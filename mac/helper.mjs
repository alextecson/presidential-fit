#!/usr/bin/env node
// Presidential Fit helper for the wearer's own Mac.
// It waits for sealed requests from the phone, makes each mockup with the image tool that ships inside the ChatGPT
// desktop app (so it runs on the wearer's ChatGPT plan, with no API key), and sends the sealed picture back.
// It also checks a photograph the wearer takes of the finished look, or of one piece he is trying on, against the plan.
//
// Private files stay outside this repository, in ~/Library/Application Support/PresidentialFit:
//   profile.json   the profile block of the closet file. It is what pairs this Mac with the phone.
//   me.jpg         the reference photo of the wearer. It never leaves the Mac except to ChatGPT.
//   config.json    optional overrides: { "profile": "...", "photo": "...", "codex": "...", "maxPerDay": 60, "maxChecksPerDay": 80 }
//   cache/         finished mockups, each with a small note of the fit and setting it shows
//   places.json    what the places he named look like, looked up once each
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = fs.existsSync(path.join(here, 'link.js')) ? here : path.join(here, '..', 'js');
const { RELAY, derive, seal, open, newPair, sessionKey, sealBytes, openBytes, tidy, briefHash } = await import(pathToFileURL(path.join(lib, 'link.js')).href);
const { checkTask, parseCheck } = await import(pathToFileURL(path.join(lib, 'check.js')).href);
const { promptFrom, editPromptFrom, diffLines, WHENS, LOOK } = await import(pathToFileURL(path.join(lib, 'mockup.js')).href);
const { placeTask, readPlace, sceneOf, placeName } = await import(pathToFileURL(path.join(lib, 'place.js')).href);

const HOME = process.env.PF_HOME || path.join(os.homedir(), 'Library', 'Application Support', 'PresidentialFit');
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; } };
const cfg = Object.assign({ profile: 'profile.json', photo: 'me.jpg', codex: '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex', maxPerDay: 60 }, readJson(path.join(HOME, 'config.json'), {}));
const abs = (p) => (path.isAbsolute(p) ? p : path.join(HOME, p));
const LOG = path.join(HOME, 'helper.log');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function log(...a) {
  const line = new Date().toISOString() + ' ' + a.join(' ') + '\n';
  try { if (fs.existsSync(LOG) && fs.statSync(LOG).size > 1e6) fs.renameSync(LOG, LOG + '.1'); fs.appendFileSync(LOG, line); } catch (e) { /* logging never stops the helper */ }
  if (process.stdout.isTTY) process.stdout.write(line);
}
class UserError extends Error {}

for (const d of ['cache', 'jobs']) fs.mkdirSync(path.join(HOME, d), { recursive: true });
const CACHE = path.join(HOME, 'cache');
// one helper at a time
const PID = path.join(HOME, 'helper.pid');
const other = Number(readJson(PID, 0));
if (other && other !== process.pid) { try { process.kill(other, 0); log('another helper is already running, stopping this one'); process.exit(0); } catch (e) { /* stale */ } }
fs.writeFileSync(PID, String(process.pid));
const bye = () => { try { if (Number(readJson(PID, 0)) === process.pid) fs.rmSync(PID); } catch (e) { /* gone */ } try { if (awake) awake.kill(); } catch (e) { /* gone */ } process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);
// Mockups nobody has asked for in a month are let go, and so is anything a stopped job left behind. The phone keeps its own copies.
try {
  const old = Date.now() - 30 * 86400000;
  for (const f of fs.readdirSync(CACHE)) { if (!/^[0-9a-f]{32}\.(jpg|json)$/.test(f)) continue; const p = path.join(CACHE, f); if (fs.statSync(p).mtimeMs < old) fs.rmSync(p); }
  for (const f of fs.readdirSync(path.join(HOME, 'jobs'))) { if (/^[0-9a-f]{16}(-place)?$/.test(f)) fs.rmSync(path.join(HOME, 'jobs', f), { recursive: true, force: true }); }
} catch (e) { /* tidying never stops the helper */ }

