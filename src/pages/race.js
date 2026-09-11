// 실제 레이스 페이지 — 지난 그랑프리를 OpenF1 기록으로 재생한다.
//
// 흐름: 경기 고르기 → 재생(트랙·타워·간트·로그) → 최종 순위 → 모델 대조
// 모델 대조는 "실제 우승 전략을 우리 비용식에 넣으면 최적 대비 몇 초인가"를 본다.

import { $, h, mount } from '../ui/dom.js';
import { mountShell } from '../shell.js';
import { applyTeamTheme } from '../ui/theme.js';
import { createPlayback, renderTransport } from '../ui/playback.js';
import { renderRealRace } from '../ui/realRaceView.js';
import { buildRealRace, planFromStints } from '../engine/realRace.js';
import { loadRaceIndex, loadRace, TEAM_OF } from '../data/races.js';
import { circuitById } from '../data/circuits.js';
import { teamById, driversOf } from '../data/teams.js';
import { searchStrategies } from '../engine/strategySearch.js';
import { simulate, fmtRaceTime } from '../engine/simulate.js';
import { validatePlan } from '../engine/rules.js';
import { COMPOUND_KO } from '../engine/params.js';

mountShell();

const playback = createPlayback();
let index = [];
let rr = null;          // buildRealRace 결과
let view = null;
let focusNum = null;
let lastInt = -1;

const q = new URLSearchParams(location.search);
let raceKey = q.get('race');
if (q.get('driver')) focusNum = Number(q.get('driver'));

/* ---------- 화면 ---------- */

function renderPicker(root, msg) {
  const byYear = new Map();
  index.forEach((r) => {
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
  });

  mount(root,
    h('div.sim-head', h('h2.sim-question', '어떤 그랑프리를 다시 볼까요?')),
    msg ? h('p.empty', msg) : null,
    !index.length
      ? h('p.empty', '재현할 수 있는 경기 기록이 없습니다. tools/collect_races.py 로 먼저 수집하세요.')
      : [...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([year, races]) =>
        h('section', { style: { marginTop: 'var(--s-5)' } },
          h('h3.rr-year', `${year} 시즌`),
          h('div.rr-grid', races.map((r) => {
            const flags = (r.bands || []);
            const red = flags.filter((b) => b.type === 'red').length;
            const sc = flags.filter((b) => b.type === 'sc').length;
            const vsc = flags.filter((b) => b.type === 'vsc').length;
            return h('button.rr-card', {
              type: 'button',
              onclick: () => { raceKey = r.key; focusNum = null; load(); },
            },
              h('div.rr-card-name', circuitById(r.circuitId).name),
              h('div.rr-card-meta', `${r.date} · ${r.totalLaps}랩`),
              h('div.rr-card-win', r.winner ? `우승 ${r.winner}` : ''),
              h('div.rr-card-flags',
                red ? h('span.f-red', `적기 ${red}회`) : null,
                sc ? h('span.f-sc', `SC ${sc}회`) : null,
                vsc ? h('span.f-vsc', `VSC ${vsc}회`) : null,
                !red && !sc && !vsc ? h('span.f-green', '중단 없음') : null));
          })))),
    h('p.rr-src', '기록 출처: OpenF1 공개 API (api.openf1.org). 랩타임·스틴트·피트스톱·관제 메시지를 그대로 씁니다.'));
}

