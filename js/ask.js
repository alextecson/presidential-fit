// Presidential Fit: reads the answer to "What is the fit for?" and turns it into a brief for the outfit engine.
// Nothing personal lives here. Class groups, named pieces and custom occasion names are read from the closet on the phone.
import { OCCASIONS, addDays, dow, daysBetween, isoDate, isDenim } from './engine.js';

const words = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
const set = (s) => new Set(s.split(/\s+/).filter(Boolean));

// ---------- what kind of day ----------
// Listed in the order that decides which occasion leads when several are named. The rest ride along.
const KINDS = [
  ['dressy', words('wedding, weddings, graduation, commencement, interview, funeral, memorial, ceremony, gala, banquet, formal, black tie, baptism, christening, recital, awards, pinning')],
  ['teach', words('teach, teaching, lecture, lectures, lecturing, class, classes, classroom, lab, seminar, campus, students, exam, exams, finals, midterm, midterms, office hours')],
  ['work', words('work, working, office, meeting, meetings, conference, presentation, presenting, client, clients, hospital, clinic, clinical, clinicals, rounds, patient, patients, survey, inspection, deposition, hearing, orientation, training, workshop, networking, church, mass, temple, board meeting, site visit, home visit, home visits')],
  ['event', words('concert, show, event, game, casino, party, theater, theatre, festival, residency, comedy, musical, opera, symphony, fight, premiere, reception, fundraiser, night out, movie, movies, nightclub, clubbing, cruise, tailgate')],
  ['dinner', words('dinner, restaurant, steakhouse, supper, reservation, reservations, date night, a date, first date, lunch, brunch, eat out, eating out, out to eat, sushi, buffet')],
  ['lounge', words('lounge')],
  ['bar', words('bar, bars, drinks, happy hour, pub, brewery, cocktails, beers, beer, pool hall, billiards, tavern, speakeasy, winery, wine tasting')],
  ['casual', words('casual, errands, errand, nothing, home, chill, chilling, relax, relaxing, shopping, mall, groceries, grocery, day off, off day, travel, traveling, travelling, flight, flying, airport, road trip, walk, park, coffee, breakfast, barber, haircut, weekend, lazy, hang out, hanging out, cookout, bbq, barbecue, picnic, kids, family, friends, chores, appointment, doctor, dentist, beach, driving range')],
  ['holiday', words('thanksgiving, christmas, xmas, easter, new years, new year, birthday, anniversary, valentines, holiday')],
];
const ORDER = ['dressy', 'teach', 'work', 'event', 'dinner', 'lounge', 'bar'];
const MOOD_WORDS = new Set(['casual', 'chill', 'chilling', 'lazy', 'relax', 'relaxing']);
const SMART = words('elevated casual, smart casual, business casual, dressy casual, sharp casual, upscale casual, polished casual');
const DOWN = words('more casual, less formal, less dressy, not too dressy, not too formal, not dressy, not formal, not fancy, nothing fancy, dress down, dressed down, dressing down, tone it down, toned down, turn it down, low key, lowkey, laid back, relaxed, comfortable, comfy, keep it simple');
const UP = words('more formal, look my best, best dressed, step it up, dress up, dressed up, dressing up, dressier, dressy, elevated, sharper, sharp, polished, classier, classy, impress, upscale, fancy');
const NEG = set('no not without skip skipping minus except never dont wont isnt wasnt cant cancel canceled cancelled drop ditch lose nix');
const FILL = set('the my a an any more that those these of wear wearing to going doing at in on for it is be am i im have having do go');
const INTENT = set('wear wearing with in add adding use using want around and plus my the a an try rock rocking bring keep swap switch to for');
const GENERIC = set('special occasion happy hour night evening morning visit room club house place time date out day the or and a of');

// Default hours for each kind of day, and for a part of the day when one is named.
const WINDOWS = { teach: [7, 16], work: [8, 18], dinner: [18, 22], lounge: [17, 23], bar: [17, 24], event: [18, 24], dressy: [15, 23], casual: [9, 19] };
const PARTS = { morning: [6, 12], midday: [11, 14], afternoon: [12, 17], evening: [17, 22], night: [18, 24], allday: [7, 22] };
const EVENING_KINDS = new Set(['dinner', 'lounge', 'bar', 'event', 'dressy']);
const DAYPART = new Set(['morning', 'noon', 'midday', 'afternoon', 'evening', 'night', 'tonight', 'tonite', 'lunchtime', 'home', 'work', 'school']);