const profile = readJson(abs(cfg.profile), null);
if (!profile) { log('no profile.json in', HOME, ': nothing to pair with'); await sleep(60000); process.exit(1); }
if (!fs.existsSync(abs(cfg.photo))) { log('no reference photo at', abs(cfg.photo)); await sleep(60000); process.exit(1); }
const link = await derive(profile);
if (!link) { log('the profile is blank: nothing to pair with'); await sleep(60000); process.exit(1); }
log('helper started, pid', process.pid);

// ---------- talking to the phone ----------
async function say(obj, file) {
  const msg = await seal(link.key, obj);
  const res = file
    ? await fetch(`${RELAY}/${link.res}`, { method: 'PUT', body: file, headers: { Filename: (obj.id || 'file') + '.bin', Message: msg } })
    : await fetch(`${RELAY}/${link.res}`, { method: 'POST', body: msg });
  if (!res.ok) throw new Error('relay answered ' + res.status + ' ' + (await res.text()).slice(0, 140));
}
let lastHere = 0;
async function announce() {
  if (Date.now() - lastHere < 6 * 3600 * 1000) return;
  try { await say({ st: 'here', v: 1, t: Date.now() }); lastHere = Date.now(); log('announced'); } catch (e) { log('announce failed:', e.message); }
}

