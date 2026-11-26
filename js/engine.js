// Presidential Fit: the outfit engine.
// Builds outfits ONLY from the closet, applies the standing rules as hard limits,
// then ranks what is left on palette, formality, weather and what each group has already seen.

export const COLORS = {
  black: { hex: '#17181b', tone: 'cool', d: 9, label: 'black' },
  charcoal: { hex: '#3b3e45', tone: 'cool', d: 8, label: 'charcoal' },
  grey: { hex: '#7f848d', tone: 'cool', d: 5, label: 'grey' },
  'light-grey': { hex: '#b9bcc2', tone: 'cool', d: 3, label: 'light grey' },
  navy: { hex: '#1c2740', tone: 'neutral', d: 8, label: 'navy' },
  indigo: { hex: '#243352', tone: 'neutral', d: 8, label: 'dark indigo' },
  blue: { hex: '#4b70a6', tone: 'cool', d: 5, label: 'blue' },
  'light-blue': { hex: '#a9c4e4', tone: 'cool', d: 2, label: 'light blue' },
  white: { hex: '#f4f4f1', tone: 'neutral', d: 0, label: 'white' },
  'off-white': { hex: '#ece7da', tone: 'warm', d: 1, label: 'off white' },
  cream: { hex: '#e9dfc6', tone: 'warm', d: 1, label: 'cream' },
  pink: { hex: '#eab6c0', tone: 'warm', d: 2, label: 'pink' },
  stone: { hex: '#cbbfa9', tone: 'warm', d: 2, label: 'stone' },
  khaki: { hex: '#b9a37c', tone: 'warm', d: 3, label: 'khaki' },
  tan: { hex: '#c19a6b', tone: 'warm', d: 4, label: 'tan' },
  camel: { hex: '#b98548', tone: 'warm', d: 4, label: 'camel' },
  cognac: { hex: '#9a5a2c', tone: 'warm', d: 5, label: 'cognac' },
  brown: { hex: '#6b4326', tone: 'warm', d: 7, label: 'brown' },
  'dark-brown': { hex: '#3f2a1c', tone: 'warm', d: 8, label: 'dark brown' },
  olive: { hex: '#5d5f3a', tone: 'warm', d: 6, label: 'olive' },
  green: { hex: '#2f4a3a', tone: 'warm', d: 7, label: 'dark green' },
  burgundy: { hex: '#5e1f2b', tone: 'warm', d: 7, label: 'burgundy' },
  mustard: { hex: '#c9a13b', tone: 'warm', d: 4, label: 'mustard' },
  purple: { hex: '#4b3a63', tone: 'cool', d: 7, label: 'purple' },
  lavender: { hex: '#c9bbe3', tone: 'cool', d: 2, label: 'lavender' },
  taupe: { hex: '#8d7f6e', tone: 'warm', d: 5, label: 'taupe' },
  sage: { hex: '#9caf88', tone: 'warm', d: 3, label: 'sage' },
  slate: { hex: '#5f6f80', tone: 'cool', d: 6, label: 'slate blue grey' },
  red: { hex: '#9c2b2b', tone: 'warm', d: 6, label: 'red' },
  gold: { hex: '#c9a24a', tone: 'warm', d: 4, label: 'gold' },
  silver: { hex: '#b8bfc8', tone: 'cool', d: 3, label: 'silver' },
  tortoise: { hex: '#6a4324', tone: 'warm', d: 6, label: 'tortoiseshell' },
};
export const colorOf = (it) => {
  if (!it) return { hex: '#888', tone: 'neutral', d: 5, label: '' };
  const c = COLORS[it.color] || { hex: it.hex || '#888', tone: 'neutral', d: 5, label: it.color || '' };
  return it.tone ? Object.assign({}, c, { tone: it.tone }) : c;
};
export const hexOf = (it) => (it && (it.hex || colorOf(it).hex)) || '#888';

export const CATS = [
  { id: 'suit', label: 'Suits' }, { id: 'jacket', label: 'Jackets' }, { id: 'coat', label: 'Coats' },
  { id: 'top', label: 'Shirts and knits' }, { id: 'bottom', label: 'Trousers' }, { id: 'shoes', label: 'Shoes' },
  { id: 'belt', label: 'Belts' }, { id: 'socks', label: 'Socks' }, { id: 'watch', label: 'Watches' },
  { id: 'glasses', label: 'Glasses' }, { id: 'hat', label: 'Hats' },
];
export const SLOT_LABEL = { hat: 'Hat', coat: 'Coat', suit: 'Suit', jacket: 'Jacket', top: 'Top', bottom: 'Bottom', belt: 'Belt', shoes: 'Shoes', socks: 'Socks', watch: 'Watch', glasses: 'Glasses' };

