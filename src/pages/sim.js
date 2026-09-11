// 시뮬레이터 — 3단계 스텝 흐름 (기획서 4절)
// 1 조건 → 2 전략+근거 → 3 레이스 재생

import { mountShell } from '../shell.js';
import { $, h, mount, debounce } from '../ui/dom.js';
import { applyTeamTheme, resolveAccent, textClassFor } from '../ui/theme.js';
import { renderGarage } from '../ui/garage.js';
import { renderBuilder } from '../ui/stintBuilder.js';
import { renderRaceTrace } from '../ui/raceTrace.js';
import { renderRaceReplay } from '../ui/raceReplay.js';
import { createPlayback, renderTransport } from '../ui/playback.js';
import { renderDistribution } from '../ui/distribution.js';
import { renderExplain, initGlossary } from '../ui/explainPanel.js';
import { renderStrategyBoard } from '../ui/strategyBoard.js';
import { pitWindows } from '../engine/pitWindow.js';
import { renderRealRace } from '../ui/realRaceView.js';
import { loadRaceIndex, loadRace } from '../data/races.js';
import { buildRealRace, myCarFrom, timelineFromRace, planFromStints, paceOffset } from '../engine/realRace.js';

import { state, set, subscribe, scenarioOf, scenarioSeed, syncUrl, fromQuery } from '../store.js';
import { CIRCUITS } from '../data/circuits.js';
import { TEAMS, driversOf } from '../data/teams.js';
import { simulate, fmtRaceTime, fmtGap } from '../engine/simulate.js';
import { searchStrategies } from '../engine/strategySearch.js';
import { validatePlan } from '../engine/rules.js';
import { runMonteCarlo } from '../engine/monteCarlo.js';
import { explainPlan } from '../engine/explain.js';
import { buildTrace } from '../engine/trace.js';
import { runSelfTest } from '../engine/selftest.js';
import { COMPOUND_KO } from '../engine/params.js';
import { eun } from '../engine/josa.js';

mountShell();
initGlossary();

/* ---------- 상태 ---------- */
const undoStack = [];
const redoStack = [];
let running = false;
let trace = null;
let traceCtl = null;
let transportCtl = null;
let replayCtl = null;
let lastIntLap = -1;
let lastStep = null;                       // 스텝이 바뀔 때만 슬라이드 애니메이션
let windowsCache = { seed: null, windows: null };   // 피트 윈도우는 시나리오당 한 번만 계산
const playback = createPlayback();

function getWindows(sc) {
  const seed = scenarioSeed();
  if (windowsCache.seed !== seed) {
    windowsCache = { seed, windows: state.plans.map((p) => pitWindows(sc, p, seed, timelineOf(sc))) };
  }
  return windowsCache.windows;
}

/* ---------- 계산 ---------- */
/* ---------- 실제 경기 재현 ----------
   raceKey 가 있으면 그 경기의 랩 수·노면 온도·중단 구간을 시나리오에 씌운다.
   추천 탐색·피트 윈도우·시뮬레이션이 전부 같은 타임라인을 쓴다. */
let realIndex = [];
let realRace = null;      // data/races 의 경기 JSON

/** 실제 경기 모드면 랩 수를 그 경기에 맞춘 시나리오 */
function scenarioNow() {
  const sc = scenarioOf();
  if (realRace) sc.circuit = { ...sc.circuit, laps: realRace.totalLaps };
  return sc;
}

/** 이 시나리오에 쓸 랩별 깃발 타임라인 */
function timelineOf(sc) {
  return realRace
    ? timelineFromRace(realRace.bands, sc.circuit.laps)
    : new Array(sc.circuit.laps).fill('green');
}

function recompute() {
  const sc = scenarioNow();
  const seed = scenarioSeed();
  const tl = timelineOf(sc);
  const plans = searchStrategies(sc, seed, tl);
  const results = plans.map((p) => simulate(sc, p, seed, tl));
  let myPlan = state.myPlan ? refit(state.myPlan, sc.circuit.laps) : null;
  const myResult = myPlan ? simulate(sc, myPlan, seed, tl) : null;
  set({ plans, results, myPlan, myResult, selected: Math.min(state.selected, Math.max(0, plans.length - 1)), mc: null }, 'compute');
}

