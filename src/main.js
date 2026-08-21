// 부팅 + 배선. 여기만 DOM 과 엔진을 동시에 안다.
import { $, h, mount, debounce } from './ui/dom.js';
import { applyTeamTheme, resolveAccent } from './ui/theme.js';
import { renderPanel } from './ui/scenarioPanel.js';
import { renderCards } from './ui/strategyCards.js';
import { renderBuilder } from './ui/stintBuilder.js';
import { renderLapChart } from './ui/lapChart.js';
import { renderDistribution } from './ui/distribution.js';
import { renderExplain, initGlossary } from './ui/explainPanel.js';
import { renderGarage } from './ui/garage.js';

import { state, set, subscribe, scenarioOf, scenarioSeed, syncUrl, fromQuery } from './store.js';
import { simulate } from './engine/simulate.js';
import { searchStrategies } from './engine/strategySearch.js';
import { validatePlan } from './engine/rules.js';
import { runMonteCarlo } from './engine/monteCarlo.js';
import { explainPlan } from './engine/explain.js';
import { runSelfTest } from './engine/selftest.js';
import { COMPOUND_COLOR } from './engine/params.js';

const undoStack = [];
const redoStack = [];
let running = false;

/* ---------- 계산 ---------- */

function recompute({ keepMc = false } = {}) {
  const sc = scenarioOf();
  const seed = scenarioSeed();
  const green = new Array(sc.circuit.laps).fill('green');

  const plans = searchStrategies(sc, seed);
  const results = plans.map((p) => simulate(sc, p, seed, green));

  // 시나리오가 바뀌면 내 전략은 랩 수가 안 맞을 수 있다 → 비율 유지하며 재조정
  let myPlan = state.myPlan;
  if (myPlan) {
    myPlan = refit(myPlan, sc.circuit.laps);
  }
  const myResult = myPlan ? simulate(sc, myPlan, seed, green) : null;

  set({
    plans, results, myPlan, myResult,
    selected: Math.min(state.selected, Math.max(0, plans.length - 1)),
    mc: keepMc ? state.mc : null,
  }, 'compute');
}

/** 스틴트 비율을 유지한 채 총 랩 수에 맞춘다 */
function refit(plan, totalLaps) {
  const sum = plan.stints.reduce((a, s) => a + s.laps, 0);
  if (sum === totalLaps) return plan;
  const scale = totalLaps / sum;
  const stints = plan.stints.map((s) => ({ ...s, laps: Math.max(4, Math.round(s.laps * scale)) }));
  let diff = totalLaps - stints.reduce((a, s) => a + s.laps, 0);
  let i = 0;
  while (diff !== 0 && i < 500) {
    const idx = i % stints.length;
    if (diff > 0) { stints[idx].laps++; diff--; }
    else if (stints[idx].laps > 4) { stints[idx].laps--; diff++; }
    i++;
  }
  return { ...plan, stints };
}

async function runMc() {
  if (running || !state.plans.length) return;
  running = true;
  render();
  await new Promise((r) => setTimeout(r, 16)); // 버튼 상태를 먼저 그린다

  const t0 = performance.now();
  const sc = scenarioOf();
  const mc = runMonteCarlo(sc, state.plans, scenarioSeed());
  const ms = Math.round(performance.now() - t0);
  console.info(`[APEX] 몬테카를로 ${mc.runs}회 · ${ms}ms`);

  running = false;
  set({ mc }, 'mc');
}

/* ---------- 빌더 편집 ---------- */

function onPlanChange(next, { transient }) {
  if (!transient) {
    undoStack.push(JSON.stringify(state.myPlan));
    if (undoStack.length > 20) undoStack.shift();
    redoStack.length = 0;
  }
  const sc = scenarioOf();
  const green = new Array(sc.circuit.laps).fill('green');
  set({ myPlan: next, myResult: simulate(sc, next, scenarioSeed(), green) }, 'plan');
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(state.myPlan));
  const prev = JSON.parse(undoStack.pop());
  const sc = scenarioOf();
  set({ myPlan: prev, myResult: prev ? simulate(sc, prev, scenarioSeed(), new Array(sc.circuit.laps).fill('green')) : null }, 'plan');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(state.myPlan));
  const next = JSON.parse(redoStack.pop());
  const sc = scenarioOf();
  set({ myPlan: next, myResult: simulate(sc, next, scenarioSeed(), new Array(sc.circuit.laps).fill('green')) }, 'plan');
}