// lo/hi = formality band (1 very casual .. 5 full suit). jacket: 'required' | 'preferred' | 'optional'
const BASE_OCCASIONS = {
  lounge: { label: 'Lounge', long: 'Lounge', lo: 2.5, hi: 4, jacket: 'preferred', gold: true, scene: 'a quiet upscale lounge with leather club chairs and warm low light' },
  dinner: { label: 'Dinner', long: 'Dinner out', lo: 3, hi: 4.5, jacket: 'preferred', scene: 'the entrance of an upscale restaurant in the evening' },
  bar: { label: 'Bar', long: 'Bar or happy hour', lo: 2, hi: 3.5, jacket: 'optional', scene: 'a stylish cocktail bar' },
  event: { label: 'Event', long: 'Event or show', lo: 2.5, hi: 4.5, jacket: 'preferred', scene: 'a grand hotel lobby at night' },
  dressy: { label: 'Dressy', long: 'Special occasion', lo: 4, hi: 5, jacket: 'required', scene: 'an elegant hotel lobby' },
  casual: { label: 'Casual', long: 'Casual day', lo: 1, hi: 3, jacket: 'optional', scene: 'a sunny city street' },
};
export const OCCASIONS = Object.assign({}, BASE_OCCASIONS);
// Groups are audiences who see you repeatedly (for a lecturer, each class). Each one gets its own occasion and its own repeat memory.
export function configure(profile) {
  for (const k of Object.keys(OCCASIONS)) delete OCCASIONS[k];
  for (const g of (profile && profile.groups) || []) {
    OCCASIONS['teach_' + g.id] = { label: g.short || g.name, long: 'Teaching, ' + g.name, group: g.id, teach: true, lo: 3, hi: 5, jacket: 'required', formalDay: !!g.formalDay, casualDays: g.casualDays || [], scene: g.scene || 'a bright modern lecture hall' };
  }
  const over = (profile && profile.occasions) || {};
  for (const [k, v] of Object.entries(BASE_OCCASIONS)) OCCASIONS[k] = Object.assign({}, v, over[k] || {});
}

const BROWNS = ['dark-brown', 'brown', 'cognac', 'tan'];
const WARM_BOTTOMS = ['tan', 'camel', 'khaki', 'stone', 'olive', 'cream', 'off-white', 'brown'];

export const isDenim = (it) => !!it && (it.sub === 'jeans' || (it.tags || []).includes('denim'));
const dayNum = (d) => Math.round(new Date(d + 'T12:00:00').getTime() / 86400000);
export const daysBetween = (a, b) => dayNum(b) - dayNum(a);
export const dow = (d) => new Date(d + 'T12:00:00').getDay();
export const fmtDate = (d, opts) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric' });
export const shortDate = (d) => { const x = new Date(d + 'T12:00:00'); return (x.getMonth() + 1) + '/' + x.getDate(); };
export function isoDate(dt = new Date()) {
  const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, '0'), d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function addDays(d, n) { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return isoDate(x); }

function leatherMatch(belt, shoes) {
  const a = belt.leather, b = shoes.leather;
  if (!a || !b || b === 'none') return 0;
  if (a === b) return 2;
  const ia = BROWNS.indexOf(a), ib = BROWNS.indexOf(b);
  if (ia < 0 || ib < 0) return -99;          // black never meets brown
  const gap = Math.abs(ia - ib);
  return gap === 1 ? 0.6 : gap === 2 ? -1.2 : -3;
}

// ---------- history ----------
export function buildHistory(wears, date) {
  // last time each item was worn at all, and per group, strictly around `date`
  const any = new Map(), byGroup = {}, adjacent = new Set(), sameDay = new Set();
  for (const w of wears) {
    if (!w.items) continue;
    const gap = daysBetween(w.date, date);       // positive = wear is before date
    if (gap === 0) { w.items.forEach((id) => sameDay.add(id)); continue; }
    if (Math.abs(gap) === 1) w.items.forEach((id) => adjacent.add(id));
    if (gap > 0) {
      for (const id of w.items) {
        if (!any.has(id) || any.get(id) < w.date) any.set(id, w.date);
        if (w.group) {
          const g = (byGroup[w.group] = byGroup[w.group] || new Map());
          if (!g.has(id) || g.get(id) < w.date) g.set(id, w.date);
        }
      }
    }
  }
  return { any, byGroup, adjacent, sameDay };
}
export function seenBy(wears, group, itemId) {
  return wears.filter((w) => w.group === group && (w.items || []).includes(itemId)).map((w) => w.date).sort();
}