function refit(plan, totalLaps) {
  const sum = plan.stints.reduce((a, s) => a + s.laps, 0);
  if (sum === totalLaps) return plan;
  const scale = totalLaps / sum;
  const stints = plan.stints.map((s) => ({ ...s, laps: Math.max(4, Math.round(s.laps * scale)) }));
  let diff = totalLaps - stints.reduce((a, s) => a + s.laps, 0);
  for (let i = 0; diff !== 0 && i < 500; i++) {
    const idx = i % stints.length;
    if (diff > 0) { stints[idx].laps++; diff--; }
    else if (stints[idx].laps > 4) { stints[idx].laps--; diff++; }
  }
  return { ...plan, stints };
}

function simMine(plan) {
  const sc = scenarioNow();
  return simulate(sc, plan, scenarioSeed(), timelineOf(sc));
}

async function runMc() {
  if (running || !state.plans.length) return;
  running = true;
  render();
  await new Promise((r) => setTimeout(r, 16));
  const mc = runMonteCarlo(scenarioNow(), state.plans, scenarioSeed());
  running = false;
  set({ mc }, 'mc');
}

/* ---------- 빌더 ---------- */
function onPlanChange(next, { transient }) {
  if (!transient) {
    undoStack.push(JSON.stringify(state.myPlan));
    if (undoStack.length > 20) undoStack.shift();
    redoStack.length = 0;
  }
  set({ myPlan: next, myResult: simMine(next) }, 'plan');
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(state.myPlan));
  const prev = JSON.parse(undoStack.pop());
  set({ myPlan: prev, myResult: prev ? simMine(prev) : null }, 'plan');
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(state.myPlan));
  const next = JSON.parse(redoStack.pop());
  set({ myPlan: next, myResult: simMine(next) }, 'plan');
}

