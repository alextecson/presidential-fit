// A quiet colour block figure of the fit: instant, offline, and honest about being a sketch.
import { hexOf } from './engine.js';

const METAL = { gold: '#cfa94f', silver: '#b9c1cb', tortoise: '#6a4324' };
const shade = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

export function figureSvg(o, items) {
  const get = (id) => items.find((i) => i.id === id);
  const suit = o.suit ? get(o.suit) : null;
  const jacket = suit || (o.jacket && o.jacket !== 'none' ? get(o.jacket) : null);
  const top = get(o.top), bottom = get(o.suit || o.bottom), shoes = get(o.shoes);
  const belt = o.belt && o.belt !== 'none' ? get(o.belt) : null;
  const watch = get(o.watch), glasses = o.glasses ? get(o.glasses) : null;
  const hat = o.hat ? get(o.hat) : null, coat = o.coat ? get(o.coat) : null;
  const socks = o.socks ? get(o.socks) : null;

  const cTop = hexOf(top), cBot = hexOf(bottom), cJak = jacket ? hexOf(jacket) : null, cShoe = hexOf(shoes);
  const skin = '#c69c7b';
  const metal = METAL[(watch && watch.metal) || 'gold'];
  const untucked = o.tuck === 'untucked';
  const p = [];
  const stripe = top && top.pattern === 'stripe';
  const check = (it) => it && it.pattern === 'check';

  p.push(`<defs>
    <pattern id="pf-stripe" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="${cTop}"/><rect width="1.2" height="5" fill="${shade(cTop, -0.35)}" opacity=".55"/></pattern>
    <pattern id="pf-check" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="none"/><path d="M0 0H9M0 0V9" stroke="#ffffff" stroke-opacity=".16" stroke-width="1"/></pattern>
  </defs>`);
  const topFill = stripe ? 'url(#pf-stripe)' : cTop;

  // coat sits behind everything
  if (coat) p.push(`<path d="M58 96 L38 112 L28 300 L66 306 L70 150 Z M142 96 L162 112 L172 300 L134 306 L130 150 Z" fill="${hexOf(coat)}"/>`);
  // trousers
  p.push(`<path d="M70 196 L130 196 L136 388 L108 388 L100 250 L92 388 L64 388 Z" fill="${cBot}"/>`);
  if (check(bottom)) p.push(`<path d="M70 196 L130 196 L136 388 L108 388 L100 250 L92 388 L64 388 Z" fill="url(#pf-check)"/>`);
  p.push(`<path d="M100 250 L100 388" stroke="${shade(cBot, -0.12)}" stroke-width="1"/>`);
  // socks peek and shoes
  if (socks && socks.sub !== 'no-show') p.push(`<rect x="66" y="384" width="26" height="6" fill="${hexOf(socks)}"/><rect x="108" y="384" width="26" height="6" fill="${hexOf(socks)}"/>`);
  p.push(`<path d="M58 400 Q60 388 78 389 L93 390 L93 402 Z" fill="${cShoe}"/><path d="M142 400 Q140 388 122 389 L107 390 L107 402 Z" fill="${cShoe}"/>`);
  p.push(`<rect x="57" y="400" width="37" height="3.5" rx="1.5" fill="${shade(cShoe, shoes && shoes.sub === 'sneaker' ? -0.08 : -0.18)}"/><rect x="106" y="400" width="37" height="3.5" rx="1.5" fill="${shade(cShoe, shoes && shoes.sub === 'sneaker' ? -0.08 : -0.18)}"/>`);
  // shirt body
  const hem = untucked ? 214 : 198;
  p.push(`<path d="M66 100 Q100 88 134 100 L132 ${hem} L68 ${hem} Z" fill="${topFill}"/>`);
  // belt
  if (belt && !untucked) p.push(`<rect x="69" y="194" width="62" height="7" fill="${hexOf(belt)}"/><rect x="95.5" y="193" width="9" height="9" rx="1.5" fill="none" stroke="${METAL[belt.metal] || metal}" stroke-width="2"/>`);
  // arms: sleeves in the outer layer colour
  const sleeve = cJak || cTop;
  const shortSleeve = !jacket && top && ['polo', 'camp-shirt', 'tee'].includes(top.sub);
  if (shortSleeve) {
    p.push(`<path d="M66 100 L46 116 L42 160 L56 163 L62 128 Z M134 100 L154 116 L158 160 L144 163 L138 128 Z" fill="${topFill}"/>`);
    p.push(`<path d="M43 160 L40 226 L50 228 L56 163 Z M157 160 L160 226 L150 228 L144 163 Z" fill="${skin}"/>`);
  } else {
    p.push(`<path d="M66 100 L46 116 L38 222 L52 225 L62 130 Z M134 100 L154 116 L162 222 L148 225 L138 130 Z" fill="${cJak ? sleeve : topFill}"/>`);
    if (jacket) p.push(`<rect x="38.5" y="220" width="13.5" height="3.5" fill="${cTop}"/><rect x="148" y="220" width="13.5" height="3.5" fill="${cTop}"/>`);
  }
  // hands and the watch on his left wrist
  p.push(`<ellipse cx="45" cy="233" rx="7" ry="8.5" fill="${skin}"/><ellipse cx="155" cy="233" rx="7" ry="8.5" fill="${skin}"/>`);
  p.push(`<rect x="147.5" y="223.5" width="14.5" height="4.5" rx="1.5" fill="${metal}"/>`);
  // jacket fronts
  if (jacket) {
    const len = jacket.unstructured && jacket.casual ? 204 : 226;
    p.push(`<path d="M66 100 L92 104 L98 ${len - 60} L96 ${len} L64 ${len} Z M134 100 L108 104 L102 ${len - 60} L104 ${len} L136 ${len} Z" fill="${cJak}"/>`);
    if (check(jacket)) p.push(`<path d="M66 100 L92 104 L98 ${len - 60} L96 ${len} L64 ${len} Z M134 100 L108 104 L102 ${len - 60} L104 ${len} L136 ${len} Z" fill="url(#pf-check)"/>`);
    p.push(`<path d="M92 104 L100 150 L108 104" fill="none" stroke="${shade(cJak, -0.14)}" stroke-width="1.4"/>`);
    p.push(`<path d="M80 101 L92 104 L88 128 Z M120 101 L108 104 L112 128 Z" fill="${shade(cJak, 0.07)}"/>`);
    if (!jacket.casual) p.push(`<circle cx="100" cy="${len - 56}" r="1.8" fill="${shade(cJak, -0.25)}"/>`);
  }
  // collar and neck
  p.push(`<rect x="92" y="78" width="16" height="18" fill="${skin}"/>`);
  if (top && top.sub !== 'tee') p.push(`<path d="M86 94 L100 106 L114 94 L108 88 L100 98 L92 88 Z" fill="${shade(cTop, top.color === 'white' ? -0.06 : 0.08)}"/>`);
  else p.push(`<path d="M88 93 Q100 104 112 93" fill="none" stroke="${shade(cTop, -0.2)}" stroke-width="2"/>`);
  // head, hair, glasses
  p.push(`<ellipse cx="100" cy="56" rx="21" ry="25" fill="${skin}"/>`);
  if (!hat) p.push(`<path d="M79 52 Q80 28 100 28 Q120 28 121 52 Q112 38 100 38 Q88 38 79 52 Z" fill="#4a4a4d"/>`);
  if (glasses) {
    const g = METAL[glasses.metal] || '#333';
    p.push(`<rect x="83" y="52" width="14" height="10" rx="3" fill="none" stroke="${g}" stroke-width="2"/><rect x="103" y="52" width="14" height="10" rx="3" fill="none" stroke="${g}" stroke-width="2"/><path d="M97 56 H103" stroke="${g}" stroke-width="1.6"/>`);
  }
  if (hat) {
    const h = hexOf(hat);
    p.push(`<ellipse cx="100" cy="40" rx="35" ry="6.5" fill="${h}"/><path d="M80 40 Q80 16 100 16 Q120 16 120 40 Z" fill="${h}"/><rect x="80" y="33" width="40" height="5" fill="${shade(h, -0.25)}"/>`);
  }
  return `<svg viewBox="0 0 200 410" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Colour sketch of the outfit">${p.join('')}</svg>`;
}
