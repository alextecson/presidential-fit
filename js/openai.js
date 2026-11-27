// Presidential Fit: ChatGPT's engines reached straight from the phone, with the wearer's own OpenAI API key.
// With a key saved, nothing here needs his Mac: the place lookup (web search) and the photo check (the model looks at the
// picture) go through the Responses API, and the mockups through the Images API in mockup.js.
// The key is read from the phone's own storage by the caller and is sent to api.openai.com and nowhere else.
import { placeTask, readPlace } from './place.js';
import { checkTask, parseCheck } from './check.js';

const API = 'https://api.openai.com/v1';
// Tried in this order. A model the account cannot use is skipped.
export const TEXT_MODELS = ['gpt-6.2-sol', 'gpt-6.1-sol', 'gpt-6.2-astra'];

export class KeyError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

// One request to the Responses API. Returns the text of the answer.
async function respond(key, body, signal) {
  let last = null;
  for (const model of TEXT_MODELS) {
    let res;
    try {
      res = await fetch(API + '/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body: JSON.stringify(Object.assign({ model }, body)), signal });
    } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      // a rejected key comes back without the headers a browser needs, so it looks like a dropped connection
      throw new KeyError(typeof navigator !== 'undefined' && navigator.onLine === false ? 'You are offline.' : 'OpenAI did not accept the request. The API key is most likely wrong or inactive. Check it in More.', 'network');
    }
    let j = null;
    try { j = await res.json(); } catch (e) { /* not json */ }
    if (res.ok && j) {
      const parts = (j.output || []).flatMap((o) => (o && o.type === 'message' ? (o.content || []).filter((c) => c && c.type === 'output_text' && typeof c.text === 'string').map((c) => c.text) : []));
      return (parts.join('\n').trim() || (typeof j.output_text === 'string' ? j.output_text.trim() : ''));
    }
    const err = (j && j.error) || {};
    const msg = err.message || `OpenAI answered ${res.status}`;
    if (res.status === 401) throw new KeyError('That API key was not accepted. Check it in More.', 'auth');
    if (res.status === 429) throw new KeyError(/quota|billing|credit/i.test(msg) ? 'Your OpenAI account is out of credit. Add credit at platform.openai.com, Billing.' : 'OpenAI is busy. Try again in a minute.', 'limit');
    if (res.status === 404 || /model/i.test(err.code || '') || /does not exist|not found|do not have access/i.test(msg)) { last = new KeyError(msg, 'model'); continue; }
    throw new KeyError(msg, 'other');
  }
  throw last || new KeyError('No model answered.', 'other');
}

// What a place he named looks like. Returns { name, text }, 'unknown' when nothing was found, or null when no usable answer came.
export async function lookUpPlace(key, name, kind, city, signal) {
  const ask = (again, effort) => respond(key, { reasoning: { effort }, tools: [{ type: 'web_search' }], input: placeTask(name, kind, city, again) }, signal);
  let read = readPlace(await ask(false, 'low'));
  if (read === 'unknown') read = readPlace(await ask(true, 'medium'));      // he types fast: look once more for the place the name sounds like
  return read;
}

const dataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('The photo could not be read.')); r.readAsDataURL(blob); });

// The photo check: the finished look against its plan, or how one piece fits. Returns the reading from check.js.
export async function checkPhoto(key, plan, photo, signal) {
  const text = await respond(key, {
    reasoning: { effort: 'low' },
    input: [{ role: 'user', content: [
      { type: 'input_text', text: checkTask(plan.lines, { mode: plan.mode, occasion: plan.occasion }) },
      { type: 'input_image', image_url: await dataUrl(photo) },
    ] }],
  }, signal);
  const out = parseCheck(text, plan.mode);
  if (!out) throw new KeyError('ChatGPT could not judge that photo. Take it again with the whole look in frame and in good light.', 'other');
  return out;
}
