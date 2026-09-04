// 레이스 리플레이 — 전략끼리의 레이스를 트랙 위에서 보여준다.
//
// 조사(docs/레이스-시뮬레이션-조사.md)에서 확인한 공통 구조를 따른다:
//   헤더 카드(랩·상태) → 트랙 맵 위의 차 → 타이밍 타워 → 스틴트 간트 + 랩 커서 → 레이스 로그
// 트레이스 그래프는 접힌 "자세히 보기"로 내려간다.
//
// 시간축: 재생 값 v 는 주인공 전략의 랩(소수 허용). v 를 주인공의 누적 시간 T 로 바꾸고,
// 나머지 전략은 같은 T 에 어느 랩의 어디를 달리고 있는지로 위치를 정한다.
// 그래서 트랙 위 차 간격이 곧 시간 간격이다 (1랩 = 그 랩의 랩타임).

import { h, mount } from './dom.js';
import { snapshotAt } from '../engine/trace.js';
import { narrateLap } from '../engine/narrate.js';
import { COMPOUND_KO, TYRE } from '../engine/params.js';
import { fmtRaceTime } from '../engine/simulate.js';
import { TRACK_PATHS, TRACK_VIEW } from '../data/trackPaths.js';

const NS = 'http://www.w3.org/2000/svg';
export const SERIES_COLORS = ['#F2F4F7', '#22C1E8', '#C084FC'];
const SHORT = { '예상 최속': '최속', '안정 우선': '안정', '공격적 대안': '공격', '내 전략': '내 차' };
const PIT_ENTRY = 0.93;          // 랩의 93% 지점에서 피트레인으로 들어간다
const LETTER = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTER: 'I', WET: 'W' };

const short = (label) => SHORT[label] || label.slice(0, 3);

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  kids.forEach((k) => k != null && el.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return el;
}

/* ---------- 트랙 기하 ---------- */

/** 지도가 없는 서킷용 도식 트랙 — 둥근 직사각형. 결승선은 아래 직선 가운데, 시계 반대 방향 */
function stadium(n = 240) {
  const [VW, VH] = TRACK_VIEW;
  const w = 720, hgt = 330, r = 140, cx = VW / 2, cy = VH / 2;
  const sw = w - 2 * r, sh = hgt - 2 * r, arc = (Math.PI / 2) * r;
  const L = 2 * sw + 2 * sh + 4 * arc;
  const at = (d) => {
    // 아래 직선 가운데에서 출발해 오른쪽으로
    let t = d;
    if (t < sw / 2) return [cx + t, cy + hgt / 2];
    t -= sw / 2;
    if (t < arc) { const a = t / r; return [cx + sw / 2 + Math.sin(a) * r, cy + sh / 2 + Math.cos(a) * r]; }
    t -= arc;
    if (t < sh) return [cx + w / 2, cy + sh / 2 - t];
    t -= sh;
    if (t < arc) { const a = t / r; return [cx + sw / 2 + Math.cos(a) * r, cy - sh / 2 - Math.sin(a) * r]; }
    t -= arc;
    if (t < sw) return [cx + sw / 2 - t, cy - hgt / 2];
    t -= sw;
    if (t < arc) { const a = t / r; return [cx - sw / 2 - Math.sin(a) * r, cy - sh / 2 - Math.cos(a) * r]; }
    t -= arc;
    if (t < sh) return [cx - w / 2, cy - sh / 2 + t];
    t -= sh;
    if (t < arc) { const a = t / r; return [cx - sw / 2 - Math.cos(a) * r, cy + sh / 2 + Math.sin(a) * r]; }
    t -= arc;
    return [cx - sw / 2 + t, cy + hgt / 2];
  };
  return Array.from({ length: n }, (_, i) => at((i / n) * L).map((v) => Math.round(v * 10) / 10));
}

export function trackGeometry(circuitId) {
  const real = TRACK_PATHS[circuitId];
  const pts = real || stadium();
  const N = pts.length;
  const cx = pts.reduce((a, p) => a + p[0], 0) / N, cy = pts.reduce((a, p) => a + p[1], 0) / N;
  const inward = (p, d) => {
    const vx = cx - p[0], vy = cy - p[1]; const L = Math.hypot(vx, vy) || 1;
    return [p[0] + (vx / L) * d, p[1] + (vy / L) * d];
  };
  const e = Math.round(N * PIT_ENTRY);
  const pit = [pts[e], inward(pts[(e + 5) % N], 24), inward(pts[N - 2], 30), inward(pts[3], 30), inward(pts[8], 24), pts[12]];
  return { pts, pit, view: TRACK_VIEW, real: !!real };
}

