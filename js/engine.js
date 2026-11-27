// Presidential Fit: the outfit engine.
// Builds outfits ONLY from the closet, applies the standing rules as hard limits,
// then ranks what is left on palette, formality, weather and what each group has already seen.
// The closet is not the whole wardrobe: a piece the wearer names that is not listed is added to it first (see ask.js),
// and a piece named outright is always worn, with the check list saying where it bends a rule.

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
  { id: 'glasses', label: 'Glasses' }, { id: 'hat', label: 'Hats' }, { id: 'extra', label: 'Accessories' },
];
export const SLOT_LABEL = { hat: 'Hat', coat: 'Coat', suit: 'Suit', jacket: 'Jacket', top: 'Top', bottom: 'Bottom', belt: 'Belt', shoes: 'Shoes', socks: 'Socks', watch: 'Watch', glasses: 'Glasses', extra: 'Accessory' };
// Accessories ride along with a fit when the wearer asks for them. The stylist neither picks nor rates them.
export const EXTRA_LABEL = { tie: 'Tie', bowtie: 'Bow tie', scarf: 'Scarf', gloves: 'Gloves', vest: 'Vest', waistcoat: 'Waistcoat', sunglasses: 'Sunglasses', pocketsquare: 'Pocket square', bracelet: 'Bracelet', necklace: 'Necklace',
  chain: 'Chain', ring: 'Ring', cufflinks: 'Cufflinks', suspenders: 'Suspenders', bandana: 'Bandana', backpack: 'Backpack', bag: 'Bag', briefcase: 'Briefcase', umbrella: 'Umbrella', earring: 'Earring' };
export const extraLabel = (it) => (it && EXTRA_LABEL[it.sub]) || 'Accessory';

