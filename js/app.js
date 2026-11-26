// Presidential Fit: screens and interactions.
import * as S from './store.js';
import * as E from './engine.js';
import * as M from './mockup.js';
import { figureSvg } from './figure.js';
import { loadForecast, weatherFor, today, FRESH_MS } from './weather.js';
import { parseAsk, windowFor } from './ask.js';

const VERSION = '1.2.0';
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// The Fit tab opens on a question (mode 'ask'). The answer becomes ui.ask, and the fit is built from it (mode 'fit').
const ui = {
  tab: 'fit', mode: 'ask', ask: null, draft: '', when: null, askDay: today(), loading: '', relaxed: '',
  date: today(), occ: null, locks: {}, results: [], idx: 0, editing: false,
  forecast: null, q: '', logFilter: 'all', sheet: null, busy: null, hasKey: false,
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
  return { locks: Object.assign({}, a.locks || {}, ui.locks), allow: a.allow || {}, exclude: a.exclude || [], mods: Object.assign({}, a.mods || {}, { also: a.also || [] }) };
}
// Does a fit already in the log satisfy what was just asked for?
function fitsAsk(o, a) {
  if (!o || !o.complete) return false;
  const m = a.mods || {};
  if (m.theme || m.golf || m.wantSuit && !o.suit || m.noSuit && o.suit || m.noDenim && E.isDenim(item(o.bottom))) return false;
  const have = (slot) => (slot === 'jacket' ? (o.suit || o.jacket || 'none') : slot === 'tuck' ? o.tuck : (o[slot] || 'none'));
  for (const [k, v] of Object.entries(a.locks || {})) if (have(k) !== v) return false;
  for (const [k, v] of Object.entries(a.allow || {})) if (!v.includes(have(k))) return false;
  return !(a.exclude || []).some((id) => E.majorIds(o).includes(id));
}
function entryFor(date, occ) { return st().wears.find((w) => w.date === date && w.occ === occ) || null; }
function outfitFromEntry(w) {
  const o = { occ: w.occ, date: w.date, suit: null, jacket: 'none', top: null, bottom: null, belt: 'none', shoes: null, socks: null, watch: null, glasses: null, coat: null, hat: null, tuck: w.tuck || null,
    also: w.also || [], shift: w.shift || 0, easy: !!w.easy, lab: !!w.lab || /lab coat/i.test(w.note || '') };
  for (const id of w.items || []) {
    const it = item(id); if (!it) continue;
    if (it.cat === 'suit') { if (!o.suit && !(w.items || []).some((x) => { const b = item(x); return b && b.cat === 'bottom'; })) { o.suit = id; o.jacket = id; o.bottom = id; } else { o.jacket = id; } }
    else if (it.cat === 'jacket') o.jacket = id;
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
  const asked = Object.keys(a.locks || {}).length || Object.keys(a.allow || {}).length || (a.exclude || []).length || m.wantSuit || m.noSuit || m.noDenim || m.theme;
  if (!r.length && asked) {
    // nothing clears the rules with every piece that was named: keep the ones named outright, then ease those too, and say so
    r = E.solve(c, { locks: b.locks, mods: { also: a.also || [], shift: m.shift, lab: m.lab }, prefer: prefer || null, n: 8 });
    if (r.length) ui.relaxed = 'Not everything you asked for works together under your rules. This keeps the pieces you named outright.';
    else {
      r = E.solve(c, { locks: ui.locks, mods: { also: a.also || [], shift: m.shift }, prefer: prefer || null, n: 8 });
      if (r.length) ui.relaxed = 'The pieces you named do not clear your rules together, so this fit leaves them out.';
    }
  }
  ui.results = r; ui.idx = 0;
}
// Never hand over a fit on an old forecast: fetch a fresh one first when a connection is there.
async function present(prefer) {
  if (ui.date >= today() && (!ui.forecast || !ui.forecast.at || Date.now() - ui.forecast.at > FRESH_MS)) {
    ui.loading = 'Checking the weather'; render();
    ui.forecast = await loadForecast(st().profile, true);
  }
  ui.loading = ''; recompute(prefer); render();
}
// The answer to the opening question becomes the brief for the fit.
async function answer(text, over = {}) {
  const p = parseAsk(text, { today: today(), date: over.date || null, fixDate: !!over.fixDate, items: st().items, profile: st().profile, now: new Date() });
  if (over.occ && (over.forceOcc || !p.occSaid)) {
    p.occ = over.occ; p.occSaid = true; p.pinned = true;
    if (over.forceOcc) p.also = (over.also || []).filter((k) => k !== over.occ);
    p.notes = p.notes.filter((n) => n.k !== 'group' && n.k !== 'date');
    if (over.forceOcc && over.date) p.date = over.date;
  }
  if (!p.occ) {
    const d = defaultOcc(p.date, p.negKinds);
    p.occ = d.occ;
    if (d.why === 'class') p.notes.unshift({ k: 'occ', t: `No occasion named. ${E.fmtDate(p.date, { weekday: 'long' })} is a class day, so this is for the ${d.g.name}.` });
    else if (d.why === 'log') p.notes.unshift({ k: 'occ', t: 'No occasion named, so this is what the log has for that day.' });
    else p.notes.unshift({ k: 'occ', t: 'No occasion named, so this is a casual day. Tap it to change.' });
  }
  p.also = (p.also || []).filter((k) => k !== p.occ);
  if (over.label) p.label = over.label;
  ui.ask = p; ui.date = p.date; ui.occ = p.occ; ui.locks = {}; ui.idx = 0; ui.askDay = today();
  const e = entryFor(ui.date, ui.occ);
  ui.editing = !!e && (!!over.editing || !fitsAsk(outfitFromEntry(e), p));
  ui.mode = 'fit'; ui.tab = 'fit'; closeSheet();
  await present();
  window.scrollTo(0, 0);
}
function openDay(date, occ, extra) {
  ui.ask = blankAsk(date, occ, extra); ui.date = date; ui.occ = occ; ui.locks = {}; ui.idx = 0; ui.editing = !!(extra && extra.editing); ui.askDay = today();
  ui.mode = 'fit'; ui.tab = 'fit'; closeSheet();
  return present();
}
function backToAsk() { ui.mode = 'ask'; ui.ask = null; ui.draft = ''; ui.when = null; ui.date = today(); ui.occ = null; ui.locks = {}; ui.results = []; ui.editing = false; ui.loading = ''; }
function mockKey(o) { return E.signature(o); }
function mockFor(o) { const m = (st().mockups || {})[mockKey(o)]; return m || null; }
// The fit is shown as a ChatGPT mockup of the wearer, not a sketch. With a key saved the app makes it by itself.
const auto = { timer: null, busy: null, ctl: null, failed: new Map(), retried: new Set() };
const AUTO_CAP = 12, AUTO_DWELL = 2200;
const autoLeft = () => { const a = st().settings.autoDay; return AUTO_CAP - (a && a.d === today() ? a.n : 0); };
function photoState(o, mk) {
  if (mk) return { kind: 'photo' };
  const sig = mockKey(o);
  if (auto.busy === sig || (ui.busy && ui.busySig === sig)) return { kind: 'making' };
  if (!(st().modelPhotos || []).length) return { kind: 'nophoto', sketch: true };
  if (!ui.hasKey) return { kind: 'nokey', sketch: true };
  if (auto.failed.has(sig)) return { kind: 'error', sketch: true, msg: auto.failed.get(sig) };
  if (navigator.onLine === false) return { kind: 'offline', sketch: true };
  if (st().settings.auto === false || o.date < today()) return { kind: 'manual', sketch: true };
  if (autoLeft() <= 0) return { kind: 'cap', sketch: true };
  return { kind: 'queued' };                                   // it starts by itself in a moment
}
// One request to ChatGPT's image engine for one fit, saved against that fit when it comes back.
async function createMockup(o, { signal, onStage } = {}) {
  const key = await S.secretGet('openai');
  if (!key) throw new M.MockupError('Add your OpenAI key in More first.', 'auth');
  const photos = (st().modelPhotos || []).slice(0, 3);
  const imgs = [];
  for (const id of photos) { const b = await S.blobGet(id); if (b) imgs.push(b); }
  if (!imgs.length) throw new M.MockupError('Add a full length photo of yourself in More first.', 'photo');
  for (const id of [o.suit || (o.jacket !== 'none' ? o.jacket : null), o.top, o.suit ? null : o.bottom, o.shoes].filter(Boolean)) {
    const it = item(id); if (it && it.photo && imgs.length < 8) { const b = await S.blobGet(it.photo); if (b) imgs.push(b); }
  }
  const prompt = M.buildPrompt(o, st().items, st().profile, st().settings.setting || 'auto', photos.length);
  let hidden = document.visibilityState === 'hidden', lock = null;
  const seen = () => { if (document.visibilityState === 'hidden') hidden = true; };
  document.addEventListener('visibilitychange', seen);
  try { if (navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); } catch (e) { /* the screen may dim; the request still runs */ }
  try {
    const out = await M.generate({ key, model: st().settings.model, quality: st().settings.quality, prompt, images: imgs, signal, onModel: onStage });
    await saveMock(o, out.blob, out.model);
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
  if (ui.tab !== 'fit' || ui.mode !== 'fit' || ui.loading || auto.busy || ui.busy || !st().items.length) return;
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
  try { await createMockup(o, { signal: auto.ctl.signal }); }
  catch (e) {
    if (e instanceof M.MockupError && e.kind === 'paused' && !auto.retried.has(sig)) auto.retried.add(sig);      // one more try once the app is back in front
    else auto.failed.set(sig, e && e.name === 'AbortError' ? 'Stopped.' : (e && e.message) || 'That did not work.');
  }
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
function pickFile(accept, multiple = false) {
  return new Promise((resolve) => {
    const inp = $('#filePick'); inp.value = ''; inp.accept = accept; inp.multiple = multiple;
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
    const snap = ui.mode === 'fit' && ui.ask && !ui.loading ? { at: Date.now(), ask: ui.ask, date: ui.date, occ: ui.occ, locks: ui.locks, idx: ui.idx, editing: ui.editing } : null;
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
      <textarea id="askBox" class="askbox" rows="3" data-in="askText" data-enter="askGo" enterkeyhint="go" placeholder="Dinner tonight, then drinks" autocomplete="off">${esc(ui.draft)}</textarea>
      <button class="btn primary" data-act="askGo">Get my fit</button>
      <p class="fine">Say where and when, and anything you want in it. Monday class with the fedora. No jeans. More casual.</p>
    </section>
    <section class="sec"><h3>Or tap one</h3>
      <div class="seg" role="group" aria-label="Day">${quick.map(([d, l]) => `<button class="${d === when ? 'on' : ''}" data-act="askWhen" data-date="${d}">${l}</button>`).join('')}
        <label class="${other ? 'on' : ''}"><span>${other ? esc(E.fmtDate(when)) : 'Another day'}</span><input type="date" data-in="askDate" value="${when}" aria-label="Pick another day"></label></div>
      <div class="chips wrap">${Object.entries(E.OCCASIONS).map(([k, v]) => `<button class="chip" data-act="askChip" data-occ="${k}">${esc(v.label)}</button>`).join('')}</div>
    </section>
    ${wearing.length ? `<section class="sec"><h3>Wearing today</h3><div class="card list">${wearing.map((w) => logLine(w, 'gotoDay')).join('')}</div></section>` : ''}`;
}
// What was asked, how it was read, and a place to change it.
function askBar() {
  const a = ui.ask, occ = E.OCCASIONS[ui.occ] || E.OCCASIONS.casual;
  const also = (a.also || []).filter((k) => E.OCCASIONS[k] && k !== ui.occ);
  const said = a.text ? `<q>${esc(a.text)}</q>` : esc(a.label || '');
  const again = '<button class="link" data-act="askAgain">New question</button>';
  return `<div class="card asked">
    ${said ? `<div class="asked-top"><div class="said">${said}</div>${again}</div>` : ''}
    <div class="pills">
      <label class="pill"><span>${esc(dayWord(ui.date))}</span><input type="date" data-in="pillDate" value="${ui.date}" aria-label="Change the day"></label>
      <button class="pill" data-act="pickOcc">${esc(occ.long)}</button>
      ${also.map((k) => `<span class="pill plain">+ ${esc(E.OCCASIONS[k].long)}</span>`).join('')}
      ${said ? '' : again}
    </div>
    ${(a.notes || []).length ? `<ul class="notes">${a.notes.map((n) => `<li>${esc(n.t)}</li>`).join('')}</ul>` : ''}
    <div class="refine"><input type="text" id="refineBox" data-enter="refine" enterkeyhint="go" placeholder="Change something" aria-label="Change something about this fit" autocomplete="off"><button class="btn small" data-act="refine">Go</button></div>
  </div>`;
}
function rowHtml(r, logged) {
  const lab = r.label || E.SLOT_LABEL[r.slot];
  const locked = !logged && ui.locks[r.slot] != null;
  const name = r.item ? esc(r.item.name) : (r.slot === 'jacket' ? 'No jacket' : 'None');
  const note = r.note && (r.item || r.slot !== 'jacket') ? `<small>${esc(r.note)}</small>` : '';
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
  if (ph.kind === 'photo') return `<div class="photo" data-act="mockup"><img data-blob="${esc(mk.blob)}" alt="Mockup of this fit on you"><span class="visual-tag">ChatGPT mockup</span></div>`;
  if (ph.kind === 'making' || ph.kind === 'queued') {
    const me = (st().modelPhotos || [])[0];
    return `<div class="photo making" data-act="mockup">${me ? `<img data-blob="${esc(me)}" alt="">` : ''}<div class="making-text"><div class="spinner"></div><b>ChatGPT is dressing you in this fit</b><span>About a minute. Keep the app open.</span></div></div>`;
  }
  const box = (title, text, buttons) => `<div class="photo-setup"><b>${title}</b><span>${text}</span><div class="actions wrap">${buttons}</div></div>`;
  const app = '<button class="btn small" data-act="mockup">Use the ChatGPT app</button>';
  if (ph.kind === 'nophoto') return box('Your ChatGPT mockup goes here', 'First add a full length photo of yourself. ChatGPT uses it to put each fit on you.', '<button class="btn primary small" data-act="addPhoto">Add my photo</button>');
  if (ph.kind === 'nokey') return box('Your ChatGPT mockup goes here', 'One step is left, and only you can do it: add your OpenAI key. After that every fit arrives as a photo of you instead of a sketch.', `<button class="btn primary small" data-act="setupKey">Add my key</button>${app}`);
  if (ph.kind === 'error') return box('ChatGPT did not return the mockup', esc(ph.msg || ''), `<button class="btn primary small" data-act="retryAuto">Try again</button>${app}`);
  if (ph.kind === 'offline') return box('No connection', 'The mockup is made as soon as you are back online.', '<button class="btn primary small" data-act="retryAuto">Try now</button>');
  if (ph.kind === 'cap') return box('Automatic mockups are done for today', `${AUTO_CAP} were made by themselves today. This one is made when you ask.`, '<button class="btn primary small" data-act="retryAuto">Create my mockup</button>');
  return box('See this fit on you', 'ChatGPT puts this fit on you in about a minute.', '<button class="btn primary small" data-act="retryAuto">Create my mockup</button>');
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
      ${c.why.length ? `<div class="why"><h3>Why it works</h3><p>${c.why.map(esc).join(' ')}</p></div>` : ''}
      ${checksHtml(c.checks)}
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
  const tag = i.status === 'retired' ? 'out' : i.hold ? 'manual only' : '';
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
        ? `<p>Each fit arrives as a ChatGPT mockup of you, made with your OpenAI key.</p>
           <label class="toggle"><input type="checkbox" data-in="auto"${s.auto !== false ? ' checked' : ''}><span>Make the mockup by itself with each fit</span></label>
           <p class="fine">Up to ${AUTO_CAP} a day by themselves, about a minute each. Cost depends on the quality below.</p>`
        : `<p>Each fit can arrive as a ChatGPT mockup of you instead of a sketch. That takes your own OpenAI API key, and only you can create it.</p>
           <ol class="steps"><li>Open OpenAI and sign in with your ChatGPT account.</li><li>Under Billing, add a few dollars of credit.</li><li>Under API keys, create a new secret key and copy it.</li><li>Paste it here and tap Save key.</li></ol>
           <a class="btn small" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">Open OpenAI API keys</a>`}
      <label class="field"><span>OpenAI API key</span><input type="password" id="keyInput" placeholder="${ui.hasKey ? 'Saved on this phone' : 'sk-...'}" autocomplete="off" autocapitalize="off" spellcheck="false" data-in="key"></label>
      <div class="actions"><button class="btn small" data-act="saveKey">Save key</button>${ui.hasKey ? '<button class="btn small" data-act="clearKey">Remove key</button>' : ''}</div>
      <label class="field"><span>Image quality</span><select data-in="quality">${['low', 'medium', 'high'].map((q) => `<option value="${q}"${s.quality === q ? ' selected' : ''}>${q === 'low' ? 'Draft, about 1 cent' : q === 'medium' ? 'Standard, about 5 cents' : 'Best, about 20 cents'}</option>`).join('')}</select></label>
      <label class="field"><span>Model</span><select data-in="model">${M.MODELS.map((m) => `<option value="${m}"${s.model === m ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <p class="fine">The key stays on this phone and is sent only to OpenAI. OpenAI may ask you to verify your organization before image models work. Without a key, tap Mockup on a fit to hand it to your ChatGPT app.</p></div></section>
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
function renderSheet() {
  const el = $('#sheet');
  if (!ui.sheet) { el.hidden = true; el.innerHTML = ''; document.body.classList.remove('sheet-open'); return; }
  const s = ui.sheet;
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
    <label class="field"><span>Notes</span><textarea data-in="itemNotes" data-id="${esc(i.id)}" rows="2">${esc(i.notes || '')}</textarea></label>
    <label class="toggle"><input type="checkbox" data-in="itemActive" data-id="${esc(i.id)}"${i.status !== 'retired' ? ' checked' : ''}><span>In rotation</span></label>
    <label class="toggle"><input type="checkbox" data-in="itemAuto" data-id="${esc(i.id)}"${!i.hold ? ' checked' : ''}><span>Stylist may pick it</span></label>
    ${['jacket', 'top', 'bottom', 'shoes', 'belt', 'suit'].includes(i.cat) ? `<label class="toggle"><input type="checkbox" data-in="itemTeach" data-id="${esc(i.id)}"${!i.noTeach ? ' checked' : ''}><span>Allowed in class</span></label>` : ''}
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
  if (ui.busy || auto.busy === mockKey(c.o)) return `<h2>Putting it on you</h2><div class="busy"><div class="spinner"></div><p>${esc(ui.busy || 'ChatGPT is dressing you')}</p><p class="fine">This takes about a minute. Keep the app open.</p></div><div class="actions"><button class="btn" data-act="cancelMockup">Cancel</button></div>`;
  if (!photos.length) return `<h2>See it on you</h2><p>First add a full length photo of yourself. It stays on this phone and is sent to ChatGPT only when you ask for a mockup.</p><div class="actions"><button class="btn primary" data-act="addPhoto">Add my photo</button></div>`;
  return `<h2>${mk ? 'Your mockup' : 'See it on you'}</h2>
    ${mk ? `<div class="mock"><img data-blob="${esc(mk.blob)}" alt="Mockup of this fit on you"></div><div class="actions wrap"><button class="btn small" data-act="shareMock">Save or share</button><button class="btn small danger" data-act="delMock">Remove</button></div>` : ''}
    ${s.error ? `<p class="error">${esc(s.error)}</p>` : ''}
    ${sceneSel}
    <div class="actions col">
      ${ui.hasKey ? `<button class="btn primary" data-act="makeMockup">${mk ? 'Create a new one' : 'Create with ChatGPT'}</button>` : ''}
      <button class="btn${ui.hasKey ? '' : ' primary'}" data-act="handOff">Open in my ChatGPT app</button>
      <button class="btn" data-act="pasteMock">Paste the image ChatGPT made</button>
      <button class="btn" data-act="attachMock">Add the finished image from Photos or Files</button>
    </div>
    <p class="fine">${ui.hasKey ? 'Created in the app with your OpenAI key.' : 'Without a key: your photo opens in the share sheet and the prompt is copied. Pick ChatGPT, paste, send. Hold the image it makes, choose Copy, come back and tap Paste. Add your OpenAI key in More and none of this is needed.'}</p>
    <details class="prompt"><summary>Show the prompt</summary><pre>${esc(M.buildPrompt(c.o, st().items, st().profile, st().settings.setting || 'auto', Math.min(photos.length, 3)))}</pre><button class="btn small" data-act="copyPrompt">Copy prompt</button></details>`;
}
function sheetPaste() {
  return `<h2>Paste setup text</h2><p class="fine">Paste the closet text you were given, then tap Load.</p>
    <textarea id="pasteBox" rows="7" placeholder="Paste here" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
    <div class="actions"><button class="btn" data-act="readClipboard">Paste from clipboard</button><button class="btn primary" data-act="loadPaste">Load</button></div>`;
}
function sheetAdd() {
  const colors = Object.entries(E.COLORS).filter(([k]) => !['gold', 'silver', 'tortoise'].includes(k));
  return `<h2>Add a piece</h2><p class="fine">Only add what you own and have confirmed.</p>
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
  tab: (d) => { if (d.tab === 'fit' && ui.tab === 'fit' && ui.mode === 'fit' && !ui.sheet) backToAsk(); ui.tab = d.tab; closeSheet(); render(); window.scrollTo(0, 0); },
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
    const box = $('#refineBox'); const v = ((box && box.value) || '').trim();
    if (!v || !ui.ask) return null;
    const a = ui.ask;
    const probe = parseAsk(v, { today: today(), date: ui.date, items: st().items, profile: st().profile });
    if (probe.occSaid) return answer(v, { date: ui.date, editing: true });           // a new occasion is a new question, same day unless a day is named
    return answer(a.text ? a.text + '. ' + v : v, { date: probe.dateSaid ? probe.date : ui.date, fixDate: true, occ: ui.occ, forceOcc: true, also: a.also, editing: true, label: a.label });
  },
  pickOcc: () => openSheet({ type: 'occ' }),
  toChecks: () => { const el = $('.checks'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
  setOcc: (d) => {
    const a = ui.ask; if (!a || !E.OCCASIONS[d.occ]) return null;
    a.occ = d.occ; a.occSaid = true; a.pinned = true; a.also = (a.also || []).filter((k) => k !== d.occ); a.notes = (a.notes || []).filter((n) => n.k === 'missing');
    ui.occ = d.occ; ui.locks = {}; ui.editing = false; closeSheet();
    return present();
  },
  another: () => { if (ui.results.length) { ui.idx = (ui.idx + 1) % ui.results.length; render(); } },
  clearLocks: () => { ui.locks = {}; recompute(); render(); },
  swap: (d) => {
    const c = current(); if (!c.o) return;
    const b = brief();
    const alts = E.alternatives(ctx(), c.o, d.slot, omit(b.locks, d.slot), b);
    openSheet({ type: 'swap', slot: d.slot, alts });
  },
  pickAlt: (d) => {
    const prev = current().o;
    ui.locks[d.slot] = d.id;
    if (d.slot === 'jacket') { const it = item(d.id); if (it && it.cat === 'suit') delete ui.locks.bottom; }
    recompute(prev); closeSheet(); render();
  },
  unlock: (d) => { const prev = current().o; delete ui.locks[d.slot]; recompute(prev); closeSheet(); render(); },
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
  closeSheet: () => { if (!ui.busy) closeSheet(); },
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
    toast(r === 'ok' ? 'Key works. Every fit now arrives as your ChatGPT mockup.' : 'Saved. It will be checked when you are online.', 5000);
  },
  clearKey: async () => { await S.secretSet('openai', null); ui.hasKey = false; render(); toast('Key removed.'); },
  mockup: () => { if (current().o) openSheet({ type: 'mockup' }); },
  copyPrompt: async () => { const c = current(); const ok = await M.copyText(M.buildPrompt(c.o, st().items, st().profile, st().settings.setting || 'auto', Math.min((st().modelPhotos || []).length, 3))); toast(ok ? 'Prompt copied.' : 'Could not copy.'); },
  makeMockup: async () => {
    const c = current(); if (!c.o) return;
    if (!ui.hasKey) { toast('Add your OpenAI key in More.'); return; }
    if (auto.busy) { toast('One mockup is already being made.'); return; }
    ui.abort = new AbortController(); ui.busy = 'Sending your photo and the fit to ChatGPT'; ui.busySig = mockKey(c.o); renderSheet();
    try {
      await createMockup(c.o, { signal: ui.abort.signal, onStage: () => { ui.busy = 'ChatGPT is dressing you'; renderSheet(); } });
      ui.busy = null; auto.failed.delete(mockKey(c.o)); render(); openSheet({ type: 'mockup' });
    } catch (e) {
      ui.busy = null;
      const msg = e && e.name === 'AbortError' ? 'Cancelled.' : (e && e.message) || 'That did not work. Try again.';
      render(); openSheet({ type: 'mockup', error: msg });
    }
  },
  cancelMockup: () => { if (ui.abort) ui.abort.abort(); if (auto.ctl) auto.ctl.abort(); ui.busy = null; renderSheet(); },
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
    const prompt = M.buildPrompt(c.o, st().items, st().profile, st().settings.setting || 'auto', 1);
    const b = photos.length ? await S.blobGet(photos[0]) : null;
    const r = await M.handOff(prompt, b);
    if (r.shared) toast('Prompt copied. In ChatGPT, paste and send.', 5000);
    else if (!r.cancelled) toast(r.copied ? 'Prompt copied. Open ChatGPT, attach your photo, paste, send.' : 'Copy the prompt below, then open ChatGPT.', 6000);
  },
  attachMock: async () => { const c = current(); const [f] = await pickFile('image/*'); if (!f || !c.o) return; const b = await M.downscale(f, 1536, 0.92); await saveMock(c.o, b, 'ChatGPT app'); auto.failed.delete(mockKey(c.o)); render(); openSheet({ type: 'mockup' }); toast('Mockup added.'); },
  delMock: async () => { const c = current(); const mk = mockFor(c.o); if (!mk) return; await S.blobDel(mk.blob); delete st().mockups[mockKey(c.o)]; S.save(); render(); openSheet({ type: 'mockup' }); },
  shareMock: async () => {
    const mk = mockFor(current().o); if (!mk) return; const b = await S.blobGet(mk.blob);
    const file = new File([b], 'presidential-fit-' + ui.date + '.jpg', { type: b.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch (e) { /* closed */ } }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; a.click(); }
  },
  refreshWeather: async () => {
    const was = ui.forecast ? ui.forecast.at : 0;
    ui.forecast = await loadForecast(st().profile, true);
    if (ui.mode === 'fit') recompute();
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
async function saveMock(o, blob, model) {
  st().mockups = st().mockups || {};
  const key = mockKey(o); const old = st().mockups[key];
  const id = 'mock:' + S.uid('m');
  await S.blobPut(id, blob);
  if (old) await S.blobDel(old.blob);
  st().mockups[key] = { blob: id, at: Date.now(), model, date: o.date, occ: o.occ };
  await S.save(true);
}
async function doImport(obj) {
  const merge = st().items.length > 0 && obj.kind !== 'presidential-fit-backup';
  await S.importAll(obj, { merge });
  E.configure(st().profile);
  await S.persist();
  ui.forecast = await loadForecast(st().profile);
  backToAsk(); ui.tab = 'fit';
  render(); toast(`Closet loaded: ${st().items.length} pieces.`);
}

// ---------- inputs ----------
const IN = {
  q: (el) => { ui.q = el.value; const v = $('#view'); const pos = el.selectionStart; v.innerHTML = viewCloset(); hydrateImages(v); const n = $('[data-in="q"]'); n.focus(); n.setSelectionRange(pos, pos); },
  askText: (el) => { ui.draft = el.value; },
  askDate: (el) => { if (el.value) { ui.when = el.value; ui.date = el.value; render(); } },
  pillDate: (el) => {
    const a = ui.ask; if (!el.value || !a) return null;
    return answer(a.text, Object.assign({ date: el.value, fixDate: true, label: a.label }, a.pinned ? { occ: ui.occ, forceOcc: true, also: a.also } : {}));
  },
  quality: (el) => { st().settings.quality = el.value; S.save(); },
  auto: (el) => { st().settings.auto = el.checked; S.save(); },
  model: (el) => { st().settings.model = el.value; S.save(); },
  scene: (el) => { st().settings.setting = el.value; S.save(); renderSheet(); hydrateImages($('#sheet')); },
  itemNotes: (el) => { const i = item(el.dataset.id); if (i) { i.notes = el.value; S.save(); } },
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
const LIVE = ['q', 'askText'];
const fail = (err) => { console.error(err); ui.loading = ''; toast('Something went wrong. Try again.'); };
document.addEventListener('input', (e) => { const t = e.target.closest('[data-in]'); if (t && LIVE.includes(t.dataset.in)) IN[t.dataset.in](t); });
document.addEventListener('change', (e) => { const t = e.target.closest('[data-in]'); if (t && !LIVE.includes(t.dataset.in) && IN[t.dataset.in]) Promise.resolve(IN[t.dataset.in](t)).catch(fail); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  const t = e.target.closest('[data-enter]'); const fn = t && A[t.dataset.enter];
  if (fn) { e.preventDefault(); t.blur(); Promise.resolve(fn(t.dataset, t)).catch(fail); }
});

// ---------- boot ----------
const AWAY_MS = 10 * 60 * 1000;
async function boot() {
  await S.loadState();
  E.configure(st().profile);
  ui.hasKey = !!(await S.secretGet('openai').catch(() => null));
  // Coming straight back (from ChatGPT, say) returns to the fit that was open. Otherwise the app starts on the question.
  const snap = await S.kvGet('session').catch(() => null);
  if (snap && snap.ask && Date.now() - snap.at < AWAY_MS && snap.date >= today() && E.OCCASIONS[snap.occ] && st().items.length) {
    Object.assign(ui, { mode: 'fit', ask: snap.ask, date: snap.date, occ: snap.occ, locks: snap.locks || {}, editing: !!snap.editing });
    recompute(); ui.idx = Math.min(snap.idx || 0, Math.max(0, ui.results.length - 1));
  }
  render();
  ui.forecast = await loadForecast(st().profile);
  if (ui.mode === 'fit') { const keep = ui.idx; recompute(); ui.idx = Math.min(keep, Math.max(0, ui.results.length - 1)); }
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
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
    if (ui.sw) ui.sw.update().catch(() => {});
    const away = hiddenAt && Date.now() - hiddenAt > AWAY_MS;
    if ((ui.askDay !== today() || (away && ui.mode === 'fit')) && !ui.sheet && !ui.busy) { ui.askDay = today(); backToAsk(); }   // after time away, or on a new day, it starts with the question again
    ui.forecast = await loadForecast(st().profile);
    if (ui.mode === 'fit' && !ui.sheet) { const keep = ui.idx; recompute(); ui.idx = Math.min(keep, Math.max(0, ui.results.length - 1)); }
    refresh();
  });
}
window.PF = { ui, S, E, M, doImport, answer, parseAsk };
boot().catch((e) => { console.error(e); render(); });
