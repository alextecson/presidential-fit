#!/usr/bin/env node
// Presidential Fit helper for the wearer's own Mac.
// It waits for sealed requests from the phone, makes each mockup with the image tool that ships inside the ChatGPT
// desktop app (so it runs on the wearer's ChatGPT plan, with no API key), and sends the sealed picture back.
//
// Private files stay outside this repository, in ~/Library/Application Support/PresidentialFit:
//   profile.json   the profile block of the closet file. It is what pairs this Mac with the phone.
//   me.jpg         the reference photo of the wearer. It never leaves the Mac except to ChatGPT.
//   config.json    optional overrides: { "profile": "...", "photo": "...", "codex": "...", "maxPerDay": 40 }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = fs.existsSync(path.join(here, 'link.js')) ? here : path.join(here, '..', 'js');
const { RELAY, derive, seal, open, newPair, sessionKey, sealBytes } = await import(pathToFileURL(path.join(lib, 'link.js')).href);
const { promptFrom } = await import(pathToFileURL(path.join(lib, 'mockup.js')).href);

const HOME = process.env.PF_HOME || path.join(os.homedir(), 'Library', 'Application Support', 'PresidentialFit');
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; } };
const cfg = Object.assign({ profile: 'profile.json', photo: 'me.jpg', codex: '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex', maxPerDay: 40 }, readJson(path.join(HOME, 'config.json'), {}));
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
// one helper at a time
const PID = path.join(HOME, 'helper.pid');
const other = Number(readJson(PID, 0));
if (other && other !== process.pid) { try { process.kill(other, 0); log('another helper is already running, stopping this one'); process.exit(0); } catch (e) { /* stale */ } }
fs.writeFileSync(PID, String(process.pid));
const bye = () => { try { if (Number(readJson(PID, 0)) === process.pid) fs.rmSync(PID); } catch (e) { /* gone */ } process.exit(0); };
process.on('SIGTERM', bye); process.on('SIGINT', bye);

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
const tidy = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f`$\\<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
function checkRequest(r) {
  if (!r || r.v !== 1 || !/^[0-9a-f]{16}$/.test(r.id || '') || typeof r.t !== 'number' || typeof r.pub !== 'string' || r.pub.length > 200) return null;
  if (Math.abs(Date.now() - r.t) > 10 * 60 * 1000) return null;                       // old requests are not worth a picture
  if (!Array.isArray(r.lines) || r.lines.length < 3 || r.lines.length > 14) return null;
  const lines = r.lines.map((l) => tidy(l, 240));
  if (!lines.every((l) => /^[A-Z][A-Z ]{1,14}: \S/.test(l))) return null;             // "SLOT: description" and nothing else
  return { id: r.id, pub: r.pub, lines, scene: tidy(r.scene, 240) || 'a plain light grey photo studio backdrop', fresh: !!r.fresh };
}
// Requests already taken, kept on disk so a restart never makes the same mockup twice.
const SEEN = path.join(HOME, 'seen.json');
const seen = new Map(Object.entries(readJson(SEEN, {})));
const queue = [];
let working = false;
let current = null;                                                // the job being made, with its child process
function cancel(id) {
  const i = queue.findIndex((j) => j.id === id);
  if (i >= 0) { queue.splice(i, 1); log('request', id, 'cancelled before it started'); return; }
  if (current && current.id === id) { current.cancelled = true; if (current.child) current.child.kill('SIGKILL'); log('request', id, 'cancelled while being made'); }
}
async function onMessage(m) {
  const raw = await open(link.key, m.message);
  if (raw && raw.v === 1 && typeof raw.cancel === 'string' && typeof raw.t === 'number' && Math.abs(Date.now() - raw.t) < 10 * 60 * 1000) { cancel(raw.cancel); return; }
  const req = checkRequest(raw);
  if (!req || seen.has(req.id)) return;
  seen.set(req.id, Date.now());
  for (const [k, t] of seen) if (Date.now() - t > 3600 * 1000) seen.delete(k);
  try { fs.writeFileSync(SEEN, JSON.stringify(Object.fromEntries(seen))); } catch (e) { /* memory still holds it */ }
  if (queue.length >= 3) { try { await say({ id: req.id, st: 'error', msg: 'Your Mac is busy with other mockups. Try again in a minute.' }); } catch (e) { /* phone will time out */ } return; }
  const ahead = queue.length + (working ? 1 : 0);
  queue.push(req);
  log('request', req.id, req.lines.length + ' lines' + (ahead ? ', ' + ahead + ' ahead of it' : ''));
  say({ id: req.id, st: 'working', ahead, eta: 75 * (ahead + 1) }).catch((e) => log('ack failed:', e.message));   // the phone hears at once that the Mac is awake
  pump();
}
async function pump() {
  if (working) return;
  working = true;
  while (queue.length) {
    const job = queue.shift();
    current = job;
    try { await handle(job); }
    catch (e) {
      if (job.cancelled) continue;                                    // the phone moved on: nothing to report
      log('job', job.id, 'failed:', e.message);
      try { await say({ id: job.id, st: 'error', msg: e instanceof UserError ? e.message : 'Your Mac could not make the mockup. Try again.' }); } catch (e2) { /* phone will time out */ }
    }
  }
  current = null;
  working = false;
}
const DAY = path.join(HOME, 'day.json');
const madeToday = () => { const d = readJson(DAY, {}); return d.d === new Date().toDateString() ? d.n : 0; };
async function handle(job) {
  const hash = createHash('sha256').update(job.lines.join('\n') + '|' + job.scene).digest('hex').slice(0, 32);
  const cached = path.join(HOME, 'cache', hash + '.jpg');
  const hit = fs.existsSync(cached) && !job.fresh;
  if (!hit) {
    if (madeToday() >= cfg.maxPerDay) throw new UserError('Your Mac has made its limit of mockups for today.');
    await makeImage(job, cached);
    fs.writeFileSync(DAY, JSON.stringify({ d: new Date().toDateString(), n: madeToday() + 1 }));
  }
  const jpg = fs.readFileSync(cached);
  const pair = await newPair();
  const sealed = await sealBytes(await sessionKey(pair.priv, job.pub, job.id), jpg);
  await say({ id: job.id, st: 'done', pub: pair.pub }, sealed);
  log('job', job.id, hit ? 'sent from cache' : 'made and sent', Math.round(jpg.length / 1024) + ' KB');
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
async function makeImage(job, outJpg) {
  const dir = path.join(HOME, 'jobs', job.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(abs(cfg.photo), path.join(dir, 'me.jpg'));
  const started = Date.now();
  const { code, out } = await run(cfg.codex, ['exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', dir, '-i', 'me.jpg', '-o', 'last.txt', '-'], [HEADER, '', promptFrom(job.lines, job.scene, 1)].join('\n'), { cwd: dir, timeoutMs: 280000, job });
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
  log('job', job.id, 'picture made in', Math.round((Date.now() - started) / 1000) + 's');
}

// ---------- listen: one open connection to the relay, reopened whenever it drops (a sleeping Mac drops it) ----------
const td = new TextDecoder();
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
        if (m.event === 'message') { since = m.id; onMessage(m).catch((e) => log('bad message:', e.message)); }
      }
    }
  } catch (e) { if (e.name !== 'AbortError') log('connection:', e.message); }
  clearInterval(dog);
  await sleep(4000);
}