function onPath(pts, f) {
  const N = pts.length;
  const t = ((f % 1) + 1) % 1;
  const i = Math.floor(t * N), k = t * N - i;
  const a = pts[i % N], b = pts[(i + 1) % N];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
}

function onPolyline(pl, g) {
  const seg = pl.slice(1).map((p, i) => Math.hypot(p[0] - pl[i][0], p[1] - pl[i][1]));
  const L = seg.reduce((a, b) => a + b, 0);
  let d = Math.max(0, Math.min(1, g)) * L;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? d / seg[i] : 0;
      return [pl[i][0] + (pl[i + 1][0] - pl[i][0]) * k, pl[i][1] + (pl[i + 1][1] - pl[i][1]) * k];
    }
    d -= seg[i];
  }
  return pl[pl.length - 1];
}

/* ---------- 시간 → 위치 ---------- */

const cumAt = (laps, k) => (k <= 0 ? 0 : laps[Math.min(k, laps.length) - 1].cumulative);

/** 주인공의 랩 값 v(소수) → 레이스 시간 T → 각 전략의 상태 */
function carStates(valid, focusIdx, v) {
  const f = valid[focusIdx].result.laps;
  const k = Math.floor(v), frac = v - k;
  const T = cumAt(f, k) + (k < f.length ? frac * f[k].time : 0);
  return valid.map((e) => {
    const laps = e.result.laps;
    let done = 0;
    while (done < laps.length && laps[done].cumulative <= T) done++;
    if (done >= laps.length) return { finished: true, frac: 0, lap: laps.length, inPit: false, T };
    const L = laps[done];
    const p = (T - cumAt(laps, done)) / L.time;
    if (L.pit > 0) {
      const pd = (L.time - L.pit) / L.time;
      if (p < pd) return { frac: (p / pd) * PIT_ENTRY, lap: done + 1, inPit: false, pitting: true, T };
      return { pitFrac: (p - pd) / (1 - pd), lap: done + 1, inPit: true, T };
    }
    return { frac: p, lap: done + 1, inPit: false, T };
  });
}

/* ---------- 로그 이벤트 ---------- */

function buildEvents(valid, trace) {
  const ev = [];
  ev.push({ lap: 0, cls: 'start', html: '출발 — ' + valid.map((e) => `<b>${short(e.plan.label)}</b> ${COMPOUND_KO[e.plan.stints[0].compound]}`).join(' · ') });
  valid.forEach((e, si) => {
    const name = short(e.plan.label);
    e.result.laps.forEach((L, i) => {
      if (L.pit > 0) {
        const next = e.result.laps[i + 1];
        ev.push({ lap: L.lap, si, cls: 'pit', html: `<b>${name}</b> 피트인 → ${COMPOUND_KO[next ? next.compound : L.compound]} <span class="rl-num">${L.pit.toFixed(1)}초 손실${L.sc !== 'green' ? ' · SC 중이라 싸게' : ''}</span>` });
      }
      const cliff = TYRE[L.compound]?.cliffLap;
      if (cliff && L.age === cliff + 1) {
        ev.push({ lap: L.lap, si, cls: 'warn', html: `<b>${name}</b> ${COMPOUND_KO[L.compound]} ${cliff}랩 클리프를 넘김 — 페이스가 급격히 떨어집니다` });
      }
    });
  });
  (valid[0].result.scBands || []).forEach((b) => {
    ev.push({ lap: b.from, cls: 'sc', html: `<b>${b.type === 'sc' ? '세이프티카' : 'VSC'}</b> 출동 · ${b.from}${b.to > b.from ? `–${b.to}` : ''}랩` });
    if (b.to > b.from) ev.push({ lap: b.to + 1, cls: 'sc', html: `${b.type === 'sc' ? '세이프티카' : 'VSC'} 해제 — 레이스 재개` });
  });
  (trace.crossovers || []).forEach((c) => {
    const txt = (c.text || '').replace(/^\d+랩\s*—\s*/, '');
    ev.push({ lap: c.lap, cls: 'cross', html: txt ? txt.replace(/(\S+) 앞섭니다/, '<b>$1</b> 앞섭니다') : `<b>${short(c.toLabel)}</b>이(가) ${short(c.fromLabel)} 앞으로` });
  });
  const fin = snapshotAt(trace, trace.totalLaps);
  ev.push({ lap: trace.totalLaps, cls: 'finish', html: '<b>결승선</b> — ' + fin.map((r) => `${r.pos}위 ${short(r.label)}${r.pos > 1 ? ` +${r.gap.toFixed(1)}초` : ''}`).join(' · ') });
  return ev.sort((a, b) => a.lap - b.lap);
}