/* ---------- 스텝 ---------- */
function goStep(n) {
  playback.pause();
  set({ step: n }, 'step');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderStepper() {
  const labels = ['조건', '전략', '레이스'];
  mount($('#stepper'),
    labels.flatMap((label, i) => {
      const n = i + 1;
      const stateOf = n < state.step ? 'done' : n === state.step ? 'current' : 'todo';
      const btn = h('button.step', {
        type: 'button', 'data-state': stateOf,
        'aria-current': stateOf === 'current' ? 'step' : null,
        disabled: stateOf === 'todo',
        onclick: () => stateOf === 'done' && goStep(n),
      }, h('span.step-dot', String(n)), h('span.step-label', label));
      return i < labels.length - 1
        ? [btn, h('span.step-line', { 'data-done': n < state.step ? '' : null })]
        : [btn];
    }));
}

function contextLine(sc) {
  return `${sc.circuit.track} · ${sc.team.name} / ${sc.driver.name} · ${sc.weather.trackTemp}°C · ${{ dry: '건조', rain: '비', heavy: '폭우' }[sc.weather.surface]}`;
}

/** 실제 경기로 전환/해제. 서킷·랩 수·노면 온도를 그 경기 값으로 맞춘다. */
async function setRace(key) {
  if (!key) {
    realRace = null;
    set({ raceKey: null }, 'scenario');
    return;
  }
  set({ raceKey: key }, 'race-loading');
  try {
    const data = await loadRace(key);
    realRace = data;
    set({
      raceKey: key,
      circuitId: data.circuitId,
      trackTemp: Math.round(data.weather.trackTemp ?? state.trackTemp),
      surface: data.weather.rain ? state.surface : 'dry',
    }, 'scenario');
  } catch (e) {
    realRace = null;
    set({ raceKey: null }, 'scenario');
  }
}

const circuitNameOf = (id) => (CIRCUITS.find((c) => c.id === id) || {}).name || id;

/** 중단 구간 요약 칩 */
function bandChips(bands) {
  const n = (t) => (bands || []).filter((b) => b.type === t).length;
  const out = [];
  if (n('red')) out.push(h('span.chip-red', `적기 ${n('red')}회`));
  if (n('sc')) out.push(h('span.chip-sc', `SC ${n('sc')}회`));
  if (n('vsc')) out.push(h('span.chip-vsc', `VSC ${n('vsc')}회`));
  if (!out.length) out.push(h('span.chip-green', '중단 없음'));
  return out;
}

/* ---------- 스텝 1 — 조건 ---------- */
function renderStep1(root, sc) {
  const focusId = document.activeElement && document.activeElement.id;
  const drivers = driversOf(state.teamId);
  const sel = (opts, value, onchange, disabled) =>
    h('select', { onchange: (e) => onchange(e.target.value), disabled: disabled ? 'true' : null,
      title: disabled ? '실제 경기 모드에서는 그 경기의 서킷으로 고정됩니다' : null },
      opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  const field = (label, ctrl) => { const id = 'f' + Math.random().toString(36).slice(2, 7); ctrl.id = id; return h('div.field', h('label', { for: id }, label), ctrl); };
  // 숫자 입력. 키 입력마다 재렌더하면 포커스가 날아가므로 change(확정) 시점에만 반영한다.
  const numField = (label, key, min, max, unit) => {
    const id = `in-${key}`;
    return h('div.field',
      h('label', { for: id }, label),
      h('div.num-field',
        h('input', { id, type: 'number', min, max, step: 1, value: state[key], inputmode: 'numeric',
          'aria-label': `${label} (${min}~${max}${unit})`,
          onchange: (e) => {
            let v = Math.round(Number(e.target.value));
            if (!Number.isFinite(v)) v = state[key];
            v = Math.max(min, Math.min(max, v));
            e.target.value = v;
            if (v !== state[key]) set({ [key]: v }, 'scenario');
          } }),
        h('span.unit', unit)));
  };

  const realOn = !!state.raceKey;

  mount(root,
    h('div.sim-head', h('h2.sim-question', '어디서, 누가, 어떤 날씨에 달리나요?')),

    // 실제 경기에 내 전략을 넣어 볼지 먼저 고른다
    h('div.card.mode-card',
      h('div.field', h('label', '레이스'),
        h('div.seg', { role: 'group', 'aria-label': '레이스 종류' },
          h('button', { type: 'button', 'aria-pressed': String(!realOn), onclick: () => setRace(null) }, '가상 조건'),
          h('button', { type: 'button', 'aria-pressed': String(realOn), onclick: () => setRace((realIndex[realIndex.length - 1] || {}).key || null) }, '실제 경기'))),
      realOn
        ? h('div.mode-body',
          field('경기', sel(realIndex.map((r) => [r.key, `${r.year} ${circuitNameOf(r.circuitId)} · ${r.date}`]), state.raceKey, (v) => setRace(v))),
          realRace
            ? h('div.mode-meta',
              h('span', h('b', String(realRace.totalLaps)), ' 랩'),
              h('span', '노면 ', h('b', `${realRace.weather.trackTemp ?? '—'}`), '°C'),
              ...bandChips(realRace.bands),
              h('span.mode-note', '이 경기의 세이프티카·VSC·적기 구간을 그대로 넣고, 실제 상대들과 같은 순위표에서 비교합니다'))
            : h('div.mode-meta', h('span.mode-note', '경기 기록을 불러오는 중…')))
        : h('div.mode-body', h('span.mode-note', '서킷과 날씨를 직접 정하고, 세이프티카는 확률로 발생시킵니다')),
    ),

    h('div.cond-grid',
      h('div.card',
        field('서킷', sel(CIRCUITS.map((c) => [c.id, c.name]), state.circuitId,
          (v) => set({ circuitId: v }, 'scenario'), realOn)),
        h('div.circuit-meta',
          h('span', h('b', String(sc.circuit.laps)), ' 랩'),
          h('span', h('b', sc.circuit.lengthKm.toFixed(3)), ' km'),
          h('span', '피트 손실 ', h('b', sc.circuit.pitLoss.toFixed(1)), '초'),
          sc.circuit.calibrated
            ? h('span.badge.badge-ok', '✓ 실측 캘리브레이션')
            : h('span.badge.badge-muted', '근사 초기값')),
        h('div', { style: { marginTop: 'var(--s-5)' } },
          h('div.field-row',
            field('팀', sel(TEAMS.map((t) => [t.id, t.name]), state.teamId, (v) => set({ teamId: v, driverId: driversOf(v)[0].id }, 'scenario'))),
            field('드라이버', sel(drivers.map((d) => [d.id, d.name]), state.driverId, (v) => set({ driverId: v }, 'scenario'))))),
        h('div.field', { style: { marginTop: 'var(--s-4)' } },
          h('label', '노면'),
          h('div.seg', { role: 'group', 'aria-label': '노면' },
            [['dry', '건조'], ['rain', '비'], ['heavy', '폭우']].map(([v, l]) =>
              h('button', { type: 'button', 'aria-pressed': String(state.surface === v), onclick: () => set({ surface: v }, 'scenario') }, l)))),
        numField('노면 온도', 'trackTemp', 10, 60, '°C'),
        field('스타팅 그리드', h('input', { type: 'number', min: 1, max: 22, step: 1, value: state.grid, id: 'in-grid',
          onchange: (e) => { const v = Math.max(1, Math.min(22, Math.round(Number(e.target.value)) || 1)); e.target.value = v; if (v !== state.grid) set({ grid: v }, 'scenario'); } })),
        h('details.adv',
          h('summary', '고급 설정'),
          h('div',
            numField('기온', 'airTemp', 0, 45, '°C'),
            numField('습도', 'humidity', 10, 100, '%'),
            h('div.field', h('label', '예상 트래픽'),
              h('div.seg', [['clean', '없음'], ['light', '적음'], ['medium', '보통'], ['heavy', '많음']].map(([v, l]) =>
                h('button', { type: 'button', 'aria-pressed': String(state.traffic === v), onclick: () => set({ traffic: v }, 'scenario') }, l))))))),
      h('div#garage')),
    h('div.sim-foot',
      h('span', { style: { fontSize: '13px', color: 'var(--fg-2)' } }, '조건을 바꾸면 오른쪽이 바로 반영됩니다'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => goStep(2) }, '전략 계산하기 →')));

  const shown = state.plans[state.selected];
  renderGarage($('#garage'), { scenario: sc, compound: shown ? shown.stints[0].compound : 'MEDIUM', gridPos: state.grid });
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus({ preventScroll: true }); }
}

