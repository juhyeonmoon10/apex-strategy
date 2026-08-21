// 기획서 6.11 검증 목록.
// 브라우저 콘솔에서  runSelfTest()  로 실행. 엔진만 검사하며 DOM 을 건드리지 않는다.

import { simulate } from './simulate.js';
import { searchStrategies } from './strategySearch.js';
import { CIRCUITS } from '../data/circuits.js';
import { TEAMS, DRIVERS } from '../data/teams.js';
import { TYRE } from './params.js';

function baseScenario(circuitId = 'britain') {
  const circuit = CIRCUITS.find((c) => c.id === circuitId);
  const team = TEAMS.find((t) => t.id === 'mercedes');
  const driver = DRIVERS.find((d) => d.teamId === 'mercedes');
  return {
    circuit, team, driver,
    weather: { surface: 'dry', trackTemp: 32, airTemp: 22, humidity: 55, rainChance: 5 },
    grid: 2,
    traffic: 'light',
  };
}

const results = [];
function check(name, fn) {
  try {
    const r = fn();
    results.push({ name, pass: r.pass, detail: r.detail });
  } catch (e) {
    results.push({ name, pass: false, detail: `예외: ${e.message}` });
  }
}

export function runSelfTest(log = true) {
  results.length = 0;
  const sc = baseScenario();
  const green = new Array(sc.circuit.laps).fill('green');

  check('연료 효과: 마지막 랩이 첫 랩보다 빠르다', () => {
    const plan = { id: 't', label: '', stints: [{ compound: 'MEDIUM', laps: 26 }, { compound: 'HARD', laps: 26 }] };
    const r = simulate(sc, plan, 1, green);
    const l1 = r.laps[0].parts.fuel;
    const lN = r.laps[r.laps.length - 1].parts.fuel;
    const gain = l1 - lN;
    return { pass: gain > 1.2 && gain < 3.0, detail: `연료 이득 ${gain.toFixed(2)}초 (기대 1.2~3.0)` };
  });

  check('클리프: 소프트 25랩이면 2초 이상 느려진다', () => {
    const plan = { id: 't', label: '', stints: [{ compound: 'SOFT', laps: 26 }, { compound: 'HARD', laps: 26 }] };
    const r = simulate(sc, plan, 1, green);
    const early = r.laps[4].parts.deg;
    const late = r.laps[24].parts.deg;
    return { pass: late - early > 2.0, detail: `5랩 ${early.toFixed(2)}초 → 25랩 ${late.toFixed(2)}초 (차 ${(late - early).toFixed(2)})` };
  });

  check('전략 격차: 1스톱 vs 2스톱 차이가 20초 이내', () => {
    const one = { id: '1', label: '', stints: [{ compound: 'MEDIUM', laps: 24 }, { compound: 'HARD', laps: 28 }] };
    const two = { id: '2', label: '', stints: [{ compound: 'SOFT', laps: 16 }, { compound: 'MEDIUM', laps: 18 }, { compound: 'HARD', laps: 18 }] };
    const a = simulate(sc, one, 1, green).total;
    const b = simulate(sc, two, 1, green).total;
    const diff = Math.abs(a - b);
    return { pass: diff < 20, detail: `차이 ${diff.toFixed(1)}초 (v1 은 50초+)` };
  });

  check('민감도: 피트 랩 1랩 이동 시 0.05~2.0초 변화', () => {
    const mk = (n) => ({ id: 'x', label: '', stints: [{ compound: 'MEDIUM', laps: n }, { compound: 'HARD', laps: 52 - n }] });
    const a = simulate(sc, mk(24), 5, green).total;
    const b = simulate(sc, mk(25), 5, green).total;
    const d = Math.abs(a - b);
    return { pass: d > 0.05 && d < 2.0, detail: `24랩 vs 25랩 피트 → ${d.toFixed(3)}초 차이` };
  });

  check('재현성: 같은 seed 는 완전히 동일한 결과', () => {
    const plan = { id: 't', label: '', stints: [{ compound: 'MEDIUM', laps: 26 }, { compound: 'HARD', laps: 26 }] };
    const a = simulate(sc, plan, 42).total;
    const b = simulate(sc, plan, 42).total;
    return { pass: a === b, detail: `${a.toFixed(6)} vs ${b.toFixed(6)}` };
  });

  // ★ OpenF1 실측 대조 (tools/calibrate.py, 실버스톤 2023 건조 레이스)
  //   실제 중앙 그린랩 93.115초 / 우승 기록 5117초(SC 포함)
  //   우리 기본 실행은 SC 없는 조건이므로 52 x 93.1 + 피트 2회 ≈ 4880초가 목표.
  check('실측 대조: 실버스톤 그린랩이 실제 93.1초의 ±3% 이내', () => {
    const plan = { id: 't', label: '', stints: [{ compound: 'MEDIUM', laps: 26 }, { compound: 'HARD', laps: 26 }] };
    const r = simulate(sc, plan, 3, green);
    const err = Math.abs(r.avgLap - 93.115) / 93.115 * 100;
    return { pass: err < 3, detail: `모델 ${r.avgLap.toFixed(2)}초 vs 실측 93.115초 (오차 ${err.toFixed(1)}%)` };
  });

  check('실측 대조: 실버스톤 완주 시간이 4880초의 ±4% 이내', () => {
    const plan = { id: 't', label: '', stints: [{ compound: 'MEDIUM', laps: 26 }, { compound: 'HARD', laps: 26 }] };
    const r = simulate(sc, plan, 3, green);
    const err = Math.abs(r.total - 4880) / 4880 * 100;
    return { pass: err < 4, detail: `모델 ${r.total.toFixed(0)}초 vs 목표 4880초 (오차 ${err.toFixed(1)}%)` };
  });

  check('랩타임 현실성: 실버스톤 평균 랩이 85~100초', () => {
    const plan = { id: 't', label: '', stints: [{ compound: 'MEDIUM', laps: 26 }, { compound: 'HARD', laps: 26 }] };
    const r = simulate(sc, plan, 3, green);
    return { pass: r.avgLap > 85 && r.avgLap < 100, detail: `평균 ${r.avgLap.toFixed(2)}초/랩` };
  });

  check('추천 탐색: 3안이 나오고 모두 규정을 충족한다', () => {
    const plans = searchStrategies(sc, 7);
    const ok = plans.length === 3 && plans.every((p) => p.stints.reduce((a, s) => a + s.laps, 0) === sc.circuit.laps);
    return { pass: ok, detail: plans.map((p) => `${p.label}:${p.stints.length - 1}스톱`).join(' / ') };
  });

  check('추천 격차: 1안과 3안 차이가 25초 이내', () => {
    const plans = searchStrategies(sc, 7);
    const times = plans.map((p) => simulate(sc, p, 7, green).total);
    const spread = Math.max(...times) - Math.min(...times);
    return { pass: spread < 25, detail: `격차 ${spread.toFixed(1)}초` };
  });

  check('전 서킷 무결성: 24개 서킷 모두 시뮬레이션 성공', () => {
    const bad = [];
    for (const c of CIRCUITS) {
      const s = baseScenario(c.id);
      const plans = searchStrategies(s, 11);
      if (plans.length < 1) { bad.push(c.id); continue; }
      const r = simulate(s, plans[0], 11);
      if (r.invalid || !Number.isFinite(r.total)) bad.push(c.id);
    }
    return { pass: bad.length === 0, detail: bad.length ? `실패: ${bad.join(', ')}` : `${CIRCUITS.length}개 서킷 전부 정상` };
  });

  check('컴파운드 순서: 같은 나이면 SOFT < MEDIUM < HARD 랩타임', () => {
    const t = (c) => TYRE[c].delta;
    return { pass: t('SOFT') < t('MEDIUM') && t('MEDIUM') < t('HARD'), detail: `${t('SOFT')} / ${t('MEDIUM')} / ${t('HARD')}` };
  });

  const passed = results.filter((r) => r.pass).length;
  if (log) {
    console.group(`%cAPEX 엔진 자체 검증 — ${passed}/${results.length} 통과`,
      `color:${passed === results.length ? '#3FB950' : '#F85149'};font-weight:700`);
    results.forEach((r) =>
      console.log(`%c${r.pass ? '✓' : '✗'} ${r.name}`, `color:${r.pass ? '#3FB950' : '#F85149'}`, '\n   ', r.detail));
    console.groupEnd();
  }
  return { passed, total: results.length, results: results.slice() };
}
