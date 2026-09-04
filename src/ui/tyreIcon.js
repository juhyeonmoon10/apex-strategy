// 타이어 아이콘 — 피렐리 그래픽의 원형 타이어. SVG 오리지널.
// 사이드월 밴드가 컴파운드 색. 나머지는 무채색.
import { COMPOUND_COLOR, COMPOUND_KO } from '../engine/params.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  kids.forEach((k) => k != null && el.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return el;
}

/**
 * @param {string} compound  SOFT | MEDIUM | HARD | INTER | WET
 * @param {number} size      px
 * @param {object} [opt]     { label: boolean } 중앙에 약자 표시
 */
export function tyreIcon(compound, size = 44, opt = {}) {
  const color = COMPOUND_COLOR[compound] || COMPOUND_COLOR.MEDIUM;
  const svg = s('svg', {
    viewBox: '0 0 100 100', width: size, height: size,
    class: `tyre-icon c-${compound}`, role: 'img',
    'aria-label': `${COMPOUND_KO[compound] || compound} 타이어`,
  });

  const id = `ty-${compound}-${Math.random().toString(36).slice(2, 7)}`;
  const defs = s('defs');
  const g = s('radialGradient', { id, cx: '38%', cy: '35%', r: '70%' });
  g.append(s('stop', { offset: '0', 'stop-color': '#3a3f47' }));
  g.append(s('stop', { offset: '0.55', 'stop-color': '#1a1d22' }));
  g.append(s('stop', { offset: '1', 'stop-color': '#0a0b0d' }));
  defs.append(g);
  svg.append(defs);

  // 분리용 바깥 링 (어떤 배경 위에서도 경계가 산다)
  svg.append(s('circle', { cx: 50, cy: 50, r: 49, fill: '#0a0b0d' }));
  // 트레드
  svg.append(s('circle', { cx: 50, cy: 50, r: 46, fill: `url(#${id})` }));
  // 컴파운드 밴드
  svg.append(s('circle', { cx: 50, cy: 50, r: 37, fill: 'none', stroke: color, 'stroke-width': 7 }));
  svg.append(s('circle', { cx: 50, cy: 50, r: 32.5, fill: 'none', stroke: '#0a0b0d', 'stroke-width': 1.5 }));
  // 림
  svg.append(s('circle', { cx: 50, cy: 50, r: 30, fill: '#1f232a' }));
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI * 2) / 10;
    svg.append(s('line', {
      x1: 50 + Math.cos(a) * 9, y1: 50 + Math.sin(a) * 9,
      x2: 50 + Math.cos(a) * 27, y2: 50 + Math.sin(a) * 27,
      stroke: '#3a3f47', 'stroke-width': 4, 'stroke-linecap': 'round',
    }));
  }
  svg.append(s('circle', { cx: 50, cy: 50, r: 9, fill: '#0a0b0d' }));
  svg.append(s('circle', { cx: 50, cy: 50, r: 5, fill: '#2a2e36' }));

  if (opt.label) {
    svg.append(s('text', {
      x: 50, y: 55, 'text-anchor': 'middle', 'font-size': 18, 'font-weight': 800,
      'font-family': "'Barlow Condensed', sans-serif", fill: '#f2f4f7',
    }, compound[0]));
  }
  return svg;
}
