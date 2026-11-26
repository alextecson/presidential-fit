// Presidential Fit: on-device storage. Everything lives in IndexedDB on this phone.
const DB_NAME = 'presidential-fit';
const DB_VER = 1;
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const d = await openDb();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    let req;
    try { req = fn(t.objectStore(store)); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('aborted'));
  });
}

export const kvGet = (k) => run('kv', 'readonly', (s) => s.get(k));
export const kvSet = (k, v) => run('kv', 'readwrite', (s) => s.put(v, k));
export const kvDel = (k) => run('kv', 'readwrite', (s) => s.delete(k));

// Images are stored as { buf: ArrayBuffer, type } so they survive every iOS version.
export async function blobPut(id, blob) {
  const buf = await blob.arrayBuffer();
  await run('blobs', 'readwrite', (s) => s.put({ buf, type: blob.type || 'image/jpeg', at: Date.now() }, id));
  urlCache.delete(id);
  return id;
}
export async function blobGet(id) {
  const rec = await run('blobs', 'readonly', (s) => s.get(id));
  if (!rec) return null;
  return new Blob([rec.buf], { type: rec.type });
}
export async function blobDel(id) {
  await run('blobs', 'readwrite', (s) => s.delete(id));
  const u = urlCache.get(id);
  if (u) { URL.revokeObjectURL(u); urlCache.delete(id); }
}
export const blobKeys = () => run('blobs', 'readonly', (s) => s.getAllKeys());

const urlCache = new Map();
export async function blobUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await blobGet(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlCache.set(id, u);
  return u;
}

export const uid = (p = 'x') => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ---------- app state ----------
export const EMPTY_STATE = () => ({
  version: 1,
  profile: { name: '', city: '', lat: null, lon: null, tz: null, groups: [], occasions: {}, scenes: {}, cars: [], about: '' },
  items: [],
  rules: [],
  wears: [],
  settings: { quality: 'medium', model: 'gpt-image-2.6-sunburst', setting: 'auto' },
  modelPhotos: [],
  seededAt: null,
});

export let state = EMPTY_STATE();
let saveTimer = null;
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export async function loadState() {
  const s = await kvGet('state');
  if (s && s.version) state = Object.assign(EMPTY_STATE(), s);
  state.profile = Object.assign(EMPTY_STATE().profile, state.profile || {});
  state.settings = Object.assign(EMPTY_STATE().settings, state.settings || {});
  return state;
}
export function save(now = false) {
  listeners.forEach((fn) => { try { fn(state); } catch (e) { console.error(e); } });
  clearTimeout(saveTimer);
  const doSave = () => kvSet('state', JSON.parse(JSON.stringify(state))).catch((e) => console.error('save failed', e));
  if (now) return doSave();
  saveTimer = setTimeout(doSave, 250);
  return Promise.resolve();
}
export function replaceState(next) {
  state = Object.assign(EMPTY_STATE(), next);
  state.profile = Object.assign(EMPTY_STATE().profile, next.profile || {});
  state.settings = Object.assign(EMPTY_STATE().settings, next.settings || {});
  return save(true);
}

// Secrets (the OpenAI key) are kept apart from the exportable state.
export const secretGet = (k) => kvGet('secret:' + k);
export const secretSet = (k, v) => (v ? kvSet('secret:' + k, v) : kvDel('secret:' + k));

export async function persist() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* ignore */ }
  return false;
}

// ---------- backup ----------
async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
export async function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const type = (head.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
export async function exportAll(withImages = true) {
  const out = { kind: 'presidential-fit-backup', exportedAt: new Date().toISOString(), state: JSON.parse(JSON.stringify(state)), images: {} };
  if (withImages) {
    for (const k of await blobKeys()) {
      const b = await blobGet(k);
      if (b) out.images[k] = await blobToDataUrl(b);
    }
  }
  return out;
}
export async function importAll(obj, { merge = false } = {}) {
  const incoming = obj.state || obj;
  if (!incoming || !Array.isArray(incoming.items)) throw new Error('That file is not a Presidential Fit closet.');
  if (merge) {
    const byId = new Map(state.items.map((i) => [i.id, i]));
    incoming.items.forEach((i) => byId.set(i.id, Object.assign({}, byId.get(i.id) || {}, i)));
    state.items = [...byId.values()];
    const wearIds = new Set(state.wears.map((w) => w.id));
    (incoming.wears || []).forEach((w) => { if (!wearIds.has(w.id)) state.wears.push(w); });
    if (incoming.rules && incoming.rules.length) state.rules = incoming.rules;
    if (incoming.profile) state.profile = Object.assign(state.profile, incoming.profile);
    await save(true);
  } else {
    await replaceState(incoming);
  }
  if (obj.images) {
    for (const [k, v] of Object.entries(obj.images)) await blobPut(k, await dataUrlToBlob(v));
  }
  state.seededAt = state.seededAt || new Date().toISOString();
  await save(true);
  return state;
}