function renderRace(root) {
  const race = rr.race;
  const circuit = circuitById(race.circuitId);
  const focus = rr.drivers.find((d) => d.num === focusNum) || rr.drivers[0];
  const teamId = TEAM_OF[focus.team];
  if (teamId) applyTeamTheme(teamById(teamId));

  mount(root,
    h('div.sim-head',
      h('h2.sim-question', `${race.officialName || race.meetingName}`),
      h('div.sim-context',
        h('span', `${circuit.name} · ${race.totalLaps}랩 · ${race.date}`),
        h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { raceKey = null; playback.reset(); render(); } }, '다른 경기'))),

    h('div.rr-focus', { role: 'group', 'aria-label': '기준 드라이버' },
      h('span.rr-focus-label', '기준 드라이버'),
      h('select.rr-select', {
        'aria-label': '기준 드라이버',
        onchange: (e) => { focusNum = Number(e.target.value); playback.reset(); render(); },
      }, rr.drivers.map((d) => h('option', { value: String(d.num), selected: d.num === focus.num ? 'true' : null },
        `${d.pos != null && !d.dnf ? `P${d.pos}` : 'DNF'} · ${d.name}${d.team ? ` (${d.team})` : ''}`)))),

    h('div.race.race-real',
      h('div.race-head#raceHead'),
      h('div.race-transport', h('div#transport')),
      h('div.race-main', h('div.race-map#raceMap'), h('div.race-tower#raceTower')),
      h('div.race-gantt#raceGantt'),
      h('div.race-log', h('h4', '레이스 로그'), h('div#raceLog'))),

    h('details.fold', { open: 'true' },
      h('summary', '최종 순위', h('span.hint', '실제 결과')),
      h('div.fold-body', h('div#raceResult'))),

    h('details.fold',
      h('summary', '모델과 대조', h('span.hint', '실제 전략을 우리 비용식에 넣으면')),
      h('div.fold-body', h('div#raceCompare'))),

    h('p.rr-src', `기록 출처: OpenF1 (${race.collected} 수집) · 세션 ${race.sessionKey}`));

  view = renderRealRace(
    { head: $('#raceHead'), map: $('#raceMap'), tower: $('#raceTower'), gantt: $('#raceGantt'), log: $('#raceLog'), result: $('#raceResult') },
    rr, { focusNum: focus.num });

  playback.setTotal(rr.totalLaps);
  const tp = renderTransport($('#transport'), playback);
  lastInt = playback.lap == null ? null : Math.floor(playback.lap);
  view.set(playback.lap);
  tp.sync(lastInt);
  transportCtl = tp;

  renderCompare($('#raceCompare'), focus);
}

let transportCtl = null;

