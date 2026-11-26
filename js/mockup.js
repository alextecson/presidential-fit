// Presidential Fit: realistic mockups of a fit, with you as the model, made by ChatGPT's image engine.
// Two routes: (1) in the app, through the OpenAI API with your own key; (2) hand off to your ChatGPT app.
import { rows, SLOT_LABEL, OCCASIONS, colorOf } from './engine.js';

export const MODELS = ['gpt-image-2.6-sunburst', 'gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1.5'];
export const SCENES = {
  auto: { label: 'Match the occasion' },
  studio: { label: 'Plain studio', text: 'a plain light grey photo studio backdrop with soft even light, so the clothes read clearly' },
  lounge: { label: 'Lounge', text: 'a quiet upscale lounge with leather club chairs and warm low light' },
  classroom: { label: 'Lecture hall', text: 'a bright modern lecture hall' },
  restaurant: { label: 'Restaurant', text: 'the entrance of an upscale restaurant in the evening' },
  street: { label: 'City street', text: 'a clean city street in soft daylight' },
};
// Personal settings (a city, a car) come from the private closet file, not from this code.
export const scenesFor = (profile) => Object.assign({}, SCENES, (profile && profile.scenes) || {});

function pieceLine(r) {
  const it = r.item;
  if (!it) return null;
  const label = (r.label || SLOT_LABEL[r.slot]).toUpperCase();
  const c = colorOf(it).label;
  let d = it.name;
  if (c && !d.toLowerCase().includes(c.split(' ').pop())) d += ` (${c})`;
  if (it.pattern && it.pattern !== 'solid' && !d.toLowerCase().includes(it.pattern)) d += `, ${it.pattern} pattern`;
  if (r.slot === 'top') d += r.note === 'untucked' ? ', worn untucked with the hem ending above mid fly' : ', fully tucked in';
  if (r.slot === 'jacket' && r.note && r.note.includes('separate')) d += ' (the jacket only)';
  if (r.slot === 'hat') d += ', worn level';
  if (r.slot === 'coat') d += ', worn open over the outfit';
  return `${label}: ${d}`;
}

export function buildPrompt(o, items, profile, sceneKey = 'auto', photoCount = 1) {
  const rs = rows(o, items);
  const lines = rs.map(pieceLine).filter(Boolean);
  const belt = rs.find((r) => r.slot === 'belt');
  if (belt && !belt.item) lines.push('BELT: none');
  const all = scenesFor(profile);
  const scene = sceneKey !== 'auto' && all[sceneKey] ? all[sceneKey].text : (OCCASIONS[o.occ] || OCCASIONS.casual).scene;
  const who = photoCount > 1 ? `the man shown in the first ${photoCount} reference photos` : 'the man shown in the first reference photo';
  return [
    `Create one photorealistic full length photograph of ${who}.`,
    'Keep him exactly as he is: the same face, skin tone, hair, facial hair, age, height, build and body proportions. Do not make him younger, slimmer, taller or more muscular. He must be instantly recognizable as the same person.',
    'Dress him in exactly this outfit and nothing else:',
    ...lines.map((l) => '- ' + l),
    'Fit: slim but not skinny, jacket shoulders exact, a quarter inch of shirt cuff showing, trousers with a slight break or none. Clothes pressed and lint free.',
    'Any extra reference photos after his are his actual garments: match their color, cloth and details exactly.',
    `Setting: ${scene}.`,
    'Framing: vertical, head to toe including the shoes, standing naturally, relaxed posture, eye level camera, 50mm lens look, natural light, true to life color. No text, no watermark, no extra people, no added logos.',
  ].join('\n');
}

export async function downscale(blob, max = 1536, quality = 0.9) {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(blob));
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return await new Promise((res) => c.toBlob((b) => res(b || blob), 'image/jpeg', quality));
  } catch (e) { return blob; }
}

function b64ToBlob(b64, type) {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

export class MockupError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

async function callOnce({ key, model, quality, prompt, images, signal }) {
  const fd = new FormData();
  fd.append('model', model);
  fd.append('prompt', prompt);
  fd.append('size', '1024x1536');
  fd.append('quality', quality || 'medium');
  fd.append('output_format', 'jpeg');
  fd.append('output_compression', '92');
  images.forEach((b, i) => fd.append('image[]', b, `ref${i + 1}.jpg`));
  let res;
  try { res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd, signal }); }
  catch (e) {
    if (e && e.name === 'AbortError') throw e;
    // OpenAI rejects a bad key without the headers a browser needs, so it looks like a dropped connection.
    throw new MockupError(navigator.onLine === false ? 'You are offline. Mockups need a connection.' : 'ChatGPT did not accept the request. The API key is most likely wrong or inactive. Check it in More, ChatGPT mockups.', 'network');
  }
  let j = null;
  try { j = await res.json(); } catch (e) { /* not json */ }
  if (res.ok && j && j.data && j.data[0] && j.data[0].b64_json) return b64ToBlob(j.data[0].b64_json, 'image/jpeg');
  const err = (j && j.error) || {};
  const msg = err.message || `OpenAI answered ${res.status}`;
  if (res.status === 401) throw new MockupError('That API key was not accepted. Check it in More, ChatGPT mockups.', 'auth');
  if (err.code === 'moderation_blocked') throw new MockupError('ChatGPT declined this image. Try a different reference photo or scene.', 'blocked');
  if (res.status === 403 || /verif/i.test(msg)) throw new MockupError('OpenAI wants your organization verified before it makes images. Open platform.openai.com, Settings, Organization, General, then Verify.', 'verify');
  if (res.status === 404 || /model/i.test(err.code || '') || /does not exist|not found|do not have access/i.test(msg)) throw new MockupError(msg, 'model');
  if (res.status === 429) throw new MockupError(/quota|billing|credit/i.test(msg) ? 'Your OpenAI account is out of credit. Add credit at platform.openai.com, Billing.' : 'ChatGPT is busy. Try again in a minute.', 'limit');
  throw new MockupError(msg, 'other');
}

export async function generate({ key, model, quality, prompt, images, signal, onModel }) {
  const order = [model, ...MODELS.filter((m) => m !== model)].filter(Boolean);
  let last = null;
  for (const m of order) {
    try {
      if (onModel) onModel(m);
      const blob = await callOnce({ key, model: m, quality, prompt, images, signal });
      return { blob, model: m };
    } catch (e) {
      last = e;
      if (!(e instanceof MockupError) || e.kind !== 'model') throw e;
    }
  }
  throw last || new MockupError('No image model answered.', 'other');
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    try {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e2) { return false; }
  }
}

// Hand off: the prompt goes on the clipboard and the reference photo into the share sheet, where ChatGPT is one tap away.
export async function handOff(prompt, photoBlob) {
  const copied = await copyText(prompt);
  if (photoBlob && navigator.canShare) {
    const file = new File([photoBlob], 'me.jpg', { type: photoBlob.type || 'image/jpeg' });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: prompt }); return { copied, shared: true }; }
      catch (e) { if (e && e.name === 'AbortError') return { copied, shared: false, cancelled: true }; }
    }
  }
  return { copied, shared: false };
}

// A quick check that a key is live. A rejected key looks like a failed connection in a browser.
export async function testKey(key) {
  try { const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + key } }); return r.ok ? 'ok' : 'rejected'; }
  catch (e) { return navigator.onLine === false ? 'offline' : 'rejected'; }
}
