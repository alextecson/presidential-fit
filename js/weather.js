// Forecast for the home city from Open-Meteo (no account, no key). Cached for two hours, with climate normals as the fallback.
import { kvGet, kvSet } from './store.js';
import { isoDate } from './engine.js';

const NORMALS = [[42, 28], [45, 30], [54, 37], [65, 46], [74, 55], [82, 64], [86, 69], [85, 68], [78, 61], [66, 49], [55, 40], [45, 31]];   // mild generic fallback
const WMO = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'fog', 48: 'fog', 51: 'drizzle', 53: 'drizzle', 55: 'drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'snow', 73: 'snow', 75: 'snow', 80: 'showers', 81: 'showers', 82: 'heavy showers', 95: 'thunderstorms', 96: 'thunderstorms', 99: 'thunderstorms' };

export function normalFor(date, normals) {
  const m = new Date(date + 'T12:00:00').getMonth();
  const n = (normals && normals[m]) || NORMALS[m];
  return { hi: n[0], lo: n[1], rain: 5, text: 'seasonal average', estimate: true };
}

export async function loadForecast(profile, force = false) {
  const cached = await kvGet('weather').catch(() => null);
  if (profile.lat == null || profile.lon == null) return { at: 0, lat: null, days: {}, normals: profile.normals };
  if (!force && cached && Date.now() - cached.at < 2 * 3600 * 1000 && cached.lat === profile.lat) return cached;
  try {
    const u = new URL('https://api.open-meteo.com/v1/forecast');
    u.search = new URLSearchParams({
      latitude: profile.lat, longitude: profile.lon, timezone: profile.tz || 'auto', forecast_days: '14', temperature_unit: 'fahrenheit',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code',
    }).toString();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    const res = await fetch(u, { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('weather ' + res.status);
    const j = await res.json();
    const days = {};
    j.daily.time.forEach((d, i) => {
      days[d] = { hi: Math.round(j.daily.temperature_2m_max[i]), lo: Math.round(j.daily.temperature_2m_min[i]), rain: j.daily.precipitation_probability_max[i] || 0, text: WMO[j.daily.weather_code[i]] || '' };
    });
    const out = { at: Date.now(), lat: profile.lat, days, normals: profile.normals };
    await kvSet('weather', out);
    return out;
  } catch (e) {
    return cached || { at: 0, lat: profile.lat, days: {}, normals: profile.normals };
  }
}
export function weatherFor(forecast, date) {
  return (forecast && forecast.days && forecast.days[date]) || normalFor(date, forecast && forecast.normals);
}
export const today = () => isoDate(new Date());
