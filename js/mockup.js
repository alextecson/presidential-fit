// Presidential Fit: realistic mockups of a fit, with you as the model, made by ChatGPT's image engine.
// Three routes: (1) in the app, through the OpenAI API with your own key; (2) on your own Mac, through js/link.js; (3) hand off to your ChatGPT app.
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
// A kind of place named in the question ("the casino", "sushi", "the airport"). It becomes the backdrop when no place is named outright.
export const SPOTS = {
  casino: 'a casino floor with rows of slot machines, patterned carpet and warm light',
  steakhouse: 'the dining room of a classic steakhouse with dark wood and leather booths',
  sushi: 'a sushi restaurant with a pale wood counter',
  buffet: 'a large hotel buffet dining room',
  brunch: 'a bright restaurant patio set for brunch',
  concert: 'the plaza outside a concert venue with marquee lights',
  theater: 'a theater lobby with warm marquee lighting',
  arena: 'the concourse of a sports arena on game night',
  cinema: 'a cinema lobby',
  nightclub: 'a nightclub entrance with a velvet rope',
  festival: 'open festival grounds with stage lights in the distance',
  cruise: 'the open deck of a cruise ship',
  tailgate: 'a stadium parking lot tailgate',
  wedding: 'a wedding reception venue with flowers and string lights',
  graduation: 'a university commencement ground with rows of chairs',
  chapel: 'the steps of a quiet chapel',
  ballroom: 'a hotel ballroom set for a gala dinner',
  church: 'the front steps of a church',
  hospital: 'a bright hospital corridor',
  clinic: 'the hallway of a medical clinic',
  conference: 'a conference center lobby',
  airport: 'an airport terminal concourse',
  mall: 'the walkway of an upscale shopping mall',
  park: 'a path in a city park',
  beach: 'a beach boardwalk',
  coffee: 'a coffee shop with a wooden counter',
  diner: 'a classic diner with booths',
  barber: 'a classic barbershop',
  cookout: 'a backyard cookout with a grill and string lights',
  brewery: 'a brewery taproom',
  winery: 'a winery tasting room',
  pub: 'a wood panelled pub',
  speakeasy: 'a dim speakeasy bar',
  pool: 'a pool hall with green felt tables',
  golf: 'the terrace of a golf clubhouse with the course behind him',
  home: 'the living room of a family home',
};
// The part of the day a fit is worn in, from its planned hours.
export const WHENS = ['in the morning', 'around midday', 'in the afternoon', 'in the daytime', 'in the evening', 'at night'];
export function partOfDay(w) {
  if (!w || typeof w.from !== 'number') return '';
  if (w.from >= 20 || w.from < 5) return 'at night';
  if (w.from >= 17) return 'in the evening';
  if (w.to - w.from >= 6) return 'in the daytime';
  return w.from < 11 ? 'in the morning' : w.from < 14 ? 'around midday' : 'in the afternoon';
}
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
  if (r.slot === 'top') d += r.note === 'untucked' ? ', worn untucked over the trousers so the hem covers the waistband and ends above mid fly' : ', fully tucked in';
  if (r.slot === 'glasses') d += ', clear lenses, not sunglasses';
  if (r.slot === 'jacket' && r.note && r.note.includes('separate')) d += ' (the jacket only)';
  if (r.slot === 'hat') d += ', worn level';
  if (r.slot === 'coat') d += ', worn open over the outfit';
  return `${label}: ${d}`;
}