// ---------- requests ----------
const KINDS = ['work', 'dinner', 'drinks', 'an event', 'a special occasion', 'class', 'a casual day'];
function checkRequest(r) {
  if (!r || r.v !== 1 || !/^[0-9a-f]{16}$/.test(r.id || '') || typeof r.t !== 'number' || typeof r.pub !== 'string' || r.pub.length > 200) return null;
  if (Math.abs(Date.now() - r.t) > 10 * 60 * 1000) return null;                       // old requests are not worth a picture
  if (!Array.isArray(r.lines) || r.lines.length < 3 || r.lines.length > 14) return null;
  const lines = r.lines.map((l) => tidy(l, 240));
  if (!lines.every((l) => /^[A-Z][A-Z ]{1,14}: \S/.test(l))) return null;             // "SLOT: description" and nothing else
  const req = { id: r.id, pub: r.pub, lines, scene: tidy(r.scene, 300) || 'a plain light grey photo studio backdrop', fresh: !!r.fresh };
  if (typeof r.prev === 'string' && /^[0-9a-f]{32}$/.test(r.prev)) req.prev = r.prev;            // the mockup this one follows
  if (r.place && typeof r.place === 'object' && placeName(r.place.name).length > 1) req.place = { name: placeName(r.place.name), kind: KINDS.includes(r.place.kind) ? r.place.kind : '', when: WHENS.includes(r.place.when) ? r.place.when : '' };
  return req;
}
// Requests taken, kept on disk. A finished one is never made twice. One that a restart cut short is taken up again, once,
// because the phone is still waiting for it.
const SEEN = path.join(HOME, 'seen.json');
const seen = new Map(Object.entries(readJson(SEEN, {})).map(([k, v]) => [k, typeof v === 'number' ? { t: v, done: true, tries: 1 } : v]));
const saveSeen = () => { try { fs.writeFileSync(SEEN, JSON.stringify(Object.fromEntries(seen))); } catch (e) { /* memory still holds it */ } };
const finish = (id) => { const s = seen.get(id); if (s && !s.done) { s.done = true; saveSeen(); } };
const taken = new Set();                                           // taken in this run
// While he is styling, the Mac stays awake: from each request until a quarter of an hour after the last one was answered.
// This holds off idle sleep only, changes no setting, and ends by itself. A closed lid still puts the Mac to sleep.
let awake = null;
function stayAwake() {
  try { if (awake) awake.kill(); } catch (e) { /* already gone */ }
  try { awake = spawn('/usr/bin/caffeinate', ['-i', '-t', '900'], { stdio: 'ignore' }); awake.on('error', () => {}); } catch (e) { awake = null; }
}
const BUSY = path.join(HOME, 'busy');                              // present while a mockup is being made, so an update can wait for it
try { fs.rmSync(BUSY, { force: true }); } catch (e) { /* none */ }
const queue = [];
let working = false;
let current = null;                                                // the job being made, with its child process
function cancel(id) {
  const i = queue.findIndex((j) => j.id === id);
  pending.delete(id);
  if (i >= 0) { queue.splice(i, 1); finish(id); log('request', id, 'cancelled before it started'); return; }
  if (current && current.id === id) { current.cancelled = true; if (current.child) current.child.kill('SIGKILL'); log('request', id, 'cancelled while being made'); }
}
async function onMessage(m) {
  const raw = await open(link.key, m.message);
  if (raw && raw.v === 1 && typeof raw.cancel === 'string' && typeof raw.t === 'number' && Math.abs(Date.now() - raw.t) < 10 * 60 * 1000) { cancel(raw.cancel); return; }
  if (raw && raw.v === 1 && raw.kind === 'check') { await onCheck(raw); return; }
  if (raw && raw.v === 1 && raw.part === 'photo') { await onPhoto(raw, m); return; }
  const req = checkRequest(raw);
  if (!req || taken.has(req.id)) return;
  const was = seen.get(req.id);
  if (was && (was.done || was.tries >= 2)) return;
  taken.add(req.id);
  seen.set(req.id, { t: Date.now(), done: false, tries: (was ? was.tries : 0) + 1 });
  for (const [k, v] of seen) if (Date.now() - v.t > 3600 * 1000) seen.delete(k);
  saveSeen();
  if (was) log('request', req.id, 'was cut short by a restart, taking it up again');
  stayAwake();
  if (queue.length >= 3) { finish(req.id); try { await say({ id: req.id, st: 'error', msg: 'Your Mac is busy with other mockups. Try again in a minute.' }); } catch (e) { /* phone will time out */ } return; }
  const ahead = queue.length + (working ? 1 : 0);
  queue.push(req);
  log('request', req.id, req.lines.length + ' lines' + (req.prev ? ', follows an earlier mockup' : '') + (req.place ? ', at a named place' : '') + (ahead ? ', ' + ahead + ' ahead of it' : ''));
  say({ id: req.id, st: 'working', ahead, eta: 75 * (ahead + 1) }).catch((e) => log('ack failed:', e.message));   // the phone hears at once that the Mac is awake
  pump();
}
async function pump() {
  if (working) return;
  working = true;
  while (queue.length) {
    const job = queue.shift();
    current = job;
    try { fs.writeFileSync(BUSY, job.id); } catch (e) { /* only a courtesy to the installer */ }
    try { await handle(job); }
    catch (e) {
      if (!job.cancelled) {                                           // cancelled means the phone moved on: nothing to report
        log('job', job.id, 'failed:', e.message);
        try { await say({ id: job.id, st: 'error', msg: e instanceof UserError ? e.message : job.kind === 'check' ? 'Your Mac could not check the photo. Try again.' : 'Your Mac could not make the mockup. Try again.' }); } catch (e2) { /* phone will time out */ }
      }
    }
    finish(job.id);
    stayAwake();
  }
  try { fs.rmSync(BUSY, { force: true }); } catch (e) { /* none */ }
  current = null;
  working = false;
}
const DAY = path.join(HOME, 'day.json');
const madeToday = () => { const d = readJson(DAY, {}); return d.d === new Date().toDateString() ? d.n : 0; };
const noteOf = (hash) => readJson(path.join(CACHE, hash + '.json'), null);
// The photograph a change should be made to. Always the first one of its line, so a string of changes never wears the picture down.
function editBase(job) {
  if (!job.prev || job.fresh) return null;
  const pick = (h) => { const note = noteOf(h), jpg = path.join(CACHE, h + '.jpg'); return note && Array.isArray(note.lines) && note.scene === job.scene && fs.existsSync(jpg) ? { hash: h, note, jpg } : null; };
  const prev = noteOf(job.prev);
  const base = (prev && prev.root && pick(prev.root)) || pick(job.prev);
  if (!base) return null;
  const d = diffLines(base.note.lines, job.lines);
  return d.changed.length + d.gone.length || (base.note.look || 1) < LOOK ? base : null;      // nothing to change in the clothes, but the picture predates the current look
}
async function handle(job) {
  if (job.kind === 'check') return handleCheck(job);
  const hash = await briefHash(job.lines, job.scene);
  const cached = path.join(CACHE, hash + '.jpg'), noteFile = path.join(CACHE, hash + '.json');
  const had = fs.existsSync(cached) ? (noteOf(hash) || {}) : null;
  const hit = !!had && !job.fresh && (had.look || 1) >= LOOK;       // a picture from before the current look is made again
  let note = hit ? had : null;
  if (had && !hit && !job.fresh && !job.prev) job.prev = hash;      // and it is made again as an edit of itself
  if (!hit) {
    if (madeToday() >= cfg.maxPerDay) throw new UserError('Your Mac has made its limit of mockups for today.');
    const base = editBase(job);
    if (base) {
      try {
        await editImage(job, base, cached);
        note = { lines: job.lines, scene: job.scene, root: base.hash === hash ? undefined : base.hash, where: base.note.where || '', miss: !!base.note.miss, how: 'edit' };
        try { const now = new Date(); fs.utimesSync(base.jpg, now, now); fs.utimesSync(path.join(CACHE, base.hash + '.json'), now, now); } catch (e) { /* still in use either way */ }
      } catch (e) {
        if (job.cancelled) throw e;
        log('job', job.id, 'the edit did not work (' + e.message + '), making it from scratch');
      }
    }
    if (!note) {
      const place = job.place ? await lookUp(job) : null;
      await makeImage(job, place, cached);
      note = { lines: job.lines, scene: job.scene, where: place ? place.name : '', miss: !!job.place && !place, how: 'new' };
    }
    note.at = Date.now(); note.look = LOOK;
    fs.writeFileSync(noteFile, JSON.stringify(note));
    fs.writeFileSync(DAY, JSON.stringify({ d: new Date().toDateString(), n: madeToday() + 1 }));
  }
  const jpg = fs.readFileSync(cached);
  const pair = await newPair();
  const sealed = await sealBytes(await sessionKey(pair.priv, job.pub, job.id), jpg);
  await say({ id: job.id, st: 'done', pub: pair.pub, how: hit ? 'kept' : note.how, where: tidy(note.where, 60), miss: !!note.miss }, sealed);
  log('job', job.id, hit ? 'sent from cache' : note.how === 'edit' ? 'edited and sent' : 'made and sent', Math.round(jpg.length / 1024) + ' KB');
}

