// 실제 그랑프리 재생 화면.
//
// 시뮬레이션 리플레이(raceReplay.js)와 화면 구성은 같지만 데이터가 실제 기록이라
// 리타이어·랩다운·적기 중단을 다뤄야 한다. 그래서 렌더러를 따로 둔다.
//   헤더(랩·깃발) → 트랙 맵 + 타이밍 타워 → 스틴트 간트 → 레이스 로그 → 최종 순위
//
// 시계는 "달린 시간"(적기 중단을 뺀 시간)을 쓴다. 중단을 그대로 재생하면
// 32분 동안 화면이 멈춘다.

import { h, mount } from './dom.js';
import { trackGeometry } from './raceReplay.js';
import { flagAt } from '../engine/realRace.js';
import { COMPOUND_KO } from '../engine/params.js';
import { fmtRaceTime } from '../engine/simulate.js';
import { circuitById } from '../data/circuits.js';

const NS = 'http://www.w3.org/2000/svg';
const LETTER = { SOFT: 'S', MEDIUM: 'M', HARD: 'H', INTER: 'I', WET: 'W' };
const PIT_ENTRY = 0.93;
const FLAG_KO = { green: '그린', sc: '세이프티카', vsc: 'VSC', red: '적기' };

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  kids.forEach((k) => k != null && el.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return el;
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

/** 실제 기록에서 랩별 사건 목록을 만든다 (관제 + 피트 + 리타이어) */
function buildLog(rr) {
  const out = rr.events.map((e) => ({
    lap: e.lap, cls: e.type,
    html: e.type === 'incident'
      ? e.ko
      : `<b>${e.ko}</b>`,
  }));

  // 적기 중에는 거의 전 차량이 동시에 타이어를 간다 — 스무 줄로 쌓지 않고 한 줄로 묶는다
  const stoppageByLap = new Map();
  rr.drivers.forEach((d) => {
    d.pits.forEach((p) => {
      const next = d.stints.find((st) => st.from === p.lap + 1) || d.stints.find((st) => st.from === p.lap);
      const to = next ? COMPOUND_KO[next.compound] : '';
      if (p.stoppage) {
        stoppageByLap.set(p.lap, (stoppageByLap.get(p.lap) || 0) + 1);
        return;
      }
      out.push({
        lap: p.lap, cls: 'pit',
        html: `<b>${d.code}</b> 피트인${to ? ` → ${to}` : ''} <span class="rl-num">피트레인 ${p.lane.toFixed(1)}초</span>`,
      });
    });
    if (d.outLap != null && d.dnf) {
      out.push({ lap: d.outLap, cls: 'warn', html: `<b>${d.code}</b> 리타이어 (${d.outLap}랩)` });
    }
  });

  stoppageByLap.forEach((n, lap) => {
    out.push({ lap, cls: 'pit', html: `<b>중단 중 ${n}대</b> 타이어 교체 <span class="rl-num">피트 손실 없음</span>` });
  });

  return out.sort((a, b) => a.lap - b.lap || (a.cls === 'pit' ? 1 : -1));
}

/**
 * @param {{head:Element,map:Element,tower:Element,gantt:Element,log:Element,result:Element}} slots
 * @param {object} rr  buildRealRace() 결과
 * @param {{focusNum:number|null}} opts
 */
export function renderRealRace(slots, rr, opts = {}) {
  const { race, totalLaps, drivers } = rr;
  const circuit = circuitById(race.circuitId);
  const geo = trackGeometry(race.circuitId);
  const log = buildLog(rr);
  const focus = drivers.find((d) => d.num === opts.focusNum) || drivers[0];
  const onTrack = drivers.slice(0, 20).concat(rr.myCar && !drivers.slice(0, 20).includes(rr.myCar) ? [rr.myCar] : []);
  const shown = drivers;                 // 타워·간트는 전원

  /* 헤더 */
  const lapNum = h('b.rh-lap.num', '—');
  const status = h('span.rh-status', '출발 전');
  mount(slots.head,
    h('div.rh-left',
      h('div.rh-track', race.meetingName || race.officialName),
      h('div.rh-meta', `${race.location} · ${race.date} · ${totalLaps}랩`
        + (race.weather.trackTemp != null ? ` · 노면 ${race.weather.trackTemp}°C` : '')
        + (race.weather.rain ? ' · 강수 있음' : ''))),
    h('div.rh-center', h('span.rh-lapword', 'LAP'), lapNum, h('span.rh-total.num', `/ ${totalLaps}`)),
    h('div.rh-right', status));

  /* 트랙 맵 */
  const [VW, VH] = geo.view;
  const d = geo.pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ') + ' Z';
  const pd = geo.pit.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const p0 = geo.pts[0], p1 = geo.pts[1];
  const nx = -(p1[1] - p0[1]), ny = p1[0] - p0[0], nl = Math.hypot(nx, ny) || 1;
  const sf = [p0[0] + (nx / nl) * 16, p0[1] + (ny / nl) * 16, p0[0] - (nx / nl) * 16, p0[1] - (ny / nl) * 16];

  const cars = onTrack.map((drv) => {
    const g = s('g', { class: 'rm-car' + (drv === focus ? ' focus' : '') + (drv.mine ? ' mine' : '') });
    g.append(
      s('circle', { r: 11, fill: drv.colour, stroke: '#0a0b0d', 'stroke-width': 3 }),
      s('text', { x: 15, y: -11, class: 'rm-label' }, drv.code));
    return g;
  });
  const flagChip = s('g', { class: 'rm-sc', visibility: 'hidden' },
    s('rect', { x: VW - 170, y: 18, width: 150, height: 40, rx: 6, fill: '#ffd12e' }),
    s('text', { x: VW - 95, y: 46, class: 'rm-sctext', 'text-anchor': 'middle' }, ''));
  mount(slots.map, s('svg', { viewBox: `0 0 ${VW} ${VH}`, class: 'rm-svg', role: 'img', 'aria-label': `${race.location} 트랙 위 차량 위치` },
    s('path', { d, class: 'rm-road-outline' }),
    s('path', { d, class: 'rm-road' }),
    s('path', { d: pd, class: 'rm-pitlane' }),
    s('line', { x1: sf[0], y1: sf[1], x2: sf[2], y2: sf[3], class: 'rm-sf' }),
    ...cars, flagChip));

  /* 타이밍 타워 */
  const towerBody = h('div.rt-rows');
  mount(slots.tower,
    h('div.rt-head', h('span', '순위'), h('span', '드라이버'), h('span', '타이어'), h('span', '간격'), h('span', '인터벌')),
    towerBody);

  /* 스틴트 간트 */
  const cursors = [];
  const rows = shown.map((drv) => {
    const bar = h('div.rg-bar');
    drv.stints.forEach((st) => {
      const w = ((st.to - st.from + 1) / totalLaps) * 100;
      bar.append(h(`div.rg-seg.c-${st.compound}`, {
        style: { position: 'absolute', left: `${((st.from - 1) / totalLaps) * 100}%`, width: `${w}%` },
        title: `${COMPOUND_KO[st.compound]} ${st.from}–${st.to}랩`,
      }, h('span', `${LETTER[st.compound]} ${st.to - st.from + 1}`)));
    });
    drv.pits.forEach((p) => bar.append(h('i.rg-pit', { class: p.stoppage ? 'red' : '', style: { left: `${(p.lap / totalLaps) * 100}%` } })));
    if (drv.outLap != null && drv.dnf) {
      bar.append(h('i.rg-out', { style: { left: `${(drv.outLap / totalLaps) * 100}%` }, title: `${drv.outLap}랩 리타이어` }));
    }
    (rr.bands || []).forEach((b) => bar.append(h('i.rg-sc', {
      class: b.type, style: { left: `${((b.from - 1) / totalLaps) * 100}%`, width: `${((b.to - b.from + 1) / totalLaps) * 100}%` },
    })));
    const cur = h('i.rg-cur'); cursors.push(cur); bar.append(cur);
    return h('div.rg-row', { class: `${drv === focus ? 'focus' : ''} ${drv.mine ? 'mine' : ''}` },
      h('div.rg-name', h('i.rg-dot', { style: { background: drv.colour } }), drv.code), bar);
  });
  const ticks = [];
  for (let l = 10; l < totalLaps; l += 10) ticks.push(h('span', { style: { left: `${(l / totalLaps) * 100}%` } }, `L${l}`));
  mount(slots.gantt, rows, h('div.rg-axis', h('div.rg-name'), h('div.rg-ticks', ticks)));

  /* 로그 */
  const now = h('p.rl-now');
  const list = h('ul.rl-list');
  mount(slots.log, now, list);

  /* 최종 순위 — 내 차가 있으면 시뮬레이션 순위, 없으면 공식 결과 */
  if (slots.result) {
    const rows = rr.myCar
      ? rr.standingsAt(totalLaps).map((r) => ({
        drv: r.driver, pos: r.pos, out: r.out,
        gapText: r.out ? `${r.driver.officialLaps}랩 리타이어`
          : r.pos === 1 ? fmtRaceTime(r.time)
          : r.lapsBehind > 0 ? `+${r.lapsBehind}랩` : r.gap != null ? `+${r.gap.toFixed(1)}초` : '',
      }))
      : drivers.filter((x) => x.pos != null).sort((a, b) => a.pos - b.pos).map((x) => ({
        drv: x, pos: x.pos, out: x.dnf,
        gapText: x.dnf ? `${x.officialLaps}랩 리타이어`
          : x.pos === 1 ? fmtRaceTime(x.total || 0)
          : x.gapFinal != null ? `+${Number(x.gapFinal).toFixed(3)}` : '',
      }));
    mount(slots.result,
      h('div.rr-table-wrap', h('table.rr-table',
        h('thead', h('tr', h('th', '순위'), h('th', '드라이버'), h('th', '팀'), h('th', '타이어 전략'), h('th.num', '간격'))),
        h('tbody', rows.map((r) => h('tr', { class: `${r.drv === focus ? 'focus' : ''} ${r.drv.mine ? 'mine' : ''}` },
          h('td.num', r.out ? '—' : String(r.pos)),
          h('td', h('i.rg-dot', { style: { background: r.drv.colour } }), ` ${r.drv.name}`),
          h('td.muted', r.drv.team || ''),
          h('td', r.drv.stints.map((st) => h('b', { class: `rt-chip c-${st.compound}` }, LETTER[st.compound]))),
          h('td.num', r.gapText)))))));
  }

  let lastLap = -2;
  function setLap(lap) {
    if (lap === lastLap) return;
    lastLap = lap;
    const L = lap == null ? 0 : lap;
    lapNum.textContent = lap == null ? '—' : String(L);
    const flag = L > 0 ? flagAt(rr.bands, L) : 'green';
    status.textContent = lap == null ? '출발 전' : L >= totalLaps ? '완주' : FLAG_KO[flag];
    status.className = `rh-status ${lap == null ? 'pre' : L >= totalLaps ? 'fin' : flag}`;
    flagChip.setAttribute('visibility', flag === 'green' || lap == null ? 'hidden' : 'visible');
    flagChip.querySelector('text').textContent = flag === 'red' ? 'RED FLAG' : flag === 'vsc' ? 'VIRTUAL SC' : 'SAFETY CAR';

    const snap = rr.standingsAt(L);
    const prev = L > 1 ? rr.standingsAt(L - 1) : null;
    towerBody.replaceChildren(...snap.map((r, i) => {
      const before = prev ? (prev.find((x) => x.driver.num === r.driver.num) || r).pos : r.pos;
      const move = before - r.pos;
      const above = snap[i - 1];
      const interval = i === 0 || r.out || r.gap == null || !above || above.gap == null
        ? '' : `+${(r.gap - above.gap).toFixed(1)}`;
      return h('div.rt-row', { class: `${r.driver === focus ? 'focus' : ''} ${r.inPit ? 'pit' : ''} ${r.out ? 'out' : ''}` },
        h('span.rt-pos.num', r.out ? '—' : String(r.pos), move && !r.out ? h('em', { class: move > 0 ? 'up' : 'down' }, move > 0 ? `▲${move}` : `▼${-move}`) : null),
        h('span.rt-name', h('i.rg-dot', { style: { background: r.driver.colour } }), r.driver.code),
        h('span.rt-tyre', r.out ? null : h('b', { class: `rt-chip c-${r.compound}` }, LETTER[r.compound] || '?'),
          r.out ? null : h('small.num', `${r.age}랩`), r.inPit ? h('small.rt-pitbadge', 'PIT') : null),
        h('span.rt-gap.num', r.out ? '리타이어' : i === 0 ? (L > 0 ? '선두' : '') : r.lapsBehind > 0 ? `+${r.lapsBehind}랩` : r.gap != null ? `+${r.gap.toFixed(1)}초` : ''),
        h('span.rt-int.num', interval));
    }));

    const lead = snap.find((r) => !r.out);
    now.innerHTML = lap == null
      ? '▶ 재생을 누르거나 슬라이더를 끌어보세요'
      : L >= totalLaps
        ? `<b>체커기.</b> ${lead ? lead.driver.name : ''} 우승, ${drivers.filter((x) => x.dnf).length}대 리타이어.`
        : `<b>${L}랩.</b> 선두 ${lead ? lead.driver.code : '—'}${flag !== 'green' ? ` · ${FLAG_KO[flag]} 구간` : ''}`;

    const shownLog = log.filter((e) => e.lap <= L && (lap != null || e.lap === 0)).slice(-16).reverse();
    list.replaceChildren(...shownLog.map((e) => h('li', { class: `rl-${e.cls}` },
      h('span.rl-lap.num', `L${e.lap}`), h('span.rl-text', { html: e.html }))));
  }

  function set(v) {
    setLap(v == null ? null : Math.min(totalLaps, Math.floor(v)));
    const T = v == null ? null : rr.racingTimeAt(focus, Math.min(v, totalLaps));
    cars.forEach((g, i) => {
      const drv = onTrack[i];
      let xy, hide = false;
      if (T == null) {
        xy = onPath(geo.pts, -0.010 * (i + 1));
      } else {
        const p = rr.progressAt(drv, T);
        if (p.out && !p.finished) hide = true;
        const pit = drv.pits.find((x) => x.lap === p.lap);
        if (pit && p.frac > PIT_ENTRY) xy = onPolyline(geo.pit, (p.frac - PIT_ENTRY) / (1 - PIT_ENTRY));
        else xy = onPath(geo.pts, p.frac);
      }
      g.setAttribute('transform', `translate(${xy[0].toFixed(1)} ${xy[1].toFixed(1)})`);
      g.setAttribute('opacity', hide ? '0.12' : '1');
    });
    const pct = v == null ? 0 : (Math.min(v, totalLaps) / totalLaps) * 100;
    cursors.forEach((c) => { c.style.left = `${pct}%`; });
  }

  set(null);
  return { set, focus, totalLaps };
}
