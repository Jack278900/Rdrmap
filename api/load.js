export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  try {
    const mapIdRaw = String(req.query.mapId || "rdo_main");
    const mapId = mapIdRaw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "rdo_main";

    const OWNER = process.env.GITHUB_OWNER;
    const REPO = process.env.GITHUB_REPO;
    const BRANCH = process.env.GITHUB_BRANCH || "main";
    const TOKEN = process.env.GITHUB_TOKEN;
    const BASE_PATH = process.env.GITHUB_BASE_PATH || "data/maps";

    if (!OWNER || !REPO || !TOKEN) {
      return res.status(500).json({ error: "Missing env vars (GITHUB_OWNER/REPO/TOKEN)" });
    }

    const path = `${BASE_PATH}/${mapId}.json`;
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(BRANCH)}`;

    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "rdrmap-vercel-api",
      },
    });

    if (r.status === 404) {
      return res.status(200).json({ ok: true, exists: false, payload: null });
    }
    if (!r.ok) {
      const t = await r.text();
      return res.status(500).json({ error: "GitHub load failed", details: t });
    }

    const file = await r.json();
    const raw = Buffer.from(String(file.content || "").replace(/\n/g, ""), "base64").toString("utf8");
    const parsed = JSON.parse(raw);

    // Supports either { payload: <data> } wrapper or direct data
    const payload = parsed?.payload ?? parsed ?? null;

    return res.status(200).json({ ok: true, exists: true, payload });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}