/* ---------- 스텝 2 — 전략 + 근거 ---------- */
function renderStep2(root, sc) {
  mount(root,
    h('div.sim-head',
      h('h2.sim-question', '어떤 전략이 빠르고, 왜 빠른가요?'),
      h('div.sim-context', h('span', contextLine(sc)), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => goStep(1) }, '조건 바꾸기'))),

    h('div#board'),

    h('div.card.explain-panel',
      h('h3#explainTitle'),
      h('div#explain')),

    h('details.fold', { open: !!state.myPlan },
      h('summary', '직접 바꿔보기', h('span.hint', '피트 마커를 드래그하거나 ← → 키')),
      h('div.fold-body', h('div#builder'))),

    h('div.sim-foot',
      h('button.btn.btn-ghost', { type: 'button', onclick: () => goStep(1) }, '← 조건'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => goStep(3) }, '레이스 보기 →')));

  // 피렐리식 전략 보드. 윈도우는 피트 랩을 ±5 옮겨 시뮬레이션해 실제로 계산 (시나리오당 1회 캐시)
  renderStrategyBoard($('#board'), {
    plans: state.plans, results: state.results,
    windows: getWindows(sc),
    selected: state.myPlan ? -1 : state.selected,
    totalLaps: sc.circuit.laps, circuit: sc.circuit, team: sc.team,
    onSelect: (i) => set({ selected: i, myPlan: null, myResult: null }, 'select'),
  });
  renderExplainInto(sc);
  renderBuilderInto(sc);
}

function renderExplainInto(sc) {
  const target = state.myPlan || state.plans[state.selected];
  const targetRes = state.myPlan ? state.myResult : state.results[state.selected];
  const el = $('#explain');
  if (!el) return;
  if (target && targetRes && !targetRes.invalid) {
    $('#explainTitle').textContent = state.myPlan ? '내 전략은 왜 이 시간이 나오나' : `왜 ${target.stints.length - 1}스톱인가`;
    renderExplain(el, explainPlan(sc, target, targetRes, state.plans, state.results));
    el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap');
  } else {
    renderExplain(el, []);
  }
}