// ---------- solver ----------
export function solve(ctx, opts = {}) {
  const occ = OCCASIONS[ctx.occ] || OCCASIONS.casual;
  const locks = opts.locks || {};
  const exclude = opts.exclude || new Set();
  const prefer = opts.prefer || null;
  const weather = ctx.weather || {};
  const hi = weather.hi == null ? 72 : weather.hi;
  const lo = weather.lo == null ? hi - 18 : weather.lo;
  const wet = (weather.rain || 0) >= 50;
  const day = dow(ctx.date);
  const friday = !!occ.teach && (occ.casualDays || []).includes(day);   // the group's dressed down day
  const hist = buildHistory(ctx.wears || [], ctx.date);
  const groupSeen = (occ.group && hist.byGroup[occ.group]) || new Map();

  const lockedIds = new Set(Object.values(locks).filter((v) => v && v !== 'none'));
  const bandLo = friday ? 2 : occ.lo, bandHi = friday ? 4 : occ.hi;
  const usable = (it) => it.status !== 'retired' && !exclude.has(it.id) &&
    (lockedIds.has(it.id) || (!it.hold && !(occ.teach && it.noTeach) && !(it.only && !it.only.includes(ctx.occ))));

  const inBand = (it) => lockedIds.has(it.id) || ((it.formality || 3) >= bandLo - 1.2 && (it.formality || 3) <= bandHi + 1.2);
  const by = (cat) => ctx.items.filter((i) => i.cat === cat && usable(i) && (!['top', 'bottom', 'shoes', 'jacket'].includes(cat) || inBand(i)));
  const get = (id) => ctx.items.find((i) => i.id === id);

  const watches = by('watch'), glassesAll = by('glasses'), belts = by('belt'), socksAll = by('socks');
  const suits = by('suit'), jackets = by('jacket'), tops = by('top'), bottoms = by('bottom'), shoesAll = by('shoes'), coats = by('coat');

  // "Jacket" slot candidates: suits, odd jackets, suit jackets cleared as separates, or none.
  const structures = [];
  const jacketPolicy = friday ? 'preferred' : occ.jacket;
  for (const s of suits) structures.push({ kind: 'suit', suit: s, jacket: s, bottomFixed: s });
  for (const j of jackets) { if (occ.teach && !friday && j.casual && !lockedIds.has(j.id)) continue; structures.push({ kind: 'jacket', jacket: j }); }   // lectures get a tailored jacket
  for (const s of suits) if (s.separateJacket) structures.push({ kind: 'jacket', jacket: s, fromSuit: true });
  if (jacketPolicy !== 'required' || locks.jacket === 'none') structures.push({ kind: 'none', jacket: null });

  const results = [];
  const pinkYesterday = (ctx.wears || []).some((w) => Math.abs(daysBetween(w.date, ctx.date)) === 1 && (w.items || []).some((id) => { const t = get(id); return t && t.cat === 'top' && t.color === 'pink'; }));
  const denimLastFriday = friday && (ctx.wears || []).some((w) => w.group === occ.group && (occ.casualDays || []).includes(dow(w.date)) && daysBetween(w.date, ctx.date) > 0 && daysBetween(w.date, ctx.date) <= 8 && (w.items || []).some((id) => isDenim(get(id))));

  for (const watch of watches) {
    if (locks.watch && locks.watch !== watch.id) continue;
    if (occ.gold && watch.metal !== 'gold' && !locks.watch) continue;      // some settings always get the gold watch
    const metal = watch.metal;                                               // 'gold' | 'silver'
    for (const st of structures) {
      if (locks.jacket) {
        if (locks.jacket === 'none') { if (st.kind !== 'none') continue; }
        else if (!st.jacket || st.jacket.id !== locks.jacket) continue;
      }
      const jacket = st.jacket;
      const bottomList = st.bottomFixed ? [st.bottomFixed] : bottoms.concat(suits.filter((s) => s.separateTrousers && (!jacket || s.id !== jacket.id)));
      for (const bottom of bottomList) {
        if (locks.bottom && locks.bottom !== bottom.id && !(st.kind === 'suit')) continue;
        if (locks.bottom && st.kind === 'suit' && locks.bottom !== bottom.id) continue;
        for (const top of tops) {
          if (locks.top && locks.top !== top.id) continue;
          if (top.color === 'pink' && pinkYesterday && locks.top !== top.id) continue;   // no pink back to back
          for (const shoes of shoesAll) {
            if (locks.shoes && locks.shoes !== shoes.id) continue;
            if (wet && shoes.suede && locks.shoes !== shoes.id) continue;
            if (shoes.metal && shoes.metal !== watch.metal) continue;            // shoe hardware follows the watch
            const o = assemble({ watch, metal, st, jacket, bottom, top, shoes });
            if (o) results.push(o);
          }
        }
      }
    }
  }

  function assemble({ watch, metal, st, jacket, bottom, top, shoes }) {
    let score = 0;
    const why = [], flags = [];
    const isSuit = st.kind === 'suit';
    const bC = colorOf(bottom), tC = colorOf(top), sC = colorOf(shoes), jC = jacket ? colorOf(jacket) : null;
    const tailored = !!jacket;

    // ---- tuck ----
    // Half tuck never. Untucked is the casual default. Full tuck is the step up and is required under a jacket that may come off.
    let tuck;
    if (locks.tuck && !(top.tuck === 'untucked-only' && locks.tuck === 'tucked')) tuck = locks.tuck;
    else if (top.tuck === 'untucked-only') tuck = 'untucked';
    else if (isSuit || top.sub === 'dress-shirt' || !top.untuckOk) tuck = 'tucked';
    else if (jacket && !friday && (occ.teach || ctx.occ === 'dressy' || ctx.occ === 'dinner')) tuck = 'tucked';
    else tuck = 'untucked';
    if (top.tuck === 'untucked-only' && jacket && ((occ.teach && !friday) || isSuit)) score -= 3.5;

    // ---- belt ----
    let belt = null;
    const loops = bottom.loops !== false;
    if (loops) {
      const soft = shoes.leather === 'none';
      const options = belts.filter((b) => b.metal === metal && leatherMatch(b, shoes) > -3)
        .filter((b) => !(occ.teach && (b.noTeach || b.statement)))
        .map((b) => ({ b, s: leatherMatch(b, shoes) + (b.statement ? (ctx.occ === 'lounge' || ctx.occ === 'event' ? 0.2 : -0.6) : 0) - (b.rank || 0) * 0.15 + (soft && ((metal === 'gold') === BROWNS.includes(b.leather)) ? 0.5 : 0) + (prefer && prefer.belt === b.id ? 0.5 : 0) }))
        .sort((a, b) => b.s - a.s);
      if (locks.belt && locks.belt !== 'none') {
        const lb = get(locks.belt);
        if (!lb || lb.metal !== metal || leatherMatch(lb, shoes) <= -3) return null;   // buckle must match the watch, leather the shoes
        belt = lb; score += Math.min(leatherMatch(lb, shoes), 0.5);
      } else if (options.length && locks.belt !== 'none' && (tuck === 'tucked' || (!soft && options[0].s >= 0.5))) {
        belt = options[0].b; score += Math.min(options[0].s, 0.5);
      } else if (tuck === 'tucked' && locks.belt !== 'none') {
        return null;                                    // tucked with visible loops needs a belt
      }
    } else if (locks.belt && locks.belt !== 'none') return null;

    // ---- palette: the watch sets the metal, the metal sets warm or cool ----
    const brownShoes = BROWNS.includes(shoes.leather);
    const blackShoes = shoes.leather === 'black';
    const tones = [jC, tC, bC].filter(Boolean).map((c) => c.tone);
    const warmN = tones.filter((t) => t === 'warm').length + (brownShoes ? 1 : 0);
    const coolN = tones.filter((t) => t === 'cool').length + (blackShoes ? 1 : 0);
    if (warmN + coolN > 0) score += 2.6 * (metal === 'gold' ? warmN - coolN : coolN - warmN) / (warmN + coolN);
    if (metal === 'gold' && blackShoes) score -= 1;
    if (metal === 'silver' && brownShoes) score -= 2;

    // ---- glasses follow the watch ----
    const gOpts = glassesAll.filter((g) => (metal === 'gold' ? (g.metal === 'tortoise' || g.metal === 'gold') : g.metal === 'silver'));
    let glasses = null;
    if (locks.glasses) { glasses = gOpts.find((g) => g.id === locks.glasses); if (!glasses) return null; }
    else glasses = gOpts.sort((a, b) => (a.rank || 5) - (b.rank || 5))[0] || null;

    // ---- formality ----
    const band = (it, w = 1) => { const f = it.formality || 3; if (f < bandLo) score -= 3.2 * (bandLo - f) * w; else if (f > bandHi) score -= 2.6 * (f - bandHi) * w; };
    band(top); band(bottom); band(shoes, 0.8); if (jacket) band(jacket, 0.8);
    const fs = [top.formality || 3, bottom.formality || 3, shoes.formality || 3].concat(jacket ? [jacket.formality || 3] : []);
    const spread = Math.max(...fs) - Math.min(...fs);
    if (spread > 2) score -= (spread - 2) * 2.5;
    if (isSuit) { score += occ.formalDay || ctx.occ === 'dressy' ? 3.4 : (bandHi >= 5 ? 2.2 : -2.5); if ((top.formality || 3) < 3) score -= 4; if ((shoes.formality || 3) < 3.5) score -= 3; }
    if (jacket && bottom.athletic && !jacket.unstructured) score -= 7;       // no athletic fabric under a structured jacket
    if (jacket && jacket.loungeFav && ctx.occ === 'lounge') score += 1.5;
    const ACCENTS = ['pink', 'red', 'lavender', 'green', 'sage', 'mustard', 'burgundy', 'purple'];
    const accentN = [jacket, top, bottom, shoes].filter((x) => x && ACCENTS.includes(x.color)).length;
    if (accentN > 1) score -= 3 * (accentN - 1);                             // one accent colour at most
    if ((shoes.formality || 3) <= 2 && top.sub === 'tee' && ctx.occ !== 'casual') score -= 2;
    if (jacket && !isSuit) score += occ.jacket === 'optional' ? 0.2 : 1.2;
    if (jacket && !isSuit && occ.formalDay && (jacket.formality || 3) < 3.5) score -= 1.2;
    if (!jacket) score += occ.jacket === 'preferred' ? -1.6 : 0.4;

    // ---- colour ----
    if (jacket && !isSuit) {
      if (jacket.color === bottom.color) score -= 5;                       // odd jacket must not fake a suit
      const gap = Math.abs(jC.d - bC.d);
      score += gap >= 3 ? 2 : gap >= 2 ? 1 : -1.5;
      if (jacket.color === 'navy' && ['camel', 'khaki', 'tan', 'stone', 'grey', 'light-grey', 'cream', 'off-white', 'charcoal'].includes(bottom.color)) score += 1.5;
      if (['tan', 'stone', 'camel', 'khaki'].includes(jacket.color) && ['indigo', 'navy', 'charcoal', 'olive', 'brown', 'grey'].includes(bottom.color)) score += 1.5;
      if (bottom.color === 'black' && jC.tone === 'warm') score -= 2;
      if (st.fromSuit) score -= 0.6;
    }
    if (jacket) {
      if (top.color === jacket.color) score -= 2.5;
      score += tC.d < jC.d ? 1.4 : -1.2;
      if (top.pattern && top.pattern !== 'solid' && jacket.pattern && jacket.pattern !== 'solid') score -= 1.8;   // one pattern leads
    }
    if (top.color === bottom.color) score -= 3; else score += Math.abs(tC.d - bC.d) >= 3 ? 1.2 : 0;
    if (shoes.leather === 'black') { score += ['black', 'charcoal', 'grey', 'navy', 'light-grey'].includes(bottom.color) ? 1 : 0; if (WARM_BOTTOMS.includes(bottom.color)) score -= 3; }
    else if (brownShoes) { if (bottom.color === 'black') score -= 3.5; else score += 1; }

    // ---- one statement piece ----
    const statements = [jacket, top, bottom, shoes, belt].filter((x) => x && x.statement);
    if (statements.length > 1) score -= 5 * (statements.length - 1);

    // ---- denim ----
    const denim = isDenim(bottom);
    if (denim) {
      if (occ.formalDay) score -= 3.5;                                     // denim belongs to the dressed down day
      if (occ.teach && !friday && !occ.formalDay) score -= 2;
      if (friday) score += denimLastFriday ? -6 : 1;                      // but not every time
      if (ctx.occ === 'dressy') score -= 8;
      if (jacket && (jacket.formality || 3) >= 4 && !isSuit) score -= 0.5;
    }
    if (friday) { if (tuck === 'untucked') score += 1.5; if (isSuit) score -= 4; }
    if (ctx.occ === 'casual' || ctx.occ === 'bar') { if (denim) score += 1.5; if (!jacket) score += hi <= 62 ? -0.6 : 0.8; if (tuck === 'untucked') score += 0.8; }
    if (ctx.occ === 'lounge') { if (['knit-polo', 'sweater', 'ocbd'].includes(top.sub)) score += 1; if (denim) score += 0.6; }

    // ---- weather ----
    const warmth = (jacket ? (jacket.warmth || 2) : 0) + (top.warmth || 1);
    const tw = top.warmth == null ? 1 : top.warmth;
    if (hi >= 88) { if (jacket && occ.jacket !== 'required') score -= hi >= 95 ? 7 : 3.5; if (tw >= 3) score -= 6; else if (tw >= 2) score -= 1.5; if (tw === 0) score += 1; }
    else if (hi >= 78) { if (tw >= 3) score -= 4; }
    else if (hi <= 70) { if (tw === 0) score -= hi <= 62 ? 5 : 3; if (hi <= 62) { score += Math.min(warmth, 4) * 0.4; if (!jacket && lo <= 50) score -= 1.5; } }
    if (bottom.color === 'white' || bottom.color === 'off-white') score -= hi < 72 ? 3 : 0;          // white trousers are a warm weather call
    if (wet && shoes.suede) score -= 6;

    // ---- what this group, and anyone, has seen ----
    const majors = [jacket, isSuit ? null : bottom, top, shoes].filter(Boolean);
    const fresh = [], repeats = [];
    for (const it of majors) {
      const w = it.cat === 'shoes' ? 0.5 : 1;
      if (occ.group) {
        const last = groupSeen.get(it.id);
        if (!last) { score += 0.7 * w; fresh.push(it); }
        else {
          const gap = daysBetween(last, ctx.date);
          if (gap <= 9) { score -= 7 * w; repeats.push({ it, last }); }
          else if (gap <= 16) { score -= 4 * w; repeats.push({ it, last }); }
          else if (gap <= 30) score -= 1.5 * w;
        }
      }
      if (hist.adjacent.has(it.id)) { score -= 5 * w; flags.push(`${it.name}: also worn or planned the day before or after.`); }
      const lastAny = hist.any.get(it.id);
      if (lastAny) { const g = daysBetween(lastAny, ctx.date); score += g <= 3 ? -1.5 * w : 0.5 * Math.min(g, 30) / 30; }
      else score += 0.3;
    }
    if (shoes.dontDefault && locks.shoes !== shoes.id) score -= 1.6;       // rotate shoes
    for (const it of [jacket, top, bottom, shoes, belt].filter(Boolean)) if (it.fitIssue) { score -= 6; flags.push(`${it.name}: ${it.fitIssue}`); }

    // ---- socks ----
    let socks = null;
    const casualShoe = ['sneaker', 'driver', 'slide'].includes(shoes.sub);
    const noShowOk = casualShoe || (!jacket && tuck === 'untucked' && !occ.teach && (shoes.formality || 3) <= 3.5 && (bottom.formality || 3) <= 3);
    const sockScore = (s) => {
      if (s.sub === 'no-show') return casualShoe ? 5 : (noShowOk ? 1.2 : -99);
      if (casualShoe) return -99;
      let v = 0;
      const fam = { navy: ['navy', 'indigo', 'blue', 'slate'], black: ['black', 'charcoal', 'grey', 'slate', 'light-grey'], 'dark-brown': ['brown', 'dark-brown', 'olive', 'green'], tan: ['tan', 'khaki', 'camel'], stone: ['stone', 'khaki', 'camel', 'cream', 'off-white', 'white'], charcoal: ['charcoal', 'grey', 'light-grey'], grey: ['grey', 'light-grey', 'charcoal'] }[s.color] || [s.color];
      if (fam.includes(bottom.color)) v += 2;
      if (s.color === shoes.leather || (s.color === 'dark-brown' && BROWNS.includes(shoes.leather)) || (s.color === 'black' && shoes.leather === 'black')) v += 1.5;
      if (s.color === 'black' && brownShoes && metal === 'gold') v -= 1;
      if (s.color === 'dark-brown' && shoes.leather === 'black') v -= 3;
      return v;
    };
    if (locks.socks) socks = socksAll.find((s) => s.id === locks.socks) || null;
    else if (shoes.sub === 'slide') socks = null;
    else socks = socksAll.map((s) => ({ s, v: sockScore(s) })).filter((x) => x.v > -50).sort((a, b) => b.v - a.v).map((x) => x.s)[0] || null;

    // ---- coat and hat ----
    let coat = null;
    if (locks.coat && locks.coat !== 'none') coat = get(locks.coat);
    else if (locks.coat !== 'none' && (lo <= 47 || hi <= 55) && ctx.occ !== 'casual' && !(jacket && jacket.casual) && !(ctx.occ === 'bar' && lo > 42)) {
      coat = coats.filter((c) => (c.formality || 3) >= 3).map((c) => ({ c, v: (colorOf(c).tone === 'warm') === (metal === 'gold') ? 1 : 0 })).sort((a, b) => b.v - a.v).map((x) => x.c)[0] || null;
    }
    let hat = null;
    if (locks.hat && locks.hat !== 'none') {
      hat = get(locks.hat);
      if (hat) { const warmHat = colorOf(hat).tone === 'warm'; score += (warmHat === (metal === 'gold')) ? 2 : -4; }
    }

    // ---- keep the rest of the look when swapping one piece ----
    if (prefer) {
      const keep = (k, v) => { if (prefer[k] && prefer[k] === v) score += 4; };
      keep('jacket', jacket ? jacket.id : 'none'); keep('top', top.id); keep('bottom', bottom.id); keep('shoes', shoes.id); keep('watch', watch.id);
    }

    // ---- words ----
    const names = (arr) => arr.map((x) => x.short || x.name);
    const pal = [...new Set([jacket && jC.label, tC.label, bC.label].filter(Boolean))];
    why.push(`${cap(listAnd(pal))} ${pal.length > 1 ? 'sit' : 'sits'} in the ${metal === 'gold' ? 'warm' : 'cool'} palette, so ${metal} metals run all the way through with the ${watch.short || watch.name}.`);
    if (belt) why.push(`The ${belt.short || belt.name} matches the ${shoes.short || shoes.name}.`);
    else if (!loops) why.push('No belt, since these trousers have no loops.');
    if (statements.length === 1) why.push(`The ${statements[0].short || statements[0].name} is the one focal point; everything else stays quiet.`);
    if (occ.group && fresh.length) why.push(`${cap(groupName(ctx, occ.group))} has not seen the ${listAnd(names(fresh), 'or')}.`);
    if (tuck === 'tucked' && jacket && !isSuit) why.push('Fully tucked, because the jacket may come off.');
    for (const r of repeats) flags.push(`${cap(groupName(ctx, occ.group))} saw the ${r.it.short || r.it.name} on ${shortDate(r.last)}.`);
    if (denim && occ.formalDay) flags.push('Jeans on a full lecture day are a step down for this group.');
    if (friday && denim && denimLastFriday) flags.push('This group saw denim on its last dressed down day.');
    if (hat) flags.push(`${hat.short || hat.name}: outdoors only. Off when you walk in, off while you lecture, off in the lounge.`);
    if (coat) why.push(`It gets down to about ${Math.round(lo)}, so the ${coat.short || coat.name} goes on outside and comes off indoors.`);
    if (ctx.occ === 'lounge' && ctx.cars && ctx.cars.length) why.push(`Drive the ${ctx.cars[0]}.`);
    else if (jacket && lo <= 55 && hi >= 64 && !occ.teach) why.push(`High near ${Math.round(hi)}, about ${Math.round(lo)} at night: the jacket covers the evening.`);
    if (wet) flags.push(`Rain chance ${Math.round(weather.rain)}%. No suede today.`);

    return {
      score,
      o: { occ: ctx.occ, date: ctx.date, suit: isSuit ? jacket.id : null, jacket: jacket ? jacket.id : 'none', top: top.id, bottom: bottom.id, belt: belt ? belt.id : 'none', shoes: shoes.id, socks: socks ? socks.id : null, watch: watch.id, glasses: glasses ? glasses.id : null, coat: coat ? coat.id : null, hat: hat ? hat.id : null, tuck },
      why, flags: [...new Set(flags)],
    };
  }

  results.sort((a, b) => b.score - a.score);
  // keep a varied shortlist: each next pick must differ in at least two major pieces from those already kept
  const picked = [];
  const want = opts.n || 6;
  for (const r of results) {
    const diffOk = picked.every((p) => ['jacket', 'top', 'bottom', 'shoes'].filter((k) => p.o[k] !== r.o[k]).length >= (opts.minDiff == null ? 2 : opts.minDiff));
    if (diffOk) picked.push(r);
    if (picked.length >= want) break;
  }
  return picked;
}

