#!/usr/bin/env node
// Presidential Fit helper for the wearer's own Mac.
// It waits for sealed requests from the phone, makes each mockup with the image tool that ships inside the ChatGPT
// desktop app (so it runs on the wearer's ChatGPT plan, with no API key), and sends the sealed picture back.
//
// Private files stay outside this repository, in ~/Library/Application Support/PresidentialFit:
//   profile.json   the profile block of the closet file. It is what pairs this Mac with the phone.
//   me.jpg         the reference photo of the wearer. It never leaves the Mac except to ChatGPT.
//   config.json    optional overrides: { "profile": "...", "photo": "...", "codex": "...", "maxPerDay": 60 }
//   cache/         finished mockups, each with a small note of the fit and setting it shows
//   places.json    what the places he named look like, looked up once each
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = fs.existsSync(path.join(here, 'link.js')) ? here : path.join(here, '..', 'js');
const { RELAY, derive, seal, open, newPair, sessionKey, sealBytes, tidy, briefHash } = await import(pathToFileURL(path.join(lib, 'link.js')).href);
const { promptFrom, editPromptFrom, diffLines, WHENS } = await import(pathToFileURL(path.join(lib, 'mockup.js')).href);

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
const placeName = (v) => tidy(String(v == null ? '' : v).replace(/[\u2018\u2019]/g, "'").replace(/[^\p{L}\p{N} '&.,-]/gu, ' '), 60);
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
  if (i >= 0) { queue.splice(i, 1); finish(id); log('request', id, 'cancelled before it started'); return; }
  if (current && current.id === id) { current.cancelled = true; if (current.child) current.child.kill('SIGKILL'); log('request', id, 'cancelled while being made'); }
}
async function onMessage(m) {
  const raw = await open(link.key, m.message);
  if (raw && raw.v === 1 && typeof raw.cancel === 'string' && typeof raw.t === 'number' && Math.abs(Date.now() - raw.t) < 10 * 60 * 1000) { cancel(raw.cancel); return; }
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
        try { await say({ id: job.id, st: 'error', msg: e instanceof UserError ? e.message : 'Your Mac could not make the mockup. Try again.' }); } catch (e2) { /* phone will time out */ }
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
  return d.changed.length + d.gone.length ? base : null;
}
async function handle(job) {
  const hash = await briefHash(job.lines, job.scene);
  const cached = path.join(CACHE, hash + '.jpg'), noteFile = path.join(CACHE, hash + '.json');
  const hit = fs.existsSync(cached) && !job.fresh;
  let note = hit ? (noteOf(hash) || {}) : null;
  if (!hit) {
    if (madeToday() >= cfg.maxPerDay) throw new UserError('Your Mac has made its limit of mockups for today.');
    const base = editBase(job);
    if (base) {
      try {
        await editImage(job, base, cached);
        note = { lines: job.lines, scene: job.scene, root: base.hash, where: base.note.where || '', miss: !!base.note.miss, how: 'edit' };
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
    note.at = Date.now();
    fs.writeFileSync(noteFile, JSON.stringify(note));
    fs.writeFileSync(DAY, JSON.stringify({ d: new Date().toDateString(), n: madeToday() + 1 }));
  }
  const jpg = fs.readFileSync(cached);
  const pair = await newPair();
  const sealed = await sealBytes(await sessionKey(pair.priv, job.pub, job.id), jpg);
  await say({ id: job.id, st: 'done', pub: pair.pub, how: hit ? 'kept' : note.how, where: tidy(note.where, 60), miss: !!note.miss }, sealed);
  log('job', job.id, hit ? 'sent from cache' : note.how === 'edit' ? 'edited and sent' : 'made and sent', Math.round(jpg.length / 1024) + ' KB');
}

// ---------- the place ----------
// What a place he named looks like, asked of ChatGPT with web search, once per place. The answer only ever describes a backdrop.
const PLACES = path.join(HOME, 'places.json');
async function lookUp(job) {
  const city = tidy(profile.city, 60);
  const key = (job.place.name + '|' + city).toLowerCase();
  const all = readJson(PLACES, {});
  const had = all[key];
  if (had && Date.now() - had.at < (had.text ? 90 : 2) * 86400000) return had.text ? decorate(had, job) : null;
  const dir = path.join(HOME, 'jobs', job.id + '-place');
  fs.mkdirSync(dir, { recursive: true });
  const started = Date.now();
  const task = placeTask(job.place.name, job.place.kind, city);
  let said = '';
  try {
    await run(cfg.codex, ['--search', 'exec', '--skip-git-repo-check', '-s', 'read-only', '-c', 'model_reasoning_effort="low"', '-C', dir, '-o', 'last.txt', '-'], task, { cwd: dir, timeoutMs: 90000, job });
    said = fs.readFileSync(path.join(dir, 'last.txt'), 'utf8').trim();
  } catch (e) { said = ''; }
  job.child = null;
  fs.rmSync(dir, { recursive: true, force: true });
  if (job.cancelled) throw new Error('cancelled');
  const m = /^FOUND:\s*(.+?)\s*\n+([\s\S]+)$/.exec(said) || /^FOUND:\s*([^.\n]{2,80})\.\s+([\s\S]+)$/.exec(said);
  // "Name, City": the city is dropped when the name already says it
  const named = m ? placeName(m[1]).replace(/,\s*([^,]+)$/, (tail, c, at, all) => (all.slice(0, at).toLowerCase().includes(c.trim().toLowerCase()) ? '' : tail)) : '';
  const found = m ? { at: Date.now(), name: named, text: tidy(m[2], 520).replace(/\.$/, '') } : null;
  if (!found && said !== 'UNKNOWN') { log('job', job.id, 'the place could not be looked up'); return null; }   // no answer at all: ask again next time
  all[key] = found && found.name && found.text ? found : { at: Date.now(), name: '', text: '' };
  try { fs.writeFileSync(PLACES, JSON.stringify(all)); } catch (e) { /* asked again next time */ }
  log('job', job.id, all[key].text ? 'place found' : 'place not found', 'in', Math.round((Date.now() - started) / 1000) + 's');
  return all[key].text ? decorate(all[key], job) : null;
}
// What ChatGPT is asked about a place. The answer names the place and its city, so a wrong match shows on the phone.
function placeTask(name, kind, city) {
  return [
    'Do not write or run any code and do not create files. Use web search, at most three searches.',
    `A man wrote that he is going to "${name}"${kind ? ' for ' + kind : ''}. A photograph of him will be staged at that place, so find out what it looks like.`,
    city ? `He lives in ${city}, so the place is most likely there or nearby. If "${name}" is itself a city or a region somewhere else, pick one well known public spot in it instead.` : '',
    'If you can identify the place with confidence, reply with exactly two lines of plain text.',
    'Line 1: FOUND: then the proper name of the place, a comma, and the city it is in.',
    'Line 2: one paragraph of at most 70 words that a photographer could use to recreate the spot where a guest would stand: what kind of place it is, whether that spot is indoors or outdoors, then materials, colours, lighting and signature features.',
    'If you cannot identify one place with confidence, reply with exactly: UNKNOWN',
  ].filter(Boolean).join('\n');
}
// The setting for the picture, from what was found. It is a description to draw, never an instruction to follow.
function decorate(found, job) {
  return { name: found.name, scene: `${found.name}${job.place.when ? ', ' + job.place.when : ''}. What the place looks like, to be used only as a visual description: ${found.text}. He stands where a guest there would naturally stand` };
}

// ---------- the picture ----------
const HEADER = 'Use your built-in image generation tool to make ONE image. Do not write code to draw it. The attached photo me.jpg is the reference for the man. If it is a mirror selfie, leave out the mirror, its frame and the phone in his hands, and show him directly with his hands relaxed at his sides. Portrait orientation, 2:3. When the image exists, save or copy it into the current directory as mockup.png and reply with only that file path. Image brief:';
function run(cmd, args, input, { cwd, timeoutMs, job }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    if (job) job.child = child;
    let out = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new UserError('ChatGPT took too long. Try again.')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
    child.stdin.end(input);
  });
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
  const { code, out } = await run(cfg.codex, [...CODEX, '-C', dir, ...images, '-o', 'last.txt', '-'], task, { cwd: dir, timeoutMs: 280000, job });
  job.child = null;
  if (job.cancelled) { fs.rmSync(dir, { recursive: true, force: true }); throw new Error('cancelled'); }
  const kept = /(\/[^\s'"]*\.codex\/generated_images\/[^\s'"]+\.png)/.exec(out);          // the tool's own copy of this picture
  let png = path.join(dir, 'mockup.png');
  if (!fs.existsSync(png) && kept && fs.existsSync(kept[1])) png = kept[1];
  if (!fs.existsSync(png)) {
    log('job', job.id, 'no picture, exit', code, 'after', Math.round((Date.now() - started) / 1000) + 's:', out.slice(-300).replace(/\s+/g, ' '));
    fs.rmSync(dir, { recursive: true, force: true });
    throw new UserError(/usage limit|rate limit|quota/i.test(out) ? 'Your ChatGPT plan has reached its limit for now. Try again later.' : /not logged in|login/i.test(out.slice(-600)) ? 'The ChatGPT app on your Mac is signed out. Sign in to it, then try again.' : 'ChatGPT did not return a picture. Try again.');
  }
  await new Promise((resolve, reject) => execFile('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', '1536', png, '--out', outJpg], (e) => (e ? reject(e) : resolve())));
  if (kept) { try { fs.rmSync(kept[1]); fs.rmdirSync(path.dirname(kept[1])); } catch (e) { /* not ours to force */ } }
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