// The brief for one fit: what he wears, line by line, and where he stands. Plain text only, so it can be sent to his Mac as is.
// place = { venue, spot, when }: the place he named, or the kind of place, and the part of the day. It becomes the backdrop.
export function briefFor(o, items, profile, sceneKey = 'auto', place = null) {
  const all_ = rows(o, items);
  const shades = all_.some((r) => r.slot === 'extra' && r.item && r.item.sub === 'sunglasses');       // sunglasses take the place of his frames in the picture
  const rs = all_.filter((r) => !(shades && r.slot === 'glasses'));
  const lines = rs.map(pieceLine).filter(Boolean);
  const belt = rs.find((r) => r.slot === 'belt');
  if (belt && !belt.item) lines.push('BELT: none');
  const all = scenesFor(profile);
  let scene = sceneKey !== 'auto' && all[sceneKey] ? all[sceneKey].text : (OCCASIONS[o.occ] || OCCASIONS.casual).scene;
  if (place && sceneKey === 'auto') {
    const when = place.when ? ', ' + place.when : '';
    const kind = SPOTS[place.spot] || '';
    if (place.venue) {
      const where = place.venue + (profile && profile.city && !place.venue.toLowerCase().includes(profile.city.toLowerCase()) ? ' in ' + profile.city : '');
      scene = `${where}${when}, shown as that place really looks. If you do not know the place, use ${kind || scene}`;
    } else if (kind) scene = kind + when;
  }
  return { lines, scene };
}
// What differs between two briefs, slot by slot.
export function diffLines(before, after) {
  const map = (ls) => new Map((ls || []).map((l) => { const i = l.indexOf(': '); return [l.slice(0, i), l.slice(i + 2)]; }));
  const a = map(before), b = map(after);
  const changed = [], gone = [];
  for (const [k, v] of b) if (a.get(k) !== v) (v === 'none' ? gone : changed).push(v === 'none' ? k : `${k}: ${v}`);
  for (const k of a.keys()) if (!b.has(k) && a.get(k) !== 'none') gone.push(k);
  return { changed, gone };
}
// The brief for a change to a fit that already has a mockup: the same photograph, with only the changed pieces replaced.
export function editPromptFrom(before, after) {
  const d = diffLines(before, after);
  return [
    'Edit the first attached photo. It is a finished photograph of a man in an outfit. The second attached photo shows the same man and is only a reference for his face.',
    'Keep the photograph as it is: the same man, the same face, the same pose, the same framing, the same background and the same lighting. He must stay instantly recognizable as the same person.',
    ...(d.changed.length ? ['Change only these pieces of his outfit:', ...d.changed.map((l) => '- ' + l)] : []),
    ...(d.gone.length ? ['Take these off. He no longer wears them:', ...d.gone.map((l) => '- ' + l)] : []),
    'Every other garment stays exactly as it is in the photo. For reference, the complete outfit after the change:',
    ...after.map((l) => '- ' + l),
    'Fit: slim but not skinny, clothes pressed and lint free. Head to toe including the shoes. No text, no watermark, no extra people, no added logos.',
  ].join('\n');
}
export function promptFrom(lines, scene, photoCount = 1) {
  const who = photoCount > 1 ? `the man shown in the first ${photoCount} reference photos` : 'the man shown in the first reference photo';
  return [
    `Create one photorealistic full length photograph of ${who}.`,
    'Keep him exactly as he is: the same face, skin tone, hair, facial hair, age, height, build and body proportions. Do not make him younger, slimmer, taller or more muscular. He must be instantly recognizable as the same person.',
    'Dress him in exactly this outfit and nothing else:',
    ...lines.map((l) => '- ' + l),
    'Fit: slim but not skinny, jacket shoulders exact, a quarter inch of shirt cuff showing, trousers with a slight break or none. Clothes pressed and lint free.',
    'If his reference is a mirror selfie, leave out the mirror, its frame and the phone, and show him directly with his hands relaxed at his sides.',
    'Any extra reference photos after his are his actual garments: match their color, cloth and details exactly.',
    `Setting: ${scene}.`,
    'Framing: vertical, head to toe including the shoes, standing naturally, relaxed posture, eye level camera, 50mm lens look, natural light, true to life color. No text, no watermark, no extra people, no added logos.',
  ].join('\n');
}
export function buildPrompt(o, items, profile, sceneKey = 'auto', photoCount = 1, place = null) {
  const b = briefFor(o, items, profile, sceneKey, place);
  return promptFrom(b.lines, b.scene, photoCount);
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