// lo/hi = formality band (1 very casual .. 5 full suit). jacket: 'required' | 'preferred' | 'optional'. say = the name used mid sentence.
const BASE_OCCASIONS = {
  work: { label: 'Work', long: 'Work or a meeting', say: 'work', lo: 3, hi: 4.5, jacket: 'preferred', scene: 'a bright modern office lobby' },
  dinner: { label: 'Dinner', long: 'Dinner out', say: 'dinner', lo: 3, hi: 4.5, jacket: 'preferred', scene: 'the entrance of an upscale restaurant in the evening' },
  lounge: { label: 'Lounge', long: 'Lounge', say: 'the lounge', lo: 2.5, hi: 4, jacket: 'preferred', gold: true, scene: 'a quiet upscale lounge with leather club chairs and warm low light' },
  bar: { label: 'Bar', long: 'Bar or happy hour', say: 'the bar', lo: 2, hi: 3.5, jacket: 'optional', scene: 'a stylish cocktail bar' },
  event: { label: 'Event', long: 'Event or show', say: 'the event', lo: 2.5, hi: 4.5, jacket: 'preferred', scene: 'a grand hotel lobby at night' },
  dressy: { label: 'Dressy', long: 'Special occasion', say: 'the occasion', lo: 4, hi: 5, jacket: 'required', scene: 'an elegant hotel lobby' },
  casual: { label: 'Casual', long: 'Casual day', say: 'a casual day', lo: 1, hi: 3, jacket: 'optional', scene: 'a sunny city street' },
};
export const OCCASIONS = Object.assign({}, BASE_OCCASIONS);
// Groups are audiences who see you repeatedly (for a lecturer, each class). Each one gets its own occasion and its own repeat memory.
export function configure(profile) {
  for (const k of Object.keys(OCCASIONS)) delete OCCASIONS[k];
  for (const g of (profile && profile.groups) || []) {
    OCCASIONS['teach_' + g.id] = { label: g.short || g.name, long: 'Teaching, ' + g.name, say: 'class', group: g.id, teach: true, lo: 3, hi: 5, jacket: 'required', formalDay: !!g.formalDay, casualDays: g.casualDays || [], scene: g.scene || 'a bright modern lecture hall' };
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
// opts.locks: slot -> id or 'none', always kept. opts.allow: slot -> ids the wearer asked to choose from. opts.exclude: ids left out.
// opts.extras: accessories to carry along. opts.force: the named pieces go in even where they break a hard rule (the check list says so).
// opts.mods: also (other stops in the plan), shift (dressier or more relaxed), lab, golf, theme, wantSuit, noSuit, noDenim.
export function solve(ctx, opts = {}) {
  const occ = OCCASIONS[ctx.occ] || OCCASIONS.casual;
  const locks = opts.locks || {};
  const exclude = opts.exclude instanceof Set ? opts.exclude : new Set(opts.exclude || []);
  const prefer = opts.prefer || null;
  const mods = opts.mods || {};
  const force = !!opts.force;
  const allow = {};
  for (const [k, v] of Object.entries(opts.allow || {})) {
    const set = v instanceof Set ? v : new Set(v || []);
    if (locks[k] == null && set.size) allow[k] = set;            // a lock on the slot overrides the wider ask
  }
  const plan = [ctx.occ].concat((mods.also || []).filter((k) => OCCASIONS[k] && k !== ctx.occ));
  const inPlan = (k) => plan.includes(k);
  const wantGold = plan.some((k) => OCCASIONS[k] && OCCASIONS[k].gold);
  const shift = mods.shift || 0;
  const weather = ctx.weather || {};
  const hi = weather.hi == null ? 72 : weather.hi;               // warmest and coolest it gets in the hours the fit is worn
  const lo = weather.lo == null ? hi - 18 : weather.lo;
  const dayHi = weather.dayHi == null ? hi : weather.dayHi, dayLo = weather.dayLo == null ? lo : weather.dayLo;
  const wet = (weather.rain || 0) >= 50;
  const night = !!(ctx.win && ctx.win.from >= 17);
  const day = dow(ctx.date);
  const friday = !!occ.teach && ((occ.casualDays || []).includes(day) || shift <= -1 || !!mods.lab);   // the group's dressed down day, or a class day kept casual
  const hist = buildHistory(ctx.wears || [], ctx.date);
  const groupSeen = (occ.group && hist.byGroup[occ.group]) || new Map();

  const lockedIds = new Set(Object.values(locks).filter((v) => v && v !== 'none'));
  const asked = new Set(lockedIds);                               // a piece named outright may bend the stylist's own limits; the check list says so
  for (const set of Object.values(allow)) if (set.size <= 2) set.forEach((id) => asked.add(id));
  let bandLo = friday ? 2 : occ.lo, bandHi = friday ? 4 : occ.hi;
  const sh = occ.teach ? Math.max(0, shift) : shift;
  if (sh) { bandLo = Math.max(1, Math.min(4.5, bandLo + sh)); bandHi = Math.min(5, Math.max(bandLo + 1, bandHi + sh)); }
  for (const k of plan.slice(1)) bandHi = Math.max(bandLo + 1, Math.min(bandHi, OCCASIONS[k].hi + 0.5));   // the look also has to sit right at the next stop
  const usable = (it) => it.status !== 'retired' && !exclude.has(it.id) &&
    (asked.has(it.id) || (!it.hold && !(occ.teach && it.noTeach) && !(it.only && !it.only.some(inPlan))));

  const inBand = (it) => asked.has(it.id) || ((it.formality || 3) >= bandLo - 1.2 && (it.formality || 3) <= bandHi + 1.2);
  const by = (cat) => ctx.items.filter((i) => i.cat === cat && usable(i) && (!allow[cat] || allow[cat].has(i.id)) && (!['top', 'bottom', 'shoes', 'jacket'].includes(cat) || inBand(i)));
  const get = (id) => ctx.items.find((i) => i.id === id);

  const extras = [...new Set(opts.extras || [])].filter((id) => { const x = get(id); return x && x.cat === 'extra' && x.status !== 'retired'; });
  const watches = by('watch'), glassesAll = by('glasses'), belts = by('belt'), socksAll = by('socks'), hats = by('hat');
  const suits = by('suit'), jackets = by('jacket'), tops = by('top'), shoesAll = by('shoes'), coats = by('coat');
  const bottoms = by('bottom').filter((b) => !(mods.noDenim && isDenim(b) && locks.bottom !== b.id));

  // "Jacket" slot candidates: suits, odd jackets, suit jackets cleared as separates, or none.
  let jacketPolicy = friday ? 'preferred' : occ.jacket;
  if (!occ.teach && shift <= -1 && jacketPolicy === 'preferred') jacketPolicy = 'optional';
  if (!occ.teach && shift >= 1 && jacketPolicy === 'optional') jacketPolicy = 'preferred';
  const jp = occ.teach ? occ.jacket : jacketPolicy;               // how much the occasion itself wants a jacket
  let structures = [];
  for (const s of suits) structures.push({ kind: 'suit', suit: s, jacket: s, bottomFixed: s });
  for (const j of jackets) { if (occ.teach && !friday && j.casual && !asked.has(j.id)) continue; structures.push({ kind: 'jacket', jacket: j }); }   // lectures get a tailored jacket
  for (const s of suits) if (s.separateJacket) structures.push({ kind: 'jacket', jacket: s, fromSuit: true });
  if (jacketPolicy !== 'required' || locks.jacket === 'none') structures.push({ kind: 'none', jacket: null });
  const lockedJacket = locks.jacket && locks.jacket !== 'none' ? get(locks.jacket) : null;
  if (!locks.jacket && allow.jacket) structures = structures.filter((st) => st.jacket && allow.jacket.has(st.jacket.id));
  if (mods.wantSuit && (!locks.jacket || (lockedJacket && lockedJacket.cat === 'suit'))) structures = structures.filter((st) => st.kind === 'suit');
  if (mods.noSuit && !(lockedJacket && lockedJacket.cat === 'suit')) structures = structures.filter((st) => st.kind !== 'suit');
  if (tops.some((t) => asked.has(t.id) && solo(t)) && !structures.some((st) => st.kind === 'none')) structures.push({ kind: 'none', jacket: null });   // asked for by name, so the jacket gives way

  const results = [];
  const pinkYesterday = (ctx.wears || []).some((w) => Math.abs(daysBetween(w.date, ctx.date)) === 1 && (w.items || []).some((id) => { const t = get(id); return t && t.cat === 'top' && t.color === 'pink'; }));
  const denimLastFriday = friday && (ctx.wears || []).some((w) => w.group === occ.group && (occ.casualDays || []).includes(dow(w.date)) && daysBetween(w.date, ctx.date) > 0 && daysBetween(w.date, ctx.date) <= 8 && (w.items || []).some((id) => isDenim(get(id))));
  const themed = (it) => !!it && !!mods.theme && (THEMES[mods.theme] || [mods.theme]).includes(it.color);
  // Pieces the wearer says he already wore: they are excluded by the caller, and the new fit also stays out of their colours.
  const worn = (mods.unlike || []).map(get).filter(Boolean);
  const echoes = (it, slot) => !!it && worn.some((u) => (u.cat === 'suit' ? 'jacket' : u.cat) === slot && familyOf(u) === familyOf(it));

  for (const watch of watches) {
    if (locks.watch && locks.watch !== watch.id) continue;
    if (wantGold && watch.metal !== 'gold' && !locks.watch) continue;      // some settings always get the gold watch
    const metal = watch.metal;                                               // 'gold' | 'silver'
    for (const st of structures) {
      if (locks.jacket) {
        if (locks.jacket === 'none') { if (st.kind !== 'none') continue; }
        else if (!st.jacket || st.jacket.id !== locks.jacket) continue;
      }
      const jacket = st.jacket;
      const bottomList = st.bottomFixed ? [st.bottomFixed] : bottoms.concat(suits.filter((s) => s.separateTrousers && (!jacket || s.id !== jacket.id)));
      for (const bottom of bottomList) {
        if (locks.bottom && locks.bottom !== bottom.id) continue;
        if (allow.bottom && !allow.bottom.has(bottom.id)) continue;         // named trousers rule out a full suit
        for (const top of tops) {
          if (locks.top && locks.top !== top.id) continue;
          if (top.color === 'pink' && pinkYesterday && locks.top !== top.id) continue;   // no pink back to back
          if (jacket && solo(top) && !force) continue;                                    // worn on its own, never under a jacket
          for (const shoes of shoesAll) {
            if (locks.shoes && locks.shoes !== shoes.id) continue;
            if (wet && shoes.suede && locks.shoes !== shoes.id) continue;
            if (shoes.metal && shoes.metal !== watch.metal && !force) continue;  // shoe hardware follows the watch
            const o = assemble({ watch, metal, st, jacket, bottom, top, shoes });
            if (o) results.push(o);
          }
        }
      }
    }
  }

  function assemble({ watch, metal, st, jacket, bottom, top, shoes }) {
    let score = 0;
    const why = [];
    const isSuit = st.kind === 'suit';
    const bC = colorOf(bottom), tC = colorOf(top), jC = jacket ? colorOf(jacket) : null;

    // ---- tuck ----
    // Half tuck never. Untucked is the casual default. Full tuck is the step up and is required under a jacket that may come off.
    let tuck;
    const looseOnly = top.tuck === 'untucked-only' || solo(top);
    if (locks.tuck && !(looseOnly && locks.tuck === 'tucked')) tuck = locks.tuck;
    else if (looseOnly) tuck = 'untucked';
    else if (isSuit || top.sub === 'dress-shirt' || !top.untuckOk) tuck = 'tucked';
    else if (jacket && !friday && shift > -1 && (occ.teach || ['dressy', 'dinner', 'work'].includes(ctx.occ))) tuck = 'tucked';
    else tuck = 'untucked';
    if (top.tuck === 'untucked-only' && jacket && ((occ.teach && !friday) || isSuit)) score -= 3.5;

    // ---- belt ----
    let belt = null;
    const loops = bottom.loops !== false;
    const wantBelt = !!allow.belt;
    if (loops) {
      const soft = shoes.leather === 'none';
      const options = belts.filter((b) => b.metal === metal && leatherMatch(b, shoes) > -3)
        .filter((b) => !(occ.teach && (b.noTeach || b.statement) && !asked.has(b.id)))
        .map((b) => ({ b, s: leatherMatch(b, shoes) + (b.statement ? (inPlan('lounge') || inPlan('event') ? 0.2 : -0.6) : 0) - (b.rank || 0) * 0.15 + (soft && ((metal === 'gold') === BROWNS.includes(b.leather)) ? 0.5 : 0) + (prefer && prefer.belt === b.id ? 0.5 : 0) }))
        .sort((a, b) => b.s - a.s);
      if (locks.belt && locks.belt !== 'none') {
        const lb = get(locks.belt);
        if (!lb) return null;
        const clash = (!!lb.metal && lb.metal !== metal) || leatherMatch(lb, shoes) <= -3;   // buckle must match the watch, leather the shoes
        if (clash && !force) return null;
        belt = lb; score += clash ? -3 : Math.min(leatherMatch(lb, shoes), 0.5);
      } else if (options.length && locks.belt !== 'none' && (wantBelt || tuck === 'tucked' || (!soft && options[0].s >= 0.5))) {
        belt = options[0].b; score += Math.min(options[0].s, 0.5);
      } else if ((tuck === 'tucked' || wantBelt) && locks.belt !== 'none') {
        if (!force) return null;                        // tucked with visible loops needs a belt
        belt = belts.filter((b) => b.metal === metal).sort((x, y) => leatherMatch(y, shoes) - leatherMatch(x, shoes))[0] || null; score -= 3;
      }
    } else if (((locks.belt && locks.belt !== 'none') || wantBelt) && !force) return null;

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
    if (locks.glasses) {                                                       // a pair named outright with no metal on record goes with either watch
      const lg = get(locks.glasses);
      glasses = gOpts.find((g) => g.id === locks.glasses) || (lg && lg.cat === 'glasses' && (force || !lg.metal) ? lg : null);
      if (!glasses) return null;
    }
    else glasses = gOpts.sort((a, b) => (a.rank || 5) - (b.rank || 5))[0] || null;
    if (allow.glasses && !glasses) return null;

    // ---- formality ----
    const band = (it, w = 1) => { const f = it.formality || 3; if (f < bandLo) score -= 3.2 * (bandLo - f) * w; else if (f > bandHi) score -= 2.6 * (f - bandHi) * w; };
    band(top); band(bottom); band(shoes, 0.8); if (jacket) band(jacket, 0.8);
    const fs = [top.formality || 3, bottom.formality || 3, shoes.formality || 3].concat(jacket ? [jacket.formality || 3] : []);
    const fAvg = fs.reduce((a, b) => a + b, 0) / fs.length;
    const spread = Math.max(...fs) - Math.min(...fs);
    if (spread > 2) score -= (spread - 2) * 2.5;
    if (isSuit) { score += occ.formalDay || ctx.occ === 'dressy' ? 3.4 : (bandHi >= 5 ? 2.2 : -2.5); if ((top.formality || 3) < 3) score -= 4; if ((shoes.formality || 3) < 3.5) score -= 3; }
    if (jacket && bottom.athletic && !jacket.unstructured) score -= 7;       // no athletic fabric under a structured jacket
    if (jacket && jacket.loungeFav && inPlan('lounge')) score += 1.5;
    if (jacket && jacket.casual && ['dinner', 'work', 'dressy'].includes(ctx.occ) && shift > -1 && !asked.has(jacket.id)) score -= 2.5;   // a sit down setting gets a tailored jacket unless he names another
    const ACCENTS = ['pink', 'red', 'lavender', 'green', 'sage', 'mustard', 'burgundy', 'purple'];
    const accentN = [jacket, top, bottom, shoes].filter((x) => x && ACCENTS.includes(x.color)).length;
    if (accentN > 1) score -= 3 * (accentN - 1);                             // one accent colour at most
    if ((shoes.formality || 3) <= 2 && top.sub === 'tee' && ctx.occ !== 'casual') score -= 2;
    if (jacket && !isSuit) score += jp === 'optional' ? 0.2 : 1.2;
    if (jacket && !isSuit && occ.formalDay && (jacket.formality || 3) < 3.5) score -= 1.2;
    if (!jacket && !solo(top)) score += jp === 'preferred' ? -1.6 : 0.4;

    // ---- colour ----
    const mono = themed(top) && themed(bottom);                               // an asked for single colour look is allowed to match
    if (jacket && !isSuit) {
      if (jacket.color === bottom.color && !(themed(jacket) && themed(bottom))) score -= 5;   // odd jacket must not fake a suit
      const gap = Math.abs(jC.d - bC.d);
      score += gap >= 3 ? 2 : gap >= 2 ? 1 : (themed(jacket) && themed(bottom) ? 0 : -1.5);
      if (jacket.color === 'navy' && ['camel', 'khaki', 'tan', 'stone', 'grey', 'light-grey', 'cream', 'off-white', 'charcoal'].includes(bottom.color)) score += 1.5;
      if (['tan', 'stone', 'camel', 'khaki'].includes(jacket.color) && ['indigo', 'navy', 'charcoal', 'olive', 'brown', 'grey'].includes(bottom.color)) score += 1.5;
      if (bottom.color === 'black' && jC.tone === 'warm') score -= 2;
      if (st.fromSuit) score -= 0.6;
    }
    if (jacket) {
      if (top.color === jacket.color && !(themed(top) && themed(jacket))) score -= 2.5;
      score += tC.d < jC.d ? 1.4 : (themed(top) && themed(jacket) ? 0 : -1.2);
      if (top.pattern && top.pattern !== 'solid' && jacket.pattern && jacket.pattern !== 'solid') score -= 1.8;   // one pattern leads
    }
    if (top.color === bottom.color) score -= mono ? 0 : 3; else score += Math.abs(tC.d - bC.d) >= 3 ? 1.2 : 0;
    if (shoes.leather === 'black') { score += ['black', 'charcoal', 'grey', 'navy', 'light-grey'].includes(bottom.color) ? 1 : 0; if (WARM_BOTTOMS.includes(bottom.color)) score -= 3; }
    else if (brownShoes) { if (bottom.color === 'black') score -= 3.5; else score += 1; }
    if (night) { if (bC.d <= 2) score -= 1.2; else if (bC.d >= 6) score += 0.3; }   // evening reads darker
    if (worn.length) {                                                       // a change has to look like a change
      if (echoes(jacket, 'jacket')) score -= 6;
      if (echoes(top, 'top')) score -= 6;
      if (!isSuit && echoes(bottom, 'bottom')) score -= 2.5;
      if (echoes(shoes, 'shoes')) score -= 1;
    }
    if (mods.theme) {
      score += (themed(top) ? 2.4 : -1.2) + (themed(bottom) ? 2.6 : -2);
      if (jacket) score += themed(jacket) ? 1.6 : -0.8;
      if (themed(shoes) || (THEMES[mods.theme] || [mods.theme]).includes(shoes.leather)) score += 1.2;
    }

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
    if (inPlan('lounge')) { if (['knit-polo', 'sweater', 'ocbd'].includes(top.sub)) score += 1; if (denim && ctx.occ === 'lounge') score += 0.6; }
    if (mods.golf) {                                                         // the golf course look, off the course
      score += ['polo', 'knit-polo'].includes(top.sub) ? 2.6 : -2.5;
      if (jacket) score += jacket.unstructured && !jacket.casual ? -0.4 : -2.2;
      if (bottom.athletic) score += 1.4; if (denim) score -= 2.5;
      if (['white', 'off-white', 'khaki', 'stone', 'light-grey', 'navy'].includes(bottom.color)) score += 0.7;
      if (['driver', 'sneaker', 'loafer'].includes(shoes.sub)) score += 0.8;
    }

    // ---- weather ----
    const warmth = (jacket ? (jacket.warmth || 2) : 0) + (top.warmth || 1);
    const tw = top.warmth == null ? 1 : top.warmth;
    if (hi >= 88) { if (jacket && jp !== 'required') score -= hi >= 100 ? 14 : hi >= 95 ? 7 : 3.5; if (tw >= 3) score -= 6; else if (tw >= 2) score -= 1.5; if (tw === 0) score += 1; }
    else if (hi >= 78) { if (tw >= 3) score -= 4; }
    else if (hi <= 70) { if (tw === 0) score -= hi <= 62 ? 5 : 3; if (hi <= 62) { score += Math.min(warmth, 4) * 0.4; if (!jacket && lo <= 50) score -= 1.5; } }
    if (bottom.color === 'white' || bottom.color === 'off-white') score -= dayHi < 72 && !mods.golf ? 3 : 0;          // white trousers are a warm weather call
    if (wet && shoes.suede) score -= 6;

    // ---- what this group, and anyone, has seen ----
    const majors = [jacket, isSuit ? null : bottom, top, shoes].filter(Boolean);
    const fresh = [];
    for (const it of majors) {
      const w = it.cat === 'shoes' ? 0.5 : 1;
      if (occ.group) {
        const last = groupSeen.get(it.id);
        if (!last) { score += 0.7 * w; fresh.push(it); }
        else {
          const gap = daysBetween(last, ctx.date);
          if (gap <= 9) score -= 7 * w;
          else if (gap <= 16) score -= 4 * w;
          else if (gap <= 30) score -= 1.5 * w;
        }
      }
      if (hist.adjacent.has(it.id)) score -= 5 * w;
      const lastAny = hist.any.get(it.id);
      if (lastAny) { const g = daysBetween(lastAny, ctx.date); score += g <= 3 ? -1.5 * w : 0.5 * Math.min(g, 30) / 30; }
      else score += 0.3;
    }
    if (shoes.dontDefault && !asked.has(shoes.id)) score -= 1.6;           // rotate shoes
    for (const it of [jacket, top, bottom, shoes, belt].filter(Boolean)) if (it.fitIssue) score -= 6;

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
    const coatFit = (c) => ((colorOf(c).tone === 'warm') === (metal === 'gold') ? 1 : 0) - Math.abs((c.formality || 3) - fAvg) * 0.6;
    let coat = null;
    if (locks.coat && locks.coat !== 'none') coat = get(locks.coat) || null;
    else if (locks.coat !== 'none') {
      const relaxed = ctx.occ === 'casual' || ctx.occ === 'bar';
      const cold = relaxed ? lo <= 42 : (lo <= 47 || hi <= 55);
      if (allow.coat) coat = coats.slice().sort((a, b) => coatFit(b) - coatFit(a))[0] || null;
      else if (cold && !(jacket && jacket.casual)) coat = (relaxed ? coats : coats.filter((c) => (c.formality || 3) >= 3)).slice().sort((a, b) => coatFit(b) - coatFit(a))[0] || null;
    }
    const hatTone = (h) => ((colorOf(h).tone === 'warm') === (metal === 'gold') ? 2 : -4);
    let hat = null;
    if (locks.hat && locks.hat !== 'none') { hat = get(locks.hat) || null; if (hat) score += hatTone(hat); }
    else if (allow.hat && locks.hat !== 'none') {
      const rank = (h) => hatTone(h) - Math.abs((h.formality || 3) - fAvg);
      hat = hats.slice().sort((a, b) => rank(b) - rank(a))[0] || null;
      if (hat) score += hatTone(hat);
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
    if (plan.length > 1) why.push(`Built for ${sayOf(plan[0])}, and it carries to ${listAnd(plan.slice(1).map(sayOf))}.`);
    if (belt && leatherMatch(belt, shoes) >= 0) why.push(`The ${belt.short || belt.name} matches the ${shoes.short || shoes.name}.`);
    else if (!loops) why.push('No belt, since these trousers have no loops.');
    if (statements.length === 1) why.push(`The ${statements[0].short || statements[0].name} is the one focal point; everything else stays quiet.`);
    if (occ.group && fresh.length) why.push(`${cap(groupName(ctx, occ.group))} has not seen the ${listAnd(names(fresh), 'or')}.`);
    if (tuck === 'tucked' && jacket && !isSuit) why.push('Fully tucked, because the jacket may come off.');
    if (coat) why.push(allow.coat || locks.coat ? `The ${coat.short || coat.name} goes on outside and comes off indoors.` : `It gets down to about ${Math.round(lo)}, so the ${coat.short || coat.name} goes on outside and comes off indoors.`);
    if (inPlan('lounge') && ctx.cars && ctx.cars.length) why.push(`Drive the ${ctx.cars[0]}.`);
    else if (jacket && dayLo <= 55 && dayHi >= 64 && !occ.teach) why.push(`High near ${Math.round(dayHi)}, about ${Math.round(dayLo)} at night: the jacket covers the evening.`);

    return {
      score,
      o: { occ: ctx.occ, date: ctx.date, suit: isSuit ? jacket.id : null, jacket: jacket ? jacket.id : 'none', top: top.id, bottom: bottom.id, belt: belt ? belt.id : 'none', shoes: shoes.id, socks: socks ? socks.id : null, watch: watch.id, glasses: glasses ? glasses.id : null, coat: coat ? coat.id : null, hat: hat ? hat.id : null, tuck,
        also: plan.slice(1), shift: sh || 0, easy: friday && !(occ.casualDays || []).includes(day), lab: !!mods.lab, extras: extras.slice() },
      why,
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
  // every fit that is handed over gets checked against the day and the rules, one factor at a time
  return picked.map((r) => { const checks = audit(ctx, r.o); return Object.assign(r, { checks, flags: checks.filter((c) => c.level === 'bad' || c.level === 'note').map((c) => c.t) }); });
}

// ---------- the check list ----------
// Verifies one finished fit, whoever chose it: the hours it is worn, the weather in those hours, and each standing rule.
// level: 'ok' cleared, 'note' worth a look, 'bad' breaks a rule, 'you' something only the wearer can check.
export function audit(ctx, o) {
  const get = (id) => ctx.items.find((i) => i.id === id);
  const key = o.occ || ctx.occ;
  const occ = OCCASIONS[key] || OCCASIONS.casual;
  const date = o.date || ctx.date;
  const plan = [key].concat((o.also || []).filter((k) => OCCASIONS[k] && k !== key));
  const easy = !!occ.teach && ((occ.casualDays || []).includes(dow(date)) || !!o.easy || !!o.lab);
  const suit = o.suit ? get(o.suit) : null;
  const jacket = suit || (o.jacket && o.jacket !== 'none' ? get(o.jacket) : null);
  const top = get(o.top), bottom = get(o.suit || o.bottom), shoes = get(o.shoes), watch = get(o.watch);
  const belt = o.belt && o.belt !== 'none' ? get(o.belt) : null;
  const socks = o.socks ? get(o.socks) : null, glasses = o.glasses ? get(o.glasses) : null;
  const coat = o.coat ? get(o.coat) : null, hat = o.hat ? get(o.hat) : null;
  const extras = (o.extras || []).map(get).filter(Boolean);
  const out = [];
  const add = (k, level, t, short) => { out.push(short ? { k, level, t, short } : { k, level, t }); };
  if (!top || !bottom || !shoes || !watch) { add('Closet', 'bad', 'A piece of this fit is no longer in the closet.'); return out; }
  const nm = (it) => it.short || it.name;
  const pieces = [hat, coat, jacket, top, suit ? null : bottom, belt, shoes, socks, watch, glasses].filter(Boolean);
  const majors = [jacket, suit ? null : bottom, top, shoes].filter(Boolean);
  const win = ctx.win || null;

  // when
  add('When', 'ok', fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' }) + (win ? `, ${hourLabel(win.from)} to ${hourLabel(win.to)}.` : '.'), win ? `${hourLabel(win.from)} to ${hourLabel(win.to)}` : '');

  // weather in the hours it is worn
  const w = ctx.weather || {};
  if (w.hi != null) {
    const hi = Math.round(w.hi), lo = Math.round(w.lo == null ? w.hi - 18 : w.lo), rain = Math.round(w.rain || 0), wind = Math.round(w.wind || 0);
    const bits = [(hi === lo ? `${hi}°` : `${lo}° to ${hi}°`) + (win ? ' in those hours' : ''), `rain ${rain}%`];
    if (wind >= 15) bits.push(`wind to ${wind} mph`);
    let t = cap(bits.join(', ')) + '.';
    t += w.estimate ? ' Seasonal average, no live forecast for that day.' : (w.at ? ` Checked ${clockLabel(w.at)}.` : '');
    const issues = [];
    const layers = (coat ? 3 : 0) + (jacket ? (jacket.warmth == null ? 2 : jacket.warmth) : 0) + (top.warmth == null ? 1 : top.warmth);
    if (lo <= 40 && layers < 4) issues.push(`${lo}° needs more than this. Add a coat.`);
    else if (lo <= 47 && layers < 3) issues.push(`${lo}° needs a layer over this.`);
    if (hi >= 88 && jacket && occ.jacket !== 'required') issues.push(`${hi}° is hot for a jacket.`);
    if (hi >= 78 && (top.warmth || 0) >= 3) issues.push(`${hi}° is too warm for the ${nm(top)}.`);
    if (hi <= 62 && top.warmth === 0 && !jacket) issues.push(`The ${nm(top)} is a warm weather shirt.`);
    if (coat && lo >= 62) issues.push(`It stays above ${lo}°, so the coat is optional.`);
    if (rain >= 50 && shoes.suede) issues.push(`Rain chance ${rain}%. Suede shoes will not like it.`);
    if (hat && wind >= 20) issues.push(`Wind near ${wind} mph. Hold on to the hat.`);
    const brief = `${hi === lo ? `${hi}°` : `${lo}° to ${hi}°`}, rain ${rain}%` + (w.estimate ? ', seasonal average' : '');
    if (issues.length) add('Weather', 'note', t + ' ' + issues.join(' '), brief);
    else add('Weather', 'ok', t + (rain >= 50 ? ' No suede today, and none here.' : coat ? ` The ${nm(coat)} handles outside.` : jacket && lo <= 60 ? ' The jacket covers it.' : ''), brief);
  }

  // only what is owned and in rotation
  const gone = pieces.filter((it) => it.status === 'retired');
  if (gone.length) add('Closet', 'bad', `${cap(listAnd(gone.map(nm)))} ${gone.length > 1 ? 'are' : 'is'} out of rotation.`);
  else {
    const said = pieces.concat(extras).filter((it) => it.said);      // pieces he named that the closet did not list
    add('Closet', 'ok', said.length ? `All ${pieces.length + extras.length} pieces are yours. ${cap(listAnd(said.map((it) => 'the ' + nm(it))))} came from your words, so ${said.length > 1 ? 'their' : 'its'} details are my best reading.` : `All ${pieces.length} pieces are in your closet.`);
    const blank = said.filter((it) => !it.color && it.cat !== 'extra' && it.cat !== 'watch');
    if (blank.length) add('Closet', 'you', `No colour on record for the ${listAnd(blank.map(nm))}. The mockup guesses it.`);
  }

  // the watch sets the metal
  const metal = watch.metal;
  const off = [];
  if (belt && belt.metal && metal && belt.metal !== metal) off.push(`the ${belt.metal} buckle`);
  if (glasses && glasses.metal && metal && !(metal === 'gold' ? ['gold', 'tortoise'].includes(glasses.metal) : glasses.metal === metal)) off.push(`the ${nm(glasses)}`);
  if (shoes.metal && metal && shoes.metal !== metal) off.push(`the ${shoes.metal} hardware on the shoes`);
  if (off.length) add('Metals', 'bad', `The ${nm(watch)} sets ${metal}. ${cap(listAnd(off))} ${off.length > 1 ? 'break' : 'breaks'} it.`);
  else add('Metals', 'ok', `${cap(metal || 'one metal')} throughout: ${listAnd([nm(watch)].concat(belt && belt.metal ? [`${belt.metal} buckle`] : [], glasses ? [nm(glasses)] : []))}.`);
  if (belt && !belt.metal && metal) add('Metals', 'you', `Check that the buckle on the ${nm(belt)} is ${metal}.`);
  const goldStop = plan.find((k) => OCCASIONS[k].gold);
  if (goldStop && metal !== 'gold') add('Metals', 'note', `${cap(sayOf(goldStop))} calls for the gold watch under your rules.`);

  // belt
  const loops = bottom.loops !== false;
  if (belt) {
    const lm = leatherMatch(belt, shoes);
    if (!loops) add('Belt', 'bad', 'These trousers have no belt loops.');
    else if (lm <= -3) add('Belt', 'bad', `The ${nm(belt)} does not match the ${nm(shoes)}.`);
    else if (lm < 0) add('Belt', 'note', `The ${nm(belt)} is a shade off the ${nm(shoes)}.`);
    else add('Belt', 'ok', !shoes.leather || shoes.leather === 'none' ? `The ${nm(belt)} works with the ${nm(shoes)}.` : 'Belt leather matches the shoes.');
  } else if (!loops) add('Belt', 'ok', 'No belt: these trousers have no loops.');
  else if (o.tuck === 'tucked') add('Belt', 'bad', 'Tucked with visible loops needs a belt.');
  else add('Belt', 'ok', 'No belt needed: untucked, waistband covered.');

  // tuck
  if ((top.tuck === 'untucked-only' || solo(top)) && o.tuck === 'tucked') add('Tuck', 'bad', `The ${nm(top)} is worn untucked only.`);
  else if (o.tuck === 'untucked' && suit) add('Tuck', 'bad', 'A suit takes a tucked shirt.');
  else if (o.tuck === 'untucked' && top.tuck !== 'untucked-only' && !solo(top) && !top.untuckOk) add('Tuck', 'bad', `The ${nm(top)} is cut to be tucked.`);
  else add('Tuck', 'ok', o.tuck === 'tucked' ? (jacket && !suit ? 'Fully tucked, so the jacket can come off.' : 'Fully tucked.') : 'Untucked, hem above mid fly.');

  // one focal point
  const loud = [jacket, top, suit ? null : bottom, shoes, belt].filter((x) => x && x.statement);
  if (loud.length > 1) add('Focal point', 'bad', `${cap(listAnd(loud.map((x) => 'the ' + nm(x))))} compete. One statement piece per look.`);
  else add('Focal point', 'ok', loud.length ? `One focal point: the ${nm(loud[0])}.` : 'Nothing competes for attention.');

  // dress level for the plan
  let bandLo = easy ? 2 : occ.lo, bandHi = easy ? 4 : occ.hi;
  const sh = occ.teach ? Math.max(0, o.shift || 0) : (o.shift || 0);
  if (sh) { bandLo = Math.max(1, Math.min(4.5, bandLo + sh)); bandHi = Math.min(5, Math.max(bandLo + 1, bandHi + sh)); }
  const wrong = majors.filter((it) => (it.formality || 3) < bandLo - 1 || (it.formality || 3) > bandHi + 1);
  if (wrong.length) add('Dress level', 'note', `The ${listAnd(wrong.map(nm))} ${wrong.length > 1 || /[^s]s$/.test(nm(wrong[0])) ? 'sit' : 'sits'} outside the dress level for ${sayOf(key)}.`);
  else add('Dress level', 'ok', `Right level for ${listAnd(plan.map(sayOf))}.`);
  if (isDenim(bottom) && key === 'dressy') add('Dress level', 'bad', 'Jeans are below a special occasion.');

  // tailoring rules
  if (jacket && bottom.athletic && !jacket.unstructured) add('Jacket', 'bad', 'No athletic trousers under a structured jacket.');
  if (jacket && solo(top)) add('Jacket', 'bad', `The ${nm(top)} is worn on its own, without a jacket.`);
  if (jacket && !suit && jacket.cat === 'suit' && !jacket.separateJacket) add('Jacket', 'bad', `The ${nm(jacket)} is smooth cloth. Its jacket stays with its trousers.`);
  for (const it of [jacket, top, suit ? null : bottom, shoes, belt].filter(Boolean)) {
    if (it.only && !it.only.some((k) => plan.includes(k))) add('Rules', 'note', `${it.name}: your rules save it for other settings.`);
    if (it.fitIssue) add('Fit', 'note', `${it.name}: ${it.fitIssue}`);
  }

  // class rules and what this group has seen
  const hist = buildHistory(ctx.wears || [], date);
  if (occ.teach) {
    const probs = [];
    if (!jacket && !easy) probs.push('A lecture day calls for a jacket.');
    if (jacket && jacket.casual && !easy) probs.push('A lecture calls for a tailored jacket.');
    for (const it of [jacket, top, suit ? null : bottom, shoes, belt].filter(Boolean)) if (it.noTeach) probs.push(`${it.name}: your rules keep it out of class.`);
    if (belt && belt.statement) probs.push('Class gets a plain buckle.');
    if (isDenim(bottom) && occ.formalDay) probs.push('Jeans on a full lecture day are a step down for this group.');
    if (isDenim(bottom) && easy && (ctx.wears || []).some((x) => x.group === occ.group && (occ.casualDays || []).includes(dow(x.date)) && daysBetween(x.date, date) > 0 && daysBetween(x.date, date) <= 8 && (x.items || []).some((id) => isDenim(get(id))))) probs.push('This group saw denim on its last dressed down day.');
    if (probs.length) probs.forEach((p) => add('Class', 'note', p));
    else add('Class', 'ok', o.lab ? 'No jacket under the lab coat. Nothing your rules keep out of class.' : easy ? 'Dressed down day. Nothing your rules keep out of class.' : 'Jacket in place for the lecture. Nothing your rules keep out of class.');
    if (occ.group) {
      const seen = hist.byGroup[occ.group] || new Map();
      const gname = groupName(ctx, occ.group);
      const reps = majors.map((it) => ({ it, last: seen.get(it.id) })).filter((x) => x.last && daysBetween(x.last, date) <= (x.it.cat === 'shoes' ? 6 : 16));
      if (reps.length) reps.forEach((r) => add('Repeats', 'note', `${cap(gname)} saw the ${nm(r.it)} on ${shortDate(r.last)}.`));
      else add('Repeats', 'ok', `Nothing here repeats for ${gname} in the last 16 days.`);
    }
  }

  // rotation across days
  const again = majors.filter((it) => hist.adjacent.has(it.id));
  const pinkNear = top.color === 'pink' && (ctx.wears || []).some((x) => Math.abs(daysBetween(x.date, date)) === 1 && (x.items || []).some((id) => { const t = get(id); return t && t.cat === 'top' && t.color === 'pink' && t.id !== top.id; }));
  if (again.length) again.forEach((it) => add('Rotation', 'note', `${it.name}: also worn or planned the day before or after.`));
  else if (pinkNear) add('Rotation', 'note', 'A pink shirt two days in a row.');
  else add('Rotation', 'ok', 'Nothing repeats from the day before or after.');

  // socks
  if (socks) {
    const casualShoe = ['sneaker', 'driver', 'slide'].includes(shoes.sub);
    if (socks.sub === 'no-show') add('Socks', jacket && !casualShoe ? 'bad' : 'ok', jacket && !casualShoe ? 'No show socks do not go with tailoring.' : 'No show socks with a casual look.');
    else add('Socks', 'ok', jacket ? 'Mid calf socks with tailoring.' : 'Mid calf socks.');
  }

  if (extras.length) add('Accessories', 'you', `${cap(listAnd(extras.map((x) => 'the ' + nm(x))))}: in because you asked. Matching ${extras.length > 1 ? 'them' : 'it'} to the rest is yours to check.`);
  if (hat) add('Hat', 'you', `${hat.name}: outdoors only. Off when you walk in, off while you lecture, off in the lounge.`);
  if (hat && metal && (colorOf(hat).tone === 'warm') !== (metal === 'gold') && colorOf(hat).tone !== 'neutral') add('Hat', 'note', `The ${nm(hat)} is a ${colorOf(hat).tone} piece on a ${metal === 'gold' ? 'warm, gold' : 'cool, silver'} fit.`);
  if (occ.teach || occ.jacket !== 'optional') add('Yours to check', 'you', 'Pressed, lint free, shoes conditioned, nothing faded.');
  return out;
}
// ---------- why this fit ----------
// Says in plain words why a fit suits the day it is for: the occasion, the weather in the hours it is worn, how the colours
// and the details hold together, what is fresh about it, and what is there because he asked. One reason per line, each with
// a few words (s) that can stand in a summary. It reads any complete fit, whoever chose it.
export function explain(ctx, o, named = []) {
  const get = (id) => ctx.items.find((i) => i.id === id);
  const key = o.occ || ctx.occ, occ = OCCASIONS[key] || OCCASIONS.casual, date = o.date || ctx.date;
  const suit = o.suit ? get(o.suit) : null;
  const jacket = suit || (o.jacket && o.jacket !== 'none' ? get(o.jacket) : null);
  const top = get(o.top), bottom = get(o.suit || o.bottom), shoes = get(o.shoes), watch = get(o.watch);
  if (!top || !bottom || !shoes || !watch) return [];
  const belt = o.belt && o.belt !== 'none' ? get(o.belt) : null, glasses = o.glasses ? get(o.glasses) : null;
  const coat = o.coat ? get(o.coat) : null;
  const nm = (it) => it.short || it.name;
  const are = (it) => (/[^s]s$/.test(nm(it)) ? 'are' : 'is');
  const out = [];
  const add = (k, t, s) => { if (t) out.push(s ? { k, t, s } : { k, t }); };
  const plan = [key].concat((o.also || []).filter((k) => OCCASIONS[k] && k !== key));
  const easy = !!occ.teach && ((occ.casualDays || []).includes(dow(date)) || !!o.easy || !!o.lab);
  const majors = [jacket, suit ? null : bottom, top, shoes].filter(Boolean);
  const asked = new Set(named || []);

  // the occasion and the dress level it wants
  const fs = [top, bottom, shoes].concat(jacket ? [jacket] : []).map((x) => x.formality || 3);
  const f = fs.reduce((a, b) => a + b, 0) / fs.length;
  const word = (v) => (v < 1.8 ? 'very relaxed' : v < 2.6 ? 'relaxed' : v < 3.4 ? 'smart casual' : v < 4.6 ? 'sharp' : 'formal');
  let lo = easy ? 2 : occ.lo, hi = easy ? 4 : occ.hi;
  const sh = occ.teach ? Math.max(0, o.shift || 0) : (o.shift || 0);
  if (sh) { lo = Math.max(1, Math.min(4.5, lo + sh)); hi = Math.min(5, Math.max(lo + 1, hi + sh)); }
  const where = key === 'dressy' ? 'a special occasion' : sayOf(key);
  const built = jacket ? (suit ? `the ${nm(suit)} worn as a full suit` : `the ${nm(jacket)} over the ${nm(top)}`) : `the ${nm(top)} with the ${nm(bottom)}`;
  const carries = plan.length > 1 ? ` It also holds up at ${listAnd(plan.slice(1).map(sayOf))}.` : '';
  if (occ.teach && !easy) add('Occasion', `A lecture day calls for a jacket and a shirt that can stand in front of a room. ${jacket ? cap(built) + ' does that' : 'No jacket here' + (o.lab ? ', since the lab coat goes over it' : '')}.${carries}`, 'right for the lecture');
  else if (occ.teach) add('Occasion', `This is the group's dressed down day, so it eases off a notch and still looks like the person in charge: ${built}.${carries}`, 'eased off for the dressed down day');
  else {
    const want = word(lo) === word(hi) ? word(lo) : `${word(lo)} to ${word(hi)}`;
    const off = f < lo - 0.6 ? ' That is a step under the usual, because of what you asked for.' : f > hi + 0.6 ? ' That is a step over the usual, because of what you asked for.' : '';
    add('Occasion', `${cap(where)} wants ${want}. This reads ${word(f)}: ${built}.${off}${carries}`, `${word(f)} enough for ${where}`);
  }

  // the weather in the hours it is worn
  const w = ctx.weather || {};
  const bC = colorOf(bottom), tC = colorOf(top), jC = jacket ? colorOf(jacket) : null;
  if (w.hi != null) {
    const whi = Math.round(w.hi), wlo = Math.round(w.lo == null ? w.hi - 18 : w.lo), rain = Math.round(w.rain || 0);
    const range = whi === wlo ? `${whi}°` : `${wlo}° to ${whi}°`;
    let t, s;
    const layers = (jacket ? (jacket.warmth == null ? 2 : jacket.warmth) : 0) + (top.warmth == null ? 1 : top.warmth);     // the same count the check list uses
    if (coat) { t = `It gets down to ${wlo}°, so the ${nm(coat)} goes over it outside and comes off indoors.`; s = `covered for ${wlo}°`; }
    else if ((wlo <= 40 && layers < 4) || (wlo <= 47 && layers < 3)) { t = `It gets down to ${wlo}°. This is right indoors, and it wants a coat or a layer over it outside.`; s = ''; }
    else if (whi <= 64) { t = jacket ? `Cool, ${range}. The ${nm(jacket)} over the ${nm(top)} is enough warmth without a coat.` : (top.warmth || 1) >= 2 ? `Cool, ${range}. The ${nm(top)} is the warm layer.` : `Cool, ${range}. Take a layer for outside.`; s = `warm enough for ${wlo}°`; }
    else if (whi >= 86) { t = jacket ? `Hot, up to ${whi}°. The jacket is there for the room, and it comes off outside.` : `Hot, up to ${whi}°. No jacket, and the ${nm(top)} breathes.`; s = `light enough for ${whi}°`; }
    else { t = jacket ? `Mild, ${range}. The jacket is comfortable at that, on or off.` : `Mild, ${range}. One layer is right.`; s = `right for ${range}`; }
    if (rain >= 50 && !shoes.suede) t += ' Rain is likely, and nothing here is suede.';
    if (ctx.win && ctx.win.from >= 17 && bC.d >= 6) t += ' After dark the darker trousers read right.';
    add('Weather', t, s);
  }

  // colour
  const metal = watch.metal;
  const tones = [jC, tC, bC].filter(Boolean).map((c) => c.tone);
  const warm = tones.filter((x) => x === 'warm').length, cool = tones.filter((x) => x === 'cool').length;
  const pal = [...new Set([jacket && jC.label, tC.label, bC.label].filter(Boolean))];
  let col = '';
  if (pal.length && metal && ((metal === 'gold' && warm >= cool && warm > 0) || (metal === 'silver' && cool >= warm && cool > 0))) col = `${cap(listAnd(pal))} ${pal.length > 1 ? 'are' : 'is'} ${metal === 'gold' ? 'warm' : 'cool'} in tone, which is why the ${metal} ${nm(watch)} belongs with ${pal.length > 1 ? 'them' : 'it'}.`;
  else if (pal.length) col = `${cap(listAnd(pal))}: quiet colours that sit together.`;
  if (suit) col += ' One cloth from shoulder to shoe.';
  else if (jacket && jC.label && bC.label && Math.abs(jC.d - bC.d) >= 3) col += ` The ${jC.label} jacket and ${bC.label} trousers are far enough apart to look deliberate.`;
  else if (!jacket && tC.label && bC.label && Math.abs(tC.d - bC.d) >= 3) col += ` ${cap(tC.label)} over ${bC.label} gives a clean break at the waist.`;
  if (jacket && tC.label && tC.d < jC.d) col += ` The lighter ${tC.label} under the jacket keeps the light on your face.`;
  const ACCENTS = ['pink', 'red', 'lavender', 'green', 'sage', 'mustard', 'burgundy', 'purple', 'orange', 'teal', 'turquoise', 'coral', 'yellow'];
  const accents = majors.filter((x) => ACCENTS.includes(x.color));
  if (accents.length === 1) col += ` One accent, the ${nm(accents[0])}.`;
  add('Colour', col.trim(), metal ? `${metal === 'gold' ? 'warm' : 'cool'} tones with the ${metal} watch` : 'colours that sit together');

  // the details his rules care about
  const det = [];
  const loops = bottom.loops !== false;
  const leather = belt && shoes.leather && shoes.leather !== 'none' && leatherMatch(belt, shoes) >= 0;
  if (leather) det.push('Belt and shoes are the same leather family.');
  else if (!loops) det.push('No belt, since these trousers have no loops.');
  else if (!belt && o.tuck !== 'tucked') det.push('Untucked, so no belt is needed.');
  const metals = [belt && belt.metal, glasses && (glasses.metal === 'tortoise' ? (metal === 'gold' ? 'gold' : 'x') : glasses.metal)].filter(Boolean);
  if (metal && metals.length && metals.every((m) => m === metal)) det.push(`${cap(listAnd([belt && belt.metal ? 'buckle' : '', glasses ? 'frames' : '', 'watch'].filter(Boolean)))} ${metals.length > 1 ? 'all agree' : 'agree'}${glasses && glasses.metal === 'tortoise' ? ', tortoiseshell counting as gold' : ''}.`);
  if (o.tuck === 'tucked' && jacket && !suit) det.push('Fully tucked, so the jacket can come off.');
  else if (o.tuck === 'untucked') det.push('Worn untucked, hem above mid fly.');
  add('Details', det.join(' '), leather ? 'belt and shoes matched' : '');

  // one thing draws the eye
  const loud = [jacket, top, suit ? null : bottom, shoes, belt].filter((x) => x && x.statement);
  if (loud.length === 1) add('Focal point', `The ${nm(loud[0])} ${are(loud[0])} the one thing that draws the eye. Everything else stays quiet.`, 'one focal point');

  // what is fresh about it
  const hist = buildHistory(ctx.wears || [], date);
  if (occ.group) {
    const seen = hist.byGroup[occ.group] || new Map();
    const fresh = majors.filter((it) => !seen.has(it.id));
    if (fresh.length) add('Fresh', `${cap(groupName(ctx, occ.group))} has not seen the ${listAnd(fresh.map(nm), 'or')}.`, 'new to this group');
  } else {
    const rested = majors.filter((it) => { const last = hist.any.get(it.id); return last && daysBetween(last, date) >= 14; });
    const never = majors.filter((it) => !hist.any.has(it.id) && !hist.sameDay.has(it.id));
    if (never.length) add('Fresh', `The ${listAnd(never.map(nm))} ${never.length > 1 || are(never[0]) === 'are' ? 'have' : 'has'} not been logged before.`, 'not worn before');
    else if (rested.length) add('Fresh', `You have not worn the ${listAnd(rested.map(nm))} in at least two weeks.`, 'not worn lately');
  }

  // what is there because he asked
  const mine = [jacket, suit ? null : bottom, top, shoes, belt, coat, o.hat ? get(o.hat) : null, watch, glasses].filter((x) => x && asked.has(x.id)).concat((o.extras || []).map(get).filter(Boolean));
  if (mine.length) add('You asked', `The ${listAnd(mine.map(nm))} ${mine.length > 1 || are(mine[0]) === 'are' ? 'are' : 'is'} in because you asked. The rest is built around ${mine.length > 1 ? 'them' : 'it'}.`);
  if (plan.includes('lounge') && ctx.cars && ctx.cars.length) add('Drive', `Take the ${ctx.cars[0]}.`);
  return out;
}
export const sayOf = (k) => (OCCASIONS[k] && OCCASIONS[k].say) || 'the day';
const FAMILY = { tan: 'tan', camel: 'tan', khaki: 'tan', stone: 'tan', cognac: 'tan', taupe: 'tan', cream: 'cream', 'off-white': 'cream', white: 'cream', navy: 'blue', indigo: 'blue', blue: 'blue', 'light-blue': 'blue', slate: 'blue',
  charcoal: 'grey', grey: 'grey', 'light-grey': 'grey', olive: 'green', green: 'green', sage: 'green', brown: 'brown', 'dark-brown': 'brown', burgundy: 'red', red: 'red', lavender: 'purple', purple: 'purple' };
const familyOf = (it) => FAMILY[it.color] || it.color;
// Shirts that are the whole look: worn untucked and never under a jacket.
const solo = (t) => !!t && (!!t.solo || /\bbarong\b/i.test(t.name || ''));
export function hourLabel(h) {
  const x = ((Math.round(h) % 24) + 24) % 24;
  if (x === 0) return 'midnight';
  if (x === 12) return 'noon';
  return (x % 12) + (x < 12 ? ' AM' : ' PM');
}
export const clockLabel = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const THEMES = { black: ['black'], navy: ['navy', 'indigo'], blue: ['blue', 'navy', 'light-blue', 'indigo', 'slate'], grey: ['grey', 'charcoal', 'light-grey', 'slate'], brown: ['brown', 'dark-brown', 'tan', 'camel', 'khaki', 'cognac', 'taupe'], tan: ['tan', 'camel', 'khaki', 'stone'], white: ['white', 'off-white', 'cream'], green: ['green', 'olive', 'sage'], olive: ['olive', 'green'] };

export function alternatives(ctx, current, slot, locks = {}, base = {}) {
  // best complete look for every candidate in one slot, holding the rest of the current look where the rules allow
  const cat = slot === 'jacket' ? null : slot;
  let cands;
  if (slot === 'jacket') cands = ctx.items.filter((i) => (i.cat === 'jacket' || i.cat === 'suit') && i.status !== 'retired').map((i) => i.id).concat(['none']);
  else if (slot === 'tuck') cands = ['tucked', 'untucked'];
  else cands = ctx.items.filter((i) => i.cat === cat && i.status !== 'retired').map((i) => i.id).concat(['belt', 'coat', 'hat'].includes(slot) ? ['none'] : []);
  const out = [];
  const hold = { jacket: current.suit || current.jacket, top: current.top, bottom: current.bottom, shoes: current.shoes, watch: current.watch };
  if (current.suit) delete hold.bottom;
  // what was asked for still counts, except on the slot being changed by hand
  const mods = Object.assign({}, base.mods || {});
  if (slot === 'jacket') { delete mods.wantSuit; delete mods.noSuit; }
  if (slot === 'bottom') delete mods.noDenim;
  const allow = Object.assign({}, base.allow || {}); delete allow[slot];
  const shared = { mods, allow, exclude: base.exclude, prefer: current, n: 1, minDiff: 0 };
  for (const id of cands) {
    const pick = { [slot]: id };
    const strict = Object.assign({}, hold, locks, pick);
    if (slot === 'jacket') delete strict.bottom;
    const noWatch = Object.assign({}, strict); if (!locks.watch && slot !== 'watch') delete noWatch.watch;
    const r = solve(ctx, Object.assign({}, shared, { locks: strict }))[0]
      || solve(ctx, Object.assign({}, shared, { locks: noWatch }))[0]
      || solve(ctx, Object.assign({}, shared, { locks: Object.assign({}, locks, pick) }))[0]
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

export const majorIds = (o) => [o.suit || (o.jacket !== 'none' ? o.jacket : null), o.suit ? null : o.bottom, o.top, o.shoes, o.belt !== 'none' ? o.belt : null, o.socks, o.watch, o.glasses, o.coat, o.hat].concat(o.extras || []).filter(Boolean);
export const signature = (o) => [o.suit || o.jacket, o.top, o.bottom, o.belt, o.shoes, o.socks, o.watch, o.glasses, o.coat || '', o.hat || '', o.tuck].join('|') + ((o.extras || []).length ? '|+' + o.extras.slice().sort().join('+') : '');

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
  const ex = (o.extras || []).map(get).filter(Boolean).map((x) => ({ slot: 'extra', label: extraLabel(x), item: x, note: 'you asked for it' }));
  const chest = (x) => ['tie', 'bowtie', 'scarf', 'vest', 'waistcoat', 'pocketsquare', 'necklace', 'chain', 'suspenders'].includes(x.item.sub);   // worn at the chest: listed with the shirt
  r.push(...ex.filter(chest));
  if (!o.suit) r.push({ slot: 'bottom', item: get(o.bottom) });
  const b = get(o.suit || o.bottom);
  r.push({ slot: 'belt', item: o.belt && o.belt !== 'none' ? get(o.belt) : null, note: o.belt && o.belt !== 'none' ? '' : (b && b.loops === false ? 'no loops' : '') });
  r.push({ slot: 'shoes', item: get(o.shoes) });
  r.push({ slot: 'socks', item: o.socks ? get(o.socks) : null });
  r.push({ slot: 'watch', item: get(o.watch) });
  r.push({ slot: 'glasses', item: o.glasses ? get(o.glasses) : null });
  r.push(...ex.filter((x) => !chest(x)));
  return r;
}

export function describe(o, items) {
  return rows(o, items).filter((r) => r.item || r.slot === 'belt').map((r) => {
    const label = r.label || SLOT_LABEL[r.slot];
    const name = r.item ? r.item.name : 'none';
    return `${label}: ${name}${r.item && r.note ? ', ' + r.note : (!r.item && r.note ? ' (' + r.note + ')' : '')}`;
  }).join('\n');
}
