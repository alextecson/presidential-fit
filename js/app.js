// Presidential Fit: screens and interactions.
import * as S from './store.js';
import * as E from './engine.js';
import * as M from './mockup.js';
import { figureSvg } from './figure.js';
import { loadForecast, weatherFor, today, FRESH_MS } from './weather.js';
import { parseAsk, windowFor, colourSaid } from './ask.js';
import * as L from './link.js';
import * as C from './check.js';
import * as P from './place.js';
import * as O from './openai.js';
import * as J from './judge.js';

const VERSION = '1.10.1';
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The Fit tab opens on a question (mode 'ask'). The answer becomes ui.ask, and the fit is built from it (mode 'fit').
const ui = {
  tab: 'fit', mode: 'ask', ask: null, draft: '', when: null, askDay: today(), loading: '', relaxed: '',
  date: today(), occ: null, locks: {}, results: [], idx: 0, editing: false,
  forecast: null, q: '', logFilter: 'all', sheet: null, busy: null, hasKey: false, link: null,
  refineDraft: '', prevMock: null,
};
const st = () => S.state;
const item = (id) => st().items.find((i) => i.id === id);
const nameOf = (id) => { const i = item(id); return i ? i.name : ''; };

// ---------- helpers ----------
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, ms);
}
// The hours the fit is worn, from the answer and the clock. Past days have no forecast to check.
function win() { return ui.mode === 'fit' && ui.ask && ui.occ ? windowFor(Object.assign({}, ui.ask, { occ: ui.occ }), ui.date, new Date()) : null; }
function ctx() {
  const w = win();
  const past = ui.date < today();
  return { items: st().items, wears: st().wears, groups: st().profile.groups, cars: st().profile.cars || [], date: ui.date, occ: ui.occ, win: past ? null : w, weather: past ? null : weatherFor(ui.forecast, ui.date, w) };
}
// With no occasion named: what the log already has for that day, else a class day, else a casual day.
function defaultOcc(date, neg = []) {
  const logged = st().wears.filter((w) => w.date === date && E.OCCASIONS[w.occ] && !(E.OCCASIONS[w.occ].teach && neg.includes('teach')));
  if (logged.length) return { occ: logged[logged.length - 1].occ, why: 'log' };
  const g = neg.includes('teach') ? null : st().profile.groups.find((x) => (x.days || []).includes(E.dow(date)));
  if (g) return { occ: 'teach_' + g.id, why: 'class', g };
  return { occ: 'casual', why: 'none' };
}
const blankAsk = (date, occ, extra) => Object.assign({ text: '', date, dateSaid: true, occ, occSaid: true, pinned: true, also: [], negKinds: [], mods: {}, locks: {}, allow: {}, exclude: [], notes: [], parts: [], clock: null, clockAp: '', lunch: false }, extra || {});
// What the answer asks of the engine, with any piece swapped by hand on top.
function brief() {
  const a = ui.ask || {};
  return { locks: Object.assign({}, a.locks || {}, ui.locks), allow: a.allow || {}, exclude: a.exclude || [], extras: a.extras || [], mods: Object.assign({}, a.mods || {}, { also: a.also || [], unlike: a.worn || [] }) };
}
// Does a fit already in the log satisfy what was just asked for?
function fitsAsk(o, a) {
  if (!o || !o.complete) return false;
  const m = a.mods || {};
  if (m.theme || m.golf || m.wantSuit && !o.suit || m.noSuit && o.suit || m.noDenim && E.isDenim(item(o.bottom))) return false;
  const have = (slot) => (slot === 'jacket' ? (o.suit || o.jacket || 'none') : slot === 'tuck' ? o.tuck : (o[slot] || 'none'));
  for (const [k, v] of Object.entries(a.locks || {})) if (have(k) !== v) return false;
  for (const [k, v] of Object.entries(a.allow || {})) if (!v.includes(have(k))) return false;
  if ((a.extras || []).some((id) => !(o.extras || []).includes(id)) || (a.noExtras || []).some((id) => (o.extras || []).includes(id))) return false;
  return !(a.exclude || []).some((id) => E.majorIds(o).includes(id));
}
function entryFor(date, occ) { return st().wears.find((w) => w.date === date && w.occ === occ) || null; }
function outfitFromEntry(w) {
  const o = { occ: w.occ, date: w.date, suit: null, jacket: 'none', top: null, bottom: null, belt: 'none', shoes: null, socks: null, watch: null, glasses: null, coat: null, hat: null, tuck: w.tuck || null,
    also: w.also || [], shift: w.shift || 0, easy: !!w.easy, lab: !!w.lab || /lab coat/i.test(w.note || ''), extras: [] };
  for (const id of w.items || []) {
    const it = item(id); if (!it) continue;
    if (it.cat === 'suit') { if (!o.suit && !(w.items || []).some((x) => { const b = item(x); return b && b.cat === 'bottom'; })) { o.suit = id; o.jacket = id; o.bottom = id; } else { o.jacket = id; } }
    else if (it.cat === 'jacket') o.jacket = id;
    else if (it.cat === 'extra') o.extras.push(id);
    else if (['top', 'bottom', 'belt', 'shoes', 'socks', 'watch', 'glasses', 'coat', 'hat'].includes(it.cat)) o[it.cat] = id;
  }
  if (!o.tuck) {
    const t = item(o.top);
    o.tuck = /untucked/i.test(w.note || '') || (t && t.tuck === 'untucked-only') ? 'untucked' : 'tucked';
  }
  o.complete = !!(o.top && o.bottom && o.shoes && o.watch);
  return o;
}
function current() {
  const e = entryFor(ui.date, ui.occ);
  if (e && !ui.editing) {
    const o = outfitFromEntry(e);
    if (!o.also.length && ui.ask && (ui.ask.also || []).length) o.also = ui.ask.also.filter((k) => k !== o.occ);   // the stops just named count for the check
    const checks = o.complete ? E.audit(ctx(), o) : [];
    return { entry: e, o, why: [], checks, flags: checks.filter((c) => c.level === 'bad' || c.level === 'note').map((c) => c.t), logged: true };
  }
  const r = ui.results[ui.idx] || null;
  return r ? { entry: e, o: r.o, why: r.why, checks: r.checks || [], flags: r.flags || [], logged: false } : { entry: e, o: null, why: [], checks: [], flags: [], logged: false };
}
function recompute(prefer) {
  ui.relaxed = '';
  if (!st().items.length || !ui.occ) { ui.results = []; ui.idx = 0; return; }
  const c = ctx(), b = brief(), a = ui.ask || {}, m = a.mods || {};
  let r = E.solve(c, Object.assign({}, b, { prefer: prefer || null, n: 8 }));
  const asked = Object.keys(b.locks || {}).length || Object.keys(a.allow || {}).length || (a.exclude || []).length || m.wantSuit || m.noSuit || m.noDenim || m.theme;
  if (!r.length && asked) {
    // nothing clears the rules with every piece that was named: keep the ones named outright, then ease those too, and say so
    r = E.solve(c, { locks: b.locks, extras: b.extras, mods: { also: a.also || [], shift: m.shift, lab: m.lab }, prefer: prefer || null, n: 8 });
    if (r.length) ui.relaxed = 'Not everything you asked for works together under your rules. This keeps the pieces you named outright.';
    else {
      // a piece named outright is always worn: where the rules cannot be met with it, it goes in anyway and the check list says where
      r = E.solve(c, { locks: b.locks, extras: b.extras, mods: { also: a.also || [], shift: m.shift, lab: m.lab }, prefer: prefer || null, n: 8, force: true });
      if (r.length) ui.relaxed = 'The pieces you named bend your rules together. They are in because you asked. The check list shows where.';
      else {
        r = E.solve(c, { locks: ui.locks, extras: b.extras, mods: { also: a.also || [], shift: m.shift }, prefer: prefer || null, n: 8 });
        if (r.length) ui.relaxed = 'No fit can be built around the pieces you named, so this one leaves them out.';
      }
    }
  }
  ui.results = r; ui.idx = 0;
}
// Fresh weather re-runs the checks on the fits already shown. It never swaps the clothes under the wearer.
function reaudit() {
  const c = ctx();
  for (const r of ui.results) { r.checks = E.audit(c, r.o); r.flags = r.checks.filter((x) => x.level === 'bad' || x.level === 'note').map((x) => x.t); }
}
// Never hand over a fit on an old forecast: fetch a fresh one first when a connection is there.
async function present(prefer, then) {
  if (ui.date >= today() && (!ui.forecast || !ui.forecast.at || Date.now() - ui.forecast.at > FRESH_MS) && Date.now() - (ui.wxTried || 0) > 120000) {
    ui.loading = 'Checking the weather'; render();
    ui.wxTried = Date.now();                                        // a service that does not answer is not asked again on every change
    ui.forecast = await loadForecast(st().profile, true);
  }
  ui.loading = ''; recompute(prefer);
  if (then) then();
  render();
}
// The stylist's answer to what was typed: what it took the words to mean, what it did about each part, and what changed.
const mainIds = (o) => (o ? [o.suit || (o.jacket !== 'none' ? o.jacket : null), o.top, o.suit ? null : o.bottom, o.shoes].filter(Boolean) : []);
function respond(before, latest) {
  // before: the fit that was on screen. latest: the parse of only the newest message, when this is a follow up.
  const p = ui.ask; if (!p) return;
  const c = current(), after = c.o;
  const nm = (id) => { const it = item(id); return it ? (it.short || it.name) : ''; };
  const up = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
  const few = (ids, n = 4) => { const names = ids.map(nm).filter(Boolean); return E.listAnd(names.slice(0, n).concat(names.length > n ? [`${names.length - n} more`] : [])); };
  const SL = { jacket: 'jacket', top: 'top', bottom: 'trousers', shoes: 'shoes', belt: 'belt', watch: 'watch', glasses: 'glasses', hat: 'hat', coat: 'coat', socks: 'socks' };
  const occ = E.OCCASIONS[ui.occ] || E.OCCASIONS.casual;
  const w = win(), t = today(), late = !!w && w.from >= 17;
  const when = ui.date === t ? (late ? 'tonight' : 'today') : ui.date === E.addDays(t, 1) ? (late ? 'tomorrow night' : 'tomorrow') : 'on ' + E.fmtDate(ui.date, { weekday: 'long', month: 'short', day: 'numeric' });
  const what = (occ.teach ? 'class with the ' + groupLabel(occ.group) : ui.occ === 'dressy' ? 'a special occasion' : E.sayOf(ui.occ)) + (p.venue && !p.venueOff && !p.venueSoft ? ' at ' + p.venue : '');
  const also = (p.also || []).filter((k) => E.OCCASIONS[k] && k !== ui.occ).map(E.sayOf);
  const plan = `${what} ${when}${w ? `, ${E.hourLabel(w.from)} to ${E.hourLabel(w.to)}` : ''}${also.length ? ', then ' + E.listAnd(also) : ''}.`;
  // what one message asked for, said back
  const tell = (q, skip = []) => {
    const out = [], m = q.mods || {};
    const named = Object.entries(q.locks || {}).filter(([k, v]) => v && v !== 'none' && k !== 'tuck' && !skip.includes(v)).map(([, v]) => nm(v)).filter(Boolean);
    if (named.length) out.push(`In, as you asked: ${E.listAnd(named)}.`);
    for (const [k, v] of Object.entries(q.locks || {})) if (v === 'none' && !(k === 'jacket' && m.lab)) out.push(`No ${SL[k] || k}.`);
    if (q.locks && q.locks.tuck) out.push(q.locks.tuck === 'tucked' ? 'Shirt tucked.' : 'Shirt untucked.');
    for (const id of q.noExtras || []) if (item(id)) out.push(`No ${nm(id)}.`);
    const gone = new Set((p.exclude || []).concat(p.avoid || []));
    for (const [k, ids] of Object.entries(q.allow || {})) {
      if (m.wantSuit && k === 'jacket') continue;
      const all = st().items.filter((i) => i.cat === k && i.status !== 'retired' && !gone.has(i.id)).length;
      const got = after ? (k === 'jacket' ? (after.suit || after.jacket) : after[k]) : null;
      if (ids.filter((id) => !gone.has(id)).length >= all) { if (['jacket', 'hat', 'coat', 'belt'].includes(k) && !(before && latest)) out.push(`With a ${SL[k]}, as you asked.`); }
      else if (got && ids.includes(got)) out.push(`${up(SL[k] || k)} from the ones you named: ${nm(got)}.`);
    }
    if (m.wantSuit) out.push('A full suit, as you asked.');
    if (m.noSuit) out.push('No suit.');
    if (m.noDenim) out.push('No jeans.');
    if (m.shift <= -1) out.push('Kept more relaxed.'); else if (m.shift >= 1) out.push('Stepped up a level.');
    if (m.theme) out.push(`All ${m.theme}.`);
    if (m.golf) out.push('Golf course feel.');
    if (m.lab) out.push('No jacket, since the lab coat goes over it.');
    const left = (q.exclude || []).filter((id) => !(p.avoid || []).includes(id));
    if (left.length && !m.noDenim) out.push(`Left out: ${few(left)}.`);
    return out;
  };
  // what changed against the fit that was on screen
  let diff = '', fresh = [];
  if (before && after && !c.logged) {
    const slots = [['hat', (o) => o.hat || null], ['coat', (o) => o.coat || null], ['jacket', (o) => o.suit || (o.jacket !== 'none' ? o.jacket : null)], ['top', (o) => o.top], ['bottom', (o) => (o.suit ? null : o.bottom)], ['shoes', (o) => o.shoes]];
    const ch = slots.map(([k, f]) => ({ k, was: f(before), now: f(after) })).filter((x) => x.was !== x.now);
    fresh = ch.map((x) => x.now).filter(Boolean);
    const sameExtras = (before.extras || []).slice().sort().join('+') === (after.extras || []).slice().sort().join('+');
    if (!ch.length) diff = !sameExtras ? '' : latest && (latest.notes || []).some((n) => n.k === 'missing') ? 'Nothing changed.' : 'Nothing changed: this fit already meets that.';
    else if (ch.length === 1) diff = ch[0].now ? `${up(SL[ch[0].k])}: ${nm(ch[0].now)}${ch[0].was ? ' in place of the ' + nm(ch[0].was) : ''}.` : `No ${SL[ch[0].k]} now.`;
    else diff = `New in this fit: ${E.listAnd(ch.filter((x) => x.now).map((x) => nm(x.now)))}.`;
  }
  // pieces he named that the closet did not list: taken as his, added, and worn
  const adopted = (q) => {
    const ids = (q.made || []).filter((id) => item(id));
    if (!ids.length) return [];
    const worn = after ? E.majorIds(after) : [];
    const lines = [`Not in your closet list, so I took ${ids.length > 1 ? 'them' : 'it'} as yours and added ${ids.length > 1 ? 'them' : 'it'}: ${few(ids)}.${ids.every((id) => worn.includes(id)) ? (ids.length > 1 ? ' They are in this fit.' : ' It is in this fit.') : ''}`];
    const blank = ids.map(item).filter((it) => !it.color && it.cat !== 'extra' && it.cat !== 'watch');
    if (blank.length) lines.push(`Tell me the colour of the ${E.listAnd(blank.map((it) => it.short || it.name))}, like \u201c${blank[0].cat === 'shoes' ? 'brown' : 'navy'} ${(blank[0].short || blank[0].name).toLowerCase()}\u201d, for a truer mockup.`);
    return lines;
  };
  const painted = (q) => ((q.told || []).filter((id) => item(id)).length ? [`Noted: ${few((q.told || []).filter((id) => item(id)))}. The mockup is redone to show it.`] : []);
  const carried = (q, skip = []) => { const ids = (q.extras || []).filter((id) => item(id) && !skip.includes(id)); return ids.length ? [`With the ${E.listAnd(ids.map(nm))}, as you asked.`] : []; };
  const out = [];
  if (latest) {                                                   // a follow up: answer the new message first, then say what still holds
    const undone = !!p.undo;
    if (p.undo) { out.push(`Took back \u201c${p.undo}\u201d.`); delete p.undo; }
    for (const n of latest.notes || []) if (n.k === 'missing' || n.k === 'what') out.push(n.t);
    const mine = adopted(latest).concat(painted(latest));
    out.push(...mine);
    if (mine.length && /^Nothing changed/.test(diff)) diff = '';
    const movedTo = latest.venue && !latest.wore && p.venue && !p.venueOff && !p.venueSoft ? p.venue : '';     // this message named a new place
    if (diff && !(movedTo && /^Nothing changed/.test(diff))) out.push(undone && /^Nothing changed/.test(diff) ? 'The fit stays as it is.' : diff);
    out.push(...tell(latest, fresh.concat(latest.made || [])));
    out.push(...carried(latest, latest.made || []));
    if (latest.wore && before) out.push('Noted that you already wore that one, so its pieces stay out.');
    if (movedTo) out.push(`Moved to ${movedTo}.${staged() ? ' The mockup is staged there.' : ''}`);
    if (ui.relaxed && !c.logged) out.push(ui.relaxed);
    out.push(`Still ${plan}`);
    p.reply = out; p.diff = '';
    return;
  }
  if (p.text && J.isQuestion(p.text) && after) {                    // he asked whether it works: say so first
    const bad = problems(c.checks, 'bad'), notes = problems(c.checks, 'note');
    const about = Object.keys(p.locks || {}).length || (p.made || []).length || Object.keys(p.allow || {}).length ? 'idea' : 'fit';
    if (bad.length || /bend your rules|leaves them out/.test(ui.relaxed || '')) out.push(`${about === 'idea' ? 'Bad idea' : 'Not a fit'}: ${bad[0] || 'it only works by breaking one of your rules.'}`);
    else if (notes.length) out.push(`It works, with a catch: ${notes[0]}`);
    else out.push(about === 'idea' ? 'Good idea. It clears every check.' : 'It is a fit. It clears every check.');
  }
  if (p.text) out.push(up(plan));
  if (staged()) out.push('The mockup is staged there.');
  for (const n of p.notes || []) if (n.k !== 'avoid') out.push(n.t);
  out.push(...adopted(p), ...painted(p));
  out.push(...tell(p, p.made || []));
  out.push(...carried(p, p.made || []));
  if (after) { const gist = E.explain(ctx(), after, namedIds()).map((r) => r.s).filter(Boolean).slice(0, 3); if (gist.length) out.push(`Why this one: ${E.listAnd(gist)}. The full reasons are under the pieces.`); }
  const worn = p.worn || [];
  const swapped = (p.avoid || []).filter((id) => !worn.includes(id));
  if (worn.length) out.push(`Already worn, so out: ${few(worn)}. Kept clear of their colours too.`);
  else if (p.wore) out.push('The log has no fit for that day to compare with, so this is a fresh pick.');
  if (swapped.length) out.push(`Swapped out at your ask: ${few(swapped)}.`);
  if (ui.relaxed && !c.logged) out.push(ui.relaxed);
  p.reply = out; p.diff = diff;
}
const dropDiff = () => { if (ui.ask) ui.ask.diff = ''; };
const PLACE_KEYS = ['venue', 'venueSoft', 'venueHome', 'venueOff', 'spot'];
// ---------- questions ----------
// "Can I wear the loafers instead?", "is this ok for dinner?", "should I lose the jacket?": he asks, and gets a straight
// answer. What he proposes is tried on the fit on screen without changing it, and judged by the same rules and checks that
// build every fit. The verdict says good idea or bad idea for a proposal, fit or not a fit for the look as it stands, and
// offers to carry the proposal out. A question the rules cannot read goes to ChatGPT (askChat).
const problems = (checks, level) => (checks || []).filter((x) => x.level === level).map((x) => x.t);
function judge(text) {
  const c = current(), now = c.o;
  if (!now || now.complete === false) return null;
  const probe = parseAsk(text, { today: today(), date: ui.date, fixDate: true, items: st().items, profile: st().profile });
  const nm = (id) => { const it = items.find((i) => i.id === id); return it ? (it.short || it.name) : ''; };
  // pieces he names that the closet does not list are his: for the trial they exist, and Do it adds them for real
  const items = st().items.slice(), trial = [];
  const locks = Object.assign({}, probe.locks);
  let extras = (now.extras || []).filter((id) => !(probe.noExtras || []).includes(id)).concat(probe.extras || []);
  for (const f of probe.fresh || []) {
    if (f.update) continue;
    const it = Object.assign({ id: 'trial-' + trial.length, status: 'active', said: true, hold: true }, f.item);
    items.push(it); trial.push(it);
    if (it.cat === 'extra') extras.push(it.id); else { locks[it.cat === 'suit' ? 'jacket' : it.cat] = it.id; delete probe.allow[it.cat === 'suit' ? 'jacket' : it.cat]; }
  }
  extras = [...new Set(extras)];
  const m = probe.mods || {};
  const sameExtras = extras.slice().sort().join('+') === (now.extras || []).slice().sort().join('+');
  const proposes = Object.keys(locks).length || Object.keys(probe.allow).length || probe.exclude.length || !sameExtras || m.shift || m.wantSuit || m.noSuit || m.noDenim || m.theme;
  const cx = Object.assign({}, ctx(), { items });
  const slotAsk = Object.keys(locks).length || Object.keys(probe.allow).length || probe.exclude.length || m.shift || m.wantSuit || m.noSuit || m.noDenim || m.theme;
  if (!slotAsk && !sameExtras) return { chat: true, canDo: true };   // only an accessory is proposed, and the rules do not rate those
  const gist = (o) => E.explain(cx, o, Object.values(locks)).map((r) => r.s).filter(Boolean).slice(0, 2);
  if (!proposes) {
    if (!J.isAboutThis(text)) return null;                          // nothing the rules can read: ChatGPT is asked
    const bad = problems(c.checks, 'bad'), notes = problems(c.checks, 'note');
    const lv = E.dressLevel(cx, now), tl = text.toLowerCase();
    const over = /over ?dressed|too (formal|dressy|much|fancy)/.test(tl), under = /under ?dressed|too (casual|plain|simple|relaxed)/.test(tl);
    if (lv && (over || under)) {                                    // a yes or a no, with the measure behind it
      const is = over ? lv.f > lv.hi + 0.3 : lv.f < lv.lo - 0.3;
      const say = `${cap1(lv.where)} wants ${lv.wants}, and this reads ${lv.reads}.`;
      return { q: text, tone: is ? 'catch' : 'good', head: is ? (over ? 'Yes, a step overdressed' : 'Yes, a step underdressed') : (over ? 'No, you are not overdressed' : 'No, you are not underdressed'), lines: [say].concat(bad, notes) };
    }
    const level = (E.explain(cx, now, namedIds()).find((r) => r.k === 'Occasion') || {}).t || '';
    if (bad.length) return { q: text, tone: 'bad', head: J.HEAD.nofit, lines: bad.concat(notes) };
    if (notes.length) return { q: text, tone: 'catch', head: 'A fit, with a catch', lines: notes.concat(level ? [level] : []) };
    return { q: text, tone: 'good', head: J.HEAD.fit, lines: [level, `All ${c.checks.filter((x) => x.level === 'ok').length} checks are clear.`].filter(Boolean) };
  }
  // the proposal on top of the look as it stands: first with everything else held, then letting the rest move
  const b = brief();
  const hold = { jacket: now.suit || now.jacket, top: now.top, bottom: now.bottom, shoes: now.shoes, watch: now.watch };
  if (now.suit) delete hold.bottom;
  const touched = new Set(Object.keys(locks).concat(Object.keys(probe.allow)));
  if (touched.has('jacket')) { const j = items.find((i) => i.id === locks.jacket); if ((j && j.cat === 'suit') || now.suit) delete hold.bottom; }
  if (m.wantSuit || m.noSuit) { delete hold.jacket; delete hold.bottom; }
  if (m.noDenim && E.isDenim(items.find((i) => i.id === now.bottom))) delete hold.bottom;
  if (m.shift || m.theme) for (const k of ['jacket', 'top', 'bottom', 'shoes']) delete hold[k];
  for (const k of Object.keys(hold)) if (touched.has(k) || probe.exclude.includes(hold[k])) delete hold[k];
  const mods = Object.assign({}, b.mods, m);
  // a different dress level or a single colour look is a different fit, so nothing of the current one is favoured
  const base = { allow: probe.allow, exclude: [...new Set((b.exclude || []).concat(probe.exclude))], extras, mods, prefer: m.shift || m.theme ? null : now, n: 1, minDiff: 0 };
  let tier = 1, r = E.solve(cx, Object.assign({}, base, { locks: Object.assign({}, hold, locks) }))[0];
  if (!r) { tier = 2; r = E.solve(cx, Object.assign({}, base, { locks: Object.assign({}, hold, locks, { watch: undefined }) }))[0] || E.solve(cx, Object.assign({}, base, { locks }))[0]; }
  if (!r) { tier = 3; r = E.solve(cx, Object.assign({}, base, { locks, force: true }))[0]; }
  if (!r) return { q: text, tone: 'bad', head: J.HEAD.bad, lines: ['No fit can be built around that for this occasion.'] };
  const was = new Set(problems(c.checks, 'bad').concat(problems(c.checks, 'note')));
  const fresh_ = (x) => problems(x.checks, 'note').filter((t) => !was.has(t));
  if (tier === 1 && (problems(r.checks, 'bad').length || fresh_(r).length)) {       // holding the rest leaves a catch: see whether letting the rest move clears it
    const clean = (x) => x && !problems(x.checks, 'bad').length && !fresh_(x).length;
    const r2 = [E.solve(cx, Object.assign({}, base, { locks }))[0], E.solve(cx, Object.assign({}, base, { locks, prefer: null }))[0]].find(clean);
    if (r2) { r = r2; tier = 2; }
  }
  const bad = problems(r.checks, 'bad'), notes = fresh_(r);
  // how strong the look is with every piece fixed, so the proposal can be weighed against what is on screen
  const strength = (o) => {
    const all = { jacket: o.suit || o.jacket || 'none', top: o.top, shoes: o.shoes, belt: o.belt || 'none', watch: o.watch, tuck: o.tuck };
    if (!o.suit) all.bottom = o.bottom;
    const x = E.solve(cx, { locks: all, extras: o.extras || [], mods: Object.assign({}, mods, { wantSuit: false, noSuit: false, noDenim: false }), n: 1, minDiff: 0 })[0];
    return x ? x.score : null;
  };
  const s0 = strength(now), s1 = strength(r.o);
  const weaker = s0 != null && s1 != null && s1 < s0 - 1.5;
  const occNow = E.OCCASIONS[ui.occ] || E.OCCASIONS.casual;
  const jNow = now.suit || (now.jacket !== 'none' ? now.jacket : null), jNew = r.o.suit || (r.o.jacket !== 'none' ? r.o.jacket : null), jIt = jNew ? items.find((i) => i.id === jNew) : null;
  const lesser = !weaker ? [] : [jNow && !jNew && occNow.jacket !== 'optional' ? `${cap1(E.sayOf(ui.occ))} is better with a jacket.` : jIt && jIt.casual && ['dinner', 'work', 'dressy'].includes(ui.occ) ? 'A sit down setting is better with a tailored jacket.' : `It clears your rules, but for ${E.sayOf(ui.occ)} the fit you have now is the stronger look.`];
  // what would move, besides what he asked about
  const SL = { jacket: 'jacket', top: 'top', bottom: 'trousers', shoes: 'shoes', belt: 'belt', watch: 'watch', coat: 'coat', hat: 'hat' };
  const slotOf = (o, k) => (k === 'jacket' ? (o.suit || (o.jacket !== 'none' ? o.jacket : null)) : k === 'bottom' ? (o.suit ? null : o.bottom) : k === 'belt' ? (o.belt !== 'none' ? o.belt : null) : o[k] || null);
  // a suit is its jacket and its trousers at once, so the trousers are not listed as a second change
  const moved = Object.keys(SL).map((k) => ({ k, a: slotOf(now, k), z: slotOf(r.o, k) })).filter((x) => x.a !== x.z && !(x.k === 'bottom' && (r.o.suit || now.suit)));
  const asked = moved.filter((x) => touched.has(x.k)), others = moved.filter((x) => !touched.has(x.k));
  const change = (x) => (x.z ? `${x.k === 'jacket' && r.o.suit ? 'suit' : SL[x.k]}: ${nm(x.z)}` : `no ${SL[x.k]}`);
  const fresh = trial.length ? [`That takes the ${E.listAnd(trial.map((it) => it.short || it.name))} as yours. Do it adds ${trial.length > 1 ? 'them' : 'it'} to your closet.`] : [];
  const can = { q: text, canDo: true };
  if (tier === 3 || bad.length) return Object.assign(can, { tone: 'bad', head: J.HEAD.bad, lines: (bad.length ? bad : ['It only works by breaking one of your rules.']).concat(notes, fresh) });
  if (!moved.length && sameExtras && r.o.tuck === now.tuck) {
    const lv = m.shift ? E.dressLevel(cx, now) : null;
    if (lv) return { q: text, tone: 'good', head: 'It would not change the pick', lines: [`${cap1(lv.where)} wants ${lv.wants}, and this already reads ${lv.reads}.`] };
    return { q: text, tone: 'good', head: J.HEAD.same, lines: ['That is what this fit already does.'].concat(gist(now).length ? [`It works: ${E.listAnd(gist(now))}.`] : []) };
  }
  const why = gist(r.o).length ? [`It works: ${E.listAnd(gist(r.o))}.`] : [];
  if (notes.length) return Object.assign(can, { tone: 'catch', head: J.HEAD.catch, lines: notes.concat(others.length ? [`The rest would move too: ${others.map(change).join(', ')}.`] : [], fresh) });
  if (weaker) return Object.assign(can, { tone: 'catch', head: 'It works, but this fit is stronger', lines: [`${asked.length ? cap1(asked.map(change).join(', ')) + '.' : ''}${others.length ? ` The rest would move too: ${others.map(change).join(', ')}.` : ''}`.trim()].filter(Boolean).concat(lesser, fresh) });
  if (others.length) return Object.assign(can, { tone: 'good', head: J.HEAD.moves, lines: [`${asked.length ? cap1(asked.map(change).join(', ')) + '. ' : ''}To make it work the rest changes: ${others.map(change).join(', ')}.`].concat(why, fresh) });
  return Object.assign(can, { tone: 'good', head: J.HEAD.good, lines: [`${asked.length ? cap1(asked.map(change).join(', ')) + '. ' : ''}Nothing else needs to change.`].concat(why, fresh) });
}
const cap1 = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
// A question the rules could not read: ChatGPT answers it with the fit for context, on this phone with a key or through the Mac.
const chat = { ctl: null };
async function askChat(text, canDo = false) {
  const a = ui.ask, c = current();
  const linked = !!(ui.link && st().settings.linkSeen);
  if (!ui.hasKey && !linked) { a.verdict = { q: text, tone: 'info', head: 'I could not read that as a question about the fit', lines: ['Ask about a piece or a change, like “can I wear the loafers instead?” or “is this ok for dinner?”'] }; render(); return; }
  const w = win(), wx = ctx().weather;
  const occ = E.OCCASIONS[ui.occ] || E.OCCASIONS.casual;
  const ask = { question: text, lines: c.o ? M.briefFor(c.o, st().items, st().profile, 'auto').lines : [], occasion: occ.teach ? 'teaching a class' : ui.occ === 'dressy' ? 'a special occasion' : E.sayOf(ui.occ),
    when: `${ui.date === today() ? 'today' : E.fmtDate(ui.date, { weekday: 'long' })}${w ? `, ${E.hourLabel(w.from)} to ${E.hourLabel(w.to)}` : ''}`,
    weather: wx && wx.hi != null ? `Weather in those hours: ${Math.round(wx.lo == null ? wx.hi : wx.lo)} to ${Math.round(wx.hi)} degrees Fahrenheit, rain chance ${Math.round(wx.rain || 0)} percent.` : '',
    flags: problems(c.checks, 'bad').concat(problems(c.checks, 'note')) };
  a.verdict = { q: text, tone: 'info', head: 'Asking ChatGPT', busy: true, lines: [] }; render();
  chat.ctl = new AbortController();
  const onMac = () => L.askOpinion(ui.link, ask, { signal: chat.ctl.signal, onStage: (s) => { if (a.verdict && a.verdict.busy) { a.verdict.head = s.st === 'asleep' ? 'Your Mac is not answering. Wake it and this carries on.' : 'ChatGPT is thinking it over'; settle(); } } });
  try {
    let out;
    const own = ui.hasKey ? await S.secretGet('openai') : null;
    if (own) { try { out = await O.opinion(own, ask, chat.ctl.signal); } catch (e) { if ((e && e.name === 'AbortError') || !linked) throw e; out = await onMac(); } }
    else out = await onMac();
    const tone = out.verdict === 'good' || out.verdict === 'fit' ? 'good' : out.verdict === 'depends' ? 'catch' : 'bad';
    a.verdict = { q: text, tone, head: J.HEAD[out.verdict] || 'Answer', lines: [out.why].concat(out.instead ? ['Instead: ' + out.instead] : []), by: 'ChatGPT', canDo };
  } catch (e) {
    a.verdict = e && e.name === 'AbortError' ? null : { q: text, tone: 'info', head: 'No answer this time', lines: [(e && e.message) || 'Ask again.'] };
  }
  chat.ctl = null; saveSession(); settle();
}
// The closet is not his whole wardrobe. A piece he names that it does not list is his all the same: it is added to the closet,
// described from his words, and goes into the fit. It stays "manual only" (worn when he names it) until he says the stylist may pick it.
function adopt(p) {
  const made = [];
  for (const f of p.fresh || []) {
    const spec = f.item;
    let it = f.update ? item(f.update) : null;
    if (it) {                                                       // the colour of a piece added earlier without one
      for (const k of ['color', 'hex', 'tone', 'pattern', 'leather']) if (spec[k] != null && it[k] == null) it[k] = spec[k];
      it.name = spec.name; it.short = spec.short;
      staleMocks(it.id);
      p.told = (p.told || []).concat(it.id);
    } else {
      it = st().items.find((i) => i.said && i.cat === spec.cat && i.status !== 'retired' && i.name.toLowerCase() === spec.name.toLowerCase());
      if (!it) { it = Object.assign({ id: S.uid(spec.cat), status: 'active', notes: '', said: true, hold: true, added: today() }, spec); st().items.push(it); made.push(it.id); }
    }
    if (it.cat === 'extra') { if (!p.extras.includes(it.id)) p.extras.push(it.id); continue; }
    const slot = it.cat === 'suit' ? 'jacket' : it.cat;
    p.locks[slot] = it.id; delete p.allow[slot];
    if (it.cat === 'suit') p.mods.wantSuit = true;
    p.exclude = p.exclude.filter((id) => id !== it.id);
  }
  if ((p.fresh || []).length) S.save();
  p.made = (p.made || []).concat(made);
  p.fresh = [];
  return p;
}
// The answer to the opening question becomes the brief for the fit.
async function answer(text, over = {}) {
  const p = adopt(parseAsk(text, { today: today(), date: over.date || null, fixDate: !!over.fixDate, items: st().items, profile: st().profile, now: new Date() }));
  if (over.made) p.made = [...new Set((p.made || []).concat(over.made))];
  if (over.occ && (over.forceOcc || !p.occSaid)) {
    p.occ = over.occ; p.occSaid = true; p.pinned = true;
    if (over.forceOcc) p.also = (over.also || []).filter((k) => k !== over.occ);
    p.notes = p.notes.filter((n) => n.k !== 'group' && n.k !== 'date');
    if (over.forceOcc && over.date) p.date = over.date;
  }
  if (!p.occ) {
    // words that say he is going somewhere, with no occasion I know: not the day's logged plan, a casual day, and say so
    const lost = /\b(going|go|headed|heading|off|out) (to|for)\b/i.test(p.text);
    const d = lost ? { occ: 'casual', why: 'lost' } : defaultOcc(p.date, p.negKinds);
    if (lost) p.notes.unshift({ k: 'occ', t: 'I did not recognise where you are going, so this is a casual day. Tap the occasion to change it.' });
    p.occ = d.occ;
    if (d.why === 'class') p.notes.unshift({ k: 'occ', t: `No occasion named. ${E.fmtDate(p.date, { weekday: 'long' })} is a class day, so this is for the ${d.g.name}.` });
    else if (d.why === 'log') p.notes.unshift({ k: 'occ', t: 'No occasion named, so this is what the log has for that day.' });
    else if (d.why !== 'lost') p.notes.unshift({ k: 'occ', t: 'No occasion named, so this is a casual day. Tap it to change.' });
  }
  p.also = (p.also || []).filter((k) => k !== p.occ);
  // the closet was built around tailoring: for the gym it says so and asks what he trains in
  if (p.occ === 'gym' && !st().items.some((i) => i.status !== 'retired' && i.cat === 'bottom' && ['jogger', 'shorts'].includes(i.sub))) p.notes.push({ k: 'gym', t: 'Your closet lists almost no gym wear, so this is the closest it has. Tell me what you train in, like \u201cblack joggers and my grey tee\u201d, and I add it.' });
  if (over.steps && over.steps.length) {                           // where it is: the first message says, and a later one that names a place moves it
    const f = parseAsk(over.first || '', { today: today(), date: p.date, fixDate: true, items: st().items, profile: st().profile, now: new Date() });
    for (const k of PLACE_KEYS) p[k] = f[k];
    const moved = over.steps.map((x) => x.place).filter(Boolean).pop();
    if (moved) Object.assign(p, moved);
  }
  if (over.label) p.label = over.label;
  if (over.avoid && over.avoid.length) {                          // "change it": what was on screen stays out of the next fit
    p.avoid = [...new Set(over.avoid)];
    p.exclude = [...new Set(p.exclude.concat(p.avoid))];
    for (const [k, id] of Object.entries(p.locks)) if (p.avoid.includes(id)) delete p.locks[k];
    for (const k of Object.keys(p.allow)) { p.allow[k] = p.allow[k].filter((id) => !p.avoid.includes(id)); if (!p.allow[k].length) delete p.allow[k]; }
  }
  const e = entryFor(p.date, p.occ);
  const logged = e ? outfitFromEntry(e) : null;
  const before = over.before || (logged && logged.complete ? logged : null);
  p.worn = [...new Set(over.worn || [])];
  if (p.wore && before && !over.worn) {                           // "I wore this last week": what he was shown has to change
    const named = new Set(Object.values(p.locks).concat(...Object.values(p.allow).filter((ids) => ids.length <= 2)));
    p.worn = mainIds(before).filter((id) => !named.has(id));
    p.avoid = [...new Set((p.avoid || []).concat(p.worn))];
    p.exclude = [...new Set(p.exclude.concat(p.avoid))];
    for (const k of Object.keys(p.allow)) { p.allow[k] = p.allow[k].filter((id) => !p.avoid.includes(id)); if (!p.allow[k].length) delete p.allow[k]; }
  }
  // the first message, then every change made after it, so each one can be seen and taken back
  p.first = over.first != null ? over.first : p.text;
  p.steps = over.steps || [];
  p.base = over.base || { avoid: (p.avoid || []).slice(), worn: (p.worn || []).slice() };
  if (over.undo) p.undo = over.undo;
  if (!over.steps) ui.prevMock = null;
  ui.ask = p; ui.date = p.date; ui.occ = p.occ; ui.locks = over.keepLocks ? ui.locks : {}; ui.idx = 0; ui.askDay = today();
  ui.editing = !!e && (!!over.editing || !fitsAsk(logged, p));
  ui.mode = 'fit'; ui.tab = 'fit'; closeSheet();
  await present(over.prefer || null, () => respond(before, over.latest || null));
  window.scrollTo(0, 0);
}
// While a new mockup is made for a changed fit, the last one stays on screen instead of a blank.
// It is also the photograph the Mac edits, so a change to the fit is a change to the same picture.
function keepMock() { const c = current(); const e = c.o ? mockEntry(c.o) : null; if (e) ui.prevMock = { blob: e[1].blob, bh: e[1].bh || null, key: e[0] }; }
// Words in the Change box that mean "not what is on screen": the whole fit, or one named piece of it.
const CHANGE_ALL = /\b(change it|change this|change (?:the |this |my )?(?:fit|look|outfit)|something else|something different|(?:a )?different (?:fit|look|outfit|one)|another (?:one|fit|look|outfit)|not this|(?:a )?new (?:one|fit|look|outfit)|switch it up|start over|i (?:already )?wore (?:this|that|it)|wore (?:this|that|it)|worn (?:this|that|it))\b/;
const CHANGE_ONE = /\b(?:change|different|another|other|swap|switch|new|replace|lose|drop)(?: out)?(?: the| my| that| those| these| a| an)? (jackets?|blazers?|suits?|coats?|shirts?|tops?|polos?|sweaters?|tees?|pants|trousers|jeans|slacks|chinos|shoes|loafers|sneakers|belts?|watch(?:es)?|hats?|socks|glasses)\b/g;
const slotOfWord = (w) => (/^(jacket|blazer|suit)/.test(w) ? 'jacket' : /^coat/.test(w) ? 'coat' : /^(shirt|top|polo|sweater|tee)/.test(w) ? 'top' : /^(pants|trousers|jeans|slacks|chinos)/.test(w) ? 'bottom' : /^(shoes|loafers|sneakers)/.test(w) ? 'shoes' : /^belt/.test(w) ? 'belt' : /^watch/.test(w) ? 'watch' : /^hat/.test(w) ? 'hat' : /^glasses/.test(w) ? 'glasses' : 'socks');
function avoidFrom(text, o, prior) {
  const out = new Set(prior || []);
  if (!o) return { ids: [...out], one: false, whole: false, slots: [] };
  const t = String(text).toLowerCase().replace(/[\u2018\u2019']/g, '');
  const have = { jacket: o.suit || (o.jacket !== 'none' ? o.jacket : null), top: o.top, bottom: o.suit ? null : o.bottom, shoes: o.shoes, belt: o.belt !== 'none' ? o.belt : null, watch: o.watch, hat: o.hat, coat: o.coat, socks: o.socks, glasses: o.glasses };
  const slots = new Set();
  let m; CHANGE_ONE.lastIndex = 0;
  while ((m = CHANGE_ONE.exec(t))) slots.add(slotOfWord(m[1]));
  if (!slots.size && (CHANGE_ALL.test(t) || /\b(?:wore|worn)\b[^.,;!?]*\b(?:this|that|it|same)\b|\bsame (?:outfit|fit|look|thing|one)\b/.test(t))) ['jacket', 'top', 'bottom', 'shoes'].forEach((k) => slots.add(k));
  const one = slots.size > 0 && !(slots.size === 4 && CHANGE_ALL.test(t));
  for (const k of slots) if (have[k]) out.add(have[k]);
  return { ids: [...out], one, whole: slots.size > 0 && !one, slots: [...slots] };   // one: a single piece was named. whole: the fit as a whole should change
}
function openDay(date, occ, extra) {
  ui.prevMock = null;
  ui.ask = blankAsk(date, occ, extra); ui.date = date; ui.occ = occ; ui.locks = {}; ui.idx = 0; ui.editing = !!(extra && extra.editing); ui.askDay = today();
  ui.mode = 'fit'; ui.tab = 'fit'; closeSheet();
  return present();
}
function backToAsk() { ui.mode = 'ask'; ui.ask = null; ui.draft = ''; ui.refineDraft = ''; ui.prevMock = null; ui.when = null; ui.date = today(); ui.occ = null; ui.locks = {}; ui.results = []; ui.editing = false; ui.loading = ''; }
// Where the fit is going, when he said: the place he named, or the kind of place. It is the backdrop of the mockup,
// so the same fit at two places is two pictures.
function placeOf() {
  const a = ui.ask;
  if (ui.mode !== 'fit' || !a || (st().settings.setting || 'auto') !== 'auto') return null;
  const venue = a.venue && !a.venueOff && !a.venueHome ? a.venue : '';
  const spot = a.venueHome ? (a.venueOff ? '' : 'home') : (a.spot || '');
  if (!venue && !spot) return null;
  const w = windowFor(Object.assign({}, a, { occ: ui.occ }), ui.date, new Date(ui.date + 'T00:00:00'));     // the planned hours, not what is left of them
  return { venue, spot, soft: !!a.venueSoft, when: M.partOfDay(w), tag: (venue || spot).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() };
}
const staged = () => { const p = placeOf(); return !!(p && p.venue && !p.soft && maker()); };
const KIND_WORD = { gym: 'a workout', work: 'work', dinner: 'dinner', lounge: 'drinks', bar: 'drinks', event: 'an event', dressy: 'a special occasion', casual: 'a casual day' };
function mockKey(o) { const p = placeOf(); return E.signature(o) + (p && p.tag ? '@' + p.tag : ''); }
// A picture is shown as it is while nothing about it is out of date: not a piece's description (stale), and not the look every
// picture should have (M.LOOK, the smile for one). One he added by hand is his own and is never redone for him.
const current_ = (m) => !!m && !m.stale && ((m.look || 1) >= M.LOOK || m.model === 'ChatGPT app');
// The stored mockup for the fit on screen, with the name it is stored under.
function mockEntry(o) {
  const all = st().mockups || {}, p = placeOf(), sig = E.signature(o), key = mockKey(o);
  if (all[key] && current_(all[key])) return [key, all[key]];
  if (p && p.tag) return null;                                     // a place was named: only a picture set there will do
  let best = null;                                                 // no place named (a fit opened from the log, say): any picture of this fit, newest first
  for (const k of Object.keys(all)) if (k.startsWith(sig + '@') && current_(all[k]) && (!best || (all[k].at || 0) > (best[1].at || 0))) best = [k, all[k]];
  return best;
}
function mockFor(o) { const e = mockEntry(o); return e ? e[1] : null; }
// A piece was described anew (its colour was given, say): pictures that show it are out of date. They stay as the
// placeholder, and the one on screen becomes the photograph the new picture is edited from.
function staleMocks(id) {
  const all = st().mockups || {};
  const cur = ui.mode === 'fit' ? current().o : null, curKey = cur ? mockKey(cur) : null;
  for (const [k, m] of Object.entries(all)) {
    if (!k.split(/[|+@]/).includes(id) || m.stale) continue;
    m.stale = true;
    if (k === curKey) ui.prevMock = { blob: m.blob, bh: m.bh || null, key: k };
  }
}
// Any picture of this fit, wherever it was set: shown dimmed while the one for this place is made.
function anyMock(o) {
  const all = st().mockups || {}, sig = E.signature(o);
  let best = all[sig] || null;
  for (const k of Object.keys(all)) if (k.startsWith(sig + '@') && (!best || (all[k].at || 0) > (best.at || 0))) best = all[k];
  return best;
}
// The fit is shown as a ChatGPT mockup of the wearer, not a sketch. With a key saved the app makes it by itself.
const auto = { timer: null, busy: null, ctl: null, failed: new Map(), retried: new Set() };
const AUTO_CAP = 30, AUTO_DWELL = 2200;
// Who makes the mockup: ChatGPT through the wearer's own OpenAI key, or ChatGPT on the wearer's own Mac (js/link.js).
const maker = () => (ui.hasKey ? 'key' : (ui.link && st().settings.linkSeen ? 'mac' : null));
// Look for the Mac once in a while until it has been seen. After that it is asked directly.
async function findMac() {
  if (ui.hasKey || !ui.link || st().settings.linkSeen || navigator.onLine === false) return;
  try { const t = await L.probe(ui.link); if (t) { st().settings.linkSeen = t; S.save(); settle(); } } catch (e) { /* no relay, no Mac: the fit still works */ }
}
const autoLeft = () => { const a = st().settings.autoDay; return AUTO_CAP - (a && a.d === today() ? a.n : 0); };
function photoState(o, mk) {
  if (mk) return { kind: 'photo' };
  const sig = mockKey(o);
  if (auto.busy === sig || (ui.busy && ui.busySig === sig)) return { kind: 'making' };
  const by = maker();
  if (by !== 'mac' && !(st().modelPhotos || []).length) return { kind: 'nophoto', sketch: true };
  if (!by) return { kind: 'nokey', sketch: true };
  if (auto.failed.has(sig)) return { kind: 'error', sketch: true, msg: auto.failed.get(sig) };
  if (navigator.onLine === false) return { kind: 'offline', sketch: true };
  if (st().settings.auto === false || o.date < today()) return { kind: 'manual', sketch: true };
  if (autoLeft() <= 0) return { kind: 'cap', sketch: true };
  return { kind: 'queued' };                                   // it starts by itself in a moment
}
// One request to ChatGPT's image engine for one fit, saved against that fit when it comes back.
async function createMockup(o, opts = {}) {
  const key = mockKey(o), place = placeOf();                       // fixed now: the fit and the place may change while ChatGPT works
  const linked = !!(ui.link && st().settings.linkSeen);
  if (maker() !== 'key') return createOnMac(o, opts, key, place);
  try { return await createWithKey(o, opts, key, place); }
  catch (e) {
    // the phone could not do it alone this time: if his Mac is there it is asked instead, and he is told why
    if ((e && e.name === 'AbortError') || !linked || (e instanceof M.MockupError && ['photo', 'paused', 'blocked'].includes(e.kind))) throw e;
    toast(`${(e && e.message) || 'OpenAI did not answer.'} Your Mac is making this one.`, 7000);
    return createOnMac(o, opts, key, place);
  }
}
// The Mac holds the reference photo and the ChatGPT sign in. The phone sends only the list of pieces and the setting, sealed.
async function createOnMac(o, opts, key, place) {
  let lock = null;
  try { if (navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch (e) { /* the screen may dim; the wait goes on */ }
  try {
    const brief = M.briefFor(o, st().items, st().profile, st().settings.setting || 'auto', place);
    const bh = await L.briefHash(brief.lines, brief.scene);
    if (place && place.venue) brief.place = { name: place.venue, kind: (E.OCCASIONS[o.occ] || {}).teach ? 'class' : KIND_WORD[o.occ] || '', when: place.when };
    // a change to a fit that already has a mockup is made to that same photograph. So is a picture of this very fit that is out of date.
    const mine = (st().mockups || {})[key];
    const prev = opts.fresh ? null : (ui.prevMock && ui.prevMock.bh) || (mine && mine.bh) || null;
    let did = {};
    const blob = await L.askMac(ui.link, brief, Object.assign({}, opts, { prev, onDone: (d) => { did = d || {}; } }));
    await saveMock(o, blob, 'ChatGPT on your Mac', { key, bh, where: did.where || '', miss: !!did.miss && !!(place && place.venue && !place.soft), place: place ? place.venue : '' });
    return { blob, model: 'mac' };
  } finally { if (lock) lock.release().catch(() => {}); }
}
// What a named place looks like, asked from the phone with his key: once per place, kept on the phone.
async function placeOnPhone(key, place, o, signal) {
  const city = st().profile.city || '';
  const k = (place.venue + '|' + city).toLowerCase();
  st().places = st().places || {};
  const had = st().places[k];
  if (had && Date.now() - had.at < (had.text ? 90 * 86400000 : 30 * 60000)) return had.text ? had : null;
  const kind = (E.OCCASIONS[o.occ] || {}).teach ? 'class' : KIND_WORD[o.occ] || '';
  const read = await O.lookUpPlace(key, P.placeName(place.venue), kind, city, signal);
  if (!read) return null;                                          // no usable answer: asked again another time
  st().places[k] = read === 'unknown' ? { at: Date.now(), name: '', text: '' } : Object.assign({ at: Date.now() }, read);
  S.save();
  return st().places[k].text ? st().places[k] : null;
}
// The photograph a change is made to when the phone works alone: the first picture of its line, so repeated changes never wear
// the face down. It has to show the same setting. Returns { blob, lines, rootKey } or null for a new photograph.
async function editBaseOnPhone(mkKey, scene, lines) {
  const all = st().mockups || {};
  const pk = (ui.prevMock && ui.prevMock.key && all[ui.prevMock.key] ? ui.prevMock.key : null) || (all[mkKey] ? mkKey : null);
  if (!pk) return null;
  const pick = (k) => { const r = all[k]; return r && (k === mkKey || (Array.isArray(r.lines) && r.scene === scene)) ? k : null; };
  const rk = (all[pk].root && pick(all[pk].root)) || pick(pk);
  if (!rk) return null;
  const rec = all[rk], was = Array.isArray(rec.lines) ? rec.lines : lines;        // a picture of this very fit with no record of its pieces shows these pieces
  const d = M.diffLines(was, lines);
  if (!(d.changed.length + d.gone.length) && (rec.look || 1) >= M.LOOK && !rec.stale) return null;
  const blob = await S.blobGet(rec.blob);
  return blob ? { blob, lines: was, rootKey: rk } : null;
}
async function createWithKey(o, { signal, onStage, fresh } = {}, mkKey, place) {
  const key = await S.secretGet('openai');
  if (!key) throw new M.MockupError('Add your OpenAI key in More first.', 'auth');
  const photos = (st().modelPhotos || []).slice(0, 3);
  const faces = [];
  for (const id of photos) { const b = await S.blobGet(id); if (b) faces.push(b); }
  if (!faces.length) throw new M.MockupError('Add a full length photo of yourself in More first.', 'photo');
  const brief = M.briefFor(o, st().items, st().profile, st().settings.setting || 'auto', place);
  let hidden = document.visibilityState === 'hidden', lock = null;
  const seen = () => { if (document.visibilityState === 'hidden') hidden = true; };
  document.addEventListener('visibilitychange', seen);
  try { if (navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch (e) { /* the screen may dim; the request still runs */ }
  try {
    // the setting: a named place is looked up once, and its real look becomes the backdrop
    let scene = brief.scene, where = '', miss = false;
    if (place && place.venue) {
      let found = null;
      try { found = await placeOnPhone(key, place, o, signal); } catch (e) { if (e && e.name === 'AbortError') throw e; }     // no lookup, no harm: the picture is still made
      if (found) { scene = P.sceneOf(found, place.when); where = found.name; } else miss = !place.soft;
    }
    // a change to a fit that already has a mockup is made to that same photograph
    const base = fresh ? null : await editBaseOnPhone(mkKey, scene, brief.lines);
    let prompt, images;
    if (base) { prompt = M.editPromptFrom(base.lines, brief.lines); images = [base.blob, faces[0]]; }
    else {
      images = faces.slice();
      for (const id of [o.suit || (o.jacket !== 'none' ? o.jacket : null), o.top, o.suit ? null : o.bottom, o.shoes].filter(Boolean)) {
        const it = item(id); if (it && it.photo && images.length < 8) { const b = await S.blobGet(it.photo); if (b) images.push(b); }
      }
      prompt = M.promptFrom(brief.lines, scene, faces.length);
    }
    const out = await M.generate({ key, model: st().settings.model, quality: st().settings.quality, prompt, images, signal, onModel: onStage });
    await saveMock(o, out.blob, out.model, { key: mkKey, place: place ? place.venue : '', where, miss, lines: brief.lines, scene, root: base && base.rootKey !== mkKey ? base.rootKey : '' });
    return out;
  } catch (e) {
    if (e instanceof M.MockupError && e.kind === 'network' && hidden) throw new M.MockupError('The app went to the background while ChatGPT was working. Keep it open for about a minute.', 'paused');
    throw e;
  } finally {
    document.removeEventListener('visibilitychange', seen);
    if (lock) lock.release().catch(() => {});
  }
}
function scheduleAuto() {
  clearTimeout(auto.timer);
  if (ui.tab !== 'fit' || ui.mode !== 'fit' || ui.loading || ui.busy || !st().items.length) return;
  if (auto.busy) {
    // the fit on screen changed while the Mac is still making the old one: call that one off, the new one starts after it
    const now = current();
    if (maker() === 'mac' && auto.ctl && now.o && mockKey(now.o) !== auto.busy && !mockFor(now.o)) { auto.moved = true; auto.ctl.abort(); }
    return;
  }
  const c = current();
  if (!c.o || (c.logged && !c.o.complete) || photoState(c.o, mockFor(c.o)).kind !== 'queued') return;
  const sig = mockKey(c.o);
  auto.timer = setTimeout(() => runAuto(sig, false), AUTO_DWELL);
}
// Redraw after a mockup starts or lands, without taking a text box away from someone who is typing in it.
function settle() {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { auto.stale = true; return; }
  auto.stale = false; render();
}
document.addEventListener('focusout', () => { if (auto.stale) setTimeout(settle, 60); });
async function runAuto(sig, forced) {
  if (auto.busy || ui.busy || ui.loading) return;
  const c = current();
  if (ui.tab !== 'fit' || ui.mode !== 'fit' || !c.o || mockKey(c.o) !== sig || mockFor(c.o)) return;
  if (!forced && photoState(c.o, null).kind !== 'queued') return;
  const o = c.o;
  auto.busy = sig; auto.ctl = new AbortController(); auto.failed.delete(sig);
  if (!forced) { const used = AUTO_CAP - autoLeft(); st().settings.autoDay = { d: today(), n: used + 1 }; S.save(); }
  settle();
  try { await createMockup(o, { signal: auto.ctl.signal, onStage: (s) => { const z = !!(s && s.st === 'asleep'); if (auto.asleep !== z) { auto.asleep = z; settle(); } } }); }
  catch (e) {
    if (e instanceof M.MockupError && e.kind === 'paused' && !auto.retried.has(sig)) auto.retried.add(sig);      // one more try once the app is back in front
    else if (e && e.name === 'AbortError' && auto.moved) { /* called off because the fit changed */ }
    else auto.failed.set(sig, e && e.name === 'AbortError' ? 'Stopped.' : (e && e.message) || 'That did not work.');
  }
  auto.moved = false; auto.asleep = false;
  auto.busy = null; auto.ctl = null;
  settle();
}
function swatch(it, big) {
  if (!it) return `<span class="sw none${big ? ' big' : ''}"></span>`;
  const img = it.photo ? `<img data-blob="${esc(it.photo)}" alt="">` : '';
  const pat = it.pattern === 'stripe' ? ' stripe' : it.pattern === 'check' ? ' check' : '';
  return `<span class="sw${big ? ' big' : ''}${pat}" style="--c:${esc(E.hexOf(it))}">${img}</span>`;
}
async function hydrateImages(root = document) {
  for (const img of root.querySelectorAll('img[data-blob]')) {
    const u = await S.blobUrl(img.dataset.blob);
    if (u) { img.src = u; img.removeAttribute('data-blob'); } else img.remove();
  }
}
function pickFile(accept, multiple = false, camera = false) {
  return new Promise((resolve) => {
    const inp = $('#filePick'); inp.value = ''; inp.accept = accept; inp.multiple = multiple;
    if (camera) inp.setAttribute('capture', 'environment'); else inp.removeAttribute('capture');      // straight to the camera, or the phone's own chooser
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}
const occLabel = (k) => (E.OCCASIONS[k] ? E.OCCASIONS[k].long : k);
const groupLabel = (g) => { const x = st().profile.groups.find((y) => y.id === g); return x ? x.name : ''; };

// ---------- render ----------
let sessionTimer = null;
function saveSession() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    const snap = ui.mode === 'fit' && ui.ask && !ui.loading ? { at: Date.now(), ask: ui.ask, date: ui.date, occ: ui.occ, locks: ui.locks, idx: ui.idx, editing: ui.editing, relaxed: ui.relaxed, tab: ui.tab, prev: ui.prevMock, fits: ui.results.map((r) => ({ o: r.o, why: r.why })) } : null;
    S.kvSet('session', snap).catch(() => {});
  }, 300);
}
function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const v = $('#view');
  if (!st().items.length) v.innerHTML = viewSetup();
  else if (ui.tab === 'fit') v.innerHTML = ui.mode === 'fit' && ui.ask ? viewFit() : viewAsk();
  else if (ui.tab === 'closet') v.innerHTML = viewCloset();
  else if (ui.tab === 'log') v.innerHTML = viewLog();
  else v.innerHTML = viewMore();
  renderWeather();
  renderSheet();
  hydrateImages();
  saveSession();
  scheduleAuto();
}
// After something changes in the background: never take the keyboard away from someone who is typing.
function refresh() {
  const a = document.activeElement;
  if (a && (a.id === 'askBox' || a.id === 'refineBox')) { renderWeather(); return; }
  if (!ui.sheet) render();
}
function renderWeather() {
  const d = ui.mode === 'fit' ? ui.date : (ui.when || today());
  const w = weatherFor(ui.forecast, d);
  $('#wx').innerHTML = st().items.length ? `<b>${Math.round(w.hi)}°</b><span>${Math.round(w.lo)}°</span><em>${esc(w.estimate ? 'avg' : (w.text || ''))}</em>` : '';
}

function viewSetup() {
  return `<section class="setup">
    <div class="figure-hero">${figureSvg({ jacket: 'j', top: 't', bottom: 'b', shoes: 's', belt: 'none', watch: 'w', glasses: 'g', tuck: 'tucked' }, [
      { id: 'j', cat: 'jacket', color: 'navy' }, { id: 't', cat: 'top', color: 'cream', sub: 'knit-polo' }, { id: 'b', cat: 'bottom', color: 'charcoal' },
      { id: 's', cat: 'shoes', color: 'dark-brown' }, { id: 'w', cat: 'watch', metal: 'gold' }, { id: 'g', cat: 'glasses', metal: 'tortoise' }])}</div>
    <h1>Your stylist, built from your own closet.</h1>
    <p>Fits come only from what you own, under your standing rules, and never repeat for the same audience.</p>
    <button class="btn primary" data-act="importFile">Import my closet file</button>
    <button class="btn" data-act="pasteSetup">Paste setup text</button>
    <button class="btn ghost" data-act="loadSample">Try it with a sample closet</button>
    <p class="fine">Your closet, photos and log stay on this phone.</p>
  </section>`;
}

const dayWord = (d) => (d === today() ? 'Today' : d === E.addDays(today(), 1) ? 'Tomorrow' : E.fmtDate(d));
function logLine(w, act = 'openLog') {
  const its = (w.items || []).map(item).filter(Boolean);
  const main = its.filter((i) => ['suit', 'jacket', 'top', 'bottom', 'shoes'].includes(i.cat));
  return `<button class="logrow" data-act="${act}" data-id="${esc(w.id)}" data-date="${w.date}" data-occ="${esc(w.occ)}">
    <span class="ld"><b>${new Date(w.date + 'T12:00:00').getDate()}</b><small>${E.fmtDate(w.date, { month: 'short' })}</small><small>${E.fmtDate(w.date, { weekday: 'short' })}</small></span>
    <span class="lb"><span class="lt">${esc(occLabel(w.occ))}${w.status === 'planned' ? ' <em>planned</em>' : ''}</span>
    <span class="ls">${main.map((i) => swatch(i)).join('')}</span>
    <span class="ln">${esc(main.map((i) => i.short || i.name).join(', ') || (w.note || ''))}</span></span></button>`;
}
// The opening screen: one question. The answer can be typed, spoken with the keyboard microphone, or tapped.
function viewAsk() {
  const t = today(), when = ui.when || t;
  const quick = [[t, 'Today'], [E.addDays(t, 1), 'Tomorrow']];
  const other = !quick.some(([d]) => d === when);
  const wearing = st().wears.filter((w) => w.date === t && w.status === 'worn' && E.OCCASIONS[w.occ]);
  return `<section class="ask">
      <div class="eyebrow">${esc(E.fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' }))}</div>
      <h1>What is the fit for?</h1>
      <textarea id="askBox" class="askbox" rows="3" data-in="askText" data-enter="askGo" enterkeyhint="go" placeholder="Dinner at Marios tonight, then drinks" autocomplete="off">${esc(ui.draft)}</textarea>
      <button class="btn primary" data-act="askGo">Get my fit</button>
      <p class="fine">Say where and when, and anything you want in it. Name the place and the mockup is staged there. Name a piece the closet does not list and it is taken as yours. Or ask: can I wear jeans to dinner? Monday class with the fedora.</p>
    </section>
    <section class="sec"><h3>Or tap one</h3>
      <div class="seg" role="group" aria-label="Day">${quick.map(([d, l]) => `<button class="${d === when ? 'on' : ''}" data-act="askWhen" data-date="${d}">${l}</button>`).join('')}
        <label class="${other ? 'on' : ''}"><span>${other ? esc(E.fmtDate(when)) : 'Another day'}</span><input type="date" data-in="askDate" value="${when}" aria-label="Pick another day"></label></div>
      <div class="chips wrap">${Object.entries(E.OCCASIONS).map(([k, v]) => `<button class="chip" data-act="askChip" data-occ="${k}">${esc(v.label)}</button>`).join('')}</div>
    </section>
    ${wearing.length ? `<section class="sec"><h3>Wearing today</h3><div class="card list">${wearing.map((w) => logLine(w, 'gotoDay')).join('')}</div></section>` : ''}`;
}
// What was asked, how it was read, and a place to change it.
function verdictHtml(v) {
  if (!v) return '';
  if (v.busy) return `<div class="verdict info"><q>${esc(v.q)}</q><div class="busy"><div class="spinner"></div><p>${esc(v.head)}</p></div><div class="actions"><button class="btn small" data-act="dropVerdict">Cancel</button></div></div>`;
  return `<div class="verdict ${esc(v.tone)}"><q>${esc(v.q)}</q><h3>${esc(v.head)}</h3>${(v.lines || []).map((t) => `<p>${esc(t)}</p>`).join('')}${v.by ? `<p class="fine">Answered by ${esc(v.by)}, with this fit for context.</p>` : ''}
    <div class="actions">${v.canDo ? `<button class="btn small primary" data-act="doVerdict">${v.tone === 'bad' ? 'Do it anyway' : 'Do it'}</button>` : ''}<button class="btn small" data-act="dropVerdict">${v.canDo ? 'Keep this fit' : 'OK'}</button></div></div>`;
}
function askBar() {
  const a = ui.ask, occ = E.OCCASIONS[ui.occ] || E.OCCASIONS.casual;
  const also = (a.also || []).filter((k) => E.OCCASIONS[k] && k !== ui.occ);
  const first = a.first != null ? a.first : a.text;
  const said = first ? `<q>${esc(first)}</q>` : esc(a.label || '');
  // every change made so far: the ones typed, and the pieces swapped by hand. Each can be taken back.
  const c = current();
  const typed = (a.steps || []).map((x, i) => `<button class="chip took" data-act="dropStep" data-i="${i}" aria-label="Take back: ${esc(x.t)}"><span>${esc(x.t)}</span><b aria-hidden="true">×</b></button>`);
  const swapped = c.logged ? [] : Object.entries(ui.locks).map(([slot, id]) => {
    const it = id && id !== 'none' ? item(id) : null;
    const label = `${E.SLOT_LABEL[slot] || 'Tuck'}: ${it ? (it.short || it.name) : slot === 'tuck' ? id : 'none'}`;
    return `<button class="chip took" data-act="unlock" data-slot="${esc(slot)}" aria-label="Take back: ${esc(label)}"><span>${esc(label)}</span><b aria-hidden="true">×</b></button>`;
  });
  const changes = typed.concat(swapped);
  return `<div class="card asked">
    ${said ? `<div class="said">${said}</div>` : ''}
    <div class="pills">
      <label class="pill"><span>${esc(dayWord(ui.date))}</span><input type="date" data-in="pillDate" value="${ui.date}" aria-label="Change the day"></label>
      <button class="pill" data-act="pickOcc">${esc(occ.long)}</button>
      ${also.map((k) => `<span class="pill plain">+ ${esc(E.OCCASIONS[k].long)}</span>`).join('')}
    </div>
    ${changes.length ? `<div class="changes"><h3>Your changes <span>${changes.length}</span></h3><div class="chips wrap">${changes.join('')}</div></div>` : ''}
    ${(a.reply || []).length || a.diff ? `<p class="reply">${esc((a.reply || []).concat(a.diff ? [a.diff] : []).join(' '))}</p>` : ((a.notes || []).length ? `<ul class="notes">${a.notes.map((n) => `<li>${esc(n.t)}</li>`).join('')}</ul>` : '')}
    ${verdictHtml(a.verdict)}
    <div class="refine"><input type="text" id="refineBox" data-in="refineText" data-enter="refine" enterkeyhint="go" placeholder="Change it, or ask: can I wear…?" aria-label="Change something about this fit, or name the place" autocomplete="off" value="${esc(ui.refineDraft)}"><button class="btn small" data-act="refine">Go</button></div>
    <div class="actions"><button class="btn small" data-act="refreshFit">Refresh</button><button class="btn small" data-act="askAgain">Start over</button></div>
  </div>`;
}
function rowHtml(r, logged) {
  const lab = r.label || E.SLOT_LABEL[r.slot];
  const locked = !logged && ui.locks[r.slot] != null;
  const name = r.item ? esc(r.item.name) : (r.slot === 'jacket' ? 'No jacket' : 'None');
  const note = r.note && (r.item || r.slot !== 'jacket') ? `<small>${esc(r.note)}</small>` : '';
  if (r.slot === 'extra') return `<button class="row" data-act="item" data-id="${esc(r.item.id)}">${swatch(r.item)}<span class="rt"><span class="rl">${esc(lab)}</span><span class="rn">${name}${note}</span></span><span class="chev" aria-hidden="true"></span></button>`;
  return `<button class="row" ${logged ? 'disabled' : `data-act="swap" data-slot="${r.slot}"`}>
    ${swatch(r.item)}<span class="rt"><span class="rl">${esc(lab)}${locked ? ' · locked' : ''}</span><span class="rn">${name}${note}</span></span>${logged ? '' : '<span class="chev" aria-hidden="true"></span>'}</button>`;
}
// One line at the top of the fit: the hours and weather it was checked against, and how the checks came out.
function verifiedLine(checks) {
  const when = checks.find((c) => c.k === 'When'), wx = checks.find((c) => c.k === 'Weather');
  if (!wx || !wx.short) return '';
  const open = checks.filter((c) => c.level === 'bad' || c.level === 'note').length;
  const clear = checks.filter((c) => c.level === 'ok').length;
  return `<button class="verified${open ? ' open' : ''}" data-act="toChecks"><i aria-hidden="true"></i><span>${esc([when && when.short, wx.short].filter(Boolean).join(' · '))}<b>${open ? `${open} of ${open + clear} checks to look at` : `All ${clear} checks clear`}</b></span></button>`;
}
// The top of the fit: the ChatGPT mockup, or what stands between the wearer and having one.
function photoSlot(o, mk, ph) {
  if (ph.kind === 'photo') {
    const set = mk.where ? `<p class="fine setat">Set at ${esc(mk.where)}, as ChatGPT found it.</p>` : mk.miss && mk.place ? `<p class="fine setat">ChatGPT could not find ${esc(mk.place)}, so the backdrop is a stand in. Name the place another way in the box above to try again.</p>` : '';
    return `<div class="photo" data-act="mockup"><img data-blob="${esc(mk.blob)}" alt="Mockup of this fit on you"><span class="visual-tag">ChatGPT mockup</span></div>${set}`;
  }
  if (ph.kind === 'making' || ph.kind === 'queued') {
    const changed = !!(ui.prevMock && ui.prevMock.blob);                       // a change is being made to the picture that was on screen
    const old = changed ? ui.prevMock.blob : (anyMock(o) || {}).blob, me = old || (st().modelPhotos || [])[0];
    const pl = placeOf(), at = pl && pl.venue && !pl.soft ? pl.venue : '';
    if (auto.asleep && ph.kind === 'making') return `<div class="photo making${old ? ' prev' : ''}" data-act="mockup">${me ? `<img data-blob="${esc(me)}" alt="">` : ''}<div class="making-text"><div class="spinner"></div><b>Your Mac is not answering</b><span>It may be asleep. Wake it and this mockup arrives by itself. Trying for a few more minutes.</span></div></div>`;
    return `<div class="photo making${old ? ' prev' : ''}" data-act="mockup">${me ? `<img data-blob="${esc(me)}" alt="">` : ''}<div class="making-text"><div class="spinner"></div><b>${changed ? 'Updating your mockup with the change' : at ? `ChatGPT is putting you at ${esc(at)} in this fit` : 'ChatGPT is dressing you in this fit'}</b><span>${maker() === 'mac' ? 'Made on your Mac. About a minute. Keep the app open.' : 'About a minute. Keep the app open.'}</span></div></div>`;
  }
  const box = (title, text, buttons) => `<div class="photo-setup"><b>${title}</b><span>${text}</span><div class="actions wrap">${buttons}</div></div>`;
  const app = '<button class="btn small" data-act="mockup">Use the ChatGPT app</button>';
  if (ph.kind === 'nophoto') return box('Your ChatGPT mockup goes here', 'First add a full length photo of yourself. ChatGPT uses it to put each fit on you.', '<button class="btn primary small" data-act="addPhoto">Add my photo</button>');
  if (ph.kind === 'nokey') return box('Your ChatGPT mockup goes here', 'One step is left, and only you can do it: add your OpenAI key. After that every fit arrives as a photo of you instead of a sketch.', `<button class="btn primary small" data-act="setupKey">Add my key</button>${app}`);
  if (ph.kind === 'error' && ph.msg === 'Stopped.') return box('Mockup stopped', 'You stopped this one. It is made when you ask.', `<button class="btn primary small" data-act="retryAuto">Create my mockup</button>${app}`);
  if (ph.kind === 'error' && /Mac is not answering/.test(ph.msg || '')) return box('Your Mac is not answering', esc((ph.msg || '').replace(/^Your Mac is not answering\. /, '')) + ' Or let this phone make them on its own.', `<button class="btn primary small" data-act="retryAuto">Try again</button><button class="btn small" data-act="setupKey">Use this phone only</button>${app}`);
  if (ph.kind === 'error') return box('ChatGPT did not return the mockup', esc(ph.msg || ''), `<button class="btn primary small" data-act="retryAuto">Try again</button>${app}`);
  if (ph.kind === 'offline') return box('No connection', 'The mockup is made as soon as you are back online.', '<button class="btn primary small" data-act="retryAuto">Try now</button>');
  if (ph.kind === 'cap') return box('Automatic mockups are done for today', `${AUTO_CAP} were made by themselves today. This one is made when you ask.`, '<button class="btn primary small" data-act="retryAuto">Create my mockup</button>');
  return box('See this fit on you', 'ChatGPT puts this fit on you in about a minute.', '<button class="btn primary small" data-act="retryAuto">Create my mockup</button>');
}
// ---------- the photo check ----------
// A photograph of the finished look, or of one piece he is trying on. ChatGPT on his Mac reads it against the plan and his
// rules (js/check.js). The photograph is sealed on the way, looked at once and not kept on the Mac. The phone keeps it
// with the reading so he can see what was checked.
const look = { busy: null, key: null, ctl: null, error: '', errKey: null };
const canCheck = () => ui.hasKey || !!(ui.link && st().settings.linkSeen);
const redrawLook = () => { if (ui.sheet && ui.sheet.type === 'item') { renderSheet(); hydrateImages($('#sheet')); } else settle(); };
async function startCheck(d, camera) {
  if (look.busy) { toast('One photo is already being checked.'); return; }
  if (!canCheck()) { toast('The photo check needs an OpenAI key on this phone, or your Mac helper.', 5000); return; }
  const piece = d && d.id ? item(d.id) : null;
  if (!piece && !current().o) return;
  const [f] = await pickFile('image/*', false, camera);
  if (f) await runCheck(piece, f);
}
// One photograph, checked: against the fit on screen, or as a fitting of one piece.
async function runCheck(piece, f) {
  if (look.busy) return;
  const o = piece ? null : current().o;
  if (!piece && !o) return;
  const key = piece ? 'piece:' + piece.id : E.signature(o);
  const plan = piece ? { mode: 'piece', occasion: '', lines: [M.plainLine(piece)] } : { mode: 'look', occasion: E.sayOf(o.occ), lines: M.briefFor(o, st().items, st().profile, 'auto').lines };
  // which closet piece each line of the plan is, so a fit problem can be noted on the piece
  const labels = piece ? { [plan.lines[0].split(':')[0]]: piece.id } : Object.fromEntries(E.rows(o, st().items).filter((r) => r.item).map((r) => [(r.label || E.SLOT_LABEL[r.slot]).toUpperCase(), r.item.id]));
  look.busy = 'Getting the photo ready'; look.key = key; look.error = ''; look.errKey = null; look.ctl = new AbortController(); redrawLook();
  try {
    const blob = await M.downscale(f, 1600, 0.86);
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    if (head[0] !== 0xff || head[1] !== 0xd8) throw new Error('That photo could not be read. Take it again, or choose another.');
    const linked = !!(ui.link && st().settings.linkSeen);
    const onMac = () => { look.busy = 'Reaching your Mac'; redrawLook(); return L.askCheck(ui.link, plan, blob, { signal: look.ctl.signal, onStage: (s) => { look.busy = s.st === 'asleep' ? 'Your Mac is not answering. Wake it and this carries on by itself.' : s.st === 'sending' ? 'Sending the photo, sealed' : 'ChatGPT is looking at the photo'; redrawLook(); } }); };
    let res;
    const own = ui.hasKey ? await S.secretGet('openai') : null;
    if (own) {                                                      // this phone alone, with his own key
      look.busy = 'ChatGPT is looking at the photo'; redrawLook();
      try { res = await O.checkPhoto(own, plan, blob, look.ctl.signal); }
      catch (e) { if ((e && e.name === 'AbortError') || !linked) throw e; toast(`${(e && e.message) || 'OpenAI did not answer.'} Your Mac is checking this one.`, 7000); res = await onMac(); }
    } else res = await onMac();
    st().looks = st().looks || {};
    const old = st().looks[key];
    const id = 'look:' + S.uid('k');
    await S.blobPut(id, blob);
    if (old && old.photo) await S.blobDel(old.photo);
    st().looks[key] = { at: Date.now(), mode: plan.mode, verdict: res.verdict, pieces: res.pieces || [], fix: res.fix || [], good: res.good || [], photo: id, labels };
    // the newest twenty readings are kept
    const keys = Object.keys(st().looks).sort((a, b) => st().looks[b].at - st().looks[a].at);
    for (const k of keys.slice(20)) { if (st().looks[k].photo) await S.blobDel(st().looks[k].photo); delete st().looks[k]; }
    if (piece) {                                                    // how a piece fits is remembered on the piece, and the stylist takes it into account
      const p0 = (res.pieces || [])[0] || {};
      if (res.verdict === 'fits') { delete piece.fitIssue; piece.fitOk = today(); }
      else if (res.verdict === 'tailor' || res.verdict === 'nofit') { piece.fitIssue = `${C.VERDICTS[res.verdict]}. ${res.fix[0] || p0.note || ''}`.trim() + ` (photo check ${E.shortDate(today())})`; delete piece.fitOk; }
    }
    await S.save(true);
  } catch (e) { if (!(e && e.name === 'AbortError')) { look.error = (e && e.message) || 'That did not work. Try again.'; look.errKey = key; } }
  look.busy = null; look.ctl = null;
  redrawLook();
}
const nicer = (label) => { const t = String(label || '').toLowerCase(); return t ? t[0].toUpperCase() + t.slice(1) : ''; };
function lookHtml(key, mode, id) {
  const rec = (st().looks || {})[key];
  const err = look.error && look.errKey === key ? `<p class="error">${esc(look.error)}</p>` : '';
  const forId = id ? ` data-id="${esc(id)}"` : '';
  const buttons = (again) => `<div class="actions wrap"><button class="btn small${again ? '' : ' primary'}" data-act="lookShot"${forId}>${again ? 'Take a new photo' : 'Take a photo'}</button><button class="btn small" data-act="lookPick"${forId}>Choose a photo</button>${again ? `<button class="btn small danger" data-act="lookClear" data-key="${esc(key)}">Remove</button>` : ''}</div>`;
  if (look.busy && look.key === key) return `<div class="lookcheck"><h3>Photo check</h3><div class="busy"><div class="spinner"></div><p>${esc(look.busy)}</p></div><div class="actions"><button class="btn small" data-act="lookCancel">Cancel</button></div></div>`;
  if (!rec) {
    const what = mode === 'piece' ? 'Put it on and take a photo. ChatGPT says how it fits, and the piece remembers it.' : 'Dressed? Take a photo of the whole look. ChatGPT checks it against this fit and your rules before you leave.';
    return `<div class="lookcheck"><h3>Photo check</h3><p class="fine">${what}</p>${err}${canCheck() ? buttons(false) : '<p class="fine">It needs an OpenAI key on this phone (More), or your Mac helper.</p>'}</div>`;
  }
  const tone = rec.verdict === 'ready' || rec.verdict === 'fits' ? 'ok' : rec.verdict === 'unclear' ? 'you' : 'bad';
  const OFF = ['tight', 'loose', 'long', 'short'];
  const lis = [];
  for (const t of rec.fix || []) lis.push(`<li class="bad"><i aria-hidden="true"></i><span><b>Fix</b>${esc(t)}</span></li>`);
  for (const p of rec.pieces || []) {
    const state = [p.seen === 'different' ? 'not as planned' : p.seen === 'hidden' ? 'not in view' : '', OFF.includes(p.fit) ? 'runs ' + p.fit : p.fit === 'good' ? 'fits' : ''].filter(Boolean).join(', ');
    const pid = (rec.labels || {})[p.label], it = pid ? item(pid) : null;
    const save = it && mode !== 'piece' && OFF.includes(p.fit) && p.seen !== 'hidden' ? ` <button class="link" data-act="noteFit" data-id="${esc(pid)}" data-key="${esc(key)}" data-label="${esc(p.label)}"${it.fitIssue ? ' disabled' : ''}>${it.fitIssue ? 'Noted on the piece' : 'Note it on the piece'}</button>` : '';
    const cls = p.seen === 'different' || OFF.includes(p.fit) ? 'note' : p.seen === 'hidden' ? 'you' : 'ok';
    lis.push(`<li class="${cls}"><i aria-hidden="true"></i><span><b>${esc(nicer(p.label))}${state ? ' · ' + esc(state) : ''}</b>${esc(p.note || '')}${save}</span></li>`);
  }
  for (const t of rec.good || []) lis.push(`<li class="ok"><i aria-hidden="true"></i><span><b>Works</b>${esc(t)}</span></li>`);
  return `<div class="lookcheck"><div class="lc-head">${rec.photo ? `<img data-blob="${esc(rec.photo)}" alt="The photo that was checked">` : ''}<div><div class="eyebrow">Photo check · ${esc(E.shortDate(E.isoDate(new Date(rec.at))))} ${esc(E.clockLabel(rec.at))}</div><h3 class="lc-${tone}">${esc(C.VERDICTS[rec.verdict] || 'Checked')}</h3></div></div>
    <ul>${lis.join('')}</ul>${err}${canCheck() ? buttons(true) : ''}</div>`;
}
// Why this fit suits the day, one reason per line. Pieces he named count as asked for.
const namedIds = () => { const a = ui.ask || {}; return Object.values(a.locks || {}).concat(Object.values(ui.locks || {}), a.made || []).filter((v) => v && v !== 'none'); };
function whyHtml(o) {
  const why = o && o.complete !== false ? E.explain(ctx(), o, namedIds()) : [];
  if (!why.length) return '';
  return `<div class="why"><h3>Why this works</h3><ul>${why.map((r) => `<li><b>${esc(r.k)}</b>${esc(r.t)}</li>`).join('')}</ul></div>`;
}
// Every factor that was checked for this fit, problems first.
function checksHtml(checks) {
  if (!checks.length) return '';
  const open = checks.filter((c) => c.level === 'bad' || c.level === 'note');
  const clear = checks.filter((c) => c.level === 'ok').length;
  const rank = { bad: 0, note: 1, ok: 2, you: 3 };
  const rows = checks.slice().sort((x, y) => rank[x.level] - rank[y.level]);
  return `<div class="checks"><h3>Checked <span${open.length ? ' class="open"' : ''}>${open.length ? `${open.length} to look at` : `all ${clear} clear`}</span></h3>
    <ul>${rows.map((c) => `<li class="${c.level}"><i aria-hidden="true"></i><span><b>${esc(c.k)}</b>${esc(c.t)}</span></li>`).join('')}</ul></div>`;
}
function viewFit() {
  if (ui.loading) return `${askBar()}<div class="card"><div class="busy"><div class="spinner"></div><p>${esc(ui.loading)}</p></div></div>`;
  const c = current();
  const occ = E.OCCASIONS[ui.occ] || E.OCCASIONS.casual;
  const past = E.daysBetween(ui.date, today()) > 0;
  const isToday = ui.date === today();
  let body = '';
  if (c.logged && !c.o.complete) {
    body = `<div class="card"><div class="eyebrow">${c.entry.status === 'planned' ? 'Planned' : 'Logged'} · ${esc(occ.long)}</div>
      <ul class="plain">${(c.entry.items || []).map((id) => `<li>${swatch(item(id))}<span>${esc(nameOf(id))}</span></li>`).join('')}</ul>
      ${c.entry.note ? `<p class="note">${esc(c.entry.note)}</p>` : ''}
      <div class="actions"><button class="btn" data-act="editEntry">Build a full fit for this day</button></div></div>`;
  } else if (c.o) {
    const rs = E.rows(c.o, st().items);
    const mk = mockFor(c.o);
    const ph = photoState(c.o, mk);
    const watch = item(c.o.watch);
    document.documentElement.dataset.metal = watch && watch.metal === 'silver' ? 'silver' : 'gold';
    const status = c.logged ? (c.entry.status === 'planned' ? 'Planned' : 'Worn') : (ui.editing ? 'New pick' : 'Suggested');
    const count = !c.logged && ui.results.length > 1 ? `<span class="count">${ui.idx + 1} of ${ui.results.length}</span>` : '';
    body = `<div class="card fit">
      <div class="fit-head"><div><div class="eyebrow">${esc(status)} · ${esc(occ.long)}</div><h2>${esc(E.fmtDate(ui.date, { weekday: 'long', month: 'long', day: 'numeric' }))}</h2></div>${count}</div>
      ${verifiedLine(c.checks)}
      ${c.logged && c.entry.status === 'planned' && !past ? '<p class="fine">You locked this in earlier. It was checked again just now.</p>' : ''}
      ${!c.logged && ui.relaxed ? `<p class="error">${esc(ui.relaxed)}</p>` : ''}
      ${photoSlot(c.o, mk, ph)}
      <div class="look${ph.sketch ? '' : ' no-visual'}">
        ${ph.sketch ? `<div class="visual" data-act="mockup">${figureSvg(c.o, st().items)}<span class="visual-tag">Sketch</span></div>` : ''}
        <div class="rows">${rs.map((r) => rowHtml(r, c.logged)).join('')}</div>
      </div>
      ${c.entry && c.entry.note && c.logged ? `<p class="note">${esc(c.entry.note)}</p>` : ''}
      ${whyHtml(c.o)}
      ${checksHtml(c.checks)}
      ${lookHtml(E.signature(c.o), 'look', '')}
      <div class="actions">
        ${c.logged
          ? `${c.entry.status === 'planned' && (past || isToday) ? '<button class="btn primary" data-act="markWorn">I wore it</button>' : ''}
             <button class="btn${c.entry.status === 'planned' && (past || isToday) ? '' : ' primary'}" data-act="mockup">Mockup</button>
             <button class="btn" data-act="editEntry">Change it</button>`
          : `<button class="btn primary" data-act="lockIn">${past || isToday ? (isToday ? 'Wearing this' : 'I wore this') : 'Lock it in'}</button>
             <button class="btn" data-act="another">Another</button>
             <button class="btn" data-act="mockup">Mockup</button>`}
      </div>
      ${!c.logged && Object.keys(ui.locks).length ? `<button class="link" data-act="clearLocks">Clear my ${Object.keys(ui.locks).length} locked ${Object.keys(ui.locks).length === 1 ? 'piece' : 'pieces'}</button>` : ''}
      ${c.logged ? '<button class="link danger" data-act="removeEntry">Remove from the log</button>' : (c.entry ? '<button class="link" data-act="cancelEdit">Keep the logged fit</button>' : '')}
    </div>`;
  } else {
    body = `<div class="card"><h2>No fit clears the rules</h2><p>Nothing in the closet works for this with those pieces. Clear a locked piece, change what you asked for above, or ask again.</p>
      <div class="actions">${Object.keys(ui.locks).length ? '<button class="btn primary" data-act="clearLocks">Clear locked pieces</button>' : ''}<button class="btn" data-act="askAgain">New question</button></div></div>`;
  }
  return `${askBar()}${body}`;
}

function lastWorn(id) {
  const ds = st().wears.filter((w) => (w.items || []).includes(id) && E.daysBetween(w.date, today()) >= 0).map((w) => w.date).sort();
  return ds.length ? ds[ds.length - 1] : null;
}
function viewCloset() {
  const q = ui.q.trim().toLowerCase();
  const list = st().items.filter((i) => !q || (i.name + ' ' + (i.notes || '') + ' ' + i.color).toLowerCase().includes(q));
  const active = list.filter((i) => i.status !== 'retired');
  const retired = list.filter((i) => i.status === 'retired');
  const sec = (cat) => {
    const its = active.filter((i) => i.cat === cat.id);
    if (!its.length) return '';
    return `<section class="sec"><h3>${esc(cat.label)} <span>${its.length}</span></h3><div class="grid">${its.map(tile).join('')}</div></section>`;
  };
  return `<div class="bar"><input type="search" placeholder="Search ${st().items.length} pieces" value="${esc(ui.q)}" data-in="q" autocomplete="off"><button class="btn small" data-act="addItem">Add</button></div>
    ${E.CATS.map(sec).join('')}
    ${retired.length ? `<section class="sec"><h3>Out of rotation <span>${retired.length}</span></h3><div class="grid">${retired.map(tile).join('')}</div></section>` : ''}
    ${!list.length ? '<p class="empty">Nothing matches that search.</p>' : ''}`;
}
function tile(i) {
  const lw = lastWorn(i.id);
  const tag = i.status === 'retired' ? 'out' : i.said ? 'from your words' : i.hold ? 'manual only' : '';
  return `<button class="tile${i.status === 'retired' ? ' off' : ''}" data-act="item" data-id="${esc(i.id)}">${swatch(i, true)}<span class="tn">${esc(i.name)}</span><span class="tm">${tag ? esc(tag) : (lw ? 'worn ' + E.shortDate(lw) : '')}</span></button>`;
}

function viewLog() {
  const f = ui.logFilter;
  const ws = st().wears.filter((w) => f === 'all' || (f === 'other' ? !w.group : w.group === f)).slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const chips = [['all', 'All'], ...st().profile.groups.map((g) => [g.id, g.name]), ['other', 'Other']];
  return `<div class="chips">${chips.map(([k, l]) => `<button class="chip${k === f ? ' on' : ''}" data-act="logFilter" data-f="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="card list">${ws.map((w) => logLine(w)).join('') || '<p class="empty">Nothing logged yet. Lock in a fit and it lands here.</p>'}</div>`;
}

function viewMore() {
  const s = st().settings;
  const photos = st().modelPhotos || [];
  return `<section class="sec"><h3>You, as the model <span>${photos.length}</span></h3>
      <div class="card"><p>Add one to three full length photos of yourself: standing, good light, head to shoes. ChatGPT uses them to put each fit on you.</p>
      <div class="photos">${photos.map((id) => `<div class="ph"><img data-blob="${esc(id)}" alt="Model photo"><button data-act="delPhoto" data-id="${esc(id)}" aria-label="Remove photo">×</button></div>`).join('')}
      ${photos.length < 4 ? '<button class="ph add" data-act="addPhoto"><span>+</span>Add photo</button>' : ''}</div></div></section>
    <section class="sec"><h3>ChatGPT mockups</h3>
      <div class="card" id="keyCard">${ui.hasKey
        ? `<p><b>This phone works on its own.</b> Mockups, changes to them, the place lookup and the photo check are made here with your OpenAI key. Your Mac is not needed.</p>
           <label class="toggle"><input type="checkbox" data-in="auto"${s.auto !== false ? ' checked' : ''}><span>Make the mockup by itself with each fit</span></label>
           <p class="fine">Up to ${AUTO_CAP} a day by themselves, about a minute each. OpenAI bills the key per use: the mockup price depends on the quality below, a photo check or a place lookup is a cent or two.${maker() && ui.link && s.linkSeen ? ' If OpenAI turns a request down, your Mac is asked instead and you are told why.' : ''}</p>`
        : `<p>${maker() === 'mac' ? '<b>Right now your Mac makes the mockups</b>, with your ChatGPT plan, so it has to be awake and online.' : 'Each fit can arrive as a ChatGPT mockup of you instead of a sketch.'} To have this phone do everything on its own, with no Mac, it needs your own OpenAI API key.</p>
           <p class="fine">Why a key: an app on a phone cannot use a ChatGPT plan. OpenAI only lets its own app or a signed in computer do that. The API is the one door open to a phone, and OpenAI bills it per use, apart from your plan: roughly 5 to 10 cents a mockup at Standard, a cent or two for a photo check or a place lookup.</p>
           <ol class="steps"><li>Tap Open OpenAI below and sign in with your ChatGPT account.</li><li>Under Billing, add a card and a few dollars of credit.</li><li>If it asks you to verify your organization, do it. Image models need it.</li><li>Under API keys, create a new secret key and tap Copy.</li><li>Come back here and tap Paste my key.</li></ol>
           <div class="actions wrap"><a class="btn small" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">Open OpenAI</a><button class="btn small primary" data-act="pasteKey">Paste my key</button></div>`}
      <label class="field"><span>OpenAI API key</span><input type="password" id="keyInput" placeholder="${ui.hasKey ? 'Saved on this phone' : 'sk-...'}" autocomplete="off" autocapitalize="off" spellcheck="false" data-in="key"></label>
      <div class="actions"><button class="btn small" data-act="saveKey">Save key</button>${ui.hasKey ? '<button class="btn small" data-act="clearKey">Remove key</button>' : ''}</div>
      <label class="field"><span>Image quality</span><select data-in="quality">${['low', 'medium', 'high'].map((q) => `<option value="${q}"${s.quality === q ? ' selected' : ''}>${q === 'low' ? 'Draft, about 1 to 2 cents' : q === 'medium' ? 'Standard, about 5 to 10 cents' : 'Best, about 20 to 30 cents'}</option>`).join('')}</select></label>
      <label class="field"><span>Model</span><select data-in="model">${M.MODELS.map((m) => `<option value="${m}"${s.model === m ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <p class="fine">The key stays on this phone and is sent only to OpenAI. Prices are estimates from OpenAI's published rates. Without a key and without your Mac, tap Mockup on a fit to hand it to your ChatGPT app.</p></div></section>
    <section class="sec"><h3>Standing rules</h3><div class="card rules">${(st().rules || []).map((g) => `<details><summary>${esc(g.group)}</summary><ul>${g.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`).join('') || '<p class="empty">No rules loaded.</p>'}</div></section>
    <section class="sec"><h3>Your data</h3><div class="card">
      <p>${st().items.length} pieces, ${st().wears.length} logged days. Everything is stored on this phone only.</p>
      <div class="actions wrap"><button class="btn small" data-act="exportData">Back up</button><button class="btn small" data-act="importFile">Import file</button><button class="btn small" data-act="pasteSetup">Paste setup</button><button class="btn small danger" data-act="erase">Erase</button></div></div></section>
    ${window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches ? '' : '<section class="sec"><h3>Install</h3><div class="card"><p>In Safari, tap Share, then Add to Home Screen. The app then opens full screen and works offline.</p></div></section>'}
    <p class="fine center">Presidential Fit ${VERSION}</p>`;
}

// ---------- sheets ----------
function openSheet(s) { ui.sheet = s; renderSheet(); hydrateImages($('#sheet')); }
function closeSheet() { ui.sheet = null; renderSheet(); }
let sheetShown = '';
function renderSheet() {
  const el = $('#sheet');
  if (!ui.sheet) { el.hidden = true; el.innerHTML = ''; document.body.classList.remove('sheet-open'); sheetShown = ''; return; }
  const s = ui.sheet;
  // the same sheet drawn again (a status changed) stays where it was scrolled to and does not slide in a second time
  const name = s.type + ':' + (s.id || s.slot || '');
  const again = !el.hidden && sheetShown === name && !!el.querySelector('.panel');
  const kept = again ? el.querySelector('.panel').scrollTop : 0;
  let inner = '';
  if (s.type === 'swap') inner = sheetSwap(s);
  else if (s.type === 'item') inner = sheetItem(s);
  else if (s.type === 'log') inner = sheetLog(s);
  else if (s.type === 'mockup') inner = sheetMockup(s);
  else if (s.type === 'paste') inner = sheetPaste(s);
  else if (s.type === 'add') inner = sheetAdd(s);
  else if (s.type === 'occ') inner = sheetOcc(s);
  else if (s.type === 'confirm') inner = `<h2>${esc(s.title)}</h2><p>${esc(s.text)}</p><div class="actions"><button class="btn danger" data-act="confirmYes">${esc(s.yes)}</button><button class="btn" data-act="closeSheet">Cancel</button></div>`;
  el.innerHTML = `<div class="backdrop" data-act="closeSheet"></div><div class="panel" role="dialog" aria-modal="true"><div class="grab" data-act="closeSheet"></div>${inner}</div>`;
  el.hidden = false; document.body.classList.add('sheet-open');
  if (again) { const pn = el.querySelector('.panel'), bd = el.querySelector('.backdrop'); pn.style.animation = 'none'; if (bd) bd.style.animation = 'none'; pn.scrollTop = kept; }
  sheetShown = name;
}
function sheetOcc() {
  return `<h2>What kind of day</h2><p class="fine">Pick the one the fit is for. The fit is rebuilt and checked again.</p>
    <div class="rows sheet-rows">${Object.entries(E.OCCASIONS).map(([k, v]) => `<button class="row pick${k === ui.occ ? ' cur' : ''}" data-act="setOcc" data-occ="${k}"><span class="rn">${esc(v.long)}</span>${k === ui.occ ? '<span class="tick" aria-label="current"></span>' : ''}</button>`).join('')}</div>`;
}
function sheetSwap(s) {
  const lab = E.SLOT_LABEL[s.slot] || 'Tuck';
  const cur = current().o;
  const counts = {};
  s.alts.forEach((a) => a.result && a.result.flags.forEach((f) => { counts[f] = (counts[f] || 0) + 1; }));
  const live = s.alts.filter((a) => a.result).length;
  const own = (a) => (a.result ? a.result.flags.filter((f) => counts[f] < Math.max(2, live * 0.6)) : []);
  const rowsHtml = s.alts.map((a) => {
    const it = a.id === 'none' ? null : item(a.id);
    const isCur = cur && ((s.slot === 'jacket' ? (cur.suit || cur.jacket) : cur[s.slot]) || 'none') === a.id;
    const name = it ? it.name : (s.slot === 'tuck' ? (a.id === 'tucked' ? 'Fully tucked' : 'Untucked') : `No ${lab.toLowerCase()}`);
    let hint = '';
    if (!a.result) hint = 'Breaks a rule with this fit';
    else if (own(a).length) hint = own(a)[0];
    else if (it && it.notes && (it.hold || it.fitIssue)) hint = it.notes;
    return `<button class="row alt${isCur ? ' cur' : ''}${a.result ? '' : ' bad'}" ${a.result ? `data-act="pickAlt" data-slot="${s.slot}" data-id="${esc(a.id)}"` : 'disabled'}>${swatch(it)}<span class="rn">${esc(name)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>${isCur ? '<span class="tick" aria-label="current"></span>' : ''}</button>`;
  }).join('');
  return `<h2>${esc(lab)}</h2><p class="fine">Best match first. The rest of the fit adjusts to keep every rule.</p>
    ${ui.locks[s.slot] != null ? `<button class="link" data-act="unlock" data-slot="${s.slot}">Let the stylist choose this piece</button>` : ''}
    <div class="rows sheet-rows">${rowsHtml}</div>`;
}
function sheetItem(s) {
  const i = item(s.id); if (!i) return '';
  const seen = st().profile.groups.map((g) => ({ g, dates: E.seenBy(st().wears, g.id, i.id) }));
  const all = st().wears.filter((w) => (w.items || []).includes(i.id)).map((w) => w.date).sort();
  const cat = E.CATS.find((c) => c.id === i.cat);
  return `<div class="item-head">${swatch(i, true)}<div><div class="eyebrow">${esc(cat ? cat.label : i.cat)}</div><h2>${esc(i.name)}</h2></div></div>
    ${i.notes ? `<p class="note">${esc(i.notes)}</p>` : ''}
    <div class="seen">${seen.map((x) => `<div><b>${esc(x.g.name)}</b><span>${x.dates.length ? 'saw it ' + x.dates.map(E.shortDate).join(', ') : 'has not seen it'}</span></div>`).join('')}
      <div><b>All wears</b><span>${all.length ? all.length + ', last ' + E.shortDate(all[all.length - 1]) : 'none logged'}</span></div></div>
    ${i.said ? `<p class="fine">Added from your words${i.added ? ' on ' + esc(E.shortDate(i.added)) : ''}. The details below are my best reading. Correct them here. It is worn when you name it, until you turn on Stylist may pick it.</p>
    <label class="field"><span>Name</span><input type="text" data-in="itemName" data-id="${esc(i.id)}" value="${esc(i.name)}" autocomplete="off"></label>
    <label class="field"><span>Color</span><select data-in="itemColor" data-id="${esc(i.id)}"><option value="">Not set</option>${Object.entries(E.COLORS).filter(([k]) => !['gold', 'silver', 'tortoise'].includes(k)).map(([k, v]) => `<option value="${k}"${i.color === k ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}${i.color && !E.COLORS[i.color] ? `<option value="${esc(i.color)}" selected>${esc(i.color)}</option>` : ''}</select></label>
    ${i.cat !== 'extra' ? `<label class="field"><span>How dressy</span><select data-in="itemFormality" data-id="${esc(i.id)}">${[[1, '1, very casual'], [2, '2, casual'], [3, '3, smart casual'], [4, '4, business'], [5, '5, formal']].map(([v, l]) => `<option value="${v}"${Math.round(i.formality || 3) === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}` : ''}
    <label class="field"><span>Notes</span><textarea data-in="itemNotes" data-id="${esc(i.id)}" rows="2">${esc(i.notes || '')}</textarea></label>
    <label class="toggle"><input type="checkbox" data-in="itemActive" data-id="${esc(i.id)}"${i.status !== 'retired' ? ' checked' : ''}><span>In rotation</span></label>
    <label class="toggle"><input type="checkbox" data-in="itemAuto" data-id="${esc(i.id)}"${!i.hold ? ' checked' : ''}><span>Stylist may pick it</span></label>
    ${['jacket', 'top', 'bottom', 'shoes', 'belt', 'suit'].includes(i.cat) ? `<label class="toggle"><input type="checkbox" data-in="itemTeach" data-id="${esc(i.id)}"${!i.noTeach ? ' checked' : ''}><span>Allowed in class</span></label>` : ''}
    ${i.fitIssue ? `<p class="note">Fit: ${esc(i.fitIssue)} <button class="link" data-act="clearFit" data-id="${esc(i.id)}">Clear</button></p>` : ''}
    ${['suit', 'jacket', 'coat', 'top', 'bottom', 'shoes', 'hat'].includes(i.cat) ? lookHtml('piece:' + i.id, 'piece', i.id) : ''}
    <div class="actions wrap"><button class="btn small" data-act="itemPhoto" data-id="${esc(i.id)}">${i.photo ? 'Replace photo' : 'Add photo'}</button>
      <button class="btn small" data-act="wearItem" data-id="${esc(i.id)}">Build a fit around it</button>
      <button class="btn small danger" data-act="delItem" data-id="${esc(i.id)}">Delete</button></div>
    <p class="fine">A photo of the piece also goes to ChatGPT, so the mockup shows the real garment.</p>`;
}
function sheetLog(s) {
  const w = st().wears.find((x) => x.id === s.id); if (!w) return '';
  const o = outfitFromEntry(w);
  const list = o.complete ? E.rows(o, st().items).map((r) => rowHtml(r, true)).join('') : (w.items || []).map((id) => `<div class="row">${swatch(item(id))}<span class="rt"><span class="rn">${esc(nameOf(id))}</span></span></div>`).join('');
  return `<div class="eyebrow">${esc(occLabel(w.occ))}${w.group ? ' · ' + esc(groupLabel(w.group)) : ''}</div><h2>${esc(E.fmtDate(w.date, { weekday: 'long', month: 'long', day: 'numeric' }))}</h2>
    <div class="rows sheet-rows">${list}</div>
    <label class="field"><span>Note</span><textarea data-in="logNote" data-id="${esc(w.id)}" rows="2">${esc(w.note || '')}</textarea></label>
    <div class="actions wrap"><button class="btn small" data-act="toggleWorn" data-id="${esc(w.id)}">${w.status === 'planned' ? 'Mark as worn' : 'Mark as planned'}</button>
      <button class="btn small" data-act="gotoDay" data-date="${w.date}" data-occ="${esc(w.occ)}">Open in Fit</button>
      <button class="btn small danger" data-act="delLog" data-id="${esc(w.id)}">Delete</button></div>`;
}
function sheetMockup(s) {
  const c = current(); if (!c.o) return '';
  const mk = mockFor(c.o);
  const photos = st().modelPhotos || [];
  const sceneSel = `<label class="field"><span>Setting</span><select data-in="scene">${Object.entries(M.scenesFor(st().profile)).map(([k, v]) => `<option value="${k}"${(st().settings.setting || 'auto') === k ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>`;
  if (ui.busy || auto.busy === mockKey(c.o)) return `<h2>Putting it on you</h2><div class="busy"><div class="spinner"></div><p>${esc(ui.busy || (auto.asleep ? 'Your Mac is not answering. Wake it and this carries on by itself.' : 'ChatGPT is dressing you'))}</p><p class="fine">${auto.asleep ? 'It keeps trying for a few more minutes.' : 'This takes about a minute. Keep the app open.'}</p></div><div class="actions"><button class="btn" data-act="cancelMockup">Cancel</button></div>`;
  const by = maker();
  if (!photos.length && by !== 'mac') return `<h2>See it on you</h2><p>First add a full length photo of yourself. It stays on this phone and is sent to ChatGPT only when you ask for a mockup.</p><div class="actions"><button class="btn primary" data-act="addPhoto">Add my photo</button></div>`;
  return `<h2>${mk ? 'Your mockup' : 'See it on you'}</h2>
    ${mk ? `<div class="mock"><img data-blob="${esc(mk.blob)}" alt="Mockup of this fit on you"></div><div class="actions wrap"><button class="btn small" data-act="shareMock">Save or share</button><button class="btn small danger" data-act="delMock">Remove</button></div>` : ''}
    ${s.error ? `<p class="error">${esc(s.error)}</p>` : ''}
    ${sceneSel}
    <div class="actions col">
      ${by ? `<button class="btn primary" data-act="makeMockup">${mk ? 'Create a new one' : 'Create with ChatGPT'}</button>` : ''}
      <button class="btn${by ? '' : ' primary'}" data-act="handOff">Open in my ChatGPT app</button>
      <button class="btn" data-act="pasteMock">Paste the image ChatGPT made</button>
      <button class="btn" data-act="attachMock">Add the finished image from Photos or Files</button>
    </div>
    <p class="fine">${by === 'key' ? 'Created in the app with your OpenAI key.' : by === 'mac' ? 'Made on your Mac with your ChatGPT plan and sent here encrypted. Your Mac has to be awake.' : 'Without a key: your photo opens in the share sheet and the prompt is copied. Pick ChatGPT, paste, send. Hold the image it makes, choose Copy, come back and tap Paste. Add your OpenAI key in More and none of this is needed.'}</p>
    <details class="prompt"><summary>Show the prompt</summary><pre>${esc(M.buildPrompt(c.o, st().items, st().profile, st().settings.setting || 'auto', Math.min(photos.length, 3), placeOf()))}</pre><button class="btn small" data-act="copyPrompt">Copy prompt</button></details>`;
}
function sheetPaste() {
  return `<h2>Paste setup text</h2><p class="fine">Paste the closet text you were given, then tap Load.</p>
    <textarea id="pasteBox" rows="7" placeholder="Paste here" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
    <div class="actions"><button class="btn" data-act="readClipboard">Paste from clipboard</button><button class="btn primary" data-act="loadPaste">Load</button></div>`;
}
function sheetAdd() {
  const colors = Object.entries(E.COLORS).filter(([k]) => !['gold', 'silver', 'tortoise'].includes(k));
  return `<h2>Add a piece</h2><p class="fine">Add what you own. You can also just name a piece when you ask for a fit, and it is added for you.</p>
    <label class="field"><span>Type</span><select id="addCat">${E.CATS.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></label>
    <label class="field"><span>Name</span><input id="addName" type="text" placeholder="Navy knit polo" autocomplete="off"></label>
    <label class="field"><span>Color</span><select id="addColor">${colors.map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label>
    <label class="field"><span>How dressy</span><select id="addFormality"><option value="1">1, very casual</option><option value="2">2, casual</option><option value="3" selected>3, smart casual</option><option value="4">4, business</option><option value="5">5, formal</option></select></label>
    <label class="field"><span>Metal or leather (belts, shoes, watches, glasses)</span><select id="addExtra"><option value="">Does not apply</option><option value="gold">Gold metal</option><option value="silver">Silver metal</option><option value="tortoise">Tortoiseshell</option><option value="black">Black leather</option><option value="dark-brown">Dark brown leather</option><option value="brown">Brown leather</option><option value="cognac">Cognac leather</option><option value="tan">Tan leather</option></select></label>
    <label class="toggle"><input type="checkbox" id="addUntuck"><span>Top can be worn untucked</span></label>
    <label class="toggle"><input type="checkbox" id="addLoops" checked><span>Trousers have belt loops</span></label>
    <div class="actions"><button class="btn primary" data-act="saveNew">Add to closet</button></div>`;
}

// ---------- actions ----------
const A = {
  tab: (d) => { ui.tab = d.tab; closeSheet(); render(); window.scrollTo(0, 0); },
  askGo: () => {
    const box = $('#askBox'); const v = ((box ? box.value : ui.draft) || '').trim();
    if (!v) { toast('Say what it is for, or tap one below.'); return null; }
    ui.draft = '';
    return answer(v, { date: ui.when && ui.when !== today() ? ui.when : null });
  },
  askChip: (d) => answer('', { date: ui.when || today(), occ: d.occ, forceOcc: true }),
  askWhen: (d) => { ui.when = d.date; ui.date = d.date; render(); },
  askAgain: () => { backToAsk(); closeSheet(); render(); window.scrollTo(0, 0); },
  refine: () => {
    const box = $('#refineBox'); const v = ((box && box.value) || ui.refineDraft || '').trim();
    if (!v || !ui.ask) return null;
    ui.refineDraft = '';
    const a = ui.ask;
    // a question is answered, not carried out: good idea or bad idea, fit or not a fit, with a button to do it
    if (J.isQuestion(v) && !ui.doing) {
      const verdict = judge(v);
      if (verdict && !verdict.chat) { a.verdict = verdict; saveSession(); render(); window.scrollTo(0, 0); return null; }
      return askChat(v, !!(verdict && verdict.canDo));
    }
    ui.doing = false; a.verdict = null;
    // just a colour ("red", "they are brown"): it belongs to the piece in this fit that was added without one
    const cur = current().o;
    const blank = cur ? E.majorIds(cur).map(item).filter((it) => it && it.said && !it.color && it.cat !== 'extra' && it.cat !== 'watch') : [];
    if (blank.length) {
      const c = colourSaid(v, blank.map((it) => it.name));
      const low = v.toLowerCase();
      const it = c ? (blank.length === 1 ? blank[0] : blank.find((x) => low.includes((x.short || x.name).toLowerCase().split(' ').pop())) || null) : null;
      if (it) {
        it.color = c.color; if (c.hex) { it.hex = c.hex; it.tone = c.tone; }
        if (it.cat === 'shoes' && it.leather == null) it.leather = ['black', 'brown', 'dark-brown', 'cognac', 'tan'].includes(c.color) ? c.color : 'none';
        const tail = /[A-Z]/.test(it.name.slice(1)) ? it.name : it.name[0].toLowerCase() + it.name.slice(1);
        it.name = c.word[0].toUpperCase() + c.word.slice(1) + ' ' + tail; it.short = /[A-Z]/.test(it.name.slice(1)) ? it.name : it.name.toLowerCase();
        staleMocks(it.id); S.save(); reaudit();
        a.reply = [`Noted: ${it.short}. The mockup is redone to show it.`]; a.diff = '';
        render(); return null;
      }
    }
    const probe = adopt(parseAsk(v, { today: today(), date: ui.date, items: st().items, profile: st().profile }));   // a piece named here that the closet lacks is added before the fit is rebuilt
    // "change it" or "different shoes" keeps what is on screen out of the next fit, unless this very message asks for that piece by name
    const named = new Set(Object.values(probe.locks).concat(...Object.values(probe.allow).filter((ids) => ids.length <= 2)));
    const now = current().o;
    const av = avoidFrom(v, now, a.avoid);
    const avoid = av.ids.filter((id) => !named.has(id));
    // a follow up holds the rest of the look, unless it asks for a different fit altogether or a different dress level
    const prefer = now && !av.whole && !probe.wore && !(probe.mods && probe.mods.shift) ? now : null;
    const worn = (a.worn || []).concat(probe.wore && now ? mainIds(now).filter((id) => !named.has(id)) : []);
    keepMock();
    const touched = new Set(av.slots.concat(Object.keys(probe.locks), Object.keys(probe.allow)));
    for (const k of Object.keys(ui.locks)) if (av.whole || probe.wore || touched.has(k) || avoid.includes(ui.locks[k])) delete ui.locks[k];
    if (probe.occSaid) return answer(v, { date: ui.date, editing: true, avoid, worn, prefer, before: now, made: probe.made });    // a new occasion is a new question, same day unless a day is named
    const place = probe.venue && !probe.wore ? { venue: probe.venue, venueSoft: !!probe.venueSoft, venueHome: !!probe.venueHome, venueOff: false, spot: probe.venueHome ? 'home' : (a.venueHome ? '' : a.spot || '') } : null;
    const steps = (a.steps || []).concat([Object.assign({ t: v, avoid: avoid.filter((id) => !(a.avoid || []).includes(id)), worn: worn.filter((id) => !(a.worn || []).includes(id)) }, place ? { place } : {})]);
    const first = a.first != null ? a.first : a.text;
    return answer([first].concat(steps.map((x) => x.t)).filter(Boolean).join('. '), { date: probe.dateSaid ? probe.date : ui.date, fixDate: true, occ: ui.occ, forceOcc: true, also: a.also, editing: true, label: a.label, avoid, worn, prefer, before: now, latest: probe, steps, first, base: a.base || { avoid: [], worn: [] }, keepLocks: true });
  },
  // take one typed change back: everything else that was asked still holds
  dropStep: (d) => {
    const a = ui.ask, i = Number(d.i);
    if (!a || !(a.steps || [])[i]) return null;
    const gone = a.steps[i], steps = a.steps.filter((x, k) => k !== i);
    const base = a.base || { avoid: [], worn: [] };
    const avoid = [...new Set(base.avoid.concat(...steps.map((x) => x.avoid || [])))];
    const worn = [...new Set(base.worn.concat(...steps.map((x) => x.worn || [])))];
    const first = a.first != null ? a.first : a.text;
    const now = current().o;
    // the look holds, except that a piece this change had pushed out is welcome back
    const prefer = Object.assign({}, now);
    for (const id of gone.avoid || []) { const it = item(id); const slot = it ? (it.cat === 'suit' ? 'jacket' : it.cat) : ''; if (['jacket', 'top', 'bottom', 'shoes'].includes(slot)) prefer[slot] = id; }
    keepMock();
    return answer([first].concat(steps.map((x) => x.t)).filter(Boolean).join('. '), { date: ui.date, fixDate: true, occ: ui.occ, forceOcc: true, also: a.also, editing: true, label: a.label, avoid, worn, prefer, before: now, latest: { mods: {}, locks: {}, allow: {}, exclude: [], notes: [] }, undo: gone.t, steps, first, base, keepLocks: true });
  },
  // look again at the same fit: fresh weather, the checks rerun, and the mockup asked for again if it never came
  refreshFit: async () => {
    const was = ui.forecast ? ui.forecast.at : 0;
    toast('Checking again');
    ui.forecast = await loadForecast(st().profile, true);
    reaudit();
    const c = current(); if (c.o) { auto.failed.delete(mockKey(c.o)); auto.retried.delete(mockKey(c.o)); }
    render();
    toast(ui.forecast.at && ui.forecast.at !== was ? `Checked again at ${E.clockLabel(ui.forecast.at)}. The fit is unchanged.` : 'No connection. The fit and the last forecast stay as they are.', 4000);
  },
  pickOcc: () => openSheet({ type: 'occ' }),
  toChecks: () => { const el = $('.checks'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  setOcc: (d) => {
    const a = ui.ask; if (!a || !E.OCCASIONS[d.occ]) return null;
    a.occ = d.occ; a.occSaid = true; a.pinned = true; a.also = (a.also || []).filter((k) => k !== d.occ); a.notes = (a.notes || []).filter((n) => n.k === 'missing' || n.k === 'avoid');
    keepMock();
    ui.occ = d.occ; ui.editing = false; closeSheet();
    return present(null, () => respond(null));
  },
  another: () => { if (ui.results.length) { keepMock(); ui.idx = (ui.idx + 1) % ui.results.length; dropDiff(); render(); } },
  clearLocks: () => { keepMock(); ui.locks = {}; recompute(); dropDiff(); render(); },
  swap: (d) => {
    const c = current(); if (!c.o) return;
    const b = brief();
    const alts = E.alternatives(ctx(), c.o, d.slot, omit(b.locks, d.slot), b);
    openSheet({ type: 'swap', slot: d.slot, alts });
  },
  pickAlt: (d) => {
    const prev = current().o;
    keepMock();
    ui.locks[d.slot] = d.id;
    if (d.slot === 'jacket') { const it = item(d.id); if (it && it.cat === 'suit') delete ui.locks.bottom; }
    recompute(prev); dropDiff(); closeSheet(); render();
  },
  unlock: (d) => { const prev = current().o; keepMock(); delete ui.locks[d.slot]; recompute(prev); dropDiff(); closeSheet(); render(); },
  lockIn: () => {
    const c = current(); if (!c.o) return;
    const occ = E.OCCASIONS[ui.occ];
    const past = E.daysBetween(ui.date, today()) >= 0;
    const rec = { id: 'w-' + ui.date + '-' + ui.occ, date: ui.date, occ: ui.occ, group: occ.group || null, items: E.majorIds(c.o), tuck: c.o.tuck, note: (ui.ask && ui.ask.text) || '', status: past ? 'worn' : 'planned' };
    if (c.o.also && c.o.also.length) rec.also = c.o.also;
    if (c.o.shift) rec.shift = c.o.shift;
    if (c.o.easy) rec.easy = true;
    if (c.o.lab) rec.lab = true;
    st().wears = st().wears.filter((w) => !(w.date === ui.date && w.occ === ui.occ));
    st().wears.push(rec);
    ui.editing = false; ui.locks = {};
    S.save(); render(); toast(past ? 'Logged as worn.' : 'Locked in for ' + E.fmtDate(ui.date) + '.');
  },
  markWorn: () => { const e = entryFor(ui.date, ui.occ); if (e) { e.status = 'worn'; S.save(); render(); toast('Logged as worn.'); } },
  editEntry: () => {
    const e = entryFor(ui.date, ui.occ); const o = e ? outfitFromEntry(e) : null;
    ui.editing = true; ui.locks = {};
    recompute(o && o.complete ? o : null); render();
  },
  cancelEdit: () => { ui.editing = false; ui.locks = {}; render(); },
  removeEntry: () => openSheet({ type: 'confirm', title: 'Remove this day from the log?', text: 'The stylist will stop counting these pieces as seen that day.', yes: 'Remove', run: () => { st().wears = st().wears.filter((w) => !(w.date === ui.date && w.occ === ui.occ)); S.save(); recompute(); } }),
  confirmYes: async () => { const s = ui.sheet; closeSheet(); if (s && s.run) await s.run(); render(); },
  closeSheet: () => { if (ui.busy) return; const was = ui.sheet; closeSheet(); if (was && was.type === 'item' && ui.tab === 'fit') render(); },
  logFilter: (d) => { ui.logFilter = d.f; render(); },
  openLog: (d) => openSheet({ type: 'log', id: d.id }),
  toggleWorn: (d) => { const w = st().wears.find((x) => x.id === d.id); if (w) { w.status = w.status === 'planned' ? 'worn' : 'planned'; S.save(); render(); openSheet({ type: 'log', id: d.id }); } },
  delLog: (d) => { st().wears = st().wears.filter((x) => x.id !== d.id); S.save(); closeSheet(); recompute(); render(); },
  gotoDay: (d) => openDay(d.date, d.occ),
  item: (d) => openSheet({ type: 'item', id: d.id }),
  addItem: () => openSheet({ type: 'add' }),
  saveNew: () => {
    const name = $('#addName').value.trim(); if (!name) { toast('Give it a name first.'); return; }
    const cat = $('#addCat').value, extra = $('#addExtra').value;
    const it = { id: S.uid(cat), cat, name, color: $('#addColor').value, formality: Number($('#addFormality').value), status: 'active', notes: '' };
    if (['gold', 'silver', 'tortoise'].includes(extra)) it.metal = extra;
    if (['black', 'dark-brown', 'brown', 'cognac', 'tan'].includes(extra)) it.leather = extra;
    if (cat === 'belt' && !it.metal) it.metal = 'silver';
    if (cat === 'belt' && !it.leather) it.leather = it.color;
    if (cat === 'shoes' && !it.leather) it.leather = 'none';
    if (cat === 'top') it.untuckOk = $('#addUntuck').checked;
    if (cat === 'bottom' || cat === 'suit') it.loops = $('#addLoops').checked;
    st().items.push(it); S.save(); closeSheet(); recompute(); render(); toast('Added to the closet.');
  },
  delItem: (d) => openSheet({ type: 'confirm', title: 'Delete this piece?', text: 'It leaves the closet for good. To pause it instead, turn off In rotation.', yes: 'Delete', run: () => { st().items = st().items.filter((i) => i.id !== d.id); S.save(); recompute(); } }),
  wearItem: (d) => {
    const it = item(d.id); if (!it) return null;
    const t = today(), slot = it.cat === 'suit' ? 'jacket' : it.cat;
    return openDay(t, defaultOcc(t).occ, { label: 'A fit around the ' + (it.short || it.name), locks: { [slot]: it.id }, mods: it.cat === 'suit' ? { wantSuit: true } : {}, pinned: false, occSaid: false, editing: true });
  },
  itemPhoto: async (d) => {
    const [f] = await pickFile('image/*'); if (!f) return;
    const b = await M.downscale(f, 1280, 0.88); const id = 'item:' + d.id;
    await S.blobPut(id, b); const it = item(d.id); it.photo = id; S.save(); render(); openSheet({ type: 'item', id: d.id });
  },
  addPhoto: async () => {
    const files = await pickFile('image/*', true); if (!files.length) return;
    st().modelPhotos = st().modelPhotos || [];
    for (const f of files.slice(0, 4 - st().modelPhotos.length)) {
      const b = await M.downscale(f, 1536, 0.9); const id = 'me:' + S.uid('p');
      await S.blobPut(id, b); st().modelPhotos.push(id);
    }
    S.save(); S.persist(); const wasMock = ui.sheet && ui.sheet.type === 'mockup'; render(); if (wasMock) openSheet({ type: 'mockup' }); toast('Photo added.');
  },
  delPhoto: async (d) => { st().modelPhotos = (st().modelPhotos || []).filter((x) => x !== d.id); await S.blobDel(d.id); S.save(); render(); },
  saveKey: async () => {
    const v = ($('#keyInput').value || '').trim(); if (!v) { toast('Paste the key first.'); return; }
    toast('Checking the key with OpenAI');
    const r = await M.testKey(v);
    if (r === 'rejected') { toast('OpenAI did not accept that key. Check it and paste again.', 5000); return; }
    await S.secretSet('openai', v); ui.hasKey = true; auto.failed.clear(); render();
    toast(r === 'ok' ? 'Key works. This phone now makes the mockups and checks on its own.' : 'Saved. It will be checked when you are online.', 5000);
  },
  pasteKey: async () => {
    let t = '';
    try { t = ((await navigator.clipboard.readText()) || '').trim(); } catch (e) { toast('The clipboard could not be read. Paste the key in the box below and tap Save key.', 6000); return null; }
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(t)) { toast('No OpenAI key is copied yet. In OpenAI, create the key and tap Copy, then come back.', 6000); return null; }
    const box = $('#keyInput'); if (box) box.value = t;
    return A.saveKey();
  },
  clearKey: async () => { await S.secretSet('openai', null); ui.hasKey = false; render(); toast('Key removed.'); },
  mockup: () => { if (current().o) openSheet({ type: 'mockup' }); },
  copyPrompt: async () => { const c = current(); const ok = await M.copyText(M.buildPrompt(c.o, st().items, st().profile, st().settings.setting || 'auto', Math.min((st().modelPhotos || []).length, 3), placeOf())); toast(ok ? 'Prompt copied.' : 'Could not copy.'); },
  makeMockup: async () => {
    const c = current(); if (!c.o) return;
    if (!maker()) { toast('Add your OpenAI key in More.'); return; }
    if (auto.busy) { toast('One mockup is already being made.'); return; }
    const again = !!mockFor(c.o);
    ui.abort = new AbortController(); ui.busy = 'Sending your photo and the fit to ChatGPT'; ui.busySig = mockKey(c.o); renderSheet();
    try {
      await createMockup(c.o, { signal: ui.abort.signal, fresh: again, onStage: (s) => { ui.busy = s && s.st === 'asleep' ? 'Your Mac is not answering. Wake it and this carries on by itself.' : 'ChatGPT is dressing you'; renderSheet(); } });
      ui.busy = null; auto.failed.delete(mockKey(c.o)); render(); openSheet({ type: 'mockup' });
    } catch (e) {
      ui.busy = null;
      const msg = e && e.name === 'AbortError' ? 'Cancelled.' : (e && e.message) || 'That did not work. Try again.';
      render(); openSheet({ type: 'mockup', error: msg });
    }
  },
  cancelMockup: () => { if (ui.abort) ui.abort.abort(); if (auto.ctl) auto.ctl.abort(); ui.busy = null; renderSheet(); },
  lookShot: (d) => startCheck(d, true),
  lookPick: (d) => startCheck(d, false),
  lookCancel: () => { if (look.ctl) look.ctl.abort(); },
  lookClear: async (d) => { const r = (st().looks || {})[d.key]; if (!r) return; if (r.photo) await S.blobDel(r.photo); delete st().looks[d.key]; await S.save(true); redrawLook(); },
  noteFit: (d) => {
    const it = item(d.id), r = (st().looks || {})[d.key]; if (!it || !r) return;
    const p = (r.pieces || []).find((x) => x.label === d.label); if (!p) return;
    it.fitIssue = `Runs ${p.fit}${p.note ? '. ' + p.note : ''} (photo check ${E.shortDate(today())})`; delete it.fitOk;
    S.save(); reaudit(); redrawLook(); toast('Noted on the piece. The stylist takes it into account.', 4000);
  },
  clearFit: (d) => { const it = item(d.id); if (!it) return; delete it.fitIssue; S.save(); if (ui.mode === 'fit') reaudit(); redrawLook(); },
  doVerdict: () => { const v = ui.ask && ui.ask.verdict; if (!v || !v.canDo) return null; ui.ask.verdict = null; ui.doing = true; ui.refineDraft = v.q; const box = $('#refineBox'); if (box) box.value = v.q; return A.refine(); },
  dropVerdict: () => { if (chat.ctl) chat.ctl.abort(); if (ui.ask) ui.ask.verdict = null; saveSession(); render(); },
  retryAuto: () => { const c = current(); if (!c.o) return null; const sig = mockKey(c.o); auto.failed.delete(sig); return runAuto(sig, true); },
  setupKey: () => { ui.tab = 'more'; closeSheet(); render(); const el = $('#keyCard'); if (el) el.scrollIntoView({ block: 'start' }); },
  pasteMock: async () => {
    const c = current(); if (!c.o) return;
    try {
      for (const it of await navigator.clipboard.read()) {
        const type = it.types.find((t) => t.startsWith('image/'));
        if (!type) continue;
        const b = await M.downscale(await it.getType(type), 1536, 0.92);
        await saveMock(c.o, b, 'ChatGPT app'); auto.failed.delete(mockKey(c.o));
        render(); openSheet({ type: 'mockup' }); toast('Mockup added.'); return;
      }
      toast('No image is copied yet. In ChatGPT, hold the image and choose Copy.', 5000);
    } catch (e) { toast('The image could not be pasted. Use Add the finished image.', 5000); }
  },
  handOff: async () => {
    const c = current(); if (!c.o) return;
    const photos = st().modelPhotos || [];
    const prompt = M.buildPrompt(c.o, st().items, st().profile, st().settings.setting || 'auto', 1, placeOf());
    const b = photos.length ? await S.blobGet(photos[0]) : null;
    const r = await M.handOff(prompt, b);
    if (r.shared) toast('Prompt copied. In ChatGPT, paste and send.', 5000);
    else if (!r.cancelled) toast(r.copied ? 'Prompt copied. Open ChatGPT, attach your photo, paste, send.' : 'Copy the prompt below, then open ChatGPT.', 6000);
  },
  attachMock: async () => { const c = current(); const [f] = await pickFile('image/*'); if (!f || !c.o) return; const b = await M.downscale(f, 1536, 0.92); await saveMock(c.o, b, 'ChatGPT app'); auto.failed.delete(mockKey(c.o)); render(); openSheet({ type: 'mockup' }); toast('Mockup added.'); },
  delMock: async () => { const c = current(); const e = c.o ? mockEntry(c.o) : null; if (!e) return; await S.blobDel(e[1].blob); delete st().mockups[e[0]]; S.save(); render(); openSheet({ type: 'mockup' }); },
  shareMock: async () => {
    const mk = mockFor(current().o); if (!mk) return; const b = await S.blobGet(mk.blob);
    const file = new File([b], 'presidential-fit-' + ui.date + '.jpg', { type: b.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch (e) { /* closed */ } }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; a.click(); }
  },
  refreshWeather: async () => {
    const was = ui.forecast ? ui.forecast.at : 0;
    ui.forecast = await loadForecast(st().profile, true);
    if (ui.mode === 'fit') reaudit();
    refresh(); toast(ui.forecast.at && ui.forecast.at !== was ? 'Weather updated.' : 'No connection. Using the last forecast.');
  },
  importFile: async () => {
    const [f] = await pickFile('.json,application/json,text/plain'); if (!f) return;
    try { await doImport(JSON.parse(await f.text())); } catch (e) { toast(e.message || 'That file could not be read.', 4000); }
  },
  pasteSetup: () => openSheet({ type: 'paste' }),
  readClipboard: async () => { try { $('#pasteBox').value = await navigator.clipboard.readText(); } catch (e) { toast('Tap in the box, then choose Paste.'); } },
  loadPaste: async () => {
    const raw = ($('#pasteBox').value || '').trim(); if (!raw) { toast('Nothing pasted yet.'); return; }
    try { await doImport(JSON.parse(raw)); closeSheet(); } catch (e) { toast('That text is not a closet file.', 4000); }
  },
  loadSample: async () => { const res = await fetch('sample-closet.json'); await doImport(await res.json()); },
  exportData: async () => {
    const data = await S.exportAll(true);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const file = new File([blob], 'presidential-fit-backup-' + today() + '.json', { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch (e) { /* closed */ } }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); }
  },
  erase: () => openSheet({ type: 'confirm', title: 'Erase everything on this phone?', text: 'Closet, log, photos, mockups and the key are removed. Back up first if you want to keep them.', yes: 'Erase', run: async () => { for (const k of await S.blobKeys()) await S.blobDel(k); await S.secretSet('openai', null); ui.hasKey = false; await S.replaceState(S.EMPTY_STATE()); E.configure(st().profile); backToAsk(); } }),
};
function omit(obj, k) { const o = Object.assign({}, obj); delete o[k]; return o; }
// extra: { key, bh, where, miss, place }. key is the name the request was made under; bh names the picture on the Mac so the
// next change can be made to it; where is the place ChatGPT found; place is the place as he named it.
async function saveMock(o, blob, model, extra = {}) {
  st().mockups = st().mockups || {};
  const key = extra.key || mockKey(o); const old = st().mockups[key];
  const id = 'mock:' + S.uid('m');
  await S.blobPut(id, blob);
  const rec = { blob: id, at: Date.now(), model, date: o.date, occ: o.occ };
  for (const k of ['bh', 'where', 'place', 'lines', 'scene', 'root']) if (extra[k]) rec[k] = extra[k];
  if (extra.miss) rec.miss = true;
  if (model !== 'ChatGPT app') rec.look = M.LOOK;
  if (old) { await S.blobDel(old.blob); if (ui.prevMock && ui.prevMock.blob === old.blob) ui.prevMock = { blob: id, bh: rec.bh || ui.prevMock.bh, key }; }
  st().mockups[key] = rec;
  await S.save(true);
}
async function doImport(obj) {
  const merge = st().items.length > 0 && obj.kind !== 'presidential-fit-backup';
  await S.importAll(obj, { merge });
  E.configure(st().profile);
  await S.persist();
  ui.forecast = await loadForecast(st().profile);
  ui.link = await L.derive(st().profile).catch(() => null);
  backToAsk(); ui.tab = 'fit';
  render(); toast(`Closet loaded: ${st().items.length} pieces.`);
  findMac();
}

// ---------- inputs ----------
const IN = {
  q: (el) => { ui.q = el.value; const v = $('#view'); const pos = el.selectionStart; v.innerHTML = viewCloset(); hydrateImages(v); const n = $('[data-in="q"]'); n.focus(); n.setSelectionRange(pos, pos); },
  askText: (el) => { ui.draft = el.value; },
  refineText: (el) => { ui.refineDraft = el.value; },
  askDate: (el) => { if (el.value) { ui.when = el.value; ui.date = el.value; render(); } },
  pillDate: (el) => {
    const a = ui.ask; if (!el.value || !a) return null;
    keepMock();
    return answer(a.text, Object.assign({ date: el.value, fixDate: true, label: a.label, avoid: a.avoid, worn: a.worn, steps: a.steps || [], first: a.first != null ? a.first : a.text, base: a.base, keepLocks: true }, a.pinned ? { occ: ui.occ, forceOcc: true, also: a.also } : {}));
  },
  quality: (el) => { st().settings.quality = el.value; S.save(); },
  auto: (el) => { st().settings.auto = el.checked; S.save(); },
  model: (el) => { st().settings.model = el.value; S.save(); },
  scene: (el) => { st().settings.setting = el.value; S.save(); renderSheet(); hydrateImages($('#sheet')); },
  itemNotes: (el) => { const i = item(el.dataset.id); if (i) { i.notes = el.value; S.save(); } },
  itemName: (el) => { const i = item(el.dataset.id); const v = el.value.trim(); if (i && v) { i.name = v; i.short = /[A-Z]/.test(v.slice(1)) ? v : v.toLowerCase(); staleMocks(i.id); S.save(); } },
  itemColor: (el) => { const i = item(el.dataset.id); if (!i) return; if (el.value) i.color = el.value; else delete i.color; if (E.COLORS[i.color] || !i.color) { delete i.hex; delete i.tone; } if (i.cat === 'shoes' && i.leather !== 'none') i.leather = ['black', 'brown', 'dark-brown', 'cognac', 'tan'].includes(i.color) ? i.color : i.leather; staleMocks(i.id); S.save(); if (ui.mode === 'fit') reaudit(); },
  itemFormality: (el) => { const i = item(el.dataset.id); if (i) { i.formality = Number(el.value); S.save(); if (ui.mode === 'fit') reaudit(); } },
  itemActive: (el) => { const i = item(el.dataset.id); if (i) { i.status = el.checked ? 'active' : 'retired'; S.save(); recompute(); } },
  itemAuto: (el) => { const i = item(el.dataset.id); if (i) { i.hold = !el.checked; S.save(); recompute(); } },
  itemTeach: (el) => { const i = item(el.dataset.id); if (i) { i.noTeach = !el.checked; S.save(); recompute(); } },
  logNote: (el) => { const w = st().wears.find((x) => x.id === el.dataset.id); if (w) { w.note = el.value; S.save(); } },
  key: () => {},
};
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const fn = A[t.dataset.act]; if (fn) { e.preventDefault(); Promise.resolve(fn(t.dataset, t)).catch((err) => fail(err)); }
});
const LIVE = ['q', 'askText', 'refineText'];
const fail = (err) => { console.error(err); ui.loading = ''; toast('Something went wrong. Try again.'); };
document.addEventListener('input', (e) => { const t = e.target.closest('[data-in]'); if (t && LIVE.includes(t.dataset.in)) IN[t.dataset.in](t); });
document.addEventListener('change', (e) => { const t = e.target.closest('[data-in]'); if (t && !LIVE.includes(t.dataset.in) && IN[t.dataset.in]) Promise.resolve(IN[t.dataset.in](t)).catch(fail); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  const t = e.target.closest('[data-enter]'); const fn = t && A[t.dataset.enter];
  if (fn) { e.preventDefault(); t.blur(); Promise.resolve(fn(t.dataset, t)).catch(fail); }
});

// ---------- boot ----------
async function boot() {
  await S.loadState();
  E.configure(st().profile);
  ui.hasKey = !!(await S.secretGet('openai').catch(() => null));
  ui.link = await L.derive(st().profile).catch(() => null);
  // The fit that was open comes back exactly as it was left, however long ago. Only Start over returns to the question.
  const snap = await S.kvGet('session').catch(() => null);
  if (snap && snap.ask && E.OCCASIONS[snap.occ] && st().items.length) {
    Object.assign(ui, { mode: 'fit', ask: snap.ask, date: snap.date, occ: snap.occ, locks: snap.locks || {}, editing: !!snap.editing, relaxed: snap.relaxed || '', tab: snap.tab || 'fit', prevMock: snap.prev && snap.prev.blob ? snap.prev : null });
    // the same fits come back, not a new pick
    if (Array.isArray(snap.fits) && snap.fits.length) { ui.results = snap.fits.filter((f) => f && f.o && item(f.o.top) && item(f.o.shoes)).map((f) => ({ score: 0, o: f.o, why: f.why || [], checks: [], flags: [] })); reaudit(); }
    else recompute();
    ui.idx = Math.min(snap.idx || 0, Math.max(0, ui.results.length - 1));
  }
  render();
  findMac();
  ui.forecast = await loadForecast(st().profile);
  if (ui.mode === 'fit') reaudit();
  refresh();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    // A new release takes over on its own: the page reloads once when the new files are in place.
    const had = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had || reloaded || ui.busy) return;
      const a = document.activeElement;
      if (a && (a.id === 'askBox' || a.id === 'refineBox') && a.value) return;
      reloaded = true; location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => { ui.sw = reg; }).catch(() => {});
  }
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    if (ui.sw) ui.sw.update().catch(() => {});
    findMac();
    ui.forecast = await loadForecast(st().profile);
    if (ui.mode === 'fit' && !ui.sheet) reaudit();
    refresh();
  });
}
window.PF = { ui, S, E, M, L, doImport, answer, parseAsk, runCheck };
boot().catch((e) => { console.error(e); render(); });
