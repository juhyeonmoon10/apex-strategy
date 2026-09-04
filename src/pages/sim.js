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
import { stintBar, stintText } from '../ui/strategyCards.js';

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
const playback = createPlayback();

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
  const drivers = driversOf(state.teamId);
  const sel = (opts, value, onchange) =>
    h('select', { onchange: (e) => onchange(e.target.value) },
      opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l)));
  const field = (label, ctrl) => { const id = 'f' + Math.random().toString(36).slice(2, 7); ctrl.id = id; return h('div.field', h('label', { for: id }, label), ctrl); };
  const slider = (label, key, min, max, unit) =>
    h('div.field',
      h('div.slider-row', h('label', label), h('span.val.num', `${state[key]}${unit}`)),
      h('input', { type: 'range', min, max, value: state[key], 'aria-label': label,
        oninput: (e) => { const v = Number(e.target.value); e.target.closest('.field').querySelector('.val').textContent = `${v}${unit}`; set({ [key]: v }, 'scenario'); } }));

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
              h('button', { type: 'button', 'aria-pressed': state.surface === v, onclick: () => set({ surface: v }, 'scenario') }, l)))),
        slider('노면 온도', 'trackTemp', 10, 60, '°C'),
        field('스타팅 그리드', h('input', { type: 'number', min: 1, max: 22, value: state.grid,
          oninput: (e) => set({ grid: Math.max(1, Math.min(22, Number(e.target.value) || 1)) }, 'scenario') })),
        h('details.adv',
          h('summary', '고급 설정'),
          h('div',
            slider('기온', 'airTemp', 0, 45, '°C'),
            slider('습도', 'humidity', 10, 100, '%'),
            h('div.field', h('label', '예상 트래픽'),
              h('div.seg', [['clean', '없음'], ['light', '적음'], ['medium', '보통'], ['heavy', '많음']].map(([v, l]) =>
                h('button', { type: 'button', 'aria-pressed': state.traffic === v, onclick: () => set({ traffic: v }, 'scenario') }, l))))))),
      h('div#garage')),
    h('div.sim-foot',
      h('span', { style: { fontSize: '13px', color: 'var(--fg-2)' } }, '조건을 바꾸면 오른쪽이 바로 반영됩니다'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => goStep(2) }, '전략 계산하기 →')));

  const shown = state.plans[state.selected];
  renderGarage($('#garage'), { scenario: sc, compound: shown ? shown.stints[0].compound : 'MEDIUM', gridPos: state.grid });
}

/* ---------- 스텝 2 — 전략 + 근거 ---------- */
function renderStep2(root, sc) {
  const valid = state.results.filter((r) => r && !r.invalid);
  const best = valid.length ? Math.min(...valid.map((r) => r.total)) : 0;
  const target = state.myPlan || state.plans[state.selected];
  const targetRes = state.myPlan ? state.myResult : state.results[state.selected];

  mount(root,
    h('div.sim-head',
      h('h2.sim-question', '어떤 전략이 빠르고, 왜 빠른가요?'),
      h('div.sim-context', h('span', contextLine(sc)), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => goStep(1) }, '조건 바꾸기'))),

    h('div.cards', { role: 'radiogroup', 'aria-label': '추천 전략' },
      state.plans.map((plan, i) => {
        const res = state.results[i];
        const isBest = res && !res.invalid && Math.abs(res.total - best) < 0.05;
        const checked = !state.myPlan && state.selected === i;
        return h('div.strategy-card', {
          role: 'radio', tabindex: checked ? '0' : '-1', 'aria-checked': String(checked),
          'aria-label': `${plan.label}, ${plan.stints.length - 1}스톱, ${stintText(plan.stints)}`,
          onclick: () => set({ selected: i, myPlan: null, myResult: null }, 'select'),
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set({ selected: i, myPlan: null, myResult: null }, 'select'); } },
        },
          h('div.sc-head', h('span.no', `0${i + 1}`), h('span.label', plan.label), h('span.risk', `위험도 ${plan.risk}`)),
          stintBar(plan.stints, sc.circuit.laps),
          res && !res.invalid && h('div.sc-time', h('span.total', fmtRaceTime(res.total)), h('span.gap', { class: isBest ? 'best' : '' }, isBest ? '최적' : fmtGap(res.total - best))),
          res && !res.invalid && h('div.sc-meta', h('span', h('b', `${res.stops}`), '스톱'), h('span', '피트 ', h('b', res.pitTime.toFixed(1)), '초'), h('span', '마모 ', h('b', res.degTime.toFixed(1)), '초')),
          h('div.sc-pick', checked ? '선택됨' : ''));
      })),

    h('div.card.explain-panel',
      h('h3#explainTitle'),
      h('div#explain')),

    h('details.fold', { open: !!state.myPlan },
      h('summary', '직접 바꿔보기', h('span.hint', '피트 마커를 드래그하거나 ← → 키')),
      h('div.fold-body', h('div#builder'))),

    h('div.sim-foot',
      h('button.btn.btn-ghost', { type: 'button', onclick: () => goStep(1) }, '← 조건'),
      h('button.btn.btn-primary', { type: 'button', onclick: () => goStep(3) }, '레이스 보기 →')));

  if (target && targetRes && !targetRes.invalid) {
    $('#explainTitle').textContent = state.myPlan ? '내 전략은 왜 이 시간이 나오나' : `왜 ${target.stints.length - 1}스톱인가`;
    renderExplain($('#explain'), explainPlan(sc, target, targetRes, state.plans, state.results));
    $('#explain').classList.add('swap');
  }

  // 빌더: 내 전략이 없으면 선택된 추천안을 복사해 시작
  const builderPlan = state.myPlan || (state.plans[state.selected] && { id: 'my', label: '내 전략', stints: state.plans[state.selected].stints.map((s) => ({ ...s })) });
  const builderRes = state.myPlan ? state.myResult : (builderPlan ? simMine(builderPlan) : null);
  const ref = state.results[0] && !state.results[0].invalid ? state.results[0].total : null;
  renderBuilder($('#builder'), {
    plan: builderPlan, totalLaps: sc.circuit.laps, result: builderRes, refTotal: ref, surface: sc.weather.surface,
    validation: builderPlan ? validatePlan(builderPlan, sc) : { legal: true, errors: [], warnings: [] },
    onChange: (next, opts) => { if (!state.myPlan) { undoStack.length = 0; redoStack.length = 0; } onPlanChange(next, opts); },
    onUndo: undo, onRedo: redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
  });
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
  root.style.animation = 'none'; void root.offsetHeight; root.style.animation = '';
  if (state.step === 1) renderStep1(root, sc);
  else if (state.step === 2) renderStep2(root, sc);
  else renderStep3(root, sc);
  syncUrl();
}

const rerender = debounce(render, 30);
subscribe((reason) => {
  if (reason === 'scenario') { recompute(); }
  else rerender();
});

fromQuery();
recompute();
render();

window.COMPOUND = { state, runSelfTest, recompute, render, goStep };
console.info('%cCOMPOUND', 'color:#27f4d2;font-weight:700', '— COMPOUND.runSelfTest() 로 엔진 검증');
