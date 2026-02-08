import crypto from "crypto";

export function b64url(buf){
  return Buffer.from(buf).toString("base64")
    .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export function signSession(payload, secret){
  const p = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = b64url(crypto.createHmac("sha256", secret).update(p).digest());
  return `${p}.${sig}`;
}
export function verifySession(token, secret){
  const [p,s] = String(token||"").split(".");
  if(!p||!s) return null;
  const expected = b64url(crypto.createHmac("sha256", secret).update(p).digest());
  if(expected !== s) return null;
  try{
    const json = Buffer.from(p.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf8");
    return JSON.parse(json);
  }catch{ return null; }
}
export function getCookie(req, name){
  const raw = req.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
export function setCookie(res, name, value, opts = {}){
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || "/"}`);
  parts.push("HttpOnly");
  parts.push("SameSite=Lax");
  parts.push("Secure");
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  res.setHeader("Set-Cookie", parts.join("; "));
}
export function clearCookie(res, name){
  setCookie(res, name, "", { maxAge: 0 });
}
export function json(res, status, body){
  res.statusCode = status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
export function mustEnv(name){
  const v = process.env[name];
  if(!v) throw new Error(`Missing env var: ${name}`);
  return v;
}
export function normalizeMapId(mapId){
  const raw = String(mapId || "rdo_main");
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g,"").slice(0,64);
  return safe || "rdo_main";
}
export function allowedEditors(){
  return new Set(
    String(process.env.ALLOWED_DISCORD_IDS || "")
      .split(",").map(s=>s.trim()).filter(Boolean)
  );
}
export async function gh(url, token, init = {}){
  const headers = {
    "Accept":"application/vnd.github+json",
    "User-Agent":"rdrmap-vercel-api",
    "Authorization":`Bearer ${token}`,
    ...(init.headers || {}),
  };
  return fetch(url, { ...init, headers });
}
export async function discordTokenExchange(code){
  const CLIENT_ID = mustEnv("DISCORD_CLIENT_ID");
  const CLIENT_SECRET = mustEnv("DISCORD_CLIENT_SECRET");
  const REDIRECT_URI = mustEnv("DISCORD_REDIRECT_URI");

  const r = await fetch("https://discord.com/api/oauth2/token",{
    method:"POST",
    headers:{ "Content-Type":"application/x-www-form-urlencoded" },
    body:new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    })
  });
  if(!r.ok) return null;
  return r.json();
}
export async function discordMe(accessToken){
  const r = await fetch("https://discord.com/api/users/@me",{
    headers:{ Authorization:`Bearer ${accessToken}` }
  });
  if(!r.ok) return null;
  return r.json();
}
export async function discordMember(accessToken, guildId){
  const r = await fetch(`https://discord.com/api/users/@me/guilds/${guildId}/member`,{
    headers:{ Authorization:`Bearer ${accessToken}` }
  });
  if(!r.ok) return null;
  return r.json();
}