/* ---------- 렌더 ---------- */

function render() {
  const sc = scenarioOf();
  applyTeamTheme(sc.team);

  $('#brandMark').textContent = sc.team.name[0];
  $('#scenarioLine').textContent =
    `${sc.circuit.track} · ${sc.circuit.laps}랩 · ${sc.team.name} / ${sc.driver.name} · ` +
    `${sc.weather.trackTemp}°C · ${{ dry: '건조', rain: '비', heavy: '폭우' }[sc.weather.surface]}`;

  // 스타트 컴파운드 = 현재 보고 있는 전략의 1스틴트
  const shown = state.myPlan || state.plans[state.selected];
  const startCompound = shown ? shown.stints[0].compound : 'MEDIUM';
  renderGarage($('#garage'), { scenario: sc, compound: startCompound, gridPos: state.grid });

  renderPanel($('#panel'), { onRun: runMc, running });

  renderCards($('#cards'), {
    plans: state.plans,
    results: state.results,
    selected: state.selected,
    mc: state.mc,
    totalLaps: sc.circuit.laps,
    onSelect: (i) => set({ selected: i }, 'select'),
    onCopy: (i) => {
      undoStack.length = 0;
      redoStack.length = 0;
      const src = state.plans[i];
      const plan = { id: 'my', label: '내 전략', stints: src.stints.map((s) => ({ ...s })) };
      set({ myPlan: plan, myResult: simulate(sc, plan, scenarioSeed(), new Array(sc.circuit.laps).fill('green')) }, 'plan');
      $('#builderSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });

  const refTotal = state.results[0] && !state.results[0].invalid ? state.results[0].total : null;
  renderBuilder($('#builder'), {
    plan: state.myPlan,
    totalLaps: sc.circuit.laps,
    result: state.myResult,
    refTotal,
    surface: sc.weather.surface,
    validation: state.myPlan ? validatePlan(state.myPlan, sc) : { legal: true, errors: [], warnings: [] },
    onChange: onPlanChange,
    onUndo: undo,
    onRedo: redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  });

  // 차트: 추천 3안 + 내 전략
  const dataColor = resolveAccent(sc.team.colors.team, 'data');
  const palette = ['#F2F4F7', '#9BA3AF', '#5F6672'];
  const series = state.plans.map((p, i) => ({
    name: p.label,
    result: state.results[i],
    color: palette[i] || '#5F6672',
    emphasis: state.selected === i && !state.myPlan,
  }));
  if (state.myPlan && state.myResult) {
    series.push({ name: '내 전략', result: state.myResult, color: dataColor, emphasis: true });
  } else if (series[state.selected]) {
    series[state.selected].emphasis = true;
  }
  renderLapChart($('#chart'), series, sc.circuit.laps);

  renderDistribution($('#dist'), { mc: state.mc, plans: state.plans });

  // 설명: 내 전략이 있으면 그것을, 없으면 선택된 추천안을
  const target = state.myPlan || state.plans[state.selected];
  const targetRes = state.myPlan ? state.myResult : state.results[state.selected];
  if (target && targetRes && !targetRes.invalid) {
    renderExplain($('#explain'),
      explainPlan(sc, target, targetRes, state.plans, state.results));
    $('#explainTitle').textContent = state.myPlan ? '내 전략이 이렇게 계산된 이유' : `${target.label} — 이 전략이 나온 이유`;
  } else {
    renderExplain($('#explain'), []);
  }

  syncUrl();
}

/* ---------- 부팅 ---------- */

const rerender = debounce(render, 30);

subscribe((reason) => {
  if (reason === 'scenario') recompute();
  else rerender();
});

initGlossary();
fromQuery();
recompute();
render();

// 콘솔 진단용
window.APEX = { state, runSelfTest, recompute, render };
console.info('%cAPEX Strategy v2', 'color:#27f4d2;font-weight:700', '— 콘솔에서 APEX.runSelfTest() 로 엔진 검증을 실행할 수 있습니다.');
