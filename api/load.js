import { json, mustEnv, normalizeMapId, gh } from "./_lib.js";

export default async function handler(req, res){
  try{
    const OWNER = mustEnv("GITHUB_OWNER");
    const REPO  = mustEnv("GITHUB_REPO");
    const TOKEN = mustEnv("GITHUB_TOKEN");
    const BRANCH = process.env.GITHUB_BRANCH || "main";
    const BASE_PATH = process.env.GITHUB_BASE_PATH || "data/maps";

    const url = new URL(req.url, `https://${req.headers.host}`);
    const mapId = normalizeMapId(url.searchParams.get("mapId"));

    const path = `${BASE_PATH}/${mapId}.json`;
    const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`;

    const r = await gh(apiUrl, TOKEN);
    if(r.status === 404){
      return json(res, 200, { ok:true, mapId, payload:{ markers:[], roads:[], areas:[] } });
    }
    if(!r.ok){
      const t = await r.text();
      return json(res, 500, { error:"GitHub read failed", details:t });
    }

    const file = await r.json();
    const raw = Buffer.from(String(file.content||"").replace(/\n/g,""), "base64").toString("utf8");

    let parsed = {};
    try{ parsed = JSON.parse(raw); }catch{}
    const payload = parsed?.payload && typeof parsed.payload==="object" ? parsed.payload : parsed;

    return json(res, 200, { ok:true, mapId, payload });
  }catch(e){
    return json(res, 500, { error:String(e?.message||e) });
  }
}