// ---------- the photo check ----------
// The phone asks first and sends the photograph second, sealed with a key made for that one check. The photograph is
// written to a job folder for ChatGPT to look at and removed as soon as the answer is read. It is never kept.
const pending = new Map();                                         // checks waiting for their photograph
async function onCheck(r) {
  if (!/^[0-9a-f]{16}$/.test(r.id || '') || typeof r.t !== 'number' || Math.abs(Date.now() - r.t) > 10 * 60 * 1000 || typeof r.pub !== 'string' || r.pub.length > 200) return;
  if (!Array.isArray(r.lines) || r.lines.length < 1 || r.lines.length > 14) return;
  const lines = r.lines.map((l) => tidy(l, 240));
  if (!lines.every((l) => /^[A-Z][A-Z ]{1,14}: \S/.test(l))) return;
  if (taken.has(r.id) || seen.has(r.id)) return;
  taken.add(r.id); seen.set(r.id, { t: Date.now(), done: true, tries: 1 }); saveSeen();      // never taken up again after a restart: its photograph would have to be sent again
  for (const [k, p] of pending) if (Date.now() - p.at > 5 * 60 * 1000) pending.delete(k);
  if (pending.size >= 4) { try { await say({ id: r.id, st: 'error', msg: 'Your Mac is busy. Try again in a minute.' }); } catch (e) { /* phone will time out */ } return; }
  const pair = await newPair();
  pending.set(r.id, { at: Date.now(), key: await sessionKey(pair.priv, r.pub, r.id), job: { id: r.id, kind: 'check', mode: r.mode === 'piece' ? 'piece' : 'look', occasion: tidy(r.occasion, 40), lines } });
  stayAwake();
  log('check', r.id, 'asked for,', lines.length, 'lines, waiting for the photo');
  say({ id: r.id, st: 'ready', pub: pair.pub }).catch((e) => log('ack failed:', e.message));
}
async function onPhoto(r, m) {
  const p = pending.get(r.id);
  if (!p || !m.attachment || !m.attachment.url || typeof r.t !== 'number' || Math.abs(Date.now() - r.t) > 10 * 60 * 1000) return;
  pending.delete(r.id);
  try {
    const url = String(m.attachment.url);
    if (!url.startsWith(RELAY + '/file/')) throw new UserError('The photo did not arrive. Try again.');
    if ((m.attachment.size || 0) > 6e6) throw new UserError('That photo is too large.');
    const res = await fetch(url);
    if (!res.ok) throw new UserError('The photo did not arrive. Try again.');
    const plain = await openBytes(p.key, await res.arrayBuffer());
    const bytes = plain ? Buffer.from(plain) : null;
    if (!bytes || bytes.length < 2000 || !(bytes[0] === 0xff && bytes[1] === 0xd8)) throw new UserError('The photo arrived damaged. Try again.');     // a JPEG, and nothing else
    if (queue.length >= 3) throw new UserError('Your Mac is busy with other work. Try again in a minute.');
    const job = Object.assign(p.job, { photo: bytes, key: p.key });
    const ahead = queue.length + (working ? 1 : 0);
    queue.push(job);
    log('check', job.id, 'photo received,', Math.round(bytes.length / 1024) + ' KB' + (ahead ? ', ' + ahead + ' ahead of it' : ''));
    say({ id: job.id, st: 'working', ahead }).catch(() => {});
    pump();
  } catch (e) {
    log('check', r.id, 'failed:', e.message);
    try { await say({ id: r.id, st: 'error', msg: e instanceof UserError ? e.message : 'Your Mac could not read the photo. Try again.' }); } catch (e2) { /* phone will time out */ }
  }
}
const CHECKS = path.join(HOME, 'checks.json');
async function handleCheck(job) {
  const d = readJson(CHECKS, {}), n = d.d === new Date().toDateString() ? d.n : 0;
  if (n >= (cfg.maxChecksPerDay || 80)) throw new UserError('Your Mac has made its limit of photo checks for today.');
  const dir = path.join(HOME, 'jobs', job.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'look.jpg'), job.photo);
  job.photo = null;
  const started = Date.now();
  let said = '';
  try {
    await run(cfg.codex, ['exec', '--skip-git-repo-check', '-s', 'read-only', '-c', 'model_reasoning_effort="medium"', '-C', dir, '-i', 'look.jpg', '-o', 'last.txt', '-'], checkTask(job.lines, { mode: job.mode, occasion: job.occasion }), { cwd: dir, timeoutMs: 150000, job });
    said = fs.readFileSync(path.join(dir, 'last.txt'), 'utf8').trim();
  } catch (e) { if (e instanceof UserError) throw e; said = ''; }
  finally { job.child = null; fs.rmSync(dir, { recursive: true, force: true }); }       // the photograph does not stay on the Mac
  if (job.cancelled) throw new Error('cancelled');
  const result = parseCheck(said, job.mode);
  if (!result) throw new UserError('ChatGPT could not judge that photo. Take it again with the whole look in frame and in good light.');
  fs.writeFileSync(CHECKS, JSON.stringify({ d: new Date().toDateString(), n: n + 1 }));
  await say({ id: job.id, st: 'checked' }, await sealBytes(job.key, Buffer.from(JSON.stringify(result))));
  log('check', job.id, 'done in', Math.round((Date.now() - started) / 1000) + 's:', result.verdict);
}