// ---------- closet vocabulary ----------
const STOP = set(`a an the my his her our your this that these those some any of for to in on at by from with without and or nor but then so as is are was were be been am i im me we you it its
  do does did will would should can could may might must have has had want wants need needs going go get got give make put add use try keep wear wearing wore worn fit fits outfit look looks style vibe vibes
  day days night today tonight tomorrow morning afternoon evening week weekend maybe just only also please like something anything nothing thing things up down out off over under side new old plus non iron
  base theme logged no not show more less very really too all one two first last next other same best good nice great little bit lot kind sort type time times way home work class back front left right
  big small high low hot cold warm cool overseas fashion driving after before about into onto still again`);
const DESC = set(`dark light pale bright deep solid plain striped stripe stripes pinstripe check checked plaid textured knit cable leather suede wool cotton linen canvas tech mesh stretch slim long short sleeve
  sleeved collar collared open custom tailored tailor dress casual formal mid calf ribbed quilted reversible unstructured structured metal gold silver steel stainless tortoise tortoiseshell yellow white black
  grey charcoal navy blue indigo cream ivory pink stone khaki tan camel cognac brown olive green sage burgundy maroon mustard purple lavender lilac taupe slate red rust beige offwhite noshow golf felt fine medium
  lining sole wedge grain pebble crew neck band point spread`);
const COLOR_WORDS = {
  navy: ['navy', 'blue'], indigo: ['indigo', 'blue', 'dark'], blue: ['blue'], 'light-blue': ['blue', 'light'], slate: ['slate', 'blue', 'grey'],
  charcoal: ['charcoal', 'grey', 'dark'], grey: ['grey'], 'light-grey': ['grey', 'light'], black: ['black'],
  white: ['white'], 'off-white': ['white', 'offwhite', 'cream', 'ivory'], cream: ['cream', 'ivory', 'offwhite'],
  stone: ['stone', 'beige'], khaki: ['khaki', 'tan', 'beige'], tan: ['tan', 'beige'], camel: ['camel', 'tan'], cognac: ['cognac', 'brown'], brown: ['brown'], 'dark-brown': ['brown', 'dark'],
  olive: ['olive', 'green'], green: ['green', 'dark'], sage: ['sage', 'green'], burgundy: ['burgundy', 'maroon', 'red'], red: ['red'], pink: ['pink'], mustard: ['mustard', 'yellow'],
  purple: ['purple'], lavender: ['lavender', 'purple', 'lilac'], taupe: ['taupe'], gold: ['gold'], silver: ['silver'], tortoise: ['tortoise', 'tortoiseshell'],
};
const COLOR_SET = new Set(Object.values(COLOR_WORDS).flat().filter((w) => !['dark', 'light'].includes(w)).concat(['yellow', 'orange', 'teal', 'turquoise']));
const CAT_WORDS = { suit: ['suit'], jacket: ['jacket', 'blazer'], coat: ['coat'], bottom: ['pants'], shoes: ['shoes'], belt: ['belt'], socks: ['socks'], watch: ['watch'], glasses: ['glasses', 'frames'], hat: ['hat'], top: [] };
const SUB_WORDS = {
  'knit-polo': ['polo', 'knit'], polo: ['polo'], ocbd: ['oxford', 'buttondown'], 'dress-shirt': ['dress'], 'camp-shirt': ['camp'], tee: ['tee'], sweater: ['sweater'],
  jeans: ['jeans'], loafer: ['loafers'], oxford: ['oxford', 'oxfords'], derby: ['derby', 'derbies'], driver: ['drivers', 'mocs', 'moccasins', 'loafers'], sneaker: ['sneakers'], slide: ['slides', 'sandals'],
  boot: ['boots'], 'no-show': ['noshow'],
};
const NAME_SYN = { trilby: ['fedora'], wingtips: ['brogues'], puffer: ['parka'], trench: ['raincoat'] };     // what people also call it
// Garment words, and which part of the closet each one points at. An empty list means the closet has no slot for it.
const NOUNS = {
  suit: ['suit'], tux: ['suit'], tuxedo: ['suit'], jacket: ['jacket'], blazer: ['jacket'],
  coat: ['coat'], trench: ['coat'], puffer: ['coat'], parka: ['coat'], peacoat: ['coat'], raincoat: ['coat'],
  shirt: ['top'], polo: ['top'], sweater: ['top'], tee: ['top'], buttondown: ['top'], turtleneck: ['top'], henley: ['top'], cardigan: ['top'], hoodie: ['top'],
  pants: ['bottom'], jeans: ['bottom'], shorts: ['bottom'],
  shoes: ['shoes'], loafers: ['shoes'], sneakers: ['shoes'], oxfords: ['shoes'], wingtips: ['shoes'], boots: ['shoes'], boot: ['shoes'], drivers: ['shoes'], slides: ['shoes'], sandals: ['shoes'], brogues: ['shoes'], derbies: ['shoes'], mocs: ['shoes'], moccasins: ['shoes'],
  belt: ['belt'], socks: ['socks'], watch: ['watch'], glasses: ['glasses'], frames: ['glasses'], sunglasses: ['glasses'], shades: ['glasses'],
  hat: ['hat'], fedora: ['hat'], trilby: ['hat'], cap: ['hat'], beanie: ['hat'],
  tie: [], bowtie: [], scarf: [], gloves: [], vest: [], waistcoat: [],
};
const CANON = [
  [/\b(trousers|slacks|chinos|pant)\b/g, 'pants'], [/\bkhakis\b/g, 'khaki pants'], [/\bdenims?\b/g, 'jeans'], [/\bt ?shirts?\b|\btees\b/g, 'tee'], [/\bbutton ?downs?\b/g, 'buttondown'],
  [/\bsports? ?(coat|jacket)s?\b|\bblazers\b/g, 'blazer'], [/\b(over|top)coats?\b/g, 'coat'], [/\bsweaters\b/g, 'sweater'], [/\bpolos\b/g, 'polo'], [/\bshirts\b/g, 'shirt'],
  [/\bjackets\b/g, 'jacket'], [/\bsuits\b/g, 'suit'], [/\bhats\b/g, 'hat'], [/\bbelts\b/g, 'belt'], [/\bcoats\b/g, 'coat'], [/\bwatches\b/g, 'watch'], [/\bsneaker\b|\btrainers\b|\bkicks\b/g, 'sneakers'],
  [/\bloafer\b/g, 'loafers'], [/\bwingtip\b/g, 'wingtips'], [/\bshoe\b/g, 'shoes'], [/\bsock\b/g, 'socks'], [/\bpennies\b/g, 'penny loafers'], [/\bframe\b/g, 'frames'],
  [/\bno ?shows?\b/g, 'noshow'], [/\boff ?white\b/g, 'offwhite'], [/\bgray\b/g, 'grey'],
];
const canon = (s) => CANON.reduce((t, [re, to]) => t.replace(re, to), s);
const sing = (w) => (w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.endsWith('s') ? w.slice(0, -1) : w);

