// SVG 직접 렌더. 차트 라이브러리 0KB.
import { h, mount } from './dom.js';
import { COMPOUND_COLOR, COMPOUND_KO } from '../engine/params.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 900;
const H = 300;
const M = { top: 14, right: 14, bottom: 26, left: 46 };

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  kids.forEach((k) => el.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return el;
}

/**
 * @param {Array<{name:string, result:object, color:string, emphasis:boolean}>} series
 */
export function renderLapChart(root, series, totalLaps) {
  const valid = series.filter((x) => x.result && !x.result.invalid);
  if (!valid.length) {
    mount(root, h('p.empty', '표시할 시뮬레이션 결과가 없습니다.'));
    return;
  }

  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  // Y 범위: SC 랩은 이상치라 제외하고 스케일을 잡는다
  const times = valid.flatMap((x) => x.result.laps.filter((l) => l.sc === 'green').map((l) => l.time));
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  const pad = (hi - lo) * 0.12 || 1;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const X = (lap) => M.left + ((lap - 1) / Math.max(1, totalLaps - 1)) * plotW;
  const Y = (t) => M.top + plotH - ((t - yMin) / (yMax - yMin)) * plotH;

  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `랩타임 추이 차트. ${valid.map((v) => v.name).join(', ')} 비교.`,
  });

  // 세이프티카 밴드 (기준 시리즈 기준)
  const emph = valid.find((v) => v.emphasis) || valid[0];
  emph.result.scBands.forEach((b) => {
    svg.append(s('rect', {
      x: X(b.from), y: M.top, width: Math.max(2, X(b.to) - X(b.from)), height: plotH,
      fill: b.type === 'sc' ? '#5f6672' : '#3a3f48', opacity: 0.28,
    }));
  });

  // 강조 시리즈의 스틴트 음영
  let acc = 0;
  emph.result.laps.forEach((l, i) => {
    const prev = emph.result.laps[i - 1];
    if (prev && prev.stintIndex === l.stintIndex) return;
    const start = l.lap;
    const end = emph.result.laps.findLast((x) => x.stintIndex === l.stintIndex).lap;
    acc = end;
    svg.append(s('rect', {
      x: X(start), y: M.top, width: Math.max(1, X(end) - X(start)), height: plotH,
      fill: COMPOUND_COLOR[l.compound], opacity: 0.07,
    }));
  });

  // Y 그리드
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const t = yMin + ((yMax - yMin) * i) / ticks;
    const y = Y(t);
    svg.append(s('line', { x1: M.left, x2: W - M.right, y1: y, y2: y, stroke: '#23272e', 'stroke-width': 1 }));
    svg.append(s('text', {
      x: M.left - 8, y: y + 4, 'text-anchor': 'end',
      fill: '#5f6672', 'font-size': 10, 'font-family': 'ui-monospace, monospace',
    }, t.toFixed(1)));
  }

  // X 눈금
  const xStep = totalLaps > 60 ? 15 : 10;
  for (let lap = 1; lap <= totalLaps; lap += xStep) {
    svg.append(s('text', {
      x: X(lap), y: H - 8, 'text-anchor': 'middle',
      fill: '#5f6672', 'font-size': 10, 'font-family': 'ui-monospace, monospace',
    }, `L${lap}`));
  }

  // 라인
  valid.forEach((series_) => {
    const pts = series_.result.laps
      .filter((l) => l.sc === 'green')
      .map((l) => `${X(l.lap).toFixed(1)},${Y(Math.min(yMax, Math.max(yMin, l.time))).toFixed(1)}`)
      .join(' ');
    svg.append(s('polyline', {
      points: pts, fill: 'none', stroke: series_.color,
      'stroke-width': series_.emphasis ? 2.6 : 1.4,
      'stroke-opacity': series_.emphasis ? 1 : 0.42,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));

    // 피트 마커
    series_.result.pitLaps.forEach((lap) => {
      svg.append(s('line', {
        x1: X(lap), x2: X(lap), y1: M.top, y2: M.top + plotH,
        stroke: series_.color, 'stroke-width': 1,
        'stroke-dasharray': '3 3', 'stroke-opacity': series_.emphasis ? 0.75 : 0.25,
      }));
      if (series_.emphasis) {
        svg.append(s('path', {
          d: `M ${X(lap)} ${M.top - 2} l 5 6 l -5 6 l -5 -6 z`,
          fill: series_.color,
        }));
      }
    });
  });

  // 호버 크로스헤어
  const cross = s('line', { y1: M.top, y2: M.top + plotH, stroke: '#f2f4f7', 'stroke-width': 1, 'stroke-opacity': 0, 'pointer-events': 'none' });
  svg.append(cross);
  const tip = h('div', {
    style: {
      position: 'absolute', pointerEvents: 'none', opacity: '0',
      background: 'var(--bg-overlay)', border: '1px solid var(--border-strong)',
      borderRadius: '6px', padding: '6px 9px', fontSize: '11px',
      fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', zIndex: '10',
      transition: 'opacity 120ms',
    },
  });

  const wrap = h('div.chart-wrap', { style: { position: 'relative' } }, svg, tip);

  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const lap = Math.round(((px - M.left) / plotW) * (totalLaps - 1)) + 1;
    if (lap < 1 || lap > totalLaps) return;
    cross.setAttribute('x1', X(lap));
    cross.setAttribute('x2', X(lap));
    cross.setAttribute('stroke-opacity', '0.35');
    const l = emph.result.laps[lap - 1];
    tip.innerHTML =
      `<b>LAP ${lap}</b> · ${l.time.toFixed(3)}초<br>` +
      `${COMPOUND_KO[l.compound]} ${l.age}랩째` +
      (l.sc !== 'green' ? ` · ${l.sc.toUpperCase()}` : '') +
      (l.pit ? `<br>피트 ${l.pit.toFixed(1)}초` : '');
    tip.style.opacity = '1';
    const localX = ((X(lap) / W) * r.width);
    tip.style.left = `${Math.min(r.width - 150, localX + 10)}px`;
    tip.style.top = `12px`;
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerleave', () => {
    cross.setAttribute('stroke-opacity', '0');
    tip.style.opacity = '0';
  });

  const legend = h('div.chart-legend',
    valid.map((v) => h('span', h('i', { style: { background: v.color, opacity: v.emphasis ? 1 : 0.5 } }), v.name)),
    h('span', h('i', { style: { background: '#5f6672', height: '10px', width: '10px', borderRadius: '2px' } }), '세이프티카 구간'));

  mount(root, wrap, legend, srTable(emph, totalLaps));
}

/** 차트와 동일한 데이터의 표 — 스크린리더용 */
function srTable(series, totalLaps) {
  const step = Math.max(1, Math.round(totalLaps / 20));
  const rows = series.result.laps.filter((l) => l.lap % step === 0 || l.pit);
  return h('div.sr-only',
    h('table.laps',
      h('caption', `${series.name} 랩별 데이터`),
      h('thead', h('tr', h('th', '랩'), h('th', '랩타임'), h('th', '컴파운드'), h('th', '타이어 나이'))),
      h('tbody', rows.map((l) =>
        h('tr', h('td', l.lap), h('td', `${l.time.toFixed(2)}초`), h('td', COMPOUND_KO[l.compound]), h('td', `${l.age}랩`))))));
}
