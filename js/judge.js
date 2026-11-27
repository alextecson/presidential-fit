// Presidential Fit: questions.
// He asks whether something is a good idea, or whether it is a fit, and gets a straight answer. Most questions are settled
// by the stylist's own rules on the phone (see judge() in app.js). The ones the rules cannot read go to ChatGPT with the
// fit on screen for context. This file tells a question from a request, and holds what ChatGPT is asked and how its
// answer is read. It runs on the phone and on his Mac, so it uses nothing but plain text.

const plain = (t) => String(t || '').trim().toLowerCase().replace(/[‘’']/g, '');
// A question to be judged, not a request to carry out. "Can you change the shoes" is a request. "Can I wear the loafers" is a question.
export function isQuestion(t) {
  const s = plain(t);
  if (!s) return false;
  if (/^(can|could|would|will|cld|wld) (you|u|ya)\b|^(please|pls)\b/.test(s)) return false;
  if (/\?\s*$/.test(s)) return true;
  return /^(can|could|should|shoud|shud|shall|would|will|is|are|does|do|am|may|might) (i|it|this|that|these|those|the|my|a|an|we)\b/.test(s)
    || /^(what if|what about|how about|how does|how do|is it ok|is it okay|ok to|okay to|thoughts on|any good|good idea|bad idea|do you think|would it|does it|is this|is that|am i|will it)\b/.test(s);
}
// A question about the fit as it stands, with nothing proposed: "is this ok", "am I overdressed", "does it work for dinner".
export function isAboutThis(t) {
  const s = plain(t);
  return /\b(this|it|that|the fit|the outfit|the look|these|those)\b/.test(s) || /\b(overdressed|underdressed|over dressed|under dressed|too (formal|casual|dressy|much|plain|loud|boring|flashy|simple)|good (fit|look|choice|pick)|a fit|work|works|ok|okay|alright|fine|appropriate|right)\b/.test(s);
}

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>{}`$\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n).trim();
const RULES = 'shirt fully tucked or untucked as planned, never half tucked; with leather shoes, belt leather of the same colour family; one metal throughout (watch, buckle, frames); warm colours with the gold watch and cool colours with the silver one; one statement piece per look; a tailored jacket for a lecture or a sit down dinner; no jeans on a formal day; a slim cut that is not tight.';

// What ChatGPT is asked. ask = { question, lines, occasion, when, weather, flags }.
export function opinionTask(ask) {
  const flags = (ask.flags || []).map((f) => clip(f, 200)).filter(Boolean).slice(0, 6);
  return [
    'Do not write or run any code and do not create files. You are a menswear stylist. A client asks one question about what he is wearing. Answer it straight.',
    `He is dressing for ${clip(ask.occasion, 60) || 'the day'}${ask.when ? ', ' + clip(ask.when, 60) : ''}.${ask.weather ? ' ' + clip(ask.weather, 120) : ''}`,
    (ask.lines || []).length ? 'What he has on, or plans to wear:' : 'He has not settled on an outfit yet.',
    ...(ask.lines || []).slice(0, 14).map((l) => '- ' + clip(l, 240)),
    flags.length ? 'What his stylist app already flagged about it: ' + flags.join(' ') : 'His stylist app found nothing wrong with it.',
    `His standing rules: ${RULES}`,
    `His question: "${clip(ask.question, 300).replace(/"/g, "'")}"`,
    'Reply in plain text, in exactly this form and nothing else:',
    'VERDICT: GOOD IDEA or BAD IDEA or FIT or NOT A FIT or DEPENDS',
    'WHY: one or two short sentences in plain words.',
    'INSTEAD: one short sentence on what to do instead. Leave this line out unless the verdict is BAD IDEA or NOT A FIT.',
    'Use GOOD IDEA or BAD IDEA when he proposes something. Use FIT or NOT A FIT when he asks whether the outfit or a combination works. Use DEPENDS only when the answer truly turns on something he did not say, and name it. No brand talk. No hedging.',
  ].join('\n');
}

// Reads the answer into { verdict: 'good' | 'bad' | 'fit' | 'nofit' | 'depends', why, instead }. Null when it is not in that form.
export function parseOpinion(text) {
  const out = { verdict: '', why: '', instead: '' };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/^[\s*\-•]+/, '').trim();
    let m;
    if ((m = /^VERDICT\s*:\s*(.+)$/i.exec(line))) { const v = m[1].toUpperCase(); out.verdict = /NOT A FIT|NOT FIT/.test(v) ? 'nofit' : /BAD/.test(v) ? 'bad' : /GOOD/.test(v) ? 'good' : /DEPEND/.test(v) ? 'depends' : /FIT/.test(v) ? 'fit' : ''; }
    else if ((m = /^WHY\s*:\s*(.+)$/i.exec(line))) out.why = clip(m[1], 400);
    else if ((m = /^INSTEAD\s*:\s*(.+)$/i.exec(line))) { if (!/^(none|nothing|n\/a)\.?$/i.test(m[1].trim())) out.instead = clip(m[1], 240); }
  }
  return out.verdict && out.why ? out : null;
}
// The headline for each verdict.
export const HEAD = { good: 'Good idea', bad: 'Bad idea', fit: 'It is a fit', nofit: 'Not a fit', depends: 'It depends', catch: 'It works, with a catch', moves: 'It works, if the rest moves with it', same: 'Already in this fit' };