export function alternatives(ctx, current, slot, locks = {}) {
  // best complete look for every candidate in one slot, holding the rest of the current look where the rules allow
  const cat = slot === 'jacket' ? null : slot;
  let cands;
  if (slot === 'jacket') cands = ctx.items.filter((i) => (i.cat === 'jacket' || i.cat === 'suit') && i.status !== 'retired').map((i) => i.id).concat(['none']);
  else if (slot === 'tuck') cands = ['tucked', 'untucked'];
  else cands = ctx.items.filter((i) => i.cat === cat && i.status !== 'retired').map((i) => i.id).concat(['belt', 'coat', 'hat'].includes(slot) ? ['none'] : []);
  const out = [];
  const hold = { jacket: current.suit || current.jacket, top: current.top, bottom: current.bottom, shoes: current.shoes, watch: current.watch };
  if (current.suit) delete hold.bottom;
  for (const id of cands) {
    const pick = { [slot]: id };
    const strict = Object.assign({}, hold, locks, pick);
    if (slot === 'jacket') delete strict.bottom;
    const noWatch = Object.assign({}, strict); if (!locks.watch && slot !== 'watch') delete noWatch.watch;
    const r = solve(ctx, { locks: strict, prefer: current, n: 1, minDiff: 0 })[0]
      || solve(ctx, { locks: noWatch, prefer: current, n: 1, minDiff: 0 })[0]
      || solve(ctx, { locks: Object.assign({}, locks, pick), prefer: current, n: 1, minDiff: 0 })[0];
    out.push({ id, result: r || null });
  }
  out.sort((a, b) => (b.result ? b.result.score : -1e9) - (a.result ? a.result.score : -1e9));
  return out;
}

