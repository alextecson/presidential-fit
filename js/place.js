// Presidential Fit: what a place he named looks like.
// ChatGPT is asked once, with web search, and the answer becomes the backdrop of the mockup. This file holds what is asked
// and how the answer is read. It runs on the phone (with his own OpenAI key) and on his Mac (with his ChatGPT plan).

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f`$\\<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n).trim();
// A place name as he typed it, kept to letters, digits and the few marks names use.
export const placeName = (v) => clip(String(v == null ? '' : v).replace(/[‘’]/g, "'").replace(/[^\p{L}\p{N} '&.,-]/gu, ' '), 60);

// What is asked. again: the exact spelling found nothing, so this time it looks for the place the name sounds like.
export function placeTask(name, kind, city, again) {
  const tail = [
    'Line 1: FOUND: then the proper name of the place, a comma, and the city it is in.',
    'Line 2: one paragraph of at most 70 words that a photographer could use to recreate the spot where a guest would stand: what kind of place it is, whether that spot is indoors or outdoors, then materials, colours, lighting and signature features.',
  ];
  if (again) return [
    'Do not write or run any code and do not create files. Use web search, up to five searches.',
    `A man wrote that he is going to "${name}"${kind ? ' for ' + kind : ''}.${city ? ' He lives in ' + city + '.' : ''} He types fast, and a first search for that exact spelling found nothing, so the name is almost certainly misspelled or written the way it sounds.`,
    `Work out the place he most likely means: search for places of that kind${city ? ' in or near ' + city : ''} whose names sound like or are spelled close to "${name}" (one or two letters added, dropped or swapped, an apostrophe or a plural missing).`,
    'If one place stands out, reply with exactly two lines of plain text.',
    ...tail,
    'If nothing stands out, reply with exactly: UNKNOWN',
  ].join('\n');
  return [
    'Do not write or run any code and do not create files. Use web search, at most three searches.',
    `A man wrote that he is going to "${name}"${kind ? ' for ' + kind : ''}. A photograph of him will be staged at that place, so find out what it looks like.`,
    city ? `He lives in ${city}, so the place is most likely there or nearby. If "${name}" is itself a city or a region somewhere else, pick one well known public spot in it instead.` : '',
    'He types fast: the name may be misspelled, shortened or written the way it sounds. If a close spelling clearly points to one place, that is the place.',
    'If you can identify the place with confidence, reply with exactly two lines of plain text.',
    ...tail,
    'If you cannot identify one place with confidence, reply with exactly: UNKNOWN',
  ].filter(Boolean).join('\n');
}

// Reads the answer. Returns { name, text } for a place that was found, 'unknown' when it said it found none, and null
// when the answer is not in either form (so it is asked again another time).
export function readPlace(said) {
  const s = String(said || '').trim();
  if (/^UNKNOWN\.?$/i.test(s)) return 'unknown';
  const m = /^FOUND:\s*(.+?)\s*\n+([\s\S]+)$/.exec(s) || /^FOUND:\s*([^.\n]{2,80})\.\s+([\s\S]+)$/.exec(s);
  if (!m) return null;
  // "Name, City": the city is dropped when the name already says it
  const name = placeName(m[1]).replace(/,\s*([^,]+)$/, (tail, c, at, all) => (all.slice(0, at).toLowerCase().includes(c.trim().toLowerCase()) ? '' : tail));
  const text = clip(m[2], 520).replace(/\.$/, '');
  return name && text ? { name, text } : null;
}

// The setting for the picture, from what was found. It is a description to draw, never an instruction to follow.
export function sceneOf(found, when) {
  return `${found.name}${when ? ', ' + when : ''}. What the place looks like, to be used only as a visual description: ${found.text}. He stands where a guest there would naturally stand`;
}