function clean(t) {
  return String(t || '').toLowerCase()
    .replace(/[‘’'`]/g, '')
    .replace(/\b([ap])\.m\.?/g, '$1m')
    .replace(/(\d{1,2}):\d{2}/g, '$1')
    .replace(/&|\+/g, ' and ')
    .replace(/[.,;:!?()\n\r]+/g, ' | ')
    .replace(/[^a-z0-9/| ]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
function nameTokens(str) {
  const s = canon(String(str || '').toLowerCase().replace(/[‘’'`]/g, '').replace(/([a-z0-9])-(?=[a-z0-9])/g, '$1').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim());
  return s.split(' ').filter((w) => w.length > 1 && !STOP.has(w));
}
function buildIndex(items) {
  const rows = [], vocab = new Set();
  for (const it of items || []) {
    if (it.status === 'retired') continue;
    const own = new Set(nameTokens(it.name).concat(nameTokens(it.short)));      // the words of its own name
    const strong = new Set(), weak = new Set();
    (CAT_WORDS[it.cat] || []).forEach((w) => own.add(w));
    (SUB_WORDS[it.sub] || []).forEach((w) => own.add(w));
    if (it.cat === 'top' && !['sweater', 'tee'].includes(it.sub)) own.add('shirt');
    if (it.cat === 'suit') weak.add('jacket');
    if (isDenim(it)) own.add('jeans');
    if (it.metal) { strong.add(it.metal); if (it.metal === 'silver') { weak.add('steel'); weak.add('stainless'); } if (it.metal === 'tortoise') strong.add('tortoiseshell'); }
    if (it.pattern === 'stripe') ['striped', 'stripes', 'stripe'].forEach((w) => weak.add(w));
    if (it.pattern === 'check') ['check', 'checked', 'plaid'].forEach((w) => weak.add(w));
    (COLOR_WORDS[it.color] || [it.color]).forEach((w, i) => { if (w) (i === 0 ? strong : weak).add(w); });
    for (const w of [...own]) (NAME_SYN[w] || []).forEach((x) => weak.add(x));
    own.forEach((w) => { strong.add(w); });
    strong.forEach((w) => vocab.add(w)); weak.forEach((w) => vocab.add(w));
    rows.push({ it, own, strong, weak, slot: it.cat === 'suit' ? 'jacket' : it.cat });
  }
  return { rows, vocab };
}
function match(span, idx, cats) {
  for (const tier of [0, 1, 2]) {
    const sets = (r) => (tier === 0 ? [r.own] : tier === 1 ? [r.strong] : [r.strong, r.weak]);
    const has = (r, w) => sets(r).some((x) => x.has(w) || (!(w in NOUNS) && (x.has(sing(w)) || x.has(w + 's'))));
    const rows = idx.rows.filter((r) => (!cats || cats.includes(r.it.cat)) && span.every((w) => has(r, w)));
    if (rows.length) return rows;
  }
  return [];
}
// One mention of a piece: which closet rows it points at, or that the closet has nothing like it.
function resolve(span, idx, { neg, intent }) {
  const nouns = span.filter((w) => w in NOUNS);
  const head = nouns[nouns.length - 1] || null;
  let rows = head && NOUNS[head].length ? match(span, idx, NOUNS[head]) : [];
  if (!rows.length) rows = match(span, idx, null);
  if (!rows.length) return null;
  const slots = new Set(rows.map((r) => r.slot));
  if (slots.size > 1) return null;                                   // could be several kinds of thing: not specific enough to act on
  if (!head) {
    const solid = span.filter((w) => !DESC.has(w));
    if (neg) { if (!solid.length && rows.length > 6) return null; }
    else {
      if (!intent) return null;                                      // a name dropped in passing is not a request to wear it
      const firm = solid.some((w) => w.length >= 5) || (solid.length >= 1 && span.length >= 2) || (span.length >= 2 && rows.length <= 3);
      if (!firm) return null;
    }
  }
  return { rows, slot: [...slots][0], head };
}

function scanPieces(s, items, out) {
  const idx = buildIndex(items);
  const known = (w) => idx.vocab.has(w) || w in NOUNS;
  const raw = s.split(' ').filter((w) => w && (w.length > 1 || w === 'a' || w === 'i' || w === '|' || w === '§'));
  const toks = [];
  for (let i = 0; i < raw.length; i++) {                              // "day date" style names are one word in the closet
    const two = raw[i] + (raw[i + 1] || '');
    if (raw[i + 1] && /^[a-z0-9]+$/.test(two) && idx.vocab.has(two) && !(known(raw[i]) && known(raw[i + 1]))) { toks.push(two); i++; } else toks.push(raw[i]);
  }
  const isW = (w) => w.length > 1 && !STOP.has(w) && /^[a-z0-9]+$/.test(w) && (known(w) || DESC.has(w) || idx.vocab.has(sing(w)));
  const negBefore = (i) => {
    for (let k = i - 1, hops = 0; k >= 0 && hops < 4; k--) {
      const w = toks[k];
      if (w === '§') continue;
      if (w === '|') return false;
      if (NEG.has(w)) return true;
      if (!FILL.has(w)) return false;
      hops++;
    }
    return false;
  };
  const emit = (res, span, neg) => {
    const ids = res.rows.map((r) => r.it.id), slot = res.slot;
    const bare = span.length === 1 && span[0] in NOUNS;
    if (neg) {
      if (bare && ['jacket', 'blazer'].includes(span[0])) { out.locks.jacket = 'none'; delete out.allow.jacket; }
      else if (bare && span[0] === 'suit') out.mods.noSuit = true;
      else if (bare && ['belt', 'coat', 'hat'].includes(span[0])) { out.locks[slot] = 'none'; delete out.allow[slot]; }
      else { if (res.head === 'jeans') out.mods.noDenim = true; ids.forEach((id) => { if (!out.exclude.includes(id)) out.exclude.push(id); }); }
      return;
    }
    if (slot === 'jacket') {
      if (out.locks.jacket === 'none') delete out.locks.jacket;
      if (res.rows.every((r) => r.it.cat === 'suit') && span.includes('suit') && !span.includes('jacket') && !span.includes('blazer')) out.mods.wantSuit = true;
    }
    if (ids.length === 1) { out.locks[slot] = ids[0]; delete out.allow[slot]; }
    else {
      if (out.locks[slot] === 'none') delete out.locks[slot];
      if (out.locks[slot] == null) {
        const prev = out.allow[slot], both = prev ? ids.filter((id) => prev.includes(id)) : ids;
        out.allow[slot] = both.length ? both : ids;
      }
    }
  };
  const missing = (span, neg, intent) => { if (!neg && intent) out.notes.push({ k: 'missing', t: `Not in the closet: ${span.join(' ')}.` }); };

  let lastNeg = false, lastEnd = -1;
  for (let i = 0; i < toks.length;) {
    if (!isW(toks[i])) { i++; continue; }
    let j = i; while (j < toks.length && isW(toks[j])) j++;
    let neg = negBefore(i);
    if (!neg && lastNeg && lastEnd >= 0 && toks.slice(lastEnd, i).every((w) => w === 'or' || w === 'nor' || FILL.has(w)) && toks.slice(lastEnd, i).some((w) => w === 'or' || w === 'nor')) neg = true;
    const first = neg || ((i === 0 || toks[i - 1] === '|' || toks[i - 1] === '§' || INTENT.has(toks[i - 1])) && toks[j] !== '§');
    const run = toks.slice(i, j);
    let emitted = false;
    for (let a = 0; a < run.length;) {
      const intent = first || emitted;
      const ends = [...new Set([run.length].concat(run.map((w, k) => (k >= a && w in NOUNS ? k + 1 : 0)).filter((e) => e > a)))].sort((x, y) => y - x);
      let done = false;
      for (const e of ends) {
        const span = run.slice(a, e), res = resolve(span, idx, { neg, intent });
        if (res) { emit(res, span, neg); emitted = true; a = e; done = true; break; }
      }
      if (done) continue;
      const nounEnd = run.findIndex((w, k) => k >= a && w in NOUNS);
      if (nounEnd < 0) { a++; continue; }
      const span = run.slice(a, nounEnd + 1);                          // a garment was named but nothing matched all its words
      let hit = null, cut = 0;
      for (let k = 1; k < span.length && !hit; k++) { hit = resolve(span.slice(k), idx, { neg, intent }); cut = k; }
      if (hit && !span.slice(0, cut).some((w) => COLOR_SET.has(w))) { emit(hit, span.slice(cut), neg); emitted = true; }
      else missing(span, neg, true);
      a = nounEnd + 1;
    }
    lastNeg = neg; lastEnd = j; i = j;
  }
}

// ---------- dates and hours ----------
const WD = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, weds: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MON_IX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function readDate(s, today) {
  const hit = (date, m, keep) => ({ date, said: true, s: keep ? s : (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() });
  const past = /\b(wore|worn|had on)\b/.test(s);
  const year = Number(today.slice(0, 4));
  const mk = (y, mo, d) => { const x = new Date(y, mo, d, 12); return x.getMonth() === mo && x.getDate() === d ? isoDate(x) : null; };
  const near = (mo, d) => { let x = mk(year, mo, d); if (!x) return null; const gap = daysBetween(today, x); if (gap < -180) x = mk(year + 1, mo, d); else if (gap > 185 && past) x = mk(year - 1, mo, d); return x; };
  let m;
  if ((m = /\b(?:the )?day after (?:tomorrow|tmrw|tomm?orr?ow)\b/.exec(s))) return hit(addDays(today, 2), m);
  if ((m = /\b(?:tomorrow|tmrw|tmr|tomm?orr?ow|tomorow)\b/.exec(s))) return hit(addDays(today, 1), m);
  if ((m = /\byesterday\b/.exec(s))) return hit(addDays(today, -1), m);
  if ((m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(s))) {
    const d = m[3] ? mk(Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]) - 1, Number(m[2])) : near(Number(m[1]) - 1, Number(m[2]));
    if (d) return hit(d, m);
  }
  if ((m = new RegExp('\\b' + MONTH + ' (\\d{1,2})(?:st|nd|rd|th)?\\b').exec(s))) { const d = near(MON_IX[m[1].slice(0, 3)], Number(m[2])); if (d) return hit(d, m); }
  if ((m = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)? (?:of )?' + MONTH + '\\b').exec(s))) { const d = near(MON_IX[m[2].slice(0, 3)], Number(m[1])); if (d) return hit(d, m); }
  if ((m = /\b(?:on |for )?the (\d{1,2})(?:st|nd|rd|th)\b/.exec(s))) {
    const now = new Date(today + 'T12:00:00'); const dd = Number(m[1]);
    const d = dd >= now.getDate() ? mk(now.getFullYear(), now.getMonth(), dd) : mk(now.getFullYear() + (now.getMonth() === 11 ? 1 : 0), (now.getMonth() + 1) % 12, dd);
    if (d) return hit(d, m);
  }
  const re = /\b(?:(next|this|last|on|for|by) )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|weds?|thu(?:rs?)?|fri|sat)s?\b/g;
  while ((m = re.exec(s))) {
    if ((m[2] === 'sat' || m[2] === 'sun') && !m[1]) continue;        // "sat" and "sun" are ordinary words too
    const wd = WD[m[2]], cur = dow(today);
    let delta = (wd - cur + 7) % 7;
    if (m[1] === 'last' || (past && m[1] !== 'next')) delta = delta === 0 ? (m[1] === 'last' ? -7 : 0) : delta - 7;
    else if (m[1] === 'next') { const toMonday = ((8 - cur) % 7) || 7; if (delta < toMonday) delta += 7; }
    return hit(addDays(today, delta), m);
  }
  if ((m = /\b(?:this |the )?weekend\b/.exec(s))) { const cur = dow(today); return hit(addDays(today, cur === 0 || cur === 6 ? 0 : 6 - cur), m, true); }
  if ((m = /\b(?:today|tonite|right now|now)\b/.exec(s))) return hit(today, m);
  if (/\b(?:tonight|this (?:morning|afternoon|evening))\b/.test(s)) return { date: today, said: true, s };
  return { date: null, said: false, s };
}
function readHours(s, out) {
  const parts = [];
  if (/\ball day\b/.test(s)) parts.push('allday');
  if (/\bmornings?\b/.test(s)) parts.push('morning');
  if (/\b(noon|midday|lunchtime)\b/.test(s)) parts.push('midday');
  if (/\bafternoons?\b/.test(s)) parts.push('afternoon');
  if (/\bevenings?\b/.test(s)) parts.push('evening');
  if (/\b(tonight|tonite|nights?|late)\b/.test(s) && !/\b(date night|night out)\b/.test(s.replace(/\b(tonight|tonite)\b/g, ''))) parts.push('night');
  else if (/\b(tonight|tonite)\b/.test(s)) parts.push('night');
  out.parts = [...new Set(parts)];
  const m = /\b(?:at|around|by|from|starts at|start at) (\d{1,2}) ?(am|pm)?\b|\b(\d{1,2}) ?(am|pm)\b/.exec(s);
  if (m) {
    const h = Number(m[1] || m[3]), ap = m[2] || m[4] || '';
    if (h >= 1 && h <= 23) { out.clock = h; out.clockAp = ap; return (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim(); }
  }
  return s;
}
function clockHour(ask, kinds) {
  if (ask.clock == null) return null;
  let h = ask.clock;
  if (h > 12) return h;
  if (ask.clockAp === 'pm') return h === 12 ? 12 : h + 12;
  if (ask.clockAp === 'am') return h === 12 ? 0 : h;
  if (h === 12) return 12;
  if (h <= 6) return h + 12;
  const late = kinds.some((k) => EVENING_KINDS.has(k)) || (ask.parts || []).some((p) => p === 'evening' || p === 'night');
  return late ? h + 12 : h;
}
// The hours a fit is worn: from the occasion, any part of the day or clock time that was named, and the time right now.
export function windowFor(ask, date, now = new Date()) {
  const kinds = [ask.occ].concat(ask.also || []).filter(Boolean).map((k) => (OCCASIONS[k] && OCCASIONS[k].teach ? 'teach' : k));
  const ws = kinds.map((k) => WINDOWS[k] || WINDOWS.casual);
  let from = ws.length ? Math.min(...ws.map((w) => w[0])) : 9, to = ws.length ? Math.max(...ws.map((w) => w[1])) : 19;
  if (ask.lunch && kinds.length === 1) { from = 11; to = 15; }
  const ps = (ask.parts || []).map((p) => PARTS[p]).filter(Boolean);
  if (ps.length) {
    const pf = Math.min(...ps.map((p) => p[0])), pt = Math.max(...ps.map((p) => p[1]));
    if (kinds.length > 1) { from = Math.min(from, pf); to = Math.max(to, pt); }
    else if (kinds[0] === 'casual' || Math.min(to, pt) - Math.max(from, pf) < 2) { from = pf; to = pt; }
    else { from = Math.max(from, pf); to = Math.min(to, pt); }
  }
  const ch = clockHour(ask, kinds);
  if (ch != null) { from = ch; to = to > ch + 1 ? to : ch + 3; }
  if (date === isoDate(now)) {
    const h = now.getHours() + now.getMinutes() / 60;
    if (h > from) from = Math.floor(h);
    if (to < from + 2) to = from + 3;
  }
  return { from: Math.max(0, from), to: Math.min(to, 29) };
}

// ---------- the answer ----------
// env: { today, date (used when no day is named), fixDate (ignore days named in the text), items, profile }
export function parseAsk(text, env) {
  const today = env.today, profile = env.profile || {}, groups = profile.groups || [];
  const out = { text: String(text || '').trim(), date: env.date || today, dateSaid: false, occ: null, occSaid: false, also: [], negKinds: [], mods: {}, locks: {}, allow: {}, exclude: [], notes: [], parts: [], clock: null, clockAp: '', lunch: false, venue: '', wore: false };
  const full = canon(clean(out.text));
  // "I wore this last week", "same outfit as last time": the fit he is looking at has been worn and should change
  out.wore = /\b(?:wore|worn)\b[^|]*\b(?:this|that|it|same)\b|\bsame (?:outfit|fit|look|thing|one)\b/.test(full);
  let s = full.replace(/\bshow me\b/g, ' ').replace(/\s+/g, ' ').trim();

  const d = readDate(s, today);
  if (d.said && !env.fixDate) { out.date = d.date; out.dateSaid = true; }
  s = d.s.replace(/\//g, ' ');
  s = readHours(s, out);

  // phrases that set the mood rather than name a place or a piece
  const cut = (list, fn) => {
    for (const p of list.slice().sort((a, b) => b.length - a.length)) {
      const re = new RegExp('(^|[^a-z0-9])' + p + '(?![a-z0-9])');
      let m;
      while ((m = re.exec(s))) { fn(p); s = s.slice(0, m.index + m[1].length) + '§' + s.slice(m.index + m[0].length); }
    }
  };
  let up = 0, down = 0, smart = false;
  cut(SMART, () => { smart = true; });
  cut(DOWN, () => { down = 1; });
  cut(UP, () => { up = 1; });
  cut(['lab coat', 'white coat', 'scrubs'], () => { out.mods.lab = true; });
  let m;
  if ((m = /\b(?:all|head to toe|full|monochrome) (black|navy|blue|grey|brown|tan|white|green|olive)\b|\b(black|navy|blue|grey|brown|tan|white|green|olive) (?:theme|themed|on (?:black|navy|blue|grey|brown|tan|white|green|olive))\b|\bblacked out\b/.exec(s))) {
    out.mods.theme = m[1] || m[2] || 'black';
    s = s.replace(m[0], '§');
  }
  if (/\b(?:untucked|not tucked|un tucked)\b/.test(s)) { out.locks.tuck = 'untucked'; s = s.replace(/\b(?:untucked|not tucked|un tucked)\b/g, '§'); }
  else if (/\b(?:tucked in|tucked|tuck it in|tuck it)\b/.test(s)) { out.locks.tuck = 'tucked'; s = s.replace(/\b(?:tucked in|tucked|tuck it in|tuck it)\b/g, '§'); }
  if (/\bgolf(?:ing)?\b/.test(s)) out.mods.golf = true;

  // what kind of day: built in words, plus any occasion names the closet file customised
  const phrases = [];
  for (const [kind, ws] of KINDS) for (const w of ws) phrases.push([w, kind]);
  const base = new Set(phrases.flatMap(([w]) => w.split(' ')));
  const city = new Set(clean(profile.city || '').split(' '));
  for (const [k, o] of Object.entries(profile.occasions || {})) {
    if (!OCCASIONS[k]) continue;
    for (const w of (o.words || []).map(clean)) if (w) phrases.push([w, k]);
    for (const w of clean(o.long || '').split(' ')) if (w.length > 3 && !STOP.has(w) && !base.has(w) && !city.has(w) && !GENERIC.has(w)) phrases.push([w, k]);
  }
  phrases.sort((a, b) => b[0].length - a[0].length);
  const found = [];
  for (const [w, kind] of phrases) {
    const re = new RegExp('(^|[^a-z0-9])' + w + '(?![a-z0-9])');
    let h;
    while ((h = re.exec(s))) {
      const start = h.index + h[1].length;
      const before = s.slice(0, start).trim().split(' ').filter(Boolean);
      let neg = false;
      for (let k = before.length - 1, hops = 0; k >= 0 && hops < 4; k--) {
        const t = before[k];
        if (t === '§') continue;
        if (t === '|') break;
        if (NEG.has(t)) { neg = true; break; }
        if (!FILL.has(t)) break;
        hops++;
      }
      if (!neg && /^ (?:is |was |got |are |were |has been |been )?(?:cancel(?:l?ed)?|called off)\b/.test(s.slice(start + w.length))) neg = true;
      found.push({ kind, w, neg });
      s = s.slice(0, start) + '§' + s.slice(start + w.length);
    }
  }
  const pos = found.filter((f) => !f.neg);
  out.negKinds = [...new Set(found.filter((f) => f.neg).map((f) => f.kind))];
  const midday = (f) => f.w === 'lunch' || f.w === 'brunch';
  const dinnerProper = pos.some((f) => f.kind === 'dinner' && !midday(f));
  let real = [...new Set(pos.map((f) => f.kind).filter((k) => k !== 'casual' && k !== 'holiday'))];
  if (!dinnerProper && real.length > 1 && real.includes('dinner')) { real = real.filter((k) => k !== 'dinner'); if (!out.parts.length && !['work', 'teach'].includes(ORDER.find((k) => real.includes(k)))) out.parts = ['midday']; }
  let lead = ORDER.find((k) => real.includes(k)) || real[0] || null;
  if (!lead && pos.some((f) => f.kind === 'holiday')) lead = 'dinner';
  if (!lead && (pos.some((f) => f.kind === 'casual') || smart || out.mods.golf)) lead = 'casual';
  if (lead && lead !== 'casual' && pos.some((f) => f.kind === 'casual' && MOOD_WORDS.has(f.w))) down = 1;
  if (lead === 'dinner' && pos.some(midday) && !dinnerProper) out.lunch = true;
  const coreTeach = pos.some((f) => f.kind === 'teach' && !['students', 'campus'].includes(f.w));
  if (pos.some((f) => f.w === 'lab')) out.mods.lab = true;
  if (out.mods.lab) out.locks.jacket = 'none';                         // the lab coat goes over it

  // which class group: the one that meets that day, a group named outright, or the next one to meet
  const pickGroup = () => {
    if (!groups.length) return null;
    const meets = (g, wd) => (g.days || []).includes(wd);
    if (!out.dateSaid && !env.fixDate && !env.date && lead === 'teach' && coreTeach) {   // no day named: the next class day, today included until mid afternoon
      const hour = (env.now || new Date()).getHours();
      for (let k = hour < 15 ? 0 : 1; k < 8; k++) {
        const day = addDays(today, k), g = groups.find((x) => meets(x, dow(day)));
        if (g) { if (k > 0) { out.date = day; out.notes.push({ k: 'date', t: `Next class day is ${new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}.` }); } return g; }
      }
    }
    const wd = dow(out.date);
    const today_ = groups.filter((g) => meets(g, wd));
    if (today_.length === 1) return today_[0];
    const named = (today_.length ? today_ : groups).find((g) => clean((g.name || '') + ' ' + (g.short || '')).split(' ').some((w) => w.length > 2 && !STOP.has(w) && !(w in WD) && !['group', 'teach', 'section', 'cohort'].includes(w) && new RegExp('(^| )' + w + '( |$)').test(full)));
    if (named) return named;
    if (today_.length) return today_[0];
    let best = groups[0], gap = 9;
    for (const g of groups) for (const gd of g.days || []) { const x = (gd - wd + 7) % 7; if (x < gap) { gap = x; best = g; } }
    out.notes.push({ k: 'group', t: `No class group meets that day, so this counts for the ${best.name}. Tap the occasion to change it.` });
    return best;
  };
  const keyOf = (kind) => {
    if (kind === 'teach') { const g = pickGroup(); return g ? 'teach_' + g.id : (OCCASIONS.work ? 'work' : 'casual'); }
    return OCCASIONS[kind] ? kind : 'casual';
  };
  if (lead) {
    out.occ = keyOf(lead); out.occSaid = true;
    out.also = [...new Set(real.filter((k) => k !== lead).map(keyOf).filter((k) => k !== out.occ))];
  }
  let shift = up - down;
  if (smart && out.occ === 'casual') shift = 1;
  if (out.lunch) shift -= 0.5;
  if (shift) out.mods.shift = Math.max(-1.5, Math.min(1.5, shift));

  // A place named after "at" ("dinner at Marios"): kept for the reply, and kept out of the piece scan.
  const toks = s.split(' ');
  const plain = (w) => /^[a-z][a-z0-9]*$/.test(w) && !STOP.has(w) && !FILL.has(w) && !NEG.has(w) && !DESC.has(w) && !(w in NOUNS) && !DAYPART.has(w);
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] !== 'at') continue;
    const the = toks[i + 1] === 'the';
    let j = the ? i + 2 : i + 1;
    const words = [];
    while (j < toks.length && words.length < 3 && plain(toks[j])) { words.push(toks[j]); toks[j] = '§'; j++; }
    if (words.length && !out.venue) {
      const m2 = new RegExp(words.join('\\W+'), 'i').exec(out.text);
      const shown = m2 ? m2[0] : words.join(' ');
      out.venue = (the ? 'the ' : '') + (shown === shown.toLowerCase() ? shown.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : shown);
    }
  }
  scanPieces(toks.join(' '), env.items || [], out);
  return out;
}
