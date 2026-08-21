// 오리지널 SVG 아트. 공식 이미지를 쓰지 않는 이유:
//   1) 저작권 — 팬 프로젝트라도 공식 렌더를 재배포하면 문제가 된다
//   2) 팀을 바꾸면 색이 즉시 따라온다 (이미지로는 불가능)
//   3) 네트워크 요청 0. 성능 예산에 영향 없음
//
// 타이어 사이드월 밴드만은 "데이터 영역" 규칙을 따라 컴파운드 색을 쓴다.

import { COMPOUND_COLOR, COMPOUND_KO } from '../engine/params.js';

const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  kids.forEach((k) => k && el.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return el;
}

/**
 * 2026 규정풍 F1 머신 측면도. 노즈가 오른쪽.
 * @param {object} team   colors 를 가진 팀
 * @param {object} driver num 을 가진 드라이버
 * @param {string} compound 현재 타이어 — 사이드월 밴드 색
 */
export function carSvg(team, driver, compound = 'MEDIUM') {
  const c = team.colors;
  const tyre = COMPOUND_COLOR[compound];

  const svg = s('svg', {
    viewBox: '0 0 420 128',
    class: 'car-art',
    role: 'img',
    'aria-label': `${team.name} 머신 일러스트, ${driver.name} 카 넘버 ${driver.num}, 현재 ${COMPOUND_KO[compound]} 타이어`,
  });

  const defs = s('defs');
  const grad = s('linearGradient', { id: `carGrad-${team.id}`, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.append(s('stop', { offset: '0', 'stop-color': c.accent, 'stop-opacity': '0.95' }));
  grad.append(s('stop', { offset: '1', 'stop-color': c.team }));
  defs.append(grad);
  svg.append(defs);
  const body = `url(#carGrad-${team.id})`;

  // 노면 그림자
  svg.append(s('ellipse', { cx: 210, cy: 116, rx: 168, ry: 6, fill: '#000', opacity: '0.35' }));

  // ---- 리어윙 (파일런으로 보디워크에 연결) ----
  svg.append(s('path', { d: 'M 58 34 L 70 34 L 76 66 L 64 66 Z', fill: c.secondary, opacity: '0.9' })); // 파일런
  svg.append(s('path', { d: 'M 30 24 L 100 20 L 100 36 L 30 40 Z', fill: body }));                      // 메인플레인
  svg.append(s('path', { d: 'M 36 42 L 94 39 L 94 48 L 36 51 Z', fill: c.secondary, opacity: '0.8' }));  // 하단 엘리먼트
  svg.append(s('rect', { x: 24, y: 18, width: 10, height: 42, rx: 2, fill: c.secondary }));              // 엔드플레이트

  // ---- 엔진커버 / 에어박스 ----
  svg.append(s('path', {
    d: 'M 76 66 C 84 58 92 48 106 42 C 130 32 156 26 178 24 L 196 40 L 196 66 Z',
    fill: body,
  }));
  // 샤크핀
  svg.append(s('path', { d: 'M 100 40 C 128 32 154 26 178 24 L 178 30 C 152 33 126 40 104 46 Z', fill: c.secondary, opacity: '0.45' }));
  // 에어박스 인테이크
  svg.append(s('path', { d: 'M 178 26 L 196 26 L 200 40 L 182 40 Z', fill: '#0d0f12' }));

  // ---- 사이드포드 ----
  svg.append(s('path', {
    d: 'M 132 58 C 150 54 176 52 202 52 L 214 58 L 214 84 L 132 84 Z',
    fill: body,
  }));
  svg.append(s('path', { d: 'M 138 60 C 158 56 180 55 202 55 L 208 60 L 150 62 Z', fill: '#0d0f12', opacity: '0.55' }));

  // ---- 플로어 ----
  svg.append(s('path', { d: 'M 70 84 L 330 84 L 330 92 L 70 92 Z', fill: '#15181d' }));
  svg.append(s('path', { d: 'M 46 78 L 92 78 L 92 92 L 46 92 Z', fill: c.secondary, opacity: '0.9' }));

  // ---- 콕핏 + 헤일로 ----
  svg.append(s('path', { d: 'M 196 40 L 244 44 L 258 58 L 214 58 Z', fill: body }));
  svg.append(s('ellipse', { cx: 224, cy: 46, rx: 15, ry: 7, fill: '#0d0f12' }));
  // 드라이버 헬멧 살짝
  svg.append(s('circle', { cx: 224, cy: 44, r: 8, fill: c.secondary }));
  svg.append(s('path', { d: 'M 217 44 a 8 8 0 0 1 14 -3 l -13 4 Z', fill: '#0d0f12', opacity: '0.7' }));
  // 헤일로
  svg.append(s('path', {
    d: 'M 202 46 C 210 30 244 30 252 48',
    fill: 'none', stroke: '#0d0f12', 'stroke-width': 6, 'stroke-linecap': 'round',
  }));
  svg.append(s('path', { d: 'M 227 34 L 227 46', stroke: '#0d0f12', 'stroke-width': 5 }));

  // ---- 노즈 (길고 얇게) ----
  svg.append(s('path', {
    d: 'M 258 56 C 296 60 330 68 366 78 L 366 88 C 330 84 294 80 258 80 Z',
    fill: body,
  }));
  svg.append(s('path', { d: 'M 264 60 C 298 64 328 71 358 79 L 358 82 C 326 75 296 69 264 66 Z', fill: c.secondary, opacity: '0.5' }));

  // ---- 프론트윙 ----
  svg.append(s('path', { d: 'M 330 92 L 412 88 L 412 98 L 330 102 Z', fill: body }));
  svg.append(s('path', { d: 'M 336 84 L 408 81 L 408 88 L 336 91 Z', fill: c.secondary, opacity: '0.9' }));
  svg.append(s('rect', { x: 404, y: 74, width: 8, height: 30, rx: 2, fill: c.secondary }));

  // ---- 타이어 (사이드월 = 컴파운드 색) ----
  wheel(svg, 104, 88, tyre);
  wheel(svg, 318, 88, tyre);

  // ---- 카 넘버 ----
  svg.append(s('text', {
    x: 150, y: 50, 'text-anchor': 'middle',
    'font-family': "'Barlow Condensed', sans-serif",
    'font-size': 26, 'font-weight': 800,
    fill: c.secondary === '#0d0f12' ? '#f2f4f7' : '#0a0b0d',
    opacity: '0.9',
  }, String(driver.num)));

  return svg;
}

function wheel(svg, cx, cy, sidewall) {
  // 컴파운드 밴드 양쪽에 무채색 링을 둘러, 어떤 팀 컬러 차체 위에서도 밴드가 읽히게 한다.
  // (페라리 빨강 차체 + 소프트 빨강 밴드처럼 겹치는 조합이 실제로 존재한다)
  svg.append(s('circle', { cx, cy, r: 34, fill: '#0a0b0d' }));
  svg.append(s('circle', { cx, cy, r: 30, fill: '#101216' }));
  svg.append(s('circle', { cx, cy, r: 30, fill: 'none', stroke: sidewall, 'stroke-width': 4, opacity: '1' }));
  svg.append(s('circle', { cx, cy, r: 27.4, fill: 'none', stroke: '#0a0b0d', 'stroke-width': 1.6 }));
  svg.append(s('circle', { cx, cy, r: 22, fill: '#1a1d23' }));
  svg.append(s('circle', { cx, cy, r: 13, fill: '#0a0b0d' }));
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    svg.append(s('line', {
      x1: cx + Math.cos(a) * 6, y1: cy + Math.sin(a) * 6,
      x2: cx + Math.cos(a) * 20, y2: cy + Math.sin(a) * 20,
      stroke: '#2a2e36', 'stroke-width': 2.5, 'stroke-linecap': 'round',
    }));
  }
}

/** 드라이버 헬멧 측면도. 팀 컬러 + 개인 액센트. */
export function helmetSvg(team, driver, size = 64) {
  const c = team.colors;
  const svg = s('svg', {
    viewBox: '0 0 80 80', width: size, height: size,
    class: 'helmet-art', role: 'img',
    'aria-label': `${driver.name} 헬멧 일러스트`,
  });

  const defs = s('defs');
  const g = s('linearGradient', { id: `helm-${driver.id}`, x1: '0', y1: '0', x2: '0.4', y2: '1' });
  g.append(s('stop', { offset: '0', 'stop-color': c.accent }));
  g.append(s('stop', { offset: '1', 'stop-color': c.team }));
  defs.append(g);
  svg.append(defs);

  // 헬멧 셸
  svg.append(s('path', {
    d: 'M 40 8 C 58 8 70 22 70 40 C 70 52 66 60 60 64 L 24 66 C 14 60 10 50 10 40 C 10 22 22 8 40 8 Z',
    fill: `url(#helm-${driver.id})`,
  }));
  // 상단 스트라이프
  svg.append(s('path', { d: 'M 34 8.6 C 38 8.2 42 8.2 46 8.6 L 44 30 L 36 30 Z', fill: c.secondary, opacity: '0.9' }));
  // 바이저
  svg.append(s('path', {
    d: 'M 22 32 C 32 27 52 26 64 30 L 64 44 C 50 46 32 46 22 43 Z',
    fill: '#0a0b0d',
  }));
  svg.append(s('path', {
    d: 'M 26 33 C 36 29 50 28.5 60 31 L 60 34 C 48 32 34 33 26 36 Z',
    fill: '#f2f4f7', opacity: '0.18',
  }));
  // 에어 인테이크
  svg.append(s('path', { d: 'M 12 46 L 22 45 L 22 52 L 13 52 Z', fill: '#0a0b0d', opacity: '0.75' }));
  // 턱 보호대
  svg.append(s('path', { d: 'M 22 48 C 34 52 52 52 62 49 L 60 64 L 26 66 Z', fill: c.secondary, opacity: '0.55' }));

  return svg;
}

/** 팀 로고 자리의 추상 마크 (실제 로고 사용 안 함) */
export function teamMark(team, size = 26) {
  const c = team.colors;
  const svg = s('svg', { viewBox: '0 0 40 40', width: size, height: size, 'aria-hidden': 'true' });
  svg.append(s('path', { d: 'M 4 30 L 18 8 L 26 8 L 12 30 Z', fill: c.team }));
  svg.append(s('path', { d: 'M 16 30 L 30 8 L 38 8 L 24 30 Z', fill: c.accent, opacity: '0.75' }));
  svg.append(s('rect', { x: 4, y: 32, width: 34, height: 4, rx: 2, fill: c.secondary }));
  return svg;
}
