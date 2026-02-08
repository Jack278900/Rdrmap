/**
 * FRONTEND ONLY — uses your existing API:
 *  GET  /api/me       -> { loggedIn, editor, user:{id,username} }
 *  GET  /api/load?mapId=rdo_main -> { ok:true, mapId, payload:{markers,roads,areas} }
 *  POST /api/save     -> expects { mapId, payload, message? }
 *  GET  /api/login    -> OAuth
 *  GET  /api/logout   -> returns JSON (frontend redirects after)
 */

const MAP_ID = "rdo_main";
const LOAD_URL = `/api/load?mapId=${encodeURIComponent(MAP_ID)}`;
const SAVE_URL = `/api/save`;

// DOM
const mapWrap = document.getElementById("mapWrap");
const mapImage = document.getElementById("mapImage");
const markerLayer = document.getElementById("markerLayer");

const sidebar = document.getElementById("sidebar");
const resultsEl = document.getElementById("results");

const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const typeFilter = document.getElementById("typeFilter");
const resetViewBtn = document.getElementById("resetView");
const toggleSidebarBtn = document.getElementById("toggleSidebar");

const statTotal = document.getElementById("statTotal");
const statShown = document.getElementById("statShown");
const statTypes = document.getElementById("statTypes");

const inspector = document.getElementById("inspector");
const insTitle = document.getElementById("insTitle");
const insBody = document.getElementById("insBody");
const closeInspector = document.getElementById("closeInspector");

const hudCoords = document.getElementById("hudCoords");
const hudZoom = document.getElementById("hudZoom");
const hudMode = document.getElementById("hudMode");
const hudDirty = document.getElementById("hudDirty");

const loginCta = document.getElementById("loginCta");
const userChip = document.getElementById("userChip");
const userName = document.getElementById("userName");
const openEditor = document.getElementById("openEditor");
const logoutBtn = document.getElementById("logoutBtn");

const editorPanel = document.getElementById("editorPanel");
const editorBody = document.getElementById("editorBody");
const collapseEditor = document.getElementById("collapseEditor");
const closeEditor = document.getElementById("closeEditor");

const modeHelp = document.getElementById("modeHelp");
const mName = document.getElementById("mName");
const mType = document.getElementById("mType");
const mNotes = document.getElementById("mNotes");
const startPlace = document.getElementById("startPlace");
const cancelPlace = document.getElementById("cancelPlace");
const selectedBox = document.getElementById("selectedBox");
const deleteSelected = document.getElementById("deleteSelected");
const reloadMap = document.getElementById("reloadMap");
const saveMap = document.getElementById("saveMap");
const editorList = document.getElementById("editorList");

// State
let session = { loggedIn:false, editor:false, user:null };

let mapDoc = { mapId: MAP_ID, updatedAt: null, payload: { markers:[], roads:[], areas:[] } };
let markers = [];
let roads = [];
let areas = [];

let filtered = [];
let selectedId = null;
let dirty = false;

// modes
let mode = "browse"; // browse | add | delete
let placing = false;

// pan/zoom
let scale = 1, tx = 0, ty = 0;
let isPanning = false;
let panStart = { x:0, y:0, tx:0, ty:0 };

// utils
function esc(s){ return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m])); }
function uniq(arr){ return [...new Set(arr)]; }
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

function setDirty(v){
  dirty = v;
  hudDirty.style.display = dirty ? "" : "none";
  saveMap.disabled = !(dirty && session.editor);
}

function setMode(next){
  mode = next;
  hudMode.textContent = `mode: ${mode}`;
  document.querySelectorAll(".seg__btn").forEach(b=>{
    b.classList.toggle("seg__btn--active", b.dataset.mode === mode);
  });

  placing = false;
  cancelPlace.disabled = true;
  startPlace.textContent = "Click map to place";

  if (mode === "browse") modeHelp.textContent = "Browse: click markers to inspect.";
  if (mode === "add") modeHelp.textContent = "Add: set name/type, click “Click map to place”, then click on map.";
  if (mode === "delete") modeHelp.textContent = "Delete: click a marker to delete it.";
  updateCursor();
}

function updateCursor(){
  mapWrap.classList.remove("canPan","isPanning");
  if (mode === "browse") mapWrap.classList.add("canPan");
  if (isPanning) mapWrap.classList.add("isPanning");
}

function applyTransform(){
  const t = `translate(${tx}px, ${ty}px) scale(${scale})`;
  mapImage.style.transform = t;
  markerLayer.style.transform = t;
  hudZoom.textContent = `zoom: ${scale.toFixed(2)}`;
}

