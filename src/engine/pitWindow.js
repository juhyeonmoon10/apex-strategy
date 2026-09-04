// 피트 윈도우 — 피렐리 그래픽의 "LAP 14 TO 22" 를 실제로 계산한다.
//
// 그림처럼 임의로 적는 게 아니라, 각 피트 랩을 앞뒤로 옮겨 시뮬레이션했을 때
// 최적 대비 TOL 초 이내에 머무는 연속 구간을 윈도우로 정의한다.
// 정직한 숫자이고, 계산 비용도 작다(전략당 피트 하나에 11회 시뮬레이션).

import { simulate } from './simulate.js';
import { RACE } from './params.js';

const SPAN = 5;     // 앞뒤로 몇 랩까지 시도할지
const TOL = 1.5;    // 최적 대비 허용 손실(초)

/**
 * @returns {Array<{pitLap:number, from:number, to:number, cost:number[]}>}
 *   pitLap  현재 계획의 피트 랩
 *   from,to 윈도우 (포함)
 */
export function pitWindows(scenario, plan, seed) {
  const totalLaps = scenario.circuit.laps;
  const green = new Array(totalLaps).fill('green');
  const base = simulate(scenario, plan, seed, green);
  if (base.invalid) return [];

  const out = [];
  let acc = 0;
  for (let i = 0; i < plan.stints.length - 1; i++) {
    acc += plan.stints[i].laps;
    const pitLap = acc;
    const costs = new Map();   // shift -> total
    costs.set(0, base.total);

    // 한쪽으로 걸어가다 허용치를 넘으면 멈춘다 — 연속 구간만 윈도우로 본다
    for (const dir of [-1, 1]) {
      for (let k = 1; k <= SPAN; k++) {
        const shift = dir * k;
        const stints = plan.stints.map((s) => ({ ...s }));
        stints[i].laps += shift;
        stints[i + 1].laps -= shift;
        if (stints[i].laps < RACE.minStintLaps || stints[i + 1].laps < RACE.minStintLaps) break;
        const r = simulate(scenario, { ...plan, stints }, seed, green);
        if (r.invalid) break;
        costs.set(shift, r.total);
        if (r.total - base.total > TOL) break;
      }
    }

    const best = Math.min(...costs.values());
    let from = pitLap, to = pitLap;
    for (let k = -1; k >= -SPAN; k--) {
      const t = costs.get(k);
      if (t == null || t - best > TOL) break;
      from = pitLap + k;
    }
    for (let k = 1; k <= SPAN; k++) {
      const t = costs.get(k);
      if (t == null || t - best > TOL) break;
      to = pitLap + k;
    }
    out.push({ pitLap, from, to });
  }
  return out;
}