/** 실제 전략을 우리 엔진에 넣어 모델 최적안과 비교 */
function renderCompare(root, focus) {
  const race = rr.race;
  const circuit = circuitById(race.circuitId);
  const teamId = TEAM_OF[focus.team] || 'mercedes';
  const team = teamById(teamId);
  const usedWetTyre = focus.stints.some((st) => st.compound === 'INTER' || st.compound === 'WET');
  const driver = driversOf(team.id)[0];
  const scenario = {
    circuit, team, driver,
    weather: {
      // params.js 의 노면 키는 dry / rain / heavy 다.
      // weather.rain 은 세션 중 강수 기록이 한 번이라도 있으면 참이라 너무 헐겁다.
      // 실제로 젖은 타이어를 썼는지로 판단한다.
      surface: usedWetTyre ? 'rain' : 'dry',
      trackTemp: race.weather.trackTemp ?? 32,
      airTemp: race.weather.airTemp ?? 24,
      humidity: 50,
    },
    grid: Math.max(1, Math.min(20, focus.pos || 10)),
    traffic: 'medium',
  };
  const seed = 20260101 + race.sessionKey;
  const redFlag = (rr.bands || []).some((b) => b.type === 'red');

  const realPlan = planFromStints(focus.stints, circuit.laps);
  const picks = searchStrategies(scenario, seed);
  const green = new Array(circuit.laps).fill('green');
  const best = picks[0] ? simulate(scenario, picks[0], seed, green) : null;
  const realRes = realPlan ? simulate(scenario, realPlan, seed, green) : null;
  const check = realPlan ? validatePlan(realPlan, scenario) : null;

  const chips = (stints) => stints.map((st) => h('span.rr-chip', { class: `c-${st.compound}` },
    `${COMPOUND_KO[st.compound]} ${st.laps}랩`));

  if (!realPlan || !realRes || realRes.invalid || !best) {
    mount(root, h('p.empty',
      `${focus.name} 의 실제 스틴트를 모델 랩 수(${circuit.laps}랩)에 맞출 수 없어 대조를 건너뜁니다.`
      + (focus.dnf ? ' 리타이어한 드라이버는 대조하지 않습니다.' : '')));
    return;
  }

  const diff = realRes.total - best.total;
  mount(root,
    h('p.rr-note', `${race.date} ${circuit.track} 조건(노면 ${scenario.weather.trackTemp}°C)을 우리 모델에 넣고, `
      + `${focus.name} 의 실제 컴파운드·스틴트 길이를 그대로 시뮬레이션했습니다. 세이프티카 없이 계산합니다.`),
    h('div.rr-cmp',
      h('div.rr-cmp-row',
        h('div.rr-cmp-label', '실제 전략'),
        h('div.rr-cmp-chips', chips(realPlan.stints)),
        h('div.rr-cmp-time.num', fmtRaceTime(realRes.total))),
      h('div.rr-cmp-row.best',
        h('div.rr-cmp-label', '모델 최적안'),
        h('div.rr-cmp-chips', chips(picks[0].stints)),
        h('div.rr-cmp-time.num', fmtRaceTime(best.total)))),
    h('p.rr-diff', diff <= 0.05
      ? '실제 전략이 모델 최적안과 같은 수준입니다.'
      : `모델 기준으로 실제 전략은 최적안보다 ${diff.toFixed(1)}초 느립니다.`),
    check && !check.legal ? h('p.rr-warn', `규정 점검: ${check.errors.join(' · ')}`) : null,
    redFlag ? h('p.rr-warn', '이 경기에는 적기 중단이 있었습니다. 중단 중에는 타이어를 손실 없이 바꿀 수 있어 '
      + '스틴트가 아주 짧게 끊깁니다. 우리 모델에는 그 규칙이 없으므로 아래 차이는 실제보다 크게 나옵니다.') : null,
    h('p.rr-note.small', '컴파운드와 교체 랩만 바꾼 비교입니다. 교통·세이프티카·드라이버 페이스는 빠져 있어 '
      + '실제 순위가 틀렸다는 뜻이 아닙니다.'));
}

/* ---------- 재생 연결 ---------- */

playback.subscribe((v) => {
  if (view) view.set(v);
  const lap = v == null ? null : Math.floor(v);
  if (lap !== lastInt) {
    lastInt = lap;
    if (transportCtl) transportCtl.sync(lap);
  }
});
playback.onStateChange(() => {
  if (rr && $('#transport')) transportCtl = renderTransport($('#transport'), playback);
});

/* ---------- 진입 ---------- */

function render() {
  const root = $('#view');
  root.className = 'sim-view';
  if (rr && raceKey) renderRace(root);
  else renderPicker(root);
  const p = new URLSearchParams();
  if (raceKey) p.set('race', raceKey);
  if (rr && focusNum) p.set('driver', String(focusNum));
  history.replaceState(null, '', p.toString() ? `${location.pathname}?${p}` : location.pathname);
}

async function load() {
  const root = $('#view');
  mount(root, h('p.empty', '기록을 불러오는 중…'));
  try {
    const data = await loadRace(raceKey);
    rr = buildRealRace(data);
    if (focusNum == null) focusNum = (rr.drivers[0] || {}).num;
    render();
  } catch (e) {
    rr = null;
    raceKey = null;
    renderPicker(root, `기록을 불러오지 못했습니다: ${e.message}`);
  }
}

(async () => {
  index = await loadRaceIndex();
  if (raceKey && index.some((r) => r.key === raceKey)) await load();
  else { raceKey = null; render(); }
})();

window.COMPOUND_RACE = { get race() { return rr; }, playback };
