// Presidential Fit: the photo check.
// He takes a picture of the finished look, or of one piece he is trying on. ChatGPT looks at the picture and compares it
// with the plan and with his standing rules. This file holds what is asked and how the answer is read. It runs on the
// phone and on his Mac, so it uses nothing but plain text.

export const VERDICTS = { ready: 'Ready to go', fix: 'Fix first', fits: 'It fits', tailor: 'Needs a tailor', nofit: 'Does not fit', unclear: 'Cannot tell from this photo' };
const RULES = 'the shirt worn the way the plan says (fully tucked or untucked, never half tucked); belt leather that matches the shoes; one metal throughout (watch, buckle, frames); about a quarter inch of shirt cuff showing under a jacket sleeve; trousers with a slight break or none; a slim cut that is not tight; everything pressed and free of lint.';

// What ChatGPT is asked. lines: the plan, "LABEL: description" per piece. mode 'look' checks a finished fit, 'piece' judges how one garment fits.
export function checkTask(lines, { mode = 'look', occasion = '' } = {}) {
  const form = [
    'PIECE <LABEL> | MATCH or DIFFERENT or HIDDEN | FIT GOOD or TIGHT or LOOSE or LONG or SHORT or UNCLEAR | a few plain words',
    'FIX: one thing to put right, the most important first (leave these lines out if there is nothing, five at most)',
    'GOOD: one thing that works (three at most)',
  ];
  const close = 'Say only what the photograph shows. Where it does not show a part (cropped, turned away, too dark), write HIDDEN or UNCLEAR and do not guess. No other text.';
  if (mode === 'piece') {
    return [
      'Do not write or run any code and do not create files. Look at the attached photograph look.jpg. A man is trying on one piece of clothing and wants to know whether it fits him. Judge only the clothes. Do not try to identify him.',
      'The piece:',
      ...lines.map((l) => '- ' + l),
      'Judge how it fits him, as far as each point applies and the photograph shows it: shoulders, chest, waist, sleeve length, length of the body, seat, thigh, trouser length and break, heel and toe room.',
      'Reply in plain text, in exactly this form:',
      'VERDICT: FITS or NEEDS TAILORING or DOES NOT FIT or CANNOT TELL',
      ...form.slice(0, 1),
      'FIX: what a tailor would change, or why it does not work (leave out if nothing, four at most)',
      form[2],
      close,
    ].join('\n');
  }
  return [
    `Do not write or run any code and do not create files. Look at the attached photograph look.jpg. It shows a man who has just got dressed${occasion ? ' for ' + occasion : ''} and wants a last check before he leaves. Judge only the clothes and how they are worn. Do not try to identify him.`,
    'He planned to wear:',
    ...lines.map((l) => '- ' + l),
    `His standing rules: ${RULES}`,
    'Go through the plan piece by piece, then the look as a whole. Is each planned piece the one in the photograph? Does it fit him? Is anything off: tuck, collar, cuffs, hem, wrinkles, lint, a stain, something unbuttoned or twisted, laces, a belt that does not match the shoes, metals that do not match?',
    'Reply in plain text, in exactly this form:',
    'VERDICT: READY or FIX FIRST',
    form[0],
    '(one PIECE line for every line of the plan, with the same labels)',
    ...form.slice(1),
    close,
  ].join('\n');
}

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>{}`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// Reads the answer into { verdict, pieces: [{ label, seen, fit, note }], fix: [], good: [] }. Returns null when it is not in that form.
export function parseCheck(text, mode = 'look') {
  const out = { verdict: '', pieces: [], fix: [], good: [] };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/^[\s*\-•]+/, '').trim();
    let m;
    if ((m = /^VERDICT\s*:\s*(.+)$/i.exec(line))) {
      const v = m[1].toUpperCase();
      out.verdict = mode === 'piece'
        ? (/DOES NOT|NOT FIT/.test(v) ? 'nofit' : /TAILOR/.test(v) ? 'tailor' : /CANNOT|UNCLEAR/.test(v) ? 'unclear' : /FITS/.test(v) ? 'fits' : '')
        : (/FIX/.test(v) ? 'fix' : /READY/.test(v) ? 'ready' : '');
    } else if ((m = /^PIECE\s+([A-Za-z][A-Za-z ]{1,14}?)\s*\|\s*([A-Za-z ]+?)\s*\|\s*(?:FIT\s+)?([A-Za-z]+)\s*(?:\|\s*(.*))?$/i.exec(line))) {
      const seen = /DIFF/i.test(m[2]) ? 'different' : /HID|NOT VIS/i.test(m[2]) ? 'hidden' : 'match';
      const f = m[3].toUpperCase();
      const fit = ['GOOD', 'TIGHT', 'LOOSE', 'LONG', 'SHORT'].includes(f) ? f.toLowerCase() : 'unclear';
      if (out.pieces.length < 16) out.pieces.push({ label: clip(m[1], 16).toUpperCase(), seen, fit, note: clip(m[4], 160) });
    } else if ((m = /^FIX\s*:\s*(.+)$/i.exec(line))) { if (out.fix.length < 5 && !/^(none|nothing|n\/a)\.?$/i.test(m[1].trim())) out.fix.push(clip(m[1], 200)); }
    else if ((m = /^GOOD\s*:\s*(.+)$/i.exec(line))) { if (out.good.length < 3 && !/^(none|nothing|n\/a)\.?$/i.test(m[1].trim())) out.good.push(clip(m[1], 200)); }
  }
  if (!out.verdict) return null;
  if (mode === 'look' && out.verdict === 'ready' && out.fix.length) out.verdict = 'fix';       // something to fix means it is not ready
  return out;
}
