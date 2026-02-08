import { json, mustEnv, normalizeMapId, gh, getCookie, verifySession } from "./_lib.js";

export default async function handler(req, res){
  if(req.method !== "POST") return json(res, 405, { error:"POST only" });

  try{
    const SESSION_SECRET = mustEnv("SESSION_SECRET");
    const token = getCookie(req, "session");
    const s = token ? verifySession(token, SESSION_SECRET) : null;
    if(!s?.editor) return json(res, 403, { error:"Not allowed" });

    const body = req.body || {};
    const mapId = normalizeMapId(body.mapId);
    const payload = body.payload;

    if(!payload || typeof payload !== "object"){
      return json(res, 400, { error:"Missing payload object" });
    }

    const OWNER = mustEnv("GITHUB_OWNER");
    const REPO  = mustEnv("GITHUB_REPO");
    const TOKEN = mustEnv("GITHUB_TOKEN");
    const BRANCH = process.env.GITHUB_BRANCH || "main";
    const BASE_PATH = process.env.GITHUB_BASE_PATH || "data/maps";

    const path = `${BASE_PATH}/${mapId}.json`;
    const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}`;

    const contentObj = { mapId, updatedAt: new Date().toISOString(), payload };
    const contentStr = JSON.stringify(contentObj, null, 2);
    const contentB64 = Buffer.from(contentStr,"utf8").toString("base64");

    // get sha + skip if identical
    let sha;
    const getResp = await gh(`${apiBase}?ref=${encodeURIComponent(BRANCH)}`, TOKEN);

    if(getResp.status === 200){
      const existing = await getResp.json();
      sha = existing.sha;

      if(existing.content){
        const existingText = Buffer.from(String(existing.content).replace(/\n/g,""), "base64").toString("utf8");
        if(existingText.trim() === contentStr.trim()){
          return json(res, 200, { ok:true, skipped:true });
        }
      }
    } else if(getResp.status !== 404){
      const t = await getResp.text();
      return json(res, 500, { error:"GitHub read failed", details:t });
    }

    const putBody = {
      message: body.message || `Auto-save ${mapId}`,
      content: contentB64,
      branch: BRANCH,
      ...(sha ? { sha } : {})
    };

    const putResp = await gh(apiBase, TOKEN, {
      method:"PUT",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(putBody)
    });

    if(!putResp.ok){
      const t = await putResp.text();
      return json(res, 500, { error:"GitHub write failed", details:t });
    }

    const out = await putResp.json();
    return json(res, 200, { ok:true, skipped:false, commit: out?.commit?.sha || null });

  }catch(e){
    return json(res, 500, { error:String(e?.message||e) });
  }
}