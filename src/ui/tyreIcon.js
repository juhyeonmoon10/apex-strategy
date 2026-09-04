// 타이어 아이콘 — 피렐리 전략 그래픽의 정면 타이어를 SVG 로 재현.
//   검정 타이어 · 사이드월 바깥쪽의 얇은 컴파운드 링 · 상단 사이드월 글자 · 은색 스포크 림
// assets/tyres/*.png 가 있으면(assets.js TYRE_IMAGES) 그 파일을 우선 쓰고, 없으면 SVG.
import { COMPOUND_COLOR, COMPOUND_KO } from '../engine/params.js';
import { TYRE_IMAGES, tyreImage } from '../data/assets.js';

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  kids.forEach((k) => k != null && el.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return el;
}

let uid = 0;

export function tyreIcon(compound, size = 44) {
  if (TYRE_IMAGES) {
    const img = document.createElement('img');
    img.src = tyreImage(compound);
    img.width = size; img.height = size;
    img.alt = `${COMPOUND_KO[compound] || compound} 타이어`;
    img.className = `tyre-icon tyre-img c-${compound}`;
    img.addEventListener('error', () => img.replaceWith(tyreSvg(compound, size)), { once: true });
    return img;
  }
  return tyreSvg(compound, size);
}

export function tyreSvg(compound, size = 44) {
  const color = COMPOUND_COLOR[compound] || COMPOUND_COLOR.MEDIUM;
  const id = `ty${++uid}`;
  const svg = s('svg', {
    viewBox: '0 0 100 100', width: size, height: size,
    class: `tyre-icon c-${compound}`, role: 'img',
    'aria-label': `${COMPOUND_KO[compound] || compound} 타이어`,
  });

  const defs = s('defs');
  // 타이어 고무 — 좌상단 하이라이트
  const rub = s('radialGradient', { id: `${id}r`, cx: '35%', cy: '30%', r: '75%' });
  rub.append(s('stop', { offset: '0', 'stop-color': '#2c3037' }));
  rub.append(s('stop', { offset: '0.6', 'stop-color': '#14161a' }));
  rub.append(s('stop', { offset: '1', 'stop-color': '#050607' }));
  defs.append(rub);
  // 림 — 은색 금속
  const rim = s('linearGradient', { id: `${id}m`, x1: '0', y1: '0', x2: '1', y2: '1' });
  rim.append(s('stop', { offset: '0', 'stop-color': '#d9dde3' }));
  rim.append(s('stop', { offset: '0.5', 'stop-color': '#8c9198' }));
  rim.append(s('stop', { offset: '1', 'stop-color': '#4a4f57' }));
  defs.append(rim);
  // 사이드월 글자 경로
  defs.append(s('path', { id: `${id}t`, d: 'M 18 50 A 32 32 0 0 1 82 50', fill: 'none' }));
  svg.append(defs);

  // 분리 링 → 어떤 배경에서도 경계가 산다
  svg.append(s('circle', { cx: 50, cy: 50, r: 49.5, fill: '#0a0b0d' }));
  // 고무
  svg.append(s('circle', { cx: 50, cy: 50, r: 47.5, fill: `url(#${id}r)` }));
  // 트레드 가장자리 얇은 광택
  svg.append(s('circle', { cx: 50, cy: 50, r: 46, fill: 'none', stroke: '#3a3f47', 'stroke-width': 1 }));
  // 컴파운드 링 — 사이드월 바깥쪽, 얇게
  svg.append(s('circle', { cx: 50, cy: 50, r: 41.5, fill: 'none', stroke: color, 'stroke-width': 4 }));
  // 사이드월 글자 (브랜드 자리 — 우리 이름)
  const txt = s('text', {
    'font-family': "'Barlow Condensed', sans-serif", 'font-size': 9.5, 'font-weight': 800,
    'letter-spacing': 1.6, fill: '#f2f4f7', opacity: 0.92,
  });
  const tp = s('textPath', { href: `#${id}t`, startOffset: '50%', 'text-anchor': 'middle' }, 'COMPOUND');
  txt.append(tp);
  svg.append(txt);
  // 림
  svg.append(s('circle', { cx: 50, cy: 50, r: 30, fill: '#1a1d22' }));
  svg.append(s('circle', { cx: 50, cy: 50, r: 30, fill: 'none', stroke: `url(#${id}m)`, 'stroke-width': 2.5 }));
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const a2 = a + 0.28;
    // 두 갈래 스포크 (Y-스포크 느낌)
    svg.append(s('path', {
      d: `M ${50 + Math.cos(a) * 8} ${50 + Math.sin(a) * 8} L ${50 + Math.cos(a - 0.14) * 27} ${50 + Math.sin(a - 0.14) * 27} L ${50 + Math.cos(a + 0.14) * 27} ${50 + Math.sin(a + 0.14) * 27} Z`,
      fill: `url(#${id}m)`,
    }));
    svg.append(s('path', {
      d: `M ${50 + Math.cos(a2 + 0.35) * 8} ${50 + Math.sin(a2 + 0.35) * 8} L ${50 + Math.cos(a2 + 0.35) * 26} ${50 + Math.sin(a2 + 0.35) * 26}`,
      stroke: '#6a6f77', 'stroke-width': 1.2, opacity: 0.5,
    }));
  }
  svg.append(s('circle', { cx: 50, cy: 50, r: 8.5, fill: '#0a0b0d' }));
  svg.append(s('circle', { cx: 50, cy: 50, r: 5.5, fill: `url(#${id}m)` }));
  svg.append(s('circle', { cx: 50, cy: 50, r: 2, fill: '#0a0b0d' }));
  return svg;
}