function renderBuilderInto(sc) {
  const root = $('#builder');
  if (!root) return;
  // 내 전략이 없으면 선택된 추천안을 복사해 시작
  const builderPlan = state.myPlan || (state.plans[state.selected] && { id: 'my', label: '내 전략', stints: state.plans[state.selected].stints.map((s) => ({ ...s })) });
  const builderRes = state.myPlan ? state.myResult : (builderPlan ? simMine(builderPlan) : null);
  const ref = state.results[0] && !state.results[0].invalid ? state.results[0].total : null;
  renderBuilder(root, {
    plan: builderPlan, totalLaps: sc.circuit.laps, result: builderRes, refTotal: ref, surface: sc.weather.surface,
    validation: builderPlan ? validatePlan(builderPlan, sc) : { legal: true, errors: [], warnings: [] },
    onPreview: (p) => simMine(p),           // 드래그 중: 총시간만 제자리 갱신, 화면은 그대로
    onChange: (next, opts) => { if (!state.myPlan) { undoStack.length = 0; redoStack.length = 0; } onPlanChange(next, opts); },
    onUndo: undo, onRedo: redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
  });
}

/** 전략 편집 커밋 — 보드·스테퍼는 두고 근거·빌더·선택 표시만 갱신 */
function renderPlanPartial() {
  const sc = scenarioNow();
  renderExplainInto(sc);
  renderBuilderInto(sc);
  document.querySelectorAll('.board-row').forEach((row, i) => {
    const on = !state.myPlan && state.selected === i;
    row.setAttribute('aria-checked', String(on));
    row.tabIndex = on ? 0 : -1;
  });
  syncUrl();
}

/* ---------- 스텝 3 — 레이스 ---------- */
function renderStep3(root, sc) {
  if (realRace) return renderStep3Real(root, sc);
  const entries = state.plans.map((p, i) => ({ plan: p, result: state.results[i] }));
  if (state.myPlan && state.myResult) entries.push({ plan: state.myPlan, result: state.myResult });
  trace = buildTrace(entries);
  const focusIdx = state.myPlan ? entries.length - 1 : state.selected;
  const dataColor = resolveAccent(sc.team.colors.team, 'data');
  const focusLabel = (state.myPlan || state.plans[state.selected])?.label || '';

  mount(root,
    h('div.sim-head',
      h('h2.sim-question', `${eun(focusLabel)} 레이스에서 어떻게 움직이나요?`),
      h('div.sim-context', h('span', contextLine(sc)), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => goStep(2) }, '전략 바꾸기'))),
    // 조사에서 확인한 공통 구조: 헤더 카드 → 트랙 맵 + 타이밍 타워 → 간트 → 로그 (docs/레이스-시뮬레이션-조사.md)
    h('div.race',
      h('div.race-head#raceHead'),
      h('div.race-transport', h('div#transport')),
      h('div.race-main', h('div.race-map#raceMap'), h('div.race-tower#raceTower')),
      h('div.race-gantt#raceGantt'),
      h('div.race-log', h('h4', '레이스 로그'), h('div#raceLog'))),
    h('details.fold',
      h('summary', '레이스 트레이스', h('span.hint', '평균 페이스 대비 누적 시간차')),
      h('div.fold-body', h('div#trace'))),
    h('details.fold',
      h('summary', '500회 돌려보면?', h('span.hint', '세이프티카 변동을 포함한 몬테카를로')),
      h('div.fold-body',
        h('div#dist'),
        !state.mc && h('div', { style: { marginTop: 'var(--s-4)' } },
          h('button.btn.btn-primary', { type: 'button', disabled: running, onclick: runMc }, running ? '계산 중…' : '500회 실행')))),
    h('div.sim-foot',
      h('button.btn.btn-ghost', { type: 'button', onclick: () => goStep(2) }, '← 전략'),
      h('button.btn.btn-ghost', { type: 'button', onclick: () => { playback.reset(); goStep(1); } }, '처음으로')));

  playback.setTotal(trace ? trace.totalLaps : 0);
  replayCtl = trace ? renderRaceReplay(
    { head: $('#raceHead'), map: $('#raceMap'), tower: $('#raceTower'), gantt: $('#raceGantt'), log: $('#raceLog') },
    { trace, entries, circuit: sc.circuit, focusIdx, mineColor: dataColor }) : null;
  traceCtl = renderRaceTrace($('#trace'), { trace, mineColor: dataColor, onScrub: (lap) => playback.seek(lap) });
  transportCtl = renderTransport($('#transport'), playback);
  const v = playback.lap;
  const lap0 = v == null ? null : Math.floor(v);
  lastIntLap = lap0;
  if (replayCtl) replayCtl.set(v);
  traceCtl.setLap(lap0);
  transportCtl.sync(lap0);
  renderDistribution($('#dist'), { mc: state.mc, plans: state.plans });
}