function normalizeMarkers(arr){
  const a = Array.isArray(arr) ? arr : [];
  return a.map((m, idx)=>{
    const id = m.id ?? m._id ?? `m_${idx}_${Math.random().toString(16).slice(2)}`;
    const name = m.name ?? m.title ?? `Marker ${idx+1}`;
    const type = m.type ?? m.category ?? "Unknown";
    let x = m.x, y = m.y;
    if (typeof x === "string") x = Number(x);
    if (typeof y === "string") y = Number(y);
    return { ...m, id, name, type, x, y };
  });
}

// render
function renderMarkers(list){
  markerLayer.innerHTML = "";
  for (const it of list){
    if (typeof it.x !== "number" || typeof it.y !== "number") continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "marker" + (it.id === selectedId ? " marker--selected" : "");
    b.style.left = `${it.x - 7}px`;
    b.style.top = `${it.y - 7}px`;
    b.title = `${it.name} • ${it.type}`;
    b.addEventListener("click", (e)=>{
      e.stopPropagation();
      if (mode === "delete" && session.editor){
        removeMarker(it.id);
        return;
      }
      selectMarker(it.id, true);
    });
    markerLayer.appendChild(b);
  }
}

function renderResults(list){
  resultsEl.innerHTML = "";
  if (!list.length){
    resultsEl.innerHTML = `
      <div class="card">
        <div class="card__row">
          <div class="card__title">No results</div>
          <div class="badge">—</div>
        </div>
        <div class="card__meta">Try clearing filters or searching different keywords.</div>
      </div>`;
    return;
  }
  for (const it of list){
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="card__row">
        <div class="card__title">${esc(it.name)}</div>
        <div class="badge">${esc(it.type)}</div>
      </div>
      <div class="card__meta">${typeof it.x==="number" ? `x:${it.x} y:${it.y}` : `no coords`}</div>
    `;
    div.addEventListener("click", ()=>selectMarker(it.id, true));
    resultsEl.appendChild(div);
  }
}

function populateTypeFilter(){
  const types = uniq(markers.map(m=>m.type)).sort((a,b)=>a.localeCompare(b));
  typeFilter.innerHTML = `<option value="all">All Types</option>` + types.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
}

function updateStats(){
  statTotal.textContent = String(markers.length);
  statShown.textContent = String(filtered.length);
  statTypes.textContent = String(uniq(markers.map(m=>m.type)).length);
}

function renderEditorList(){
  if (!session.editor){
    editorList.innerHTML = `<div class="mutedSmall" style="padding:10px;">Not an editor.</div>`;
    return;
  }
  editorList.innerHTML = "";
  const list = markers.slice().sort((a,b)=> (a.type||"").localeCompare(b.type||"") || (a.name||"").localeCompare(b.name||""));
  for (const it of list){
    const row = document.createElement("div");
    row.className = "editorItem";
    row.innerHTML = `<div><b>${esc(it.name)}</b><div class="mutedSmall">${esc(it.type)} • x:${it.x} y:${it.y}</div></div><div class="mutedSmall">›</div>`;
    row.addEventListener("click", ()=>selectMarker(it.id, true));
    editorList.appendChild(row);
  }
}

// filter
function runFilter(){
  const q = (searchInput.value||"").trim().toLowerCase();
  const t = typeFilter.value;

  filtered = markers.filter(m=>{
    if (t !== "all" && m.type !== t) return false;
    if (!q) return true;
    const hay = `${m.name} ${m.type} ${m.notes||""}`.toLowerCase();
    return hay.includes(q);
  });

  updateStats();
  renderResults(filtered);
  renderMarkers(filtered);
}

// select/inspect
function selectMarker(id, focus){
  selectedId = id;
  const it = markers.find(m=>m.id===id);
  if (!it) return;

  renderMarkers(filtered);

  inspector.classList.remove("inspector--hidden");
  insTitle.textContent = it.name;

  const rows = Object.entries(it).slice(0, 80).map(([k,v])=>{
    const vv = (typeof v === "object") ? JSON.stringify(v) : String(v);
    return `<div class="k">${esc(k)}</div><div class="v">${esc(vv)}</div>`;
  }).join("");
  insBody.innerHTML = `<div class="kv">${rows}</div>`;

  if (session.editor){
    selectedBox.innerHTML = `
      <div><b>${esc(it.name)}</b></div>
      <div class="mutedSmall">${esc(it.type)} • x:${it.x} y:${it.y}</div>
      <div class="mutedSmall">${it.notes ? esc(it.notes) : ""}</div>
    `;
    deleteSelected.disabled = false;
  } else {
    selectedBox.innerHTML = `<div class="mutedSmall">Login as editor to manage markers.</div>`;
    deleteSelected.disabled = true;
  }

  if (focus && typeof it.x === "number" && typeof it.y === "number"){
    const rect = mapWrap.getBoundingClientRect();
    const targetX = rect.width * 0.55;
    const targetY = rect.height * 0.52;
    tx = targetX - it.x * scale;
    ty = targetY - it.y * scale;
    applyTransform();
  }
}

function removeMarker(id){
  const idx = markers.findIndex(m=>m.id===id);
  if (idx === -1) return;
  markers.splice(idx, 1);
  if (selectedId === id){
    selectedId = null;
    inspector.classList.add("inspector--hidden");
    selectedBox.innerHTML = `<div class="mutedSmall">No marker selected.</div>`;
    deleteSelected.disabled = true;
  }
  setDirty(true);
  populateTypeFilter();
  runFilter();
  renderEditorList();
}

function addMarkerAt(wx, wy){
  const name = (mName.value||"").trim();
  const type = (mType.value||"").trim();
  const notes = (mNotes.value||"").trim();
  if (!name || !type){
    alert("Fill in Name and Type first.");
    return;
  }
  const id = `m_${Date.now().toString(36)}_${Math.random().toString(16).slice(2)}`;
  const marker = { id, name, type, x: Math.round(wx), y: Math.round(wy), notes };
  markers.push(marker);
  setDirty(true);
  populateTypeFilter();
  runFilter();
  renderEditorList();
  selectMarker(id, false);
}

// API calls
async function loadMe(){
  const res = await fetch("/api/me", { cache:"no-store" });
  if (!res.ok){
    session = { loggedIn:false, editor:false, user:null };
    return;
  }
  const me = await res.json();
  session = {
    loggedIn: !!me.loggedIn,
    editor: !!me.editor,
    user: me.user || null
  };
}

function updateAuthUI(){
  if (session.loggedIn){
    loginCta.style.display = "none";
    userChip.classList.remove("userchip--hidden");
    userName.textContent = session.user?.username ? `@${session.user.username}` : "Logged in";
    openEditor.disabled = !session.editor;
  } else {
    loginCta.style.display = "";
    userChip.classList.add("userchip--hidden");
  }
  saveMap.disabled = !(dirty && session.editor);
  startPlace.disabled = !session.editor;
  deleteSelected.disabled = !(session.editor && selectedId);
}

async function loadMap(){
  const res = await fetch(LOAD_URL, { cache:"no-store" });
  if (!res.ok) throw new Error(`Load failed: ${res.status}`);
  const out = await res.json();

  // Your load.js returns { ok:true, mapId, payload }
  if (!out?.ok) throw new Error("Load returned not ok");
  const payload = out.payload || { markers:[], roads:[], areas:[] };

  mapDoc = { mapId: out.mapId || MAP_ID, updatedAt: null, payload };
  markers = normalizeMarkers(payload.markers || []);
  roads = Array.isArray(payload.roads) ? payload.roads : [];
  areas = Array.isArray(payload.areas) ? payload.areas : [];

  filtered = markers.slice();
  selectedId = null;

  setDirty(false);
  populateTypeFilter();
  runFilter();
  renderEditorList();
}

async function saveChanges(){
  if (!session.editor) return;

  const payload = {
    markers,
    roads,
    areas
  };

  const body = {
    mapId: mapDoc.mapId || MAP_ID,
    payload,
    message: `Map save ${mapDoc.mapId || MAP_ID}`
  };

  const res = await fetch(SAVE_URL, {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify(body),
  });

  const out = await res.json().catch(()=>null);
  if (!res.ok || !out?.ok){
    throw new Error(out?.error || `Save failed: ${res.status}`);
  }

  setDirty(false);
  alert(out.skipped ? "No changes to save." : "Saved.");
}

async function logout(){
  await fetch("/api/logout", { cache:"no-store" }).catch(()=>{});
  window.location.href = "/";
}

// pan/zoom
function clampScale(s){ return clamp(s, 0.35, 4.0); }
function zoomAt(clientX, clientY, nextScale){
  const rect = mapWrap.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const wx = (px - tx) / scale;
  const wy = (py - ty) / scale;
  scale = clampScale(nextScale);
  tx = px - wx * scale;
  ty = py - wy * scale;
  applyTransform();
}

mapWrap.addEventListener("wheel", (e)=>{
  e.preventDefault();
  const delta = Math.sign(e.deltaY);
  const factor = delta > 0 ? 0.90 : 1.10;
  zoomAt(e.clientX, e.clientY, scale * factor);
}, { passive:false });

mapWrap.addEventListener("pointerdown", (e)=>{
  if (mode !== "browse" && placing) return;
  isPanning = true;
  updateCursor();
  mapWrap.setPointerCapture(e.pointerId);
  panStart = { x:e.clientX, y:e.clientY, tx, ty };
});

mapWrap.addEventListener("pointermove", (e)=>{
  const rect = mapWrap.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const wx = (px - tx) / scale;
  const wy = (py - ty) / scale;
  hudCoords.textContent = `x: ${Math.round(wx)} y: ${Math.round(wy)}`;

  if (!isPanning) return;
  tx = panStart.tx + (e.clientX - panStart.x);
  ty = panStart.ty + (e.clientY - panStart.y);
  applyTransform();
});

mapWrap.addEventListener("pointerup", (e)=>{
  isPanning = false;
  updateCursor();
  try{ mapWrap.releasePointerCapture(e.pointerId); }catch{}
});

// place marker click
mapWrap.addEventListener("click", (e)=>{
  if (!session.editor) return;
  if (mode !== "add") return;
  if (!placing) return;

  const rect = mapWrap.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const wx = (px - tx) / scale;
  const wy = (py - ty) / scale;

  addMarkerAt(wx, wy);

  placing = false;
  cancelPlace.disabled = true;
  startPlace.textContent = "Click map to place";
});

// UI wiring
searchInput.addEventListener("input", runFilter);
clearSearch.addEventListener("click", ()=>{ searchInput.value=""; runFilter(); });
typeFilter.addEventListener("change", runFilter);

resetViewBtn.addEventListener("click", ()=>{ scale=1; tx=0; ty=0; applyTransform(); });
toggleSidebarBtn.addEventListener("click", ()=>{
  const current = getComputedStyle(sidebar).display;
  sidebar.style.display = (current === "none") ? "" : "none";
});

closeInspector.addEventListener("click", ()=> inspector.classList.add("inspector--hidden"));

openEditor.addEventListener("click", ()=>{
  if (!session.editor) return;
  editorPanel.classList.remove("editor--hidden");
});
closeEditor.addEventListener("click", ()=> editorPanel.classList.add("editor--hidden"));
collapseEditor.addEventListener("click", ()=>{
  const collapsed = editorBody.style.display === "none";
  editorBody.style.display = collapsed ? "" : "none";
  collapseEditor.textContent = collapsed ? "Collapse" : "Expand";
});

document.querySelectorAll(".seg__btn").forEach(btn=>{
  btn.addEventListener("click", ()=> setMode(btn.dataset.mode));
});

startPlace.addEventListener("click", ()=>{
  if (!session.editor) return;
  setMode("add");
  placing = true;
  cancelPlace.disabled = false;
  startPlace.textContent = "Now click on the map…";
});

cancelPlace.addEventListener("click", ()=>{
  placing = false;
  cancelPlace.disabled = true;
  startPlace.textContent = "Click map to place";
});

deleteSelected.addEventListener("click", ()=>{
  if (!session.editor) return;
  if (!selectedId) return;
  const it = markers.find(m=>m.id===selectedId);
  if (!it) return;
  if (!confirm(`Delete "${it.name}"?`)) return;
  removeMarker(selectedId);
});

reloadMap.addEventListener("click", async ()=>{
  if (dirty && !confirm("You have unsaved changes. Reload anyway?")) return;
  await loadMap();
});

saveMap.addEventListener("click", async ()=>{
  try{ await saveChanges(); }
  catch(e){ console.error(e); alert(e.message || String(e)); }
});

logoutBtn.addEventListener("click", logout);

// boot
async function boot(){
  updateCursor();
  applyTransform();
  setMode("browse");

  await loadMe();
  updateAuthUI();

  await loadMap().catch(err=>{
    console.error(err);
    resultsEl.innerHTML = `
      <div class="card">
        <div class="card__row"><div class="card__title">Failed to load map</div><div class="badge">Error</div></div>
        <div class="card__meta">${esc(err.message || err)}</div>
      </div>`;
  });
}
boot();