// ---------- the place ----------
// What a place he named looks like, asked of ChatGPT with web search, once per place. The answer only ever describes a backdrop.
const PLACES = path.join(HOME, 'places.json');
async function lookUp(job) {
  const city = tidy(profile.city, 60);
  const key = (job.place.name + '|' + city).toLowerCase();
  const all = readJson(PLACES, {});
  const had = all[key];
  if (had && Date.now() - had.at < (had.text ? 90 * 86400000 : 30 * 60000)) return had.text ? decorate(had, job) : null;      // a place not found is asked about again after half an hour
  const dir = path.join(HOME, 'jobs', job.id + '-place');
  fs.mkdirSync(dir, { recursive: true });
  const started = Date.now();
  const ask = async (task, effort) => {
    try {
      fs.rmSync(path.join(dir, 'last.txt'), { force: true });
      await run(cfg.codex, ['--search', 'exec', '--skip-git-repo-check', '-s', 'read-only', '-c', `model_reasoning_effort="${effort}"`, '-C', dir, '-o', 'last.txt', '-'], task, { cwd: dir, timeoutMs: 90000, job });
      return fs.readFileSync(path.join(dir, 'last.txt'), 'utf8').trim();
    } catch (e) { return ''; }
  };
  let said = await ask(placeTask(job.place.name, job.place.kind, city, false), 'low');
  // nothing under that spelling: he types fast, so look once more for the place the name sounds like
  if (readPlace(said) === 'unknown' && !job.cancelled) said = await ask(placeTask(job.place.name, job.place.kind, city, true), 'medium');
  job.child = null;
  fs.rmSync(dir, { recursive: true, force: true });
  if (job.cancelled) throw new Error('cancelled');
  const read = readPlace(said);
  const found = read && read !== 'unknown' ? Object.assign({ at: Date.now() }, read) : null;
  if (!read) { log('job', job.id, 'the place could not be looked up'); return null; }           // no answer at all: ask again next time
  all[key] = found && found.name && found.text ? found : { at: Date.now(), name: '', text: '' };
  try { fs.writeFileSync(PLACES, JSON.stringify(all)); } catch (e) { /* asked again next time */ }
  log('job', job.id, all[key].text ? 'place found' : 'place not found', 'in', Math.round((Date.now() - started) / 1000) + 's');
  return all[key].text ? decorate(all[key], job) : null;
}
const decorate = (found, job) => ({ name: found.name, scene: sceneOf(found, job.place.when) });

