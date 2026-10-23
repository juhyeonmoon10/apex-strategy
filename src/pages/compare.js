// 모델 비교 — 기존 모델과 조사 문서 수식의 차이를 그래프로.
// 숫자는 전부 페이지를 열 때 엔진으로 다시 계산한다 (하드코딩 없음). 시드 고정이라 항상 같은 결과.
import { mountShell } from '../shell.js';
import { applyTeamTheme } from '../ui/theme.js';
import { h, mount } from '../ui/dom.js';
import { CIRCUITS } from '../data/circuits.js';
import { TEAMS, DRIVERS, teamById } from '../data/teams.js';
import { loadRaceIndex, loadRace } from '../data/races.js';
import { COMPOUND_KO, COMPOUND_COLOR } from '../engine/params.js';
import { degradation } from '../engine/degradation.js';
import { compareModels } from '../engine/modelCompare.js';
import {
  docParams, docDegradation, stintLives, circuitSpeed, tyreTemperature, tempPenalty,
} from '../engine/docModel.js';

mountShell();
applyTeamTheme(teamById('mercedes'));

const SEED = 11;
const SLICK = ['SOFT', 'MEDIUM', 'HARD'];
const SHORT = { SOFT: 'S', MEDIUM: 'M', HARD: 'H' };
const BASE_C = '#8b72e8';   // 기존 모델 — 다크 배경 검증 통과 (dataviz validate_palette)
const DOC_C = '#17a491';    // 조사 문서 수식
const NS = 'http://www.w3.org/2000/svg';
const P = docParams();