export function groupName(ctx, gid) {
  const g = (ctx.groups || []).find((x) => x.id === gid);
  return g ? 'the ' + g.name : 'this group';
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export function listAnd(a, word = 'and') {
  if (a.length <= 1) return a.join('');
  if (a.length === 2) return a.join(` ${word} `);
  return a.slice(0, -1).join(', ') + ` ${word} ` + a[a.length - 1];
}

export const majorIds = (o) => [o.suit || (o.jacket !== 'none' ? o.jacket : null), o.suit ? null : o.bottom, o.top, o.shoes, o.belt !== 'none' ? o.belt : null, o.socks, o.watch, o.glasses, o.coat, o.hat].filter(Boolean);
export const signature = (o) => [o.suit || o.jacket, o.top, o.bottom, o.belt, o.shoes, o.socks, o.watch, o.glasses, o.coat || '', o.hat || '', o.tuck].join('|');

// Rows to show, top to toe, in the order the stylist lists them.
export function rows(o, items) {
  const get = (id) => items.find((i) => i.id === id);
  const r = [];
  if (o.hat) r.push({ slot: 'hat', item: get(o.hat), note: 'outdoors only' });
  if (o.coat) r.push({ slot: 'coat', item: get(o.coat), note: 'off indoors' });
  if (o.suit) r.push({ slot: 'jacket', label: 'Suit', item: get(o.suit), note: 'jacket and trousers together' });
  else if (o.jacket && o.jacket !== 'none') { const j = get(o.jacket); r.push({ slot: 'jacket', item: j, note: j && j.cat === 'suit' ? 'jacket only, worn as a separate' : '' }); }
  else r.push({ slot: 'jacket', item: null, note: 'none' });
  const top = get(o.top);
  r.push({ slot: 'top', item: top, note: o.tuck === 'tucked' ? 'fully tucked' : 'untucked', tuck: true });
  if (!o.suit) r.push({ slot: 'bottom', item: get(o.bottom) });
  const b = get(o.suit || o.bottom);
  r.push({ slot: 'belt', item: o.belt && o.belt !== 'none' ? get(o.belt) : null, note: o.belt && o.belt !== 'none' ? '' : (b && b.loops === false ? 'no loops' : '') });
  r.push({ slot: 'shoes', item: get(o.shoes) });
  r.push({ slot: 'socks', item: o.socks ? get(o.socks) : null });
  r.push({ slot: 'watch', item: get(o.watch) });
  r.push({ slot: 'glasses', item: o.glasses ? get(o.glasses) : null });
  return r;
}

export function describe(o, items) {
  return rows(o, items).filter((r) => r.item || r.slot === 'belt').map((r) => {
    const label = r.label || SLOT_LABEL[r.slot];
    const name = r.item ? r.item.name : 'none';
    return `${label}: ${name}${r.item && r.note ? ', ' + r.note : (!r.item && r.note ? ' (' + r.note + ')' : '')}`;
  }).join('\n');
}
