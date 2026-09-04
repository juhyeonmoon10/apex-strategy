// 시뮬레이터 — 3단계 스텝 흐름 (기획서 4절)
// 1 조건 → 2 전략+근거 → 3 레이스 재생

import { mountShell } from '../shell.js';
import { $, h, mount, debounce } from '../ui/dom.js';
import { applyTeamTheme, resolveAccent, textClassFor } from '../ui/theme.js';
import { renderGarage } from '../ui/garage.js';
import { renderBuilder } from '../ui/stintBuilder.js';
import { renderRaceTrace } from '../ui/raceTrace.js';
import { createPlayback, renderTransport } from '../ui/playback.js';
import { renderDistribution } from '../ui/distribution.js';
import { renderExplain, initGlossary } from '../ui/explainPanel.js';
import { renderStrategyBoard } from '../ui/strategyBoard.js';
import { pitWindows } from '../engine/pitWindow.js';

import { state, set, subscribe, scenarioOf, scenarioSeed, syncUrl, fromQuery } from '../store.js';
import { CIRCUITS } from '../data/circuits.js';
import { TEAMS, driversOf } from '../data/teams.js';
import { simulate, fmtRaceTime, fmtGap } from '../engine/simulate.js';
import { searchStrategies } from '../engine/strategySearch.js';
import { validatePlan } from '../engine/rules.js';
import { runMonteCarlo } from '../engine/monteCarlo.js';
import { explainPlan } from '../engine/explain.js';
import { buildTrace } from '../engine/trace.js';
import { narrateLap } from '../engine/narrate.js';
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
let lastStep = null;                       // 스텝이 바뀔 때만 슬라이드 애니메이션
let windowsCache = { seed: null, windows: null };   // 피트 윈도우는 시나리오당 한 번만 계산
const playback = createPlayback();

function getWindows(sc) {
  const seed = scenarioSeed();
  if (windowsCache.seed !== seed) {
    windowsCache = { seed, windows: state.plans.map((p) => pitWindows(sc, p, seed)) };
  }
  return windowsCache.windows;
}

/* ---------- 계산 ---------- */
function green(sc) { return new Array(sc.circuit.laps).fill('green'); }

function recompute() {
  const sc = scenarioOf();
  const seed = scenarioSeed();
  const plans = searchStrategies(sc, seed);
  const results = plans.map((p) => simulate(sc, p, seed, green(sc)));
  let myPlan = state.myPlan ? refit(state.myPlan, sc.circuit.laps) : null;
  const myResult = myPlan ? simulate(sc, myPlan, seed, green(sc)) : null;
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
  const sc = scenarioOf();
  return simulate(sc, plan, scenarioSeed(), green(sc));
}

async function runMc() {
  if (running || !state.plans.length) return;
  running = true;
  render();
  await new Promise((r) => setTimeout(r, 16));
  const mc = runMonteCarlo(scenarioOf(), state.plans, scenarioSeed());
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

/* ---------- 스텝 1 — 조건 ---------- */
function renderStep1(root, sc) {
  const focusId = document.activeElement && document.activeElement.id;
  const drivers = driversOf(state.teamId);
  const sel = (opts, value, onchange) =>
    h('select', { onchange: (e) => onchange(e.target.value) },
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

  mount(root,
    h('div.sim-head', h('h2.sim-question', '어디서, 누가, 어떤 날씨에 달리나요?')),
    h('div.cond-grid',
      h('div.card',
        field('서킷', sel(CIRCUITS.map((c) => [c.id, c.name]), state.circuitId, (v) => set({ circuitId: v }, 'scenario'))),
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
  const sc = scenarioOf();
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
    h('div.card',
      h('div#trace'),
      h('div#transport'),
      h('div.race-lower',
        h('div.trace-readout#readout'),
        h('div.narration', h('h4', '이 랩에서'), h('p#narration.empty', '▶ 재생을 누르거나 그래프를 끌어보세요')))),
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
  traceCtl = renderRaceTrace($('#trace'), { trace, mineColor: dataColor, onScrub: (lap) => playback.seek(lap) });
  // 판독부를 카드 하단 좌측으로 이동 (raceTrace 가 내부에 만든 것을 옮긴다)
  const inner = $('#trace .trace-readout');
  if (inner) { $('#readout').replaceWith(inner); inner.id = 'readout'; }
  transportCtl = renderTransport($('#transport'), playback);
  traceCtl.setLap(playback.lap);
  transportCtl.sync(playback.lap);
  updateNarration(playback.lap, focusIdx);
  renderDistribution($('#dist'), { mc: state.mc, plans: state.plans });
}

function updateNarration(lap, focusIdx) {
  const el = $('#narration');
  if (!el || !trace) return;
  if (lap == null) { el.className = 'empty'; el.textContent = '▶ 재생을 누르거나 그래프를 끌어보세요'; return; }
  el.className = '';
  el.innerHTML = narrateLap(trace, lap, focusIdx);
}

playback.subscribe((lap) => {
  if (traceCtl) traceCtl.setLap(lap);
  if (transportCtl) transportCtl.sync(lap);
  const focusIdx = state.myPlan ? (trace ? trace.series.length - 1 : 0) : state.selected;
  updateNarration(lap, focusIdx);
});
playback.onStateChange(() => { if (state.step === 3 && $('#transport')) transportCtl = renderTransport($('#transport'), playback); });

/* ---------- 렌더 ---------- */
function render() {
  const sc = scenarioOf();
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

window.COMPOUND = { state, runSelfTest, recompute, render, goStep };
console.info('%cCOMPOUND', 'color:#27f4d2;font-weight:700', '— COMPOUND.runSelfTest() 로 엔진 검증');
