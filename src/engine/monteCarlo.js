// 기획서 6.10 몬테카를로.
// 핵심: 매 회차마다 모든 전략에 "같은 SC 타임라인"을 준다.
import { mulberry32 } from './rng.js';
import { buildSafetyCarTimeline } from './safetyCar.js';
import { simulate } from './simulate.js';
import { MC_RUNS } from './params.js';

/**
 * @returns {{ perPlan: Array, scRuns:number, runs:number }}
 */
export function runMonteCarlo(scenario, plans, baseSeed, runs = MC_RUNS) {
  const totalLaps = scenario.circuit.laps;
  const results = plans.map(() => []);
  // 절대 완주 시간의 분산은 "SC 가 났는가" 가 지배해버려서 전략 비교에 쓸 수 없다.
  // 회차별 1위 대비 갭을 따로 모아야 전략의 우열이 보인다.
  const gaps = plans.map(() => []);
  let scRuns = 0;
  const scWins = plans.map(() => 0);
  const cleanWins = plans.map(() => 0);

  for (let i = 0; i < runs; i++) {
    const seed = (baseSeed + i * 7919) >>> 0;
    const timeline = buildSafetyCarTimeline(scenario.circuit, totalLaps, mulberry32(seed));
    const hadSc = timeline.some((s) => s !== 'green');
    if (hadSc) scRuns++;

    let bestIdx = 0;
    let bestTime = Infinity;
    const round = [];
    for (let p = 0; p < plans.length; p++) {
      const r = simulate(scenario, plans[p], seed, timeline);
      const t = r.invalid ? Infinity : r.total;
      results[p].push(t);
      round.push(t);
      if (t < bestTime) { bestTime = t; bestIdx = p; }
    }
    round.forEach((t, p) => gaps[p].push(Number.isFinite(t) ? t - bestTime : Infinity));
    if (hadSc) scWins[bestIdx]++; else cleanWins[bestIdx]++;
  }

  const perPlan = plans.map((plan, p) => {
    const arr = results[p].filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
    const g = gaps[p].filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
    const wins = scWins[p] + cleanWins[p];
    return {
      planId: plan.id,
      label: plan.label,
      gapP10: pct(g, 0.1),
      gapP50: pct(g, 0.5),
      gapP90: pct(g, 0.9),
      gapWorst: g.length ? g[g.length - 1] : 0,
      p10: pct(arr, 0.1),
      p50: pct(arr, 0.5),
      p90: pct(arr, 0.9),
      mean: arr.reduce((a, b) => a + b, 0) / (arr.length || 1),
      stdev: stdev(arr),
      winRate: wins / runs,
      scWinRate: scRuns ? scWins[p] / scRuns : 0,
      cleanWinRate: runs - scRuns ? cleanWins[p] / (runs - scRuns) : 0,
      samples: arr,
    };
  });

  return { perPlan, scRuns, runs };
}

function pct(sorted, q) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[i];
}

function stdev(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1));
}