// ---------- the picture ----------
const HEADER = 'Use your built-in image generation tool to make ONE image. Do not write code to draw it. The attached photo me.jpg is the reference for the man. If it is a mirror selfie, leave out the mirror, its frame and the phone in his hands, and show him directly with his hands relaxed at his sides. Portrait orientation, 2:3. When the image exists, save or copy it into the current directory as mockup.png and reply with only that file path. Image brief:';
function run(cmd, args, input, { cwd, timeoutMs, job }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    if (job) job.child = child;
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new UserError('ChatGPT took too long. Try again.')); }, timeoutMs);
    const keep = (d) => { out = (out + d).slice(-200000); };          // only the end matters, and it can be megabytes of picture data
    child.stdout.on('data', keep); child.stderr.on('data', keep);
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
    child.stdin.end(input);
  });
}
// The path of the tool's own copy of the picture, found by plain scanning: a pattern search stalls for minutes on output
// that holds a long unbroken run of characters, such as picture data.
function keptPng(out) {
  const mark = '.codex/generated_images/';
  const stop = (c) => c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === "'" || c === '"';
  for (let at = out.lastIndexOf(mark); at >= 0; at = at > 0 ? out.lastIndexOf(mark, at - 1) : -1) {
    let a = at, b = at + mark.length;
    while (a > 0 && at - a < 300 && !stop(out[a - 1])) a--;
    while (b < out.length && b - at < 300 && !stop(out[b])) b++;
    const p = out.slice(a, b);
    if (p.startsWith('/') && p.endsWith('.png')) return p;
  }
  return null;
}
const EDIT_HEADER = 'Use your built-in image generation tool to make ONE image. Do not write code to draw it. Two photos are attached: prev.jpg first, then me.jpg. Portrait orientation, 2:3. When the image exists, save or copy it into the current directory as mockup.png and reply with only that file path. Image brief:';
const CODEX = ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-c', 'model_reasoning_effort="low"'];
async function makeImage(job, place, outJpg) {
  return draw(job, outJpg, ['-i', 'me.jpg'], [HEADER, '', promptFrom(job.lines, place ? place.scene : job.scene, 1)].join('\n'), null);
}
// A change to a fit that already has a mockup: the same photograph, with only the changed pieces replaced.
async function editImage(job, base, outJpg) {
  return draw(job, outJpg, ['-i', 'prev.jpg', '-i', 'me.jpg'], [EDIT_HEADER, '', editPromptFrom(base.note.lines, job.lines)].join('\n'), base.jpg);
}
async function draw(job, outJpg, images, task, prevJpg) {
  const dir = path.join(HOME, 'jobs', job.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(abs(cfg.photo), path.join(dir, 'me.jpg'));
  if (prevJpg) fs.copyFileSync(prevJpg, path.join(dir, 'prev.jpg'));
  const started = Date.now();
  // The image tool sometimes hangs without an answer. A picture normally takes one to two minutes, so after three it is
  // asked once more, which still fits inside the time the phone waits.
  let res = null;
  for (let attempt = 1; !res; attempt++) {
    try { res = await run(cfg.codex, [...CODEX, '-C', dir, ...images, '-o', 'last.txt', '-'], task, { cwd: dir, timeoutMs: 170000, job }); }
    catch (e) {
      job.child = null;
      if (job.cancelled || attempt >= 2 || !(e instanceof UserError)) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
      log('job', job.id, 'the image tool stalled, asking once more');
      fs.rmSync(path.join(dir, 'mockup.png'), { force: true }); fs.rmSync(path.join(dir, 'last.txt'), { force: true });
    }
  }
  const { code, out } = res;
  job.child = null;
  if (job.cancelled) { fs.rmSync(dir, { recursive: true, force: true }); throw new Error('cancelled'); }
  const kept = keptPng(out);                                          // the tool's own copy of this picture
  let png = path.join(dir, 'mockup.png');
  if (!fs.existsSync(png) && kept && fs.existsSync(kept)) png = kept;
  if (!fs.existsSync(png)) {
    log('job', job.id, 'no picture, exit', code, 'after', Math.round((Date.now() - started) / 1000) + 's:', out.slice(-300).replace(/\s+/g, ' '));
    fs.rmSync(dir, { recursive: true, force: true });
    throw new UserError(/usage limit|rate limit|quota/i.test(out) ? 'Your ChatGPT plan has reached its limit for now. Try again later.' : /not logged in|login/i.test(out.slice(-600)) ? 'The ChatGPT app on your Mac is signed out. Sign in to it, then try again.' : 'ChatGPT did not return a picture. Try again.');
  }
  await new Promise((resolve, reject) => execFile('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', '1536', png, '--out', outJpg], (e) => (e ? reject(e) : resolve())));
  if (kept) { try { fs.rmSync(kept); fs.rmdirSync(path.dirname(kept)); } catch (e) { /* not ours to force */ } }
  fs.rmSync(dir, { recursive: true, force: true });
  log('job', job.id, prevJpg ? 'picture edited in' : 'picture made in', Math.round((Date.now() - started) / 1000) + 's');
}

// ---------- listen: one open connection to the relay, reopened whenever it drops (a sleeping Mac drops it) ----------
const td = new TextDecoder();
let inbox = Promise.resolve();
let since = String(Math.floor(Date.now() / 1000) - 600);
for (;;) {
  await announce();
  let lastData = Date.now();
  const ctl = new AbortController();
  const dog = setInterval(() => { if (Date.now() - lastData > 150000) ctl.abort(); }, 10000);
  try {
    const res = await fetch(`${RELAY}/${link.req}/json?since=${since}`, { signal: ctl.signal });
    if (!res.ok) throw new Error('relay answered ' + res.status);
    const reader = res.body.getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      lastData = Date.now();
      buf += td.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let m = null; try { m = JSON.parse(line); } catch (e) { continue; }
        if (m.event === 'message') { since = m.id; inbox = inbox.then(() => onMessage(m)).catch((e) => log('bad message:', e.message)); }
      }
    }
  } catch (e) { if (e.name !== 'AbortError') log('connection:', e.message); }
  clearInterval(dog);
  await sleep(4000);
}
