// 레이스 트레이스 + 재생 플레이헤드.
//
// 성능 메모: 재생 중에는 전체 재렌더를 하지 않는다.
// renderRaceTrace() 가 컨트롤러를 돌려주고, 재생 루프는 setLap() 으로
// 플레이헤드와 판독부만 직접 갱신한다. 52랩을 5배속으로 돌려도 리플로우가 없다.

import { h, mount } from './dom.js';
import { COMPOUND_COLOR, COMPOUND_KO } from '../engine/params.js';
import { snapshotAt } from '../engine/trace.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 900;
const H = 320;
const M = { top: 18, right: 16, bottom: 30, left: 52 };

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  kids.forEach((k) => k != null && el.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return el;
}

const SERIES_COLORS = ['#F2F4F7', '#9BA3AF', '#5F6672'];

/**
 * @returns {{setLap:(n:number|null)=>void, totalLaps:number}} 컨트롤러
 */
export function renderRaceTrace(root, { trace, mineColor, onScrub }) {
  if (!trace) {
    mount(root, h('p.empty', '표시할 시뮬레이션 결과가 없습니다.'));
    return { setLap() {}, totalLaps: 0 };
  }

  const { totalLaps, series, crossovers, range } = trace;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  const pad = Math.max(1.5, (range.max - range.min) * 0.14);
  const yMin = range.min - pad;
  const yMax = range.max + pad;

  const X = (lap) => M.left + (lap / totalLaps) * plotW;
  const Y = (d) => M.top + plotH - ((d - yMin) / (yMax - yMin)) * plotH;

  const svg = s('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label':
      `레이스 트레이스. 기준 페이스 대비 누적 시간차. 위로 갈수록 앞섭니다. ` +
      series.map((x) => `${x.label} 최종 ${x.points[totalLaps].delta.toFixed(1)}초`).join(', '),
  });

  // 강조 시리즈(내 전략 우선)의 스틴트 음영
  const emph = series.find((x) => x.isMine) || series[0];
  let acc = 0;
  emph.stints.forEach((st) => {
    const from = acc;
    acc += st.laps;
    svg.append(s('rect', {
      x: X(from), y: M.top, width: Math.max(1, X(acc) - X(from)), height: plotH,
      fill: COMPOUND_COLOR[st.compound], opacity: 0.075,
    }));
  });

  // Y 그리드 + 0 기준선
  for (let i = 0; i <= 4; i++) {
    const v = yMin + ((yMax - yMin) * i) / 4;
    const y = Y(v);
    svg.append(s('line', { x1: M.left, x2: W - M.right, y1: y, y2: y, stroke: '#23272e' }));
    svg.append(s('text', {
      x: M.left - 8, y: y + 4, 'text-anchor': 'end',
      fill: '#5f6672', 'font-size': 10, 'font-family': 'ui-monospace, monospace',
    }, `${v > 0 ? '+' : ''}${v.toFixed(0)}s`));
  }
  if (yMin < 0 && yMax > 0) {
    svg.append(s('line', {
      x1: M.left, x2: W - M.right, y1: Y(0), y2: Y(0),
      stroke: '#5f6672', 'stroke-width': 1.5, 'stroke-dasharray': '5 4',
    }));
    svg.append(s('text', {
      x: W - M.right - 4, y: Y(0) - 6, 'text-anchor': 'end',
      fill: '#5f6672', 'font-size': 9,
    }, '기준 페이스'));
  }

  // X 눈금
  const step = totalLaps > 60 ? 15 : 10;
  for (let lap = 0; lap <= totalLaps; lap += step) {
    svg.append(s('text', {
      x: X(lap), y: H - 10, 'text-anchor': 'middle',
      fill: '#5f6672', 'font-size': 10, 'font-family': 'ui-monospace, monospace',
    }, lap === 0 ? 'START' : `L${lap}`));
  }

  // 교차 지점 — 이 그래프의 핵심 정보
  crossovers.forEach((c) => {
    svg.append(s('line', {
      x1: X(c.lap), x2: X(c.lap), y1: M.top, y2: M.top + plotH,
      stroke: '#D29922', 'stroke-width': 1, 'stroke-dasharray': '2 3', 'stroke-opacity': 0.8,
    }));
    svg.append(s('circle', { cx: X(c.lap), cy: M.top + 6, r: 4, fill: '#D29922' }));
  });

  // 선
  let ci = 0;
  series.forEach((ser) => {
    const color = ser.isMine ? mineColor : SERIES_COLORS[ci++ % SERIES_COLORS.length];
    const d = ser.points.map((p, i) => `${i ? 'L' : 'M'} ${X(p.lap).toFixed(1)} ${Y(p.delta).toFixed(1)}`).join(' ');
    svg.append(s('path', {
      d, fill: 'none', stroke: color,
      'stroke-width': ser.isMine ? 2.8 : 1.8,
      'stroke-opacity': ser.isMine ? 1 : 0.55,
      'stroke-linejoin': 'round',
    }));
    ser.pitLaps.forEach((lap) => {
      svg.append(s('circle', {
        cx: X(lap), cy: Y(ser.points[lap].delta), r: ser.isMine ? 4 : 3,
        fill: '#0a0b0d', stroke: color, 'stroke-width': 2,
      }));
    });
    ser._color = color;
  });

  // 플레이헤드
  const head = s('line', {
    x1: X(0), x2: X(0), y1: M.top - 6, y2: M.top + plotH,
    stroke: '#F2F4F7', 'stroke-width': 1.5, 'stroke-opacity': 0,
  });
  const headDots = series.map((ser) =>
    s('circle', { cx: X(0), cy: Y(0), r: 5, fill: ser._color, stroke: '#0a0b0d', 'stroke-width': 2, opacity: 0 }));
  svg.append(head, ...headDots);

  // 판독부 (재생 중 갱신되는 영역)
  const readout = h('div.trace-readout');
  const legend = h('div.chart-legend',
    series.map((ser) => h('span', h('i', { style: { background: ser._color } }), ser.label)),
    crossovers.length ? h('span', h('i', { style: { background: '#D29922' } }), `교차 ${crossovers.length}회`) : null);

  const wrap = h('div.chart-wrap', svg);

  // 스크럽: 그래프를 클릭·드래그하면 해당 랩으로 이동
  const lapFromEvent = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    return Math.round(Math.max(0, Math.min(totalLaps, ((px - M.left) / plotW) * totalLaps)));
  };
  let dragging = false;
  svg.addEventListener('pointerdown', (ev) => {
    dragging = true;
    svg.setPointerCapture(ev.pointerId);
    onScrub(lapFromEvent(ev));
  });
  svg.addEventListener('pointermove', (ev) => { if (dragging) onScrub(lapFromEvent(ev)); });
  svg.addEventListener('pointerup', () => { dragging = false; });
  svg.addEventListener('pointercancel', () => { dragging = false; });

  mount(root, wrap, legend, readout,
    crossovers.length
      ? h('div.crossovers',
          h('h4', '선두가 바뀐 지점'),
          crossovers.map((c) => h('p', c.text)))
      : h('p.crossover-none', '이 조건에서는 순위 역전이 일어나지 않습니다. 한 전략이 시종일관 앞섭니다.'));

  function setLap(lap) {
    if (lap == null) {
      head.setAttribute('stroke-opacity', '0');
      headDots.forEach((d) => d.setAttribute('opacity', '0'));
      readout.replaceChildren();
      return;
    }
    const x = X(lap);
    head.setAttribute('x1', x);
    head.setAttribute('x2', x);
    head.setAttribute('stroke-opacity', '0.85');
    series.forEach((ser, i) => {
      headDots[i].setAttribute('cx', x);
      headDots[i].setAttribute('cy', Y(ser.points[lap].delta));
      headDots[i].setAttribute('opacity', '1');
    });

    const snap = snapshotAt(trace, lap);
    const scNow = snap[0].sc && snap[0].sc !== 'green' ? snap[0].sc.toUpperCase() : null;
    readout.replaceChildren(
      h('div.tr-lap',
        h('b.num', `LAP ${lap}`),
        h('span', `/ ${totalLaps}`),
        scNow ? h('span.tr-sc', scNow) : null),
      h('div.tr-rows',
        snap.map((r) =>
          h('div.tr-row', { class: r.isMine ? 'mine' : '' },
            h('span.tr-pos.num', `P${r.pos}`),
            h('span.tr-name', r.label),
            r.compound
              ? h('span.tr-tyre',
                  h('i', { style: { background: COMPOUND_COLOR[r.compound] } }),
                  COMPOUND_KO[r.compound])
              : h('span.tr-tyre', '그리드'),
            h('span.tr-gap.num', r.pos === 1 ? '선두' : `+${r.gap.toFixed(1)}초`)))),
    );
  }

  return { setLap, totalLaps };
}