const team = TEAMS.find((t) => t.id === 'mercedes');
const driver = DRIVERS.find((d) => d.id === 'russell') || DRIVERS.find((d) => d.teamId === 'mercedes');
const WEATHER = { surface: 'dry', trackTemp: 32, airTemp: 22, humidity: 55, rainChance: 5 };
const scenarioOf = (circuit) => ({ circuit, team, driver, weather: WEATHER, grid: 2, traffic: 'light', doc: P });

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  kids.flat().forEach((k) => k != null && el.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return el;
}
const median = (v) => {
  if (!v.length) return null;
  const a = [...v].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const shortName = (c) => {
  const m = c.name.match(/\(([^()]*(?:\([^()]*\))?[^()]*)\)\s*$/);
  return (m ? m[1] : c.name).replace(/\s*\(.*\)$/, '').replace(/ 서킷$| 시가지$| 인터내셔널$/, '');
};

/* ---------------- 툴팁 — 마크마다 data-tip ---------------- */
const tip = document.getElementById('cmpTip');
document.addEventListener('pointermove', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.getAttribute('data-tip');
  tip.hidden = false;
  const r = tip.getBoundingClientRect();
  const x = Math.min(window.innerWidth - r.width - 8, e.clientX + 14);
  const y = e.clientY + 16 + r.height > window.innerHeight ? e.clientY - r.height - 12 : e.clientY + 16;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${y}px`;
});
document.addEventListener('pointerleave', () => { tip.hidden = true; });

/* ---------------- 데이터 ---------------- */
async function computeAll(onProgress) {
  const rows = [];
  for (const c of CIRCUITS) {
    const sc = scenarioOf(c);
    const r = compareModels(sc, SEED);
    if (r.B && r.D) {
      rows.push({
        circuit: c, name: shortName(c),
        base: r.B.plan, doc: r.D.plan,
        baseTime: r.B.base.total, docTime: r.D.doc.total, temp: r.D.doc.tempTime,
        lives: r.lives, baseOver: !r.B.underDoc.legal,
        tyreT: tyreTemperature(P, WEATHER.trackTemp, WEATHER.airTemp, circuitSpeed(c)),
      });
    }
    onProgress(rows.length);
    await new Promise((res) => setTimeout(res, 0));   // 화면이 멈추지 않게 서킷마다 양보
  }
  return rows;
}

/** 2026 실제 경기 스틴트 — 스틴트가 끝날 때의 타이어 나이 */
async function realStints() {
  const out = { SOFT: [], MEDIUM: [], HARD: [] };
  try {
    const idx = await loadRaceIndex();
    const races = await Promise.all(idx.map((r) => loadRace(r.key).catch(() => null)));
    races.filter(Boolean).forEach((race) => race.drivers.forEach((d) => {
      (d.stints || []).forEach((st, i, arr) => {
        if (d.dnf && i === arr.length - 1) return;           // 리타이어로 끝난 스틴트는 뺀다
        const n = st.to - st.from + 1 + (st.age || 0);
        if (out[st.compound] && n >= 3) out[st.compound].push(n);
      });
    }));
  } catch { /* 기록을 못 읽으면 실제 분포 없이 그린다 */ }
  return out;
}

/* ---------------- 0. 숫자 세 개 ---------------- */
function heroTiles(rows, real) {
  const diff = rows.filter((r) => JSON.stringify(r.base.stints) !== JSON.stringify(r.doc.stints)).length;
  const dt = rows.map((r) => r.docTime - r.baseTime);
  const softBase = median(rows.flatMap((r) => r.base.stints.filter((x) => x.compound === 'SOFT').map((x) => x.laps)));
  const softLife = median(rows.map((r) => r.lives.SOFT.limit));
  const over = real.SOFT.length ? Math.round(100 * real.SOFT.filter((n) => n > softLife).length / real.SOFT.length) : null;
  const tile = (big, small) => h('div.cmp-tile', h('div.cmp-big', big), h('div.cmp-small', small));
  return h('div.cmp-tiles',
    tile(`${diff}/${rows.length}`, '서킷에서 다른 전략'),
    tile(h('span', h('b', { style: { color: BASE_C } }, softBase), ' vs ', h('b', { style: { color: DOC_C } }, softLife)), '소프트 랩 수 · 기존 추천 vs 문서 수명'),
    tile(`+${Math.min(...dt).toFixed(1)}~${Math.max(...dt).toFixed(1)}`, '문서 수식 예상 시간 (초)'),
    over != null ? tile(`${over}%`, `2026 실제 소프트 중 ${softLife}랩 넘김`) : null);
}

/* ---------------- 1. 열화 곡선 — 컴파운드별 작은 그래프 ---------------- */
function degCharts(rows) {
  const W = 300, H = 200, L = 34, R = 10, T = 12, B = 28;
  const maxAge = 40, maxY = 8;
  const x = (a) => L + (a / maxAge) * (W - L - R);
  const y = (v) => T + (1 - Math.min(v, maxY) / maxY) * (H - T - B);
  const ctx = { trackTemp: 32, surface: 'dry', circuitDeg: 1, teamDeg: 1, driverMgmt: 1 };

  return h('div.cmp-multiples', SLICK.map((c) => {
    const life = median(rows.map((r) => r.lives[c].limit));
    const col = COMPOUND_COLOR[c];
    const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cmp-svg', role: 'img', 'aria-label': `${COMPOUND_KO[c]} 타이어 나이별 손실` });
    for (let v = 0; v <= maxY; v += 2) {
      g.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g-grid' }),
        s('text', { x: L - 6, y: y(v) + 4, class: 'g-tick', 'text-anchor': 'end' }, `${v}`));
    }
    for (let a = 0; a <= maxAge; a += 10) g.append(s('text', { x: x(a), y: H - 8, class: 'g-tick', 'text-anchor': 'middle' }, `${a}`));
    // 문서 수명 이후 구간은 문서 모드에서 탈 수 없다 — 음영
    g.append(s('rect', { x: x(life), y: T, width: x(maxAge) - x(life), height: H - T - B, class: 'g-ban', 'data-tip': `문서 수식: ${life}랩 넘는 스틴트 금지` }));
    const pts = (fn, from) => { const p = []; for (let a = from; a <= maxAge; a++) p.push(`${x(a).toFixed(1)},${y(fn(a)).toFixed(1)}`); return p.join(' '); };
    g.append(
      s('polyline', { points: pts((a) => degradation(c, a, ctx), 2), fill: 'none', stroke: BASE_C, 'stroke-width': 2, 'stroke-dasharray': '5 4' }),
      s('polyline', { points: pts((a) => docDegradation(P, c, a, 1), 1), fill: 'none', stroke: DOC_C, 'stroke-width': 2 }),
      s('line', { x1: x(life), x2: x(life), y1: T, y2: H - B, stroke: DOC_C, 'stroke-width': 2 }),
      s('text', { x: x(life) + 4, y: T + 12, class: 'g-lab', fill: 'currentColor' }, `수명 ${life}`));
    // 히트 영역 — 나이마다 두 모델 값을 보여 준다
    for (let a = 1; a <= maxAge; a++) {
      g.append(s('rect', {
        x: x(a - 0.5), y: T, width: x(1) - x(0), height: H - T - B, fill: 'transparent',
        'data-tip': `${COMPOUND_KO[c]} ${a}랩 — 기존 ${a >= 2 ? degradation(c, a, ctx).toFixed(2) : '—'}초 · 문서 ${docDegradation(P, c, a, 1).toFixed(2)}초`,
      }));
    }
    return h('figure.cmp-fig',
      h('figcaption', h('i.cmp-dot', { style: { background: col } }), COMPOUND_KO[c]),
      g);
  }));
}

/* ---------------- 2. 한 세트로 몇 랩 — 실제 분포 + 두 모델 ---------------- */
function stintCharts(rows, real) {
  const W = 300, H = 170, L = 10, R = 10, T = 26, B = 26;
  const maxLap = 50, bin = 1;
  const x = (n) => L + (Math.min(n, maxLap) / maxLap) * (W - L - R);

  return h('div.cmp-multiples', SLICK.map((c) => {
    const v = real[c];
    const bins = new Array(Math.ceil(maxLap / bin) + 1).fill(0);
    v.forEach((n) => { bins[Math.min(bins.length - 1, Math.floor(n / bin))]++; });
    const maxN = Math.max(1, ...bins);
    const y = (n) => T + (1 - n / maxN) * (H - T - B);
    const life = median(rows.map((r) => r.lives[c].limit));
    const baseLaps = rows.flatMap((r) => r.base.stints.filter((x2) => x2.compound === c).map((x2) => x2.laps));
    const docLaps = rows.flatMap((r) => r.doc.stints.filter((x2) => x2.compound === c).map((x2) => x2.laps));
    const bMed = median(baseLaps), dMed = median(docLaps);
    const over = v.length ? Math.round(100 * v.filter((n) => n > life).length / v.length) : 0;

    const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cmp-svg', role: 'img', 'aria-label': `${COMPOUND_KO[c]} 실제 스틴트 길이 분포` });
    g.append(s('line', { x1: L, x2: W - R, y1: H - B, y2: H - B, class: 'g-axis' }));
    for (let n = 0; n <= maxLap; n += 10) g.append(s('text', { x: x(n), y: H - 8, class: 'g-tick', 'text-anchor': 'middle' }, `${n}${n === maxLap ? '+' : ''}`));
    const bw = x(bin) - x(0);
    bins.forEach((n, i) => {
      if (!n) return;
      const from = i * bin;
      g.append(s('rect', {
        x: x(from) + 1, y: y(n), width: Math.max(1, bw - 2), height: H - B - y(n), rx: 2,
        class: from > life ? 'g-bar over' : 'g-bar',
        'data-tip': `${from}랩${from >= maxLap ? ' 이상' : ''}: 실제 ${n}개 스틴트`,
      }));
    });
    const marker = (n, col, label, row, dash) => n == null ? null : [
      s('line', { x1: x(n), x2: x(n), y1: T - 4, y2: H - B, stroke: col, 'stroke-width': 2, 'stroke-dasharray': dash || null }),
      s('text', { x: x(n), y: row, class: 'g-lab', 'text-anchor': 'middle', fill: col }, label),
    ];
    g.append(...[marker(bMed, BASE_C, `기존 ${bMed}`, 10, '5 4'), marker(dMed, DOC_C, `문서 ${dMed}`, 22)].flat().filter(Boolean));
    return h('figure.cmp-fig',
      h('figcaption', h('i.cmp-dot', { style: { background: COMPOUND_COLOR[c] } }), COMPOUND_KO[c],
        h('span.cmp-fig-note', `실제 ${v.length}개 중 ${over}%가 ${life}랩 넘김`)),
      g);
  }));
}

/* ---------------- 3. 24개 서킷 전략 — 두 줄 간트 ---------------- */
function stintBar(plan, total, model) {
  return h('div.cmp-bar', { class: model },
    plan.stints.map((st) => h('span.cmp-seg', {
      class: `c-${st.compound}`,
      style: { flexGrow: st.laps, flexBasis: 0 },
      'data-tip': `${model === 'base' ? '기존' : '문서'} · ${COMPOUND_KO[st.compound]} ${st.laps}랩`,
    }, st.laps / total > 0.12 ? `${SHORT[st.compound]}${st.laps}` : '')));
}
function ganttChart(rows) {
  return h('div.cmp-gantt',
    h('div.cmp-gantt-head', h('span', ''),
      h('span', h('i.cmp-key.base'), '위 기존', h('i.cmp-key.doc', { style: { marginLeft: '16px' } }), '아래 문서'),
      h('span', '스톱')),
    rows.map((r) => {
      const ds = r.doc.stints.length - r.base.stints.length;
      return h('div.cmp-grow',
        h('div.cmp-gname', r.name),
        h('div.cmp-gbars', stintBar(r.base, r.circuit.laps, 'base'), stintBar(r.doc, r.circuit.laps, 'doc')),
        h('div.cmp-gstop', { class: ds > 0 ? 'up' : ds < 0 ? 'down' : '' , 'data-tip': `스톱 ${r.base.stints.length - 1} → ${r.doc.stints.length - 1}` },
          ds > 0 ? `+${ds}` : ds < 0 ? `${ds}` : '='));
    }));
}

/* ---------------- 4. 스톱 수 — 한 줄 막대 ---------------- */
function stopsBar(rows) {
  const same = rows.filter((r) => r.doc.stints.length === r.base.stints.length).length;
  const more = rows.filter((r) => r.doc.stints.length > r.base.stints.length).length;
  const less = rows.length - same - more;
  const seg = (n, cls, label) => n ? h('div.cmp-sseg', { class: cls, style: { flexGrow: n }, 'data-tip': `${label}: ${n}개 서킷` },
    h('b', n), h('span', label)) : null;
  return h('div.cmp-stops',
    seg(more, 'more', '문서가 더 많이'),
    seg(same, 'same', '같음'),
    seg(less, 'less', '문서가 더 적게'));
}

/* ---------------- 5. 예상 시간 차 — 가로 막대 ---------------- */
function timeChart(rows) {
  const data = rows.map((r) => ({ name: r.name, d: r.docTime - r.baseTime, t: r.temp })).sort((a, b) => b.d - a.d);
  const max = Math.max(...data.map((d) => d.d), 1);
  return h('div.cmp-tbars', data.map((d) => {
    const strat = Math.max(0, d.d - d.t);
    return h('div.cmp-trow', { 'data-tip': `${d.name}: +${d.d.toFixed(1)}초${d.t > 0.05 ? ` (온도 보정 ${d.t.toFixed(1)}초 포함)` : ''}` },
      h('div.cmp-tname', d.name),
      h('div.cmp-ttrack',
        h('span.cmp-tfill', { style: { width: `${(strat / max) * 100}%` } }),
        d.t > 0.05 ? h('span.cmp-tfill.temp', { style: { width: `${(d.t / max) * 100}%` } }) : null),
      h('div.cmp-tval', `+${d.d.toFixed(1)}`));
  }));
}

/* ---------------- 6. 온도 보정 — F4 곡선 위의 서킷 ---------------- */
function tempChart(rows) {
  const W = 640, H = 220, L = 40, R = 16, T = 16, B = 34;
  const t0 = 70, t1 = 135, maxY = 2.5;
  const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - Math.min(v, maxY) / maxY) * (H - T - B);
  const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cmp-svg wide', role: 'img', 'aria-label': '타이어 온도별 랩당 보정 시간' });
  for (let v = 0; v <= maxY; v += 0.5) {
    g.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'g-grid' }),
      s('text', { x: L - 6, y: y(v) + 4, class: 'g-tick', 'text-anchor': 'end' }, `${v}`));
  }
  for (let t = 70; t <= 130; t += 10) g.append(s('text', { x: x(t), y: H - 12, class: 'g-tick', 'text-anchor': 'middle' }, `${t}°C`));
  g.append(s('rect', { x: x(P.temp.tMin), y: T, width: x(P.temp.tMax) - x(P.temp.tMin), height: H - T - B, class: 'g-ok', 'data-tip': `적정 범위 ${P.temp.tMin}~${P.temp.tMax}°C — 보정 0초` }),
    s('text', { x: (x(P.temp.tMin) + x(P.temp.tMax)) / 2, y: T + 14, class: 'g-lab', 'text-anchor': 'middle', fill: 'currentColor' }, '보정 0'));
  const pts = [];
  for (let t = t0; t <= t1; t += 0.5) pts.push(`${x(t).toFixed(1)},${y(tempPenalty(P, t)).toFixed(1)}`);
  g.append(s('polyline', { points: pts.join(' '), fill: 'none', stroke: DOC_C, 'stroke-width': 2 }));

  const dot = (t, label, tipText, hot) => s('g', { 'data-tip': tipText },
    s('circle', { cx: x(t), cy: y(tempPenalty(P, t)), r: 5, fill: hot ? 'var(--warn)' : DOC_C, class: 'g-dot' }),
    label ? s('text', { x: x(t), y: y(tempPenalty(P, t)) - 10, class: 'g-lab', 'text-anchor': 'middle', fill: 'currentColor' }, label) : null);
  rows.forEach((r) => {
    const pen = tempPenalty(P, r.tyreT);
    const out = pen > 0;
    g.append(dot(r.tyreT, out ? r.name : null, `${r.name} (노면 32°C): 타이어 ${r.tyreT.toFixed(0)}°C · 랩당 +${pen.toFixed(2)}초`));
  });
  // 뜨거운 날 예시 — 몬차 노면 55°C
  const monza = rows.find((r) => r.circuit.id === 'italy');
  if (monza) {
    const hotT = tyreTemperature(P, 55, WEATHER.airTemp, circuitSpeed(monza.circuit));
    g.append(dot(hotT, `몬차 55°C`, `몬차 (노면 55°C): 타이어 ${hotT.toFixed(0)}°C · 랩당 +${tempPenalty(P, hotT).toFixed(2)}초`, true));
  }
  return g;
}

/* ---------------- 표로 보기 ---------------- */
function dataTable(rows) {
  const lab = (p) => p.stints.map((st) => `${SHORT[st.compound]}${st.laps}`).join(' → ');
  return h('details.fold.cmp-table',
    h('summary', '표로 보기'),
    h('div.fold-body', h('div.dt-wrap', h('table.dt',
      h('thead', h('tr', h('th', '서킷'), h('th', '기존'), h('th', '문서'), h('th', '시간 차 (초)'), h('th', '타이어 온도'))),
      h('tbody', rows.map((r) => h('tr',
        h('td', r.name), h('td', lab(r.base)), h('td', lab(r.doc)),
        h('td', `+${(r.docTime - r.baseTime).toFixed(1)}`), h('td', `${r.tyreT.toFixed(0)}°C`))))))));
}

/* ---------------- 조립 ---------------- */
const section = (no, title, note, ...body) => h('section.cmp-sec',
  h('h2', h('span.n', no), title),
  note ? h('p.cmp-note', note) : null,
  ...body);

async function main() {
  const root = document.getElementById('cmpRoot');
  const [rows, real] = await Promise.all([
    computeAll((n) => { const p = root.querySelector('.cmp-loading'); if (p) p.textContent = `계산 중… ${n}/${CIRCUITS.length}`; }),
    realStints(),
  ]);

  mount(root,
    heroTiles(rows, real),
    section('01', '타이어가 느려지는 모양', '점선 기존 · 실선 문서 · 음영 = 문서에서 금지', degCharts(rows),
      h('p.cmp-axis', '가로 타이어 나이(랩) · 세로 손실(초)')),
    section('02', '한 세트로 몇 랩?', '막대 = 2026 실제 스틴트 · 빨간 막대 = 문서 수명 넘김', stintCharts(rows, real)),
    section('03', '24개 서킷 추천 전략', null, ganttChart(rows)),
    section('04', '스톱 수', null, stopsBar(rows)),
    section('05', '예상 완주 시간 차', '문서 − 기존 (초) · 빗금 = 온도 보정', timeChart(rows)),
    section('06', '온도 보정', '모든 타이어에 같게 붙음 → 전략 순위는 그대로', tempChart(rows)),
    h('section.cmp-sec.cmp-sum',
      h('h2', h('span.n', '='), '차이의 원인'),
      h('div.cmp-cause',
        h('div', h('b', { style: { color: BASE_C } }, '기존'), h('span', '클리프 넘겨도 됨 · 손실 최대 3초')),
        h('div', h('b', { style: { color: DOC_C } }, '문서'), h('span', '클리프(τ) = 수명 · 넘기면 금지')))),
    dataTable(rows));
}

main();
