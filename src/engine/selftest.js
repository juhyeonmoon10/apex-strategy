// 기획서 6.11 검증 목록.
// 브라우저 콘솔에서  runSelfTest()  로 실행. 엔진만 검사하며 DOM 을 건드리지 않는다.

import { simulate } from './simulate.js';
import { searchStrategies } from './strategySearch.js';
import { CIRCUITS } from '../data/circuits.js';
import { TEAMS, DRIVERS } from '../data/teams.js';
import { TYRE } from './params.js';
import { buildIncidents } from './incidents.js';
import { mulberry32 } from './rng.js';
import { validatePlan } from './rules.js';
import {
  docParams, tempPenalty, compoundCoefficient, docDegradation, stintLives,
  tyreTemperature, trackTemperatureFrom, wearAfter,
} from './docModel.js';

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

  check('사고 모델: 확률 0 이면 깃발이 하나도 없다', () => {
    const inc = buildIncidents({
      circuit: sc.circuit, weather: sc.weather, totalLaps: sc.circuit.laps,
      myRisk: 0, rivalRisk: 0, rivals: DRIVERS.slice(0, 20).map((d) => ({ name: d.name, code: d.name })),
    }, mulberry32(7));
    return {
      pass: inc.incidents.length === 0 && inc.timeline.every((x) => x === 'green') && inc.myOut === null,
      detail: `사고 ${inc.incidents.length}건`,
    };
  });

  check('사고 모델: 같은 시드면 같은 사고가 난다', () => {
    const opts = {
      circuit: sc.circuit, weather: sc.weather, totalLaps: sc.circuit.laps,
      myRisk: 0.3, rivalRisk: 0.2, rivals: DRIVERS.slice(0, 20).map((d) => ({ name: d.name, code: d.name })),
    };
    const a = buildIncidents(opts, mulberry32(99));
    const b = buildIncidents(opts, mulberry32(99));
    return {
      pass: JSON.stringify(a.timeline) === JSON.stringify(b.timeline) && a.myOut === b.myOut,
      detail: `사고 ${a.incidents.length}건 · 내 리타이어 ${a.myOut ?? '없음'}`,
    };
  });

  check('사고 리타이어: 그 랩에서 기록이 끝난다', () => {
    const plan = { id: 't', label: '', stints: [{ compound: 'MEDIUM', laps: 26 }, { compound: 'HARD', laps: 26 }] };
    const r = simulate(sc, plan, 5, green, 20);
    return {
      pass: r.retired === true && r.laps.length === 20 && r.retireLap === 20,
      detail: `${r.laps.length}랩에서 종료`,
    };
  });

  // ── 조사 문서 수식 — 문서에 적힌 예시 값으로 맞춰 본다 ──
  const P = docParams();
  const near = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

  check('문서 F4: 90~110°C, a=b=0.004 일 때 120°C → +0.4초, 100°C → 0초', () => {
    const hot = tempPenalty(P, 120), mid = tempPenalty(P, 100), cold = tempPenalty(P, 80);
    return { pass: near(hot, 0.4) && mid === 0 && near(cold, 0.4), detail: `120°C ${hot.toFixed(3)} · 100°C ${mid} · 80°C ${cold.toFixed(3)}` };
  });

  check('문서 F5: 89.8 / 90.2 / 90.6 초 → k = 0.9956 / 1 / 1.0044', () => {
    const s = compoundCoefficient(89.8, 90.2), h = compoundCoefficient(90.6, 90.2);
    return { pass: near(s, 0.9956, 1e-4) && near(h, 1.0044, 1e-4), detail: `소프트 ${s.toFixed(5)} · 하드 ${h.toFixed(5)}` };
  });

  check('문서 F2: τ 이전 기울기 β₁, 이후 β₁ + β₂', () => {
    const t = P.tyre.MEDIUM;
    const before = docDegradation(P, 'MEDIUM', t.tau) - docDegradation(P, 'MEDIUM', t.tau - 1);
    const after = docDegradation(P, 'MEDIUM', t.tau + 2) - docDegradation(P, 'MEDIUM', t.tau + 1);
    return { pass: near(before, t.k1) && near(after, t.k1 + t.b2), detail: `이전 ${before.toFixed(4)} · 이후 ${after.toFixed(4)}` };
  });

  check('문서 F3: 타이어 온도 ↔ 노면 온도 식이 서로 역함수', () => {
    const T = tyreTemperature(P, 37, 24, 60);
    const back = trackTemperatureFrom(P, T, 24, 60);
    return { pass: near(back, 37), detail: `노면 37°C → 타이어 ${T.toFixed(1)}°C → 노면 ${back.toFixed(2)}°C` };
  });

  check('문서 F1·F6: 수명 = 세 항의 최솟값, 트레드 항에서 누적 마모 = h₀', () => {
    const docSc = { ...sc, model: 'doc', doc: P };
    const lives = stintLives(docSc);
    const bad = Object.entries(lives).filter(([, l]) => l.limit !== Math.floor(Math.min(l.econ, l.cliff, l.tread)));
    const worn = wearAfter(P, 'HARD', sc.circuit.lengthKm, lives.HARD.tread);
    return {
      pass: bad.length === 0 && near(worn, P.h0),
      detail: Object.entries(lives).map(([c, l]) => `${c} ${l.limit}(${l.binding})`).join(' · ') + ` · 하드 ${lives.HARD.tread.toFixed(1)}랩 마모 ${worn.toFixed(3)}mm`,
    };
  });

  check('문서 수식 모드: 24개 서킷 모두 수명 안의 전략을 찾는다', () => {
    const bad = [];
    for (const c of CIRCUITS) {
      const s = { ...baseScenario(c.id), model: 'doc', doc: P };
      const plans = searchStrategies(s, 11);
      if (plans.length < 1) { bad.push(`${c.id}(후보 없음)`); continue; }
      const v = validatePlan(plans[0], s);
      const r = simulate(s, plans[0], 11);
      if (!v.legal || r.invalid || !Number.isFinite(r.total)) bad.push(c.id);
    }
    return { pass: bad.length === 0, detail: bad.length ? `실패: ${bad.join(', ')}` : `${CIRCUITS.length}개 서킷 전부 정상` };
  });

  check('기존 모델은 그대로: model 을 안 주면 base 와 같은 결과', () => {
    const plan = { id: 't', label: '', stints: [{ compound: 'MEDIUM', laps: 26 }, { compound: 'HARD', laps: 26 }] };
    const a = simulate(sc, plan, 3, green);
    const b = simulate({ ...sc, model: 'base', doc: P }, plan, 3, green);
    return { pass: a.total === b.total && b.tempTime === 0, detail: `${a.total.toFixed(3)} / ${b.total.toFixed(3)}` };
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
