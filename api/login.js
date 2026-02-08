import { json, mustEnv, setCookie, signSession, allowedEditors, discordTokenExchange, discordMe, discordMember } from "./_lib.js";

export default async function handler(req, res){
  try{
    const SESSION_SECRET = mustEnv("SESSION_SECRET");
    const url = new URL(req.url, `https://${req.headers.host}`);
    const code = url.searchParams.get("code");

    // Step 1: redirect to Discord
    if(!code){
      const CLIENT_ID = mustEnv("DISCORD_CLIENT_ID");
      const REDIRECT_URI = mustEnv("DISCORD_REDIRECT_URI");

      const auth = new URL("https://discord.com/api/oauth2/authorize");
      auth.searchParams.set("client_id", CLIENT_ID);
      auth.searchParams.set("redirect_uri", REDIRECT_URI);
      auth.searchParams.set("response_type", "code");
      auth.searchParams.set("scope", "identify guilds.members.read");

      res.statusCode = 302;
      res.setHeader("Location", auth.toString());
      return res.end();
    }

    // Step 2: exchange code -> access token
    const tok = await discordTokenExchange(code);
    if(!tok?.access_token) return json(res, 500, { error:"Discord token exchange failed" });

    const accessToken = tok.access_token;
    const user = await discordMe(accessToken);
    if(!user?.id) return json(res, 401, { error:"Discord identify failed" });

    // ID allowlist
    const allow = allowedEditors();
    const idOK = allow.size ? allow.has(String(user.id)) : false;

    // Optional role gate
    const guildId = process.env.DISCORD_GUILD_ID || "";
    const roleId  = process.env.DISCORD_ALLOWED_ROLE_ID || "";
    let roleOK = true;
    if(guildId && roleId){
      const mem = await discordMember(accessToken, guildId);
      roleOK = Array.isArray(mem?.roles) && mem.roles.includes(roleId);
    }

    const editor = Boolean(idOK && roleOK);

    // Session cookie
    const sessionPayload = {
      v: 1,
      uid: String(user.id),
      username: user.username,
      editor,
      at: accessToken,
      iat: Date.now()
    };

    const session = signSession(sessionPayload, SESSION_SECRET);
    setCookie(res, "session", session, { maxAge: 60*60*24*7 });

    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();

  }catch(e){
    return json(res, 500, { error: String(e?.message || e) });
  }
}