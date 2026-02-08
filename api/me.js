import { json, mustEnv, getCookie, verifySession } from "./_lib.js";

export default function handler(req, res){
  try{
    const SESSION_SECRET = mustEnv("SESSION_SECRET");
    const token = getCookie(req, "session");
    if(!token) return json(res, 200, { loggedIn:false, editor:false });

    const s = verifySession(token, SESSION_SECRET);
    if(!s) return json(res, 200, { loggedIn:false, editor:false });

    return json(res, 200, {
      loggedIn: true,
      editor: !!s.editor,
      user: { id: s.uid, username: s.username }
    });
  }catch(e){
    return json(res, 500, { error:String(e?.message || e) });
  }
}