// Forecast for the home city from Open-Meteo (no account, no key): day figures plus hour by hour,
// so a fit is checked against the hours it is actually worn. Climate normals are the fallback.
import { kvGet, kvSet } from './store.js';
import { isoDate, daysBetween } from './engine.js';

const NORMALS = [[42, 28], [45, 30], [54, 37], [65, 46], [74, 55], [82, 64], [86, 69], [85, 68], [78, 61], [66, 49], [55, 40], [45, 31]];   // mild generic fallback
const WMO = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'snow', 73: 'snow', 75: 'snow', 80: 'showers', 81: 'showers', 82: 'heavy showers', 95: 'thunderstorms', 96: 'thunderstorms', 99: 'thunderstorms' };
export const FRESH_MS = 15 * 60 * 1000;      // a fit is never handed over on a forecast older than this, when a connection is there

export function normalFor(date, normals) {
  const m = new Date(date + 'T12:00:00').getMonth();
  const n = (normals && normals[m]) || NORMALS[m];
  return { hi: n[0], lo: n[1], rain: 5, text: 'seasonal average', estimate: true };
}

export async function loadForecast(profile, force = false, maxAge = FRESH_MS) {
  const cached = await kvGet('weather').catch(() => null);
  if (profile.lat == null || profile.lon == null) return { at: 0, lat: null, days: {}, normals: profile.normals };
  const mine = cached && cached.lat === profile.lat && (cached.lon == null || cached.lon === profile.lon) ? cached : null;
  if (!force && mine && mine.hours && Date.now() - mine.at < maxAge) return mine;
  try {
    const u = new URL('https://api.open-meteo.com/v1/forecast');
    u.search = new URLSearchParams({
      latitude: profile.lat, longitude: profile.lon, timezone: profile.tz || 'auto', forecast_days: '14',
      temperature_unit: 'fahrenheit', wind_speed_unit: 'mph',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
      hourly: 'temperature_2m,precipitation_probability,wind_speed_10m',
    }).toString();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(u, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error('weather ' + res.status);
    const j = await res.json();
    const days = {};
    j.daily.time.forEach((d, i) => {
      days[d] = { hi: Math.round(j.daily.temperature_2m_max[i]), lo: Math.round(j.daily.temperature_2m_min[i]), rain: j.daily.precipitation_probability_max[i] || 0, text: WMO[j.daily.weather_code[i]] || '' };
    });
    let hours = null;
    if (j.hourly && j.hourly.time && j.hourly.time.length) {
      hours = { start: j.hourly.time[0].slice(0, 10), t: j.hourly.temperature_2m.map((v) => (v == null ? null : Math.round(v))), r: (j.hourly.precipitation_probability || []).map((v) => v || 0), w: (j.hourly.wind_speed_10m || []).map((v) => Math.round(v || 0)) };
    }
    const out = { at: Date.now(), lat: profile.lat, lon: profile.lon, days, hours, normals: profile.normals };
    await kvSet('weather', out);
    return out;
  } catch (e) {
    return mine || { at: 0, lat: profile.lat, lon: profile.lon, days: {}, hours: null, normals: profile.normals };
  }
}

// Share of the day's swing above the low, hour by hour: coolest near 6 AM, warmest near 3 PM. Used when no hourly figures exist.
const CURVE = [[0, 0.22], [6, 0], [10, 0.55], [15, 1], [18, 0.72], [21, 0.42], [24, 0.22], [30, 0]];
function curveAt(h) {
  for (let i = 1; i < CURVE.length; i++) {
    if (h <= CURVE[i][0]) { const [a, fa] = CURVE[i - 1], [b, fb] = CURVE[i]; return fa + (fb - fa) * (h - a) / (b - a); }
  }
  return 0;
}

// Weather for a day. With win = { from, to } (hours; 24 and up runs past midnight) hi and lo cover just those hours.
export function weatherFor(forecast, date, win) {
  const day = (forecast && forecast.days && forecast.days[date]) || null;
  const base = day ? Object.assign({ estimate: false }, day) : normalFor(date, forecast && forecast.normals);
  base.dayHi = base.hi; base.dayLo = base.lo;
  base.at = day && forecast ? forecast.at : 0;
  if (!win) return base;
  const from = Math.max(0, Math.floor(win.from)), to = Math.max(from, Math.ceil(win.to));
  const h = forecast && forecast.hours;
  if (h && day) {
    const off = daysBetween(h.start, date) * 24;
    const ts = [], rs = [], ws = [];
    for (let i = off + from; i <= off + to && i < h.t.length; i++) {
      if (i < 0 || h.t[i] == null) continue;
      ts.push(h.t[i]); rs.push(h.r[i] || 0); ws.push(h.w[i] || 0);
    }
    if (ts.length) return Object.assign(base, { hi: Math.max(...ts), lo: Math.min(...ts), rain: Math.max(...rs), wind: Math.max(...ws), startT: ts[0], endT: ts[ts.length - 1], hourly: true });
  }
  const swing = base.dayHi - base.dayLo, ts = [];
  for (let x = from; x <= to; x++) ts.push(Math.round(base.dayLo + swing * curveAt(x)));
  return Object.assign(base, { hi: Math.max(...ts), lo: Math.min(...ts), startT: ts[0], endT: ts[ts.length - 1], hourly: false });
}
export const today = () => isoDate(new Date());