/**
 * 실제 경기 모드의 스텝 3.
 * 내 전략을 시뮬레이션한 결과를 그 경기의 실제 필드에 끼워 넣어 순위를 낸다.
 * 기준이 어긋나지 않도록 적기 중단분을 양쪽에서 같은 값으로 뺀다 (engine/realRace.js).
 */
function renderStep3Real(root, sc) {
  const plan = state.myPlan || state.plans[state.selected];
  const result = state.myPlan ? state.myResult : state.results[state.selected];
  const dataColor = resolveAccent(sc.team.colors.team, 'data');
  const label = `${sc.driver.name} · ${plan ? plan.label : ''}`;

  // 기준 페이스 맞추기 — 우승자의 실제 전략을 우리 모델로 돌려 실제 기록과의 차이를 랩당으로 나눈다.
  // 이걸 하지 않으면 근사 초기값 서킷에서 모델이 랩당 몇 초 빨라 순위가 의미를 잃는다.
  const base = buildRealRace(realRace);
  const ref = base.drivers.find((d) => d.pos === 1 && !d.dnf) || base.drivers[0];
  const refPlan = ref ? planFromStints(ref.stints, sc.circuit.laps) : null;
  const refSim = refPlan ? simulate(sc, refPlan, scenarioSeed(), timelineOf(sc)) : null;
  const offset = refSim && !refSim.invalid && ref.racing.length === sc.circuit.laps
    ? paceOffset(ref.racing[ref.racing.length - 1], refSim.total, sc.circuit.laps)
    : 0;

  const myCar = plan && result && !result.invalid
    ? myCarFrom(result, plan, { label, colour: dataColor, team: sc.team.name, offset })
    : null;
  const rr = buildRealRace(realRace, myCar);
  const finish = myCar ? rr.standingsAt(rr.totalLaps).find((r) => r.driver.mine) : null;
  const winner = ref || rr.race.drivers[0];

  mount(root,
    h('div.sim-head',
      h('h2.sim-question', finish
        ? `${realRace.meetingName} 에 이 전략으로 나갔다면 ${finish.pos}위`
        : `${realRace.meetingName} 재현`),
      h('div.sim-context',
        h('span', `${contextLine(sc)} · 실제 경기 ${realRace.date}`),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => goStep(2) }, '전략 바꾸기'))),

    finish ? h('div.real-verdict',
      h('div.rv-pos', h('b.num', String(finish.pos)), h('span', '위 / ' + rr.drivers.filter((d) => !d.dnf).length + '대')),
      h('div.rv-txt',
        h('p', `${plan.label}(${plan.stints.map((st) => COMPOUND_KO[st.compound]).join(' → ')})로 `
          + `${realRace.totalLaps}랩을 달렸을 때의 자리입니다. `
          + (finish.pos === 1
            ? `실제 우승자 ${winner.name} 보다 앞섭니다.`
            : `선두와 ${finish.lapsBehind > 0 ? `${finish.lapsBehind}랩` : `${finish.gap.toFixed(1)}초`} 차이입니다.`)),
        h('p.rv-note', '상대는 그날 실제로 기록한 랩타임 그대로이고, 내 차만 우리 모델로 계산합니다. '
          + '세이프티카·VSC 구간은 그 경기 기록을 그대로 넣었습니다. '
          + (offset
            ? `내 차의 기본 페이스는 우승자 ${winner.code} 의 실제 전략을 같은 모델로 돌려 랩당 ${offset > 0 ? '+' : ''}${offset.toFixed(2)}초 맞췄습니다. 팀·드라이버 능력치 차이는 이 보정에 흡수되므로, 순위 차이에는 전략 차이만 남습니다.`
            : '기준 페이스 보정은 적용하지 못했습니다. 순위에 서킷 페이스 오차가 섞여 있습니다.')
          + (rr.reds.size ? ' 적기 중단은 느린 랩으로만 반영되고, 중단 중 무손실 타이어 교체는 모델에 없습니다.' : '')))) : null,

    h('div.race.race-real',
      h('div.race-head#raceHead'),
      h('div.race-transport', h('div#transport')),
      h('div.race-main', h('div.race-map#raceMap'), h('div.race-tower#raceTower')),
      h('div.race-gantt#raceGantt'),
      h('div.race-log', h('h4', '레이스 로그'), h('div#raceLog'))),

    h('details.fold', { open: 'true' },
      h('summary', '최종 순위', h('span.hint', myCar ? '내 차를 넣은 시뮬레이션 순위' : '실제 결과')),
      h('div.fold-body', h('div#raceResult'))),

    h('p.rr-src', `기록 출처: OpenF1 (${realRace.collected} 수집) · 세션 ${realRace.sessionKey}`),

    h('div.sim-foot',
      h('button.btn.btn-ghost', { type: 'button', onclick: () => goStep(2) }, '← 전략'),
      h('button.btn.btn-ghost', { type: 'button', onclick: () => { playback.reset(); goStep(1); } }, '처음으로')));

  trace = null;
  traceCtl = null;
  playback.setTotal(rr.totalLaps);
  const view = renderRealRace(
    { head: $('#raceHead'), map: $('#raceMap'), tower: $('#raceTower'), gantt: $('#raceGantt'), log: $('#raceLog'), result: $('#raceResult') },
    rr, { focusNum: myCar ? -1 : (rr.drivers[0] || {}).num });
  replayCtl = view;
  transportCtl = renderTransport($('#transport'), playback);
  const v = playback.lap;
  lastIntLap = v == null ? null : Math.floor(v);
  view.set(v);
  transportCtl.sync(lastIntLap);
}