/* ---------- 렌더 ---------- */

/**
 * @param {{head:Element,map:Element,tower:Element,gantt:Element,log:Element}} slots
 * @param {{trace:object, entries:Array, circuit:object, focusIdx:number, mineColor:string}} ctx
 */
export function renderRaceReplay(slots, ctx) {
  const { trace, circuit, focusIdx, mineColor } = ctx;
  const valid = ctx.entries.filter((e) => e.result && !e.result.invalid);
  const total = trace.totalLaps;
  let ci = 0;
  const colors = valid.map((e) => (e.plan.id === 'my' ? mineColor : SERIES_COLORS[ci++ % SERIES_COLORS.length]));
  const geo = trackGeometry(circuit.id);
  const events = buildEvents(valid, trace);

  /* 헤더 */
  const lapNum = h('b.rh-lap.num', '—');
  const status = h('span.rh-status', '출발 전');
  mount(slots.head,
    h('div.rh-left', h('div.rh-track', circuit.track), h('div.rh-meta', `${total}랩 · ${geo.real ? 'F1 공식 코스 지도' : '도식 트랙'}`)),
    h('div.rh-center', h('span.rh-lapword', 'LAP'), lapNum, h('span.rh-total.num', `/ ${total}`)),
    h('div.rh-right', status));

  /* 트랙 맵 */
  const [VW, VH] = geo.view;
  const d = geo.pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ') + ' Z';
  const pd = geo.pit.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const p0 = geo.pts[0], p1 = geo.pts[1];
  const nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0]; const nl = Math.hypot(nx, ny) || 1;
  const sf = [p0[0] + (nx / nl) * 16, p0[1] + (ny / nl) * 16, p0[0] - (nx / nl) * 16, p0[1] - (ny / nl) * 16];
  const cars = valid.map((e, i) => {
    const g = s('g', { class: 'rm-car' + (e.plan.id === 'my' || i === focusIdx ? ' focus' : '') });
    g.append(
      s('circle', { r: 13, fill: colors[i], stroke: '#0a0b0d', 'stroke-width': 3 }),
      // 라벨은 위·아래를 번갈아 두어 차가 붙어도 글자가 덜 겹친다
      s('text', { x: 18, y: i % 2 ? 34 : -14, class: 'rm-label' }, short(e.plan.label)),
      s('text', { x: 18, y: i % 2 ? 54 : 8, class: 'rm-pit' }, ''));
    return g;
  });
  const scChip = s('g', { class: 'rm-sc', visibility: 'hidden' },
    s('rect', { x: VW - 150, y: 18, width: 130, height: 40, rx: 6, fill: '#ffd12e' }),
    s('text', { x: VW - 85, y: 46, class: 'rm-sctext', 'text-anchor': 'middle' }, 'SAFETY CAR'));
  const svgEl = s('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'rm-svg', role: 'img', 'aria-label': `${circuit.track} 트랙 위 전략별 위치` },
    s('path', { d, class: 'rm-road-outline' }),
    s('path', { d, class: 'rm-road' }),
    s('path', { d: pd, class: 'rm-pitlane' }),
    s('line', { x1: sf[0], y1: sf[1], x2: sf[2], y2: sf[3], class: 'rm-sf' }),
    ...cars, scChip);
  mount(slots.map, svgEl);

  /* 타이밍 타워 (내용은 랩이 바뀔 때만 갱신) */
  const towerBody = h('div.rt-rows');
  mount(slots.tower,
    h('div.rt-head', h('span', '순위'), h('span', '전략'), h('span', '타이어'), h('span', '간격'), h('span', '인터벌')),
    towerBody);

  /* 간트 */
  const bands = valid[0].result.scBands || [];
  const cursors = [];
  const rows = valid.map((e, i) => {
    const bar = h('div.rg-bar');
    let acc = 0;
    e.plan.stints.forEach((st, si) => {
      bar.append(h(`div.rg-seg.c-${st.compound}`, { style: { flex: `${st.laps} 1 0` }, title: `${COMPOUND_KO[st.compound]} ${st.laps}랩` },
        h('span', `${LETTER[st.compound]} ${st.laps}`)));
      acc += st.laps;
      if (si < e.plan.stints.length - 1) bar.append(h('i.rg-pit', { style: { left: `${(acc / total) * 100}%` } }));
    });
    bands.forEach((b) => bar.append(h('i.rg-sc', { class: b.type, style: { left: `${((b.from - 1) / total) * 100}%`, width: `${((b.to - b.from + 1) / total) * 100}%` } })));
    const cur = h('i.rg-cur'); cursors.push(cur); bar.append(cur);
    return h('div.rg-row', { class: i === focusIdx ? 'focus' : '' },
      h('div.rg-name', h('i.rg-dot', { style: { background: colors[i] } }), e.plan.label), bar);
  });
  const ticks = [];
  for (let l = 10; l < total; l += 10) ticks.push(h('span', { style: { left: `${(l / total) * 100}%` } }, `L${l}`));
  mount(slots.gantt, rows, h('div.rg-axis', h('div.rg-name'), h('div.rg-ticks', ticks)));

  /* 로그 */
  const now = h('p.rl-now');
  const list = h('ul.rl-list');
  mount(slots.log, now, list);

  let lastLap = -2;
  function setLap(lap) {
    if (lap === lastLap) return;
    lastLap = lap;
    const L = lap == null ? 0 : lap;
    lapNum.textContent = lap == null ? '—' : String(L);
    const sc = L > 0 ? valid[focusIdx].result.laps[L - 1].sc : 'green';
    status.textContent = lap == null ? '출발 전' : L >= total ? '완주' : sc === 'sc' ? '세이프티카' : sc === 'vsc' ? 'VSC' : '그린';
    status.className = `rh-status ${lap == null ? 'pre' : L >= total ? 'fin' : sc}`;
    scChip.setAttribute('visibility', sc === 'green' || lap == null ? 'hidden' : 'visible');
    scChip.querySelector('text').textContent = sc === 'vsc' ? 'VIRTUAL SC' : 'SAFETY CAR';

    // 타워
    const snap = snapshotAt(trace, L);
    const prev = L > 1 ? snapshotAt(trace, L - 1) : null;
    towerBody.replaceChildren(...snap.map((r, i) => {
      const si = valid.findIndex((e) => e.plan.label === r.label);
      const laps = valid[si].result.laps;
      const rec = L > 0 ? laps[Math.min(L, laps.length) - 1] : null;
      const before = prev ? prev.find((x) => x.label === r.label).pos : r.pos;
      const move = before - r.pos;
      const interval = i === 0 ? '' : `+${(r.gap - snap[i - 1].gap).toFixed(1)}`;
      return h('div.rt-row', { class: `${si === focusIdx ? 'focus' : ''} ${rec && rec.pit > 0 ? 'pit' : ''}` },
        h('span.rt-pos.num', String(r.pos), move ? h('em', { class: move > 0 ? 'up' : 'down' }, move > 0 ? `▲${move}` : `▼${-move}`) : null),
        h('span.rt-name', h('i.rg-dot', { style: { background: colors[si] } }), r.label),
        h('span.rt-tyre', h('b', { class: `rt-chip c-${r.compound}` }, LETTER[r.compound] || '?'), rec ? h('small.num', `${rec.age}랩`) : null, rec && rec.pit > 0 ? h('small.rt-pitbadge', 'PIT') : null),
        h('span.rt-gap.num', i === 0 ? (L > 0 ? '선두' : '') : `+${r.gap.toFixed(1)}초`),
        h('span.rt-int.num', interval));
    }));

    // 로그
    now.innerHTML = lap == null ? '▶ 재생을 누르거나 슬라이더를 끌어보세요' : narrateLap(trace, L, focusIdx);
    const shown = events.filter((e) => e.lap <= L && (lap != null || e.lap === 0)).slice(-14).reverse();
    list.replaceChildren(...shown.map((e) => h('li', { class: `rl-${e.cls}` }, h('span.rl-lap.num', e.lap === 0 ? '출발' : `L${e.lap}`), h("span.rl-text", { html: e.html }))));
  }

  function set(v) {
    const lap = v == null ? null : Math.min(total, Math.floor(v));
    setLap(lap);
    // 차 위치 (매 프레임)
    const states = v == null ? null : carStates(valid, focusIdx, Math.min(v, total));
    cars.forEach((g, i) => {
      let xy, pitTxt = '';
      if (!states) {
        xy = onPath(geo.pts, -0.012 * (i + 1));
      } else {
        const st = states[i];
        if (st.inPit) { xy = onPolyline(geo.pit, st.pitFrac); pitTxt = 'PIT'; }
        else xy = onPath(geo.pts, st.frac);
        if (st.finished) pitTxt = '완주';
      }
      g.setAttribute('transform', `translate(${xy[0].toFixed(1)} ${xy[1].toFixed(1)})`);
      const t = g.querySelector('.rm-pit'); if (t.textContent !== pitTxt) t.textContent = pitTxt;
    });
    const pct = v == null ? 0 : (Math.min(v, total) / total) * 100;
    cursors.forEach((c) => { c.style.left = `${pct}%`; });
  }

  set(null);
  return { set };
}
