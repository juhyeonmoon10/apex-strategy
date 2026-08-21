// 추천 3안 탐색. 후보를 전수 생성하고 결정론적 시드로 평가한 뒤 성격별로 고른다.
import { SLICKS, TYRE, RACE } from './params.js';
import { simulate } from './simulate.js';
import { validatePlan } from './rules.js';
import { buildSafetyCarTimeline } from './safetyCar.js';
import { mulberry32 } from './rng.js';

/** 드라이/웨트에 따라 사용 가능한 컴파운드 */
function availableCompounds(surface) {
  if (surface === 'dry') return SLICKS;
  if (surface === 'rain') return ['INTER', 'MEDIUM', 'SOFT'];
  return ['WET', 'INTER'];
}

/** 스틴트 길이를 총 랩수에 맞게 균등 분배 (나머지는 앞 스틴트로) */
function splitLaps(totalLaps, n) {
  const base = Math.floor(totalLaps / n);
  const out = new Array(n).fill(base);
  let rest = totalLaps - base * n;
  let i = 0;
  while (rest > 0) { out[i % n]++; rest--; i++; }
  return out;
}

/**
 * 후보 전략 생성.
 * 스톱 수 1~3, 컴파운드 조합, 그리고 각 조합마다 피트 랩을 ±오프셋으로 변주한다.
 */
function generateCandidates(scenario) {
  const { circuit, weather } = scenario;
  const totalLaps = circuit.laps;
  const pool = availableCompounds(weather.surface);
  const candidates = [];

  for (let stops = 1; stops <= 3; stops++) {
    const n = stops + 1;
    const combos = compoundCombos(pool, n, weather.surface);

    for (const combo of combos) {
      const evenSplit = splitLaps(totalLaps, n);
      // 첫 피트 윈도우를 앞뒤로 흔들어 언더컷/오버컷 변주를 만든다
      const shifts = n === 2 ? [-8, -4, 0, 4, 8] : [-5, 0, 5];

      for (const shift of shifts) {
        const laps = evenSplit.slice();
        if (laps.length >= 2) {
          laps[0] += shift;
          laps[laps.length - 1] -= shift;
        }
        if (laps.some((l) => l < RACE.minStintLaps)) continue;
        candidates.push({
          id: `${combo.join('-')}-${laps.join('_')}`,
          stints: combo.map((c, i) => ({ compound: c, laps: laps[i] })),
        });
      }
    }
  }
  return candidates;
}

function compoundCombos(pool, n, surface) {
  const out = [];
  const walk = (acc) => {
    if (acc.length === n) {
      if (surface === 'dry') {
        const slicks = new Set(acc.filter((c) => SLICKS.includes(c)));
        if (slicks.size < 2) return;
      }
      out.push(acc.slice());
      return;
    }
    for (const c of pool) {
      // 같은 컴파운드를 3연속 쓰는 조합은 제외 (탐색 공간 축소)
      if (acc.length >= 2 && acc[acc.length - 1] === c && acc[acc.length - 2] === c) continue;
      walk(acc.concat(c));
    }
  };
  walk([]);
  return out;
}

const STYLES = [
  { key: 'fastest', label: '예상 최속', risk: '낮음' },
  { key: 'safe', label: '안정 우선', risk: '보통' },
  { key: 'aggressive', label: '공격적 대안', risk: '높음' },
];

/**
 * 추천 3안을 반환한다.
 * 평가는 SC 없는 결정론적 조건에서 수행한다 — 추천이 매번 흔들리면 안 되기 때문.
 */
export function searchStrategies(scenario, seed) {
  const totalLaps = scenario.circuit.laps;
  const greenTimeline = new Array(totalLaps).fill('green');
  const candidates = generateCandidates(scenario);

  const scored = [];
  for (const c of candidates) {
    const plan = { id: c.id, label: '', stints: c.stints };
    const check = validatePlan(plan, scenario);
    if (!check.legal) continue;
    const res = simulate(scenario, plan, seed, greenTimeline);
    if (res.invalid) continue;
    scored.push({ plan, res, stops: c.stints.length - 1, warnings: check.warnings.length });
  }

  if (scored.length === 0) return [];
  scored.sort((a, b) => a.res.total - b.res.total);

  const best = scored[0];
  const picks = [best];

  // 안정: 경고가 없고 스톱 수가 최속안과 다른 것 중 가장 빠른 안
  const safe = scored.find(
    (s) => s !== best && s.warnings === 0 && s.stops !== best.stops
  ) || scored.find((s) => s !== best && s.warnings === 0) || scored[1];
  if (safe) picks.push(safe);

  // 공격: 첫 스틴트가 가장 짧은(= 가장 이른 언더컷) 안 중 상위권
  const pool = scored.slice(0, Math.max(12, Math.ceil(scored.length * 0.25)));
  const aggressive = pool
    .filter((s) => !picks.includes(s))
    .sort((a, b) => a.plan.stints[0].laps - b.plan.stints[0].laps)[0]
    || scored.find((s) => !picks.includes(s));
  if (aggressive) picks.push(aggressive);

  return picks.slice(0, 3).map((p, i) => ({
    id: `plan-${i}`,
    label: STYLES[i].label,
    style: STYLES[i].key,
    risk: STYLES[i].risk,
    stints: p.plan.stints.map((s) => ({ ...s })),
  }));
}

/** SC 타임라인을 seed 로부터 만드는 헬퍼 (UI 에서 재사용) */
export function timelineFor(circuit, seed) {
  return buildSafetyCarTimeline(circuit, circuit.laps, mulberry32(seed));
}
