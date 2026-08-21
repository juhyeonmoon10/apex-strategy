// 랩 단위 메인 루프. engine/ 의 심장.
import { mulberry32, normal } from './rng.js';
import { RACE } from './params.js';
import { lapTime, gridLoss } from './lapTime.js';
import {
  buildSafetyCarTimeline, pitLossFactor, wearFactor, toBands,
} from './safetyCar.js';

/**
 * @typedef {{compound:string, laps:number}} Stint
 * @typedef {{id:string, label:string, stints:Stint[]}} Plan
 */

/** 스틴트 길이 배열 → 피트 랩 목록 (해당 랩 종료 시 피트인) */
export function pitLapsOf(stints) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < stints.length - 1; i++) {
    acc += stints[i].laps;
    out.push(acc);
  }
  return out;
}

/** 랩 번호 → { compound, age, stintIndex } 매핑 테이블 */
function expandStints(stints) {
  const map = [];
  stints.forEach((s, si) => {
    for (let a = 1; a <= s.laps; a++) map.push({ compound: s.compound, age: a, stintIndex: si });
  });
  return map;
}

/**
 * 하나의 전략을 처음부터 끝까지 시뮬레이션한다.
 * @param {object} scenario { circuit, team, driver, weather, grid, traffic }
 * @param {Plan} plan
 * @param {number} seed
 * @param {string[]} [sharedTimeline] 몬테카를로에서 전략 간 공유할 SC 타임라인
 */
export function simulate(scenario, plan, seed, sharedTimeline) {
  const { circuit, team, driver, weather, grid, traffic } = scenario;
  const totalLaps = circuit.laps;

  const rand = mulberry32(seed);
  const timeline = sharedTimeline || buildSafetyCarTimeline(circuit, totalLaps, rand);
  const perLap = expandStints(plan.stints);

  if (perLap.length !== totalLaps) {
    return { invalid: true, reason: `스틴트 합계 ${perLap.length}랩 ≠ 레이스 ${totalLaps}랩` };
  }

  const pits = new Set(pitLapsOf(plan.stints));
  const laps = [];
  const events = [];

  let cumulative = gridLoss(grid);
  let pitTime = 0;
  let degTime = 0;

  for (let lap = 1; lap <= totalLaps; lap++) {
    const { compound, age, stintIndex } = perLap[lap - 1];
    const scStatus = timeline[lap - 1];

    // SC 중에는 마모가 덜 쌓인다 → 유효 타이어 나이를 줄여서 반영
    const effAge = scStatus === 'green' ? age : Math.max(1, age * wearFactor(scStatus) + age * 0.7);

    const noise = normal(rand, 0, RACE.lapNoiseSigma);
    const { total, parts } = lapTime({
      circuit, team, driver, weather, traffic,
      compound, age: effAge, lap, totalLaps, scStatus, noise,
    });

    cumulative += total;
    degTime += parts.deg;

    let pit = 0;
    if (pits.has(lap)) {
      const base = circuit.pitLoss + team.pitStop + normal(rand, 0, RACE.pitNoiseSigma);
      pit = Math.max(12, base) * pitLossFactor(scStatus);
      cumulative += pit;
      pitTime += pit;
      const next = plan.stints[stintIndex + 1];
      events.push({
        lap, type: 'pit',
        text: `${lap}랩 피트인 → ${next.compound}${scStatus !== 'green' ? ` (${scStatus.toUpperCase()} 중, ${pit.toFixed(1)}초)` : ` (${pit.toFixed(1)}초)`}`,
      });
    }

    laps.push({
      lap, time: total, cumulative, compound, age, stintIndex,
      sc: scStatus, pit, parts,
    });
  }

  const scBands = toBands(timeline);
  scBands.forEach((b) => {
    events.push({
      lap: b.from, type: b.type,
      text: `${b.from}${b.to > b.from ? `–${b.to}` : ''}랩 ${b.type === 'sc' ? '세이프티카' : 'VSC'}`,
    });
  });
  events.sort((a, b) => a.lap - b.lap);

  return {
    invalid: false,
    planId: plan.id,
    total: cumulative,
    laps,
    events,
    scBands,
    pitLaps: [...pits],
    stops: plan.stints.length - 1,
    pitTime,
    degTime,
    fastestLap: laps.reduce((m, l) => (l.time < m.time ? l : m), laps[0]),
    avgLap: cumulative / totalLaps,
  };
}

/** mm:ss.s 또는 h:mm:ss */
export function fmtRaceTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtGap(sec) {
  const sign = sec >= 0 ? '+' : '−';
  return `${sign}${Math.abs(sec).toFixed(1)}초`;
}

export { toBands };
