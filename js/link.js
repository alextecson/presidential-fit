// Presidential Fit: the link between the phone and the wearer's own Mac.
// The Mac makes mockups with the wearer's ChatGPT plan (see mac/helper.mjs). The two devices find each other with
// names and a key derived from the closet's private profile, which only they hold. Everything sent is encrypted end
// to end: the relay service passes sealed messages along and never sees an outfit or a picture.
// This file runs in the browser and in Node, so it uses only fetch and Web Crypto.
export const RELAY = 'https://ntfy.sh';
const te = new TextEncoder(), td = new TextDecoder();
const b64 = (buf) => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64 = (str) => { const s = atob(String(str).replace(/-/g, '+').replace(/_/g, '/')); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha = (data) => crypto.subtle.digest('SHA-256', typeof data === 'string' ? te.encode(data) : data);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stable JSON, keys sorted, so both devices hash exactly the same bytes.
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
const BLANK = { name: '', city: '', lat: null, lon: null, tz: null, groups: [], occasions: {}, scenes: {}, cars: [], about: '' };
// Returns null for a closet with no personal profile (the sample closet): there is nobody to link to.
export async function derive(profile) {
  const p = Object.assign({}, BLANK, profile || {});
  if (!p.name && !p.city && !(p.groups || []).length) return null;
  const seed = hex(await sha('presidential-fit link v1\n' + canon(p)));
  const part = (name) => sha(seed + '|' + name);
  const key = await crypto.subtle.importKey('raw', await part('key'), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { req: 'pfq' + hex(await part('req')).slice(0, 40), res: 'pfr' + hex(await part('res')).slice(0, 40), key };
}

// Small sealed messages (requests, status) and sealed bytes (the picture).
export async function sealBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return out;
}
export async function openBytes(key, bytes) {
  try { const a = new Uint8Array(bytes); return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, key, a.slice(12)); } catch (e) { return null; }
}
export const seal = async (key, obj) => b64(await sealBytes(key, te.encode(JSON.stringify(obj))));
export async function open(key, str) {
  try { const pt = await openBytes(key, unb64(str)); return pt ? JSON.parse(td.decode(pt)) : null; } catch (e) { return null; }
}
// A fresh key pair per picture. The picture is sealed with a key only these two key pairs can produce, and both are
// thrown away afterwards, so a picture that was relayed cannot be opened later even by someone who learns the profile.
export async function newPair() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { priv: kp.privateKey, pub: b64(await crypto.subtle.exportKey('raw', kp.publicKey)) };
}
export async function sessionKey(priv, otherPub, id) {
  const pk = await crypto.subtle.importKey('raw', unb64(otherPub), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pk }, priv, 256));
  const tag = te.encode('|' + id);
  const mat = new Uint8Array(bits.length + tag.length); mat.set(bits); mat.set(tag, bits.length);
  return crypto.subtle.importKey('raw', await sha(mat), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

// Messages on a relay topic since a moment (unix seconds, a duration like "12h", or a message id).
export async function read(topic, since, signal) {
  const res = await fetch(`${RELAY}/${topic}/json?poll=1&since=${encodeURIComponent(since)}`, { cache: 'no-store', signal });
  if (res.status === 429) { const e = new Error('busy'); e.busy = true; throw e; }
  if (!res.ok) throw new Error('relay ' + res.status);
  return (await res.text()).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter((m) => m && m.event === 'message');
}
export async function post(topic, text, signal) {
  const res = await fetch(`${RELAY}/${topic}`, { method: 'POST', body: text, signal });
  if (!res.ok) throw new Error('relay ' + res.status);
  return res.json();
}

// Has this closet's Mac announced itself in the last twelve hours? Returns the time it did, or 0.
export async function probe(link, signal) {
  let seen = 0;
  for (const m of await read(link.res, '12h', signal)) {
    const s = await open(link.key, m.message);
    if (s && s.st === 'here' && typeof s.t === 'number') seen = Math.max(seen, s.t);
  }
  return seen;
}

export class LinkError extends Error { constructor(message, kind) { super(message); this.kind = kind; } }

// Ask the Mac for one mockup and wait for it. brief = { lines, scene } from mockup.js. Resolves to a JPEG Blob.
export async function askMac(link, brief, { signal, onStage, fresh = false, ackMs = 25000, totalMs = 420000 } = {}) {
  const pair = await newPair();
  const id = hex(crypto.getRandomValues(new Uint8Array(8)));
  const started = Date.now();
  const since = Math.floor(started / 1000) - 3;
  await post(link.req, await seal(link.key, { v: 1, id, t: started, pub: pair.pub, lines: brief.lines, scene: brief.scene, fresh: !!fresh }), signal);
  // If the wait is called off (the fit changed), tell the Mac so it does not spend a mockup on it.
  const drop = () => { seal(link.key, { v: 1, cancel: id, t: Date.now() }).then((m) => post(link.req, m)).catch(() => {}); };
  if (signal) signal.addEventListener('abort', drop, { once: true });
  let acked = false;
  for (;;) {
    if (signal && signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    await sleep(acked ? 4000 : 2500);
    let msgs = [];
    try { msgs = await read(link.res, since, signal); }
    catch (e) { if (e && e.name === 'AbortError') throw e; if (e && e.busy) await sleep(6000); }
    for (const m of msgs) {
      const s = await open(link.key, m.message);
      if (!s || s.id !== id) continue;
      if (s.st === 'working' && !acked) { acked = true; if (onStage) onStage(s); }
      if (s.st === 'error') throw new LinkError(s.msg || 'Your Mac could not make the mockup.', 'macerr');
      if (s.st === 'done' && m.attachment && m.attachment.url) {
        const res = await fetch(m.attachment.url, { cache: 'no-store', signal });
        if (!res.ok) throw new LinkError('The mockup could not be fetched from the relay. Try again.', 'relay');
        const key = await sessionKey(pair.priv, s.pub, id);
        const plain = await openBytes(key, await res.arrayBuffer());
        if (!plain) throw new LinkError('The mockup arrived damaged. Try again.', 'relay');
        return new Blob([plain], { type: 'image/jpeg' });
      }
    }
    const waited = Date.now() - started;
    if (!acked && waited > ackMs) throw new LinkError('Your Mac is not answering. Mockups are made on your Mac with your ChatGPT plan, so it has to be awake and online. Wake it, then try again.', 'mac');
    if (waited > totalMs) throw new LinkError('Your Mac took too long. Try again.', 'macerr');
  }
}