playback.subscribe((v) => {
  if (replayCtl) replayCtl.set(v);               // 매 프레임 — 트랙 위 차 위치
  const lap = v == null ? null : Math.floor(v);
  if (lap !== lastIntLap) {                       // 랩이 바뀔 때만 — 트레이스·슬라이더
    lastIntLap = lap;
    if (traceCtl) traceCtl.setLap(lap);
    if (transportCtl) transportCtl.sync(lap);
  }
});
playback.onStateChange(() => { if (state.step === 3 && $('#transport')) transportCtl = renderTransport($('#transport'), playback); });

/* ---------- 렌더 ---------- */
function render() {
  const sc = scenarioNow();
  applyTeamTheme(sc.team);
  renderStepper();
  const root = $('#view');
  root.className = 'sim-view';
  if (state.step !== lastStep) {
    root.style.animation = 'none'; void root.offsetHeight; root.style.animation = '';
    lastStep = state.step;
  }
  if (state.step === 1) renderStep1(root, sc);
  else if (state.step === 2) renderStep2(root, sc);
  else renderStep3(root, sc);
  syncUrl();
}

const rerender = debounce(render, 30);
subscribe((reason) => {
  if (reason === 'scenario') recompute();
  else if (reason === 'plan' && state.step === 2) renderPlanPartial();
  else rerender();
});

fromQuery();
recompute();
render();

// 실제 경기 목록은 비동기로 받는다. URL 에 raceKey 가 있으면 그 경기까지 불러온다.
(async () => {
  realIndex = await loadRaceIndex();
  if (state.raceKey && realIndex.some((r) => r.key === state.raceKey)) {
    await setRace(state.raceKey);
  } else if (state.raceKey) {
    set({ raceKey: null }, 'scenario');
  } else if (state.step === 1) {
    render();                    // 목록이 채워졌으니 모드 카드를 다시 그린다
  }
})();

window.COMPOUND = { state, runSelfTest, recompute, render, goStep };
console.info('%cCOMPOUND', 'color:#27f4d2;font-weight:700', '— COMPOUND.runSelfTest() 로 엔진 검증');
