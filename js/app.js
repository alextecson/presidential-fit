// Presidential Fit: screens and interactions.
import * as S from './store.js';
import * as E from './engine.js';
import * as M from './mockup.js';
import { figureSvg } from './figure.js';
import { loadForecast, weatherFor, today } from './weather.js';

const VERSION = '1.0.3';
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ui = {
  tab: 'fit', date: today(), occ: null, locks: {}, results: [], idx: 0, editing: false,
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
function ctx() {
  return { items: st().items, wears: st().wears, groups: st().profile.groups, cars: st().profile.cars || [], date: ui.date, occ: ui.occ, weather: weatherFor(ui.forecast, ui.date) };
}
function defaultOcc(date) {
  const logged = st().wears.filter((w) => w.date === date);
  if (logged.length) return logged[logged.length - 1].occ;
  const d = E.dow(date);
  const g = st().profile.groups.find((x) => (x.days || []).includes(d));
  if (g) return 'teach_' + g.id;
  return ui.lastOcc && E.OCCASIONS[ui.lastOcc] && !E.OCCASIONS[ui.lastOcc].teach ? ui.lastOcc : 'casual';
}
function entryFor(date, occ) { return st().wears.find((w) => w.date === date && w.occ === occ) || null; }
function outfitFromEntry(w) {
  const o = { occ: w.occ, date: w.date, suit: null, jacket: 'none', top: null, bottom: null, belt: 'none', shoes: null, socks: null, watch: null, glasses: null, coat: null, hat: null, tuck: w.tuck || null };
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
  if (e && !ui.editing) { const o = outfitFromEntry(e); return { entry: e, o, why: [], flags: [], logged: true }; }
  const r = ui.results[ui.idx] || null;
  return r ? { entry: e, o: r.o, why: r.why, flags: r.flags, logged: false } : { entry: e, o: null, why: [], flags: [], logged: false };
}
function recompute(prefer) {
  if (!st().items.length) { ui.results = []; return; }
  ui.results = E.solve(ctx(), { locks: ui.locks, prefer: prefer || null, n: 8 });
  ui.idx = 0;
}
function setDate(d) { ui.date = d; ui.occ = defaultOcc(d); ui.locks = {}; ui.editing = false; recompute(); render(); }
function mockKey(o) { return E.signature(o); }
function mockFor(o) { const m = (st().mockups || {})[mockKey(o)]; return m || null; }
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
function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const v = $('#view');
  if (!st().items.length) v.innerHTML = viewSetup();
  else if (ui.tab === 'fit') v.innerHTML = viewFit();
  else if (ui.tab === 'closet') v.innerHTML = viewCloset();
  else if (ui.tab === 'log') v.innerHTML = viewLog();
  else v.innerHTML = viewMore();
  renderWeather();
  renderSheet();
  hydrateImages();
}
function renderWeather() {
  const w = weatherFor(ui.forecast, ui.date);
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

function dayStrip() {
  const days = [];
  for (let i = 0; i < 10; i++) days.push(E.addDays(today(), i));
  if (!days.includes(ui.date)) days.unshift(ui.date);
  return `<div class="strip" role="tablist">${days.map((d) => {
    const w = weatherFor(ui.forecast, d);
    const has = st().wears.some((x) => x.date === d);
    const lab = d === today() ? 'Today' : E.fmtDate(d, { weekday: 'short' });
    return `<button role="tab" class="day${d === ui.date ? ' on' : ''}" data-act="day" data-date="${d}"><small>${lab}</small><b>${new Date(d + 'T12:00:00').getDate()}</b><i>${Math.round(w.hi)}°</i>${has ? '<u></u>' : ''}</button>`;
  }).join('')}<label class="day pick"><small>Other</small><b>+</b><input type="date" data-in="pickDate" value="${ui.date}"></label></div>`;
}
function occChips() {
  return `<div class="chips">${Object.entries(E.OCCASIONS).map(([k, v]) => `<button class="chip${k === ui.occ ? ' on' : ''}" data-act="occ" data-occ="${k}">${esc(v.label)}</button>`).join('')}</div>`;
}
function rowHtml(r, logged) {
  const lab = r.label || E.SLOT_LABEL[r.slot];
  const locked = !logged && ui.locks[r.slot] != null;
  const name = r.item ? esc(r.item.name) : (r.slot === 'jacket' ? 'No jacket' : 'None');
  const note = r.note && (r.item || r.slot !== 'jacket') ? `<small>${esc(r.note)}</small>` : '';
  return `<button class="row" ${logged ? 'disabled' : `data-act="swap" data-slot="${r.slot}"`}>
    ${swatch(r.item)}<span class="rt"><span class="rl">${esc(lab)}${locked ? ' · locked' : ''}</span><span class="rn">${name}${note}</span></span>${logged ? '' : '<span class="chev" aria-hidden="true"></span>'}</button>`;
}
function viewFit() {
  const c = current();
  const occ = E.OCCASIONS[ui.occ];
  const past = E.daysBetween(ui.date, today()) > 0;
  const isToday = ui.date === today();
  let body = '';
  if (c.logged && !c.o.complete) {
    body = `<div class="card"><div class="eyebrow">${c.entry.status === 'planned' ? 'Planned' : 'Logged'}</div>
      <ul class="plain">${(c.entry.items || []).map((id) => `<li>${swatch(item(id))}<span>${esc(nameOf(id))}</span></li>`).join('')}</ul>
      ${c.entry.note ? `<p class="note">${esc(c.entry.note)}</p>` : ''}
      <div class="actions"><button class="btn" data-act="editEntry">Build a full fit for this day</button></div></div>`;
  } else if (c.o) {
    const rs = E.rows(c.o, st().items);
    const mk = mockFor(c.o);
    const watch = item(c.o.watch);
    document.documentElement.dataset.metal = watch && watch.metal === 'silver' ? 'silver' : 'gold';
    const status = c.logged ? (c.entry.status === 'planned' ? 'Planned' : 'Worn') : (ui.editing ? 'New pick' : 'Suggested');
    const count = !c.logged && ui.results.length > 1 ? `<span class="count">${ui.idx + 1} of ${ui.results.length}</span>` : '';
    body = `<div class="card fit">
      <div class="fit-head"><div><div class="eyebrow">${esc(status)} · ${esc(occ.long)}</div><h2>${esc(E.fmtDate(ui.date, { weekday: 'long', month: 'long', day: 'numeric' }))}</h2></div>${count}</div>
      <div class="look${mk ? ' has-photo' : ''}">
        <div class="visual" data-act="mockup">${mk ? `<img data-blob="${esc(mk.blob)}" alt="Mockup of this fit on you">` : figureSvg(c.o, st().items)}
          <span class="visual-tag">${mk ? 'ChatGPT mockup' : 'Sketch'}</span></div>
        <div class="rows">${rs.map((r) => rowHtml(r, c.logged)).join('')}</div>
      </div>
      ${c.entry && c.entry.note && c.logged ? `<p class="note">${esc(c.entry.note)}</p>` : ''}
      ${c.why.length ? `<div class="why"><h3>Why it works</h3><p>${c.why.map(esc).join(' ')}</p></div>` : ''}
      ${c.flags.length ? `<div class="flags"><h3>Flags</h3><ul>${c.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
      <div class="actions">
        ${c.logged
          ? `${c.entry.status === 'planned' && (past || isToday) ? '<button class="btn primary" data-act="markWorn">I wore it</button>' : ''}
             <button class="btn${c.entry.status === 'planned' && (past || isToday) ? '' : ' primary'}" data-act="mockup">${mk ? 'Mockup' : 'See it on me'}</button>
             <button class="btn" data-act="editEntry">Change it</button>`
          : `<button class="btn primary" data-act="lockIn">${past || isToday ? (isToday ? 'Wearing this' : 'I wore this') : 'Lock it in'}</button>
             <button class="btn" data-act="another">Another</button>
             <button class="btn" data-act="mockup">${mk ? 'Mockup' : 'See it on me'}</button>`}
      </div>
      ${!c.logged && Object.keys(ui.locks).length ? `<button class="link" data-act="clearLocks">Clear my ${Object.keys(ui.locks).length} locked ${Object.keys(ui.locks).length === 1 ? 'piece' : 'pieces'}</button>` : ''}
      ${c.logged ? '<button class="link danger" data-act="removeEntry">Remove from the log</button>' : (c.entry ? '<button class="link" data-act="cancelEdit">Keep the logged fit</button>' : '')}
    </div>`;
  } else {
    body = `<div class="card"><h2>No fit clears the rules</h2><p>Nothing in the closet fits this day with those locked pieces. Clear a lock or pick another occasion.</p>
      ${Object.keys(ui.locks).length ? '<div class="actions"><button class="btn primary" data-act="clearLocks">Clear locked pieces</button></div>' : ''}</div>`;
  }
  return `${dayStrip()}${occChips()}${body}`;
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
  const line = (w) => {
    const its = (w.items || []).map(item).filter(Boolean);
    const main = its.filter((i) => ['suit', 'jacket', 'top', 'bottom', 'shoes'].includes(i.cat));
    return `<button class="logrow" data-act="openLog" data-id="${esc(w.id)}">
      <span class="ld"><b>${new Date(w.date + 'T12:00:00').getDate()}</b><small>${E.fmtDate(w.date, { month: 'short' })}</small><small>${E.fmtDate(w.date, { weekday: 'short' })}</small></span>
      <span class="lb"><span class="lt">${esc(occLabel(w.occ))}${w.status === 'planned' ? ' <em>planned</em>' : ''}</span>
      <span class="ls">${main.map((i) => swatch(i)).join('')}</span>
      <span class="ln">${esc(main.map((i) => i.short || i.name).join(', ') || (w.note || ''))}</span></span></button>`;
  };
  return `<div class="chips">${chips.map(([k, l]) => `<button class="chip${k === f ? ' on' : ''}" data-act="logFilter" data-f="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="card list">${ws.map(line).join('') || '<p class="empty">Nothing logged yet. Lock in a fit and it lands here.</p>'}</div>`;
}

function viewMore() {
  const s = st().settings;
  const photos = st().modelPhotos || [];
  return `<section class="sec"><h3>You, as the model <span>${photos.length}</span></h3>
      <div class="card"><p>Add one to three full length photos of yourself: standing, good light, head to shoes. ChatGPT uses them to put each fit on you.</p>
      <div class="photos">${photos.map((id) => `<div class="ph"><img data-blob="${esc(id)}" alt="Model photo"><button data-act="delPhoto" data-id="${esc(id)}" aria-label="Remove photo">×</button></div>`).join('')}
      ${photos.length < 4 ? '<button class="ph add" data-act="addPhoto"><span>+</span>Add photo</button>' : ''}</div></div></section>
    <section class="sec"><h3>ChatGPT mockups</h3>
      <div class="card"><p>${ui.hasKey ? 'Mockups are created inside the app with your OpenAI key.' : 'Without a key, the app hands the photo and the exact prompt to your ChatGPT app. Add an OpenAI API key to create mockups right here.'}</p>
      <label class="field"><span>OpenAI API key</span><input type="password" id="keyInput" placeholder="${ui.hasKey ? 'Saved on this phone' : 'sk-...'}" autocomplete="off" autocapitalize="off" spellcheck="false" data-in="key"></label>
      <div class="actions"><button class="btn small" data-act="saveKey">Save key</button>${ui.hasKey ? '<button class="btn small" data-act="clearKey">Remove key</button>' : ''}</div>
      <label class="field"><span>Image quality</span><select data-in="quality">${['low', 'medium', 'high'].map((q) => `<option value="${q}"${s.quality === q ? ' selected' : ''}>${q === 'low' ? 'Draft, about 1 cent' : q === 'medium' ? 'Standard, about 5 cents' : 'Best, about 20 cents'}</option>`).join('')}</select></label>
      <label class="field"><span>Model</span><select data-in="model">${M.MODELS.map((m) => `<option value="${m}"${s.model === m ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <p class="fine">The key stays on this phone and is sent only to OpenAI. Key setup: platform.openai.com, API keys. OpenAI may ask you to verify your organization before image models work.</p></div></section>
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
  else if (s.type === 'confirm') inner = `<h2>${esc(s.title)}</h2><p>${esc(s.text)}</p><div class="actions"><button class="btn danger" data-act="confirmYes">${esc(s.yes)}</button><button class="btn" data-act="closeSheet">Cancel</button></div>`;
  el.innerHTML = `<div class="backdrop" data-act="closeSheet"></div><div class="panel" role="dialog" aria-modal="true"><div class="grab" data-act="closeSheet"></div>${inner}</div>`;
  el.hidden = false; document.body.classList.add('sheet-open');
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
      <button class="btn small" data-act="gotoDay" data-date="${w.date}" data-occ="${w.occ}">Open in Fit</button>
      <button class="btn small danger" data-act="delLog" data-id="${esc(w.id)}">Delete</button></div>`;
}
function sheetMockup(s) {
  const c = current(); if (!c.o) return '';
  const mk = mockFor(c.o);
  const photos = st().modelPhotos || [];
  const sceneSel = `<label class="field"><span>Setting</span><select data-in="scene">${Object.entries(M.scenesFor(st().profile)).map(([k, v]) => `<option value="${k}"${(st().settings.setting || 'auto') === k ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>`;
  if (ui.busy) return `<h2>Putting it on you</h2><div class="busy"><div class="spinner"></div><p>${esc(ui.busy)}</p><p class="fine">This takes about a minute. Keep the app open.</p></div><div class="actions"><button class="btn" data-act="cancelMockup">Cancel</button></div>`;
  if (!photos.length) return `<h2>See it on you</h2><p>First add a full length photo of yourself. It stays on this phone and is sent to ChatGPT only when you ask for a mockup.</p><div class="actions"><button class="btn primary" data-act="addPhoto">Add my photo</button></div>`;
  return `<h2>${mk ? 'Your mockup' : 'See it on you'}</h2>
    ${mk ? `<div class="mock"><img data-blob="${esc(mk.blob)}" alt="Mockup of this fit on you"></div><div class="actions wrap"><button class="btn small" data-act="shareMock">Save or share</button><button class="btn small danger" data-act="delMock">Remove</button></div>` : ''}
    ${s.error ? `<p class="error">${esc(s.error)}</p>` : ''}
    ${sceneSel}
    <div class="actions col">
      ${ui.hasKey ? `<button class="btn primary" data-act="makeMockup">${mk ? 'Create a new one' : 'Create with ChatGPT'}</button>` : ''}
      <button class="btn${ui.hasKey ? '' : ' primary'}" data-act="handOff">Open in my ChatGPT app</button>
      <button class="btn" data-act="attachMock">Add the finished image</button>
    </div>
    <p class="fine">${ui.hasKey ? 'Created in the app with your OpenAI key.' : 'Your photo opens in the share sheet and the prompt is copied. Swipe the app row to ChatGPT, paste, send. Save the image, then add it here.'}</p>
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
  tab: (d) => { ui.tab = d.tab; closeSheet(); render(); window.scrollTo(0, 0); },
  day: (d) => setDate(d.date),
  occ: (d) => { ui.occ = d.occ; ui.lastOcc = d.occ; ui.locks = {}; ui.editing = false; recompute(); render(); },
  another: () => { if (ui.results.length) { ui.idx = (ui.idx + 1) % ui.results.length; render(); } },
  clearLocks: () => { ui.locks = {}; recompute(); render(); },
  swap: (d) => {
    const c = current(); if (!c.o) return;
    const alts = E.alternatives(ctx(), c.o, d.slot === 'top' && false ? 'tuck' : d.slot, omit(ui.locks, d.slot));
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
    const rec = { id: 'w-' + ui.date + '-' + ui.occ, date: ui.date, occ: ui.occ, group: occ.group || null, items: E.majorIds(c.o), tuck: c.o.tuck, note: '', status: past ? 'worn' : 'planned' };
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
  gotoDay: (d) => { closeSheet(); ui.tab = 'fit'; ui.date = d.date; ui.occ = d.occ; ui.locks = {}; ui.editing = false; recompute(); render(); },
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
  wearItem: (d) => { const it = item(d.id); if (!it) return; closeSheet(); ui.tab = 'fit'; ui.editing = true; ui.locks = { [it.cat === 'suit' ? 'jacket' : it.cat]: it.id }; recompute(); render(); },
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
    await S.secretSet('openai', v); ui.hasKey = true; render();
    toast(r === 'ok' ? 'Key works. Saved on this phone.' : 'Saved. It will be checked when you are online.', 4000);
  },
  clearKey: async () => { await S.secretSet('openai', null); ui.hasKey = false; render(); toast('Key removed.'); },
  mockup: () => { if (current().o) openSheet({ type: 'mockup' }); },
  copyPrompt: async () => { const c = current(); const ok = await M.copyText(M.buildPrompt(c.o, st().items, st().profile, st().settings.setting || 'auto', Math.min((st().modelPhotos || []).length, 3))); toast(ok ? 'Prompt copied.' : 'Could not copy.'); },
  makeMockup: async () => {
    const c = current(); if (!c.o) return;
    const key = await S.secretGet('openai'); if (!key) { toast('Add your OpenAI key in More.'); return; }
    const photos = (st().modelPhotos || []).slice(0, 3);
    ui.abort = new AbortController(); ui.busy = 'Sending your photo and the fit to ChatGPT'; renderSheet();
    try {
      const imgs = [];
      for (const id of photos) { const b = await S.blobGet(id); if (b) imgs.push(b); }
      for (const id of [c.o.suit || (c.o.jacket !== 'none' ? c.o.jacket : null), c.o.top, c.o.suit ? null : c.o.bottom, c.o.shoes].filter(Boolean)) {
        const it = item(id); if (it && it.photo && imgs.length < 8) { const b = await S.blobGet(it.photo); if (b) imgs.push(b); }
      }
      const prompt = M.buildPrompt(c.o, st().items, st().profile, st().settings.setting || 'auto', photos.length);
      const out = await M.generate({ key, model: st().settings.model, quality: st().settings.quality, prompt, images: imgs, signal: ui.abort.signal, onModel: () => { ui.busy = 'ChatGPT is dressing you'; renderSheet(); } });
      await saveMock(c.o, out.blob, out.model);
      ui.busy = null; render(); openSheet({ type: 'mockup' });
    } catch (e) {
      ui.busy = null;
      const msg = e && e.name === 'AbortError' ? 'Cancelled.' : (e && e.message) || 'That did not work. Try again.';
      render(); openSheet({ type: 'mockup', error: msg });
    }
  },
  cancelMockup: () => { if (ui.abort) ui.abort.abort(); ui.busy = null; renderSheet(); },
  handOff: async () => {
    const c = current(); if (!c.o) return;
    const photos = st().modelPhotos || [];
    const prompt = M.buildPrompt(c.o, st().items, st().profile, st().settings.setting || 'auto', 1);
    const b = photos.length ? await S.blobGet(photos[0]) : null;
    const r = await M.handOff(prompt, b);
    if (r.shared) toast('Prompt copied. In ChatGPT, paste and send.', 5000);
    else if (!r.cancelled) toast(r.copied ? 'Prompt copied. Open ChatGPT, attach your photo, paste, send.' : 'Copy the prompt below, then open ChatGPT.', 6000);
  },
  attachMock: async () => { const c = current(); const [f] = await pickFile('image/*'); if (!f || !c.o) return; const b = await M.downscale(f, 1536, 0.92); await saveMock(c.o, b, 'ChatGPT app'); render(); openSheet({ type: 'mockup' }); toast('Mockup added.'); },
  delMock: async () => { const c = current(); const mk = mockFor(c.o); if (!mk) return; await S.blobDel(mk.blob); delete st().mockups[mockKey(c.o)]; S.save(); render(); openSheet({ type: 'mockup' }); },
  shareMock: async () => {
    const mk = mockFor(current().o); if (!mk) return; const b = await S.blobGet(mk.blob);
    const file = new File([b], 'presidential-fit-' + ui.date + '.jpg', { type: b.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); } catch (e) { /* closed */ } }
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = file.name; a.click(); }
  },
  refreshWeather: async () => { ui.forecast = await loadForecast(st().profile, true); recompute(); render(); toast('Weather updated.'); },
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
  erase: () => openSheet({ type: 'confirm', title: 'Erase everything on this phone?', text: 'Closet, log, photos, mockups and the key are removed. Back up first if you want to keep them.', yes: 'Erase', run: async () => { for (const k of await S.blobKeys()) await S.blobDel(k); await S.secretSet('openai', null); ui.hasKey = false; await S.replaceState(S.EMPTY_STATE()); E.configure(st().profile); ui.results = []; } }),
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
  ui.date = today(); ui.occ = defaultOcc(ui.date); ui.locks = {}; ui.editing = false; ui.tab = 'fit';
  recompute(); render(); toast(`Closet loaded: ${st().items.length} pieces.`);
}

// ---------- inputs ----------
const IN = {
  q: (el) => { ui.q = el.value; const v = $('#view'); const pos = el.selectionStart; v.innerHTML = viewCloset(); hydrateImages(v); const n = $('[data-in="q"]'); n.focus(); n.setSelectionRange(pos, pos); },
  pickDate: (el) => { if (el.value) setDate(el.value); },
  quality: (el) => { st().settings.quality = el.value; S.save(); },
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
  const fn = A[t.dataset.act]; if (fn) { e.preventDefault(); Promise.resolve(fn(t.dataset, t)).catch((err) => { console.error(err); toast('Something went wrong. Try again.'); }); }
});
document.addEventListener('input', (e) => { const t = e.target.closest('[data-in]'); if (t && ['q'].includes(t.dataset.in)) IN[t.dataset.in](t); });
document.addEventListener('change', (e) => { const t = e.target.closest('[data-in]'); if (t && t.dataset.in !== 'q' && IN[t.dataset.in]) IN[t.dataset.in](t); });

// ---------- boot ----------
async function boot() {
  await S.loadState();
  E.configure(st().profile);
  ui.hasKey = !!(await S.secretGet('openai').catch(() => null));
  ui.occ = defaultOcc(ui.date);
  recompute(); render();
  ui.forecast = await loadForecast(st().profile);
  recompute(); render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    if (ui.date < today() && !ui.sheet) { ui.date = today(); ui.occ = defaultOcc(ui.date); ui.locks = {}; ui.editing = false; }
    ui.forecast = await loadForecast(st().profile); if (!ui.sheet) { recompute(); render(); }
  });
}
window.PF = { ui, S, E, M, doImport };
boot();
