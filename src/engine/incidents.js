// 사고 → 깃발. 가상 조건 레이스에서 세이프티카를 "그냥 확률"이 아니라
// "누가 어디서 사고를 냈는가"에서 끌어낸다.
//
// 확률은 경기당으로 받는다. 랩당 확률보다 사람이 감을 잡기 쉽고, 상대 대수만큼
// 굴리면 자연스럽게 "한 경기에 몇 대가 나간다"가 된다.
//
// 사고가 나면 심각도에 따라 깃발이 달라진다.
//   옐로  차를 트랙 밖으로 밀어냈다 — 그 구간만 감속
//   VSC   차를 치워야 한다 — 전 구간 감속, 피트 손실 절반
//   SC    치우는 데 오래 걸린다 — 크게 감속, 피트가 가장 싸다
//   적기  트랙을 막았거나 배리어를 고쳐야 한다 — 중단, 타이어 무료 교체
//
// 실제 경기 재현 모드에서는 쓰지 않는다. 그쪽은 그날 진짜 기록을 쓴다.

import { INCIDENT, SAFETY_CAR } from './params.js';

const FLAG_KO = { yellow: '옐로 플래그', vsc: 'VSC', sc: '세이프티카', red: '적기' };
const RANK = { green: 0, yellow: 1, vsc: 2, sc: 3, red: 4 };

/** [min,max] 범위의 정수 */
const randInt = (rand, [lo, hi]) => lo + Math.floor(rand() * (hi - lo + 1));

/**
 * 심각도 분포. 서킷 위험도(scRate)가 높을수록 SC·적기 쪽으로 기운다.
 * 모나코(0.75)처럼 치울 공간이 없는 곳은 같은 사고라도 깃발이 무거워진다.
 */
function severityWeights(circuit) {
  const s = INCIDENT.severity;
  const k = 1 + (circuit.scRate - 0.45) * INCIDENT.escalation * 2;   // 0.45 를 중립으로
  const heavy = Math.max(0.05, k);
  const w = {
    yellow: s.yellow / heavy,
    vsc: s.vsc,
    sc: s.sc * heavy,
    red: s.red * heavy,
  };
  const sum = w.yellow + w.vsc + w.sc + w.red;
  return { yellow: w.yellow / sum, vsc: w.vsc / sum, sc: w.sc / sum, red: w.red / sum };
}

function pickSeverity(rand, weights) {
  let r = rand();
  for (const k of ['yellow', 'vsc', 'sc', 'red']) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return 'yellow';
}

/**
 * 사고를 굴리고 랩별 깃발 타임라인을 만든다.
 *
 * @param {object} opts
 *   circuit, weather, totalLaps
 *   myRisk     내 드라이버가 레이스 중 사고를 낼 확률 (0~1)
 *   rivalRisk  상대 한 대당 사고 확률 (0~1)
 *   rivals     [{ name, code }] — 로그에 이름을 쓰기 위해
 * @param {() => number} rand
 * @returns {{timeline:string[], incidents:Array, myOut:number|null, bands:Array}}
 */
export function buildIncidents(opts, rand) {
  const { circuit, weather, totalLaps, myRisk = 0, rivalRisk = 0, rivals = [] } = opts;
  const timeline = new Array(totalLaps).fill('green');
  const incidents = [];

  const surf = INCIDENT.surfaceMultiplier[weather && weather.surface] || 1;
  const weights = severityWeights(circuit);

  // 1랩과 마지막 랩은 사고를 두지 않는다 — 시뮬레이션이 다룰 수 없는 경계다
  const firstLap = 2;
  const lastLap = Math.max(firstLap, totalLaps - 1);
  const rollLap = () => firstLap + Math.floor(rand() * (lastLap - firstLap + 1));

  const apply = (lap, kind) => {
    const span = randInt(rand, INCIDENT.laps[kind]);
    const to = Math.min(totalLaps, lap + span - 1);
    for (let l = lap; l <= to; l++) {
      // 더 무거운 깃발이 이미 걸려 있으면 덮어쓰지 않는다
      if (RANK[kind] > RANK[timeline[l - 1]]) timeline[l - 1] = kind;
    }
    return to;
  };

  // 상대들의 사고
  const pool = rivals.length ? rivals : [];
  pool.forEach((r) => {
    if (rand() >= Math.min(0.9, rivalRisk * surf)) return;
    const lap = rollLap();
    const kind = pickSeverity(rand, weights);
    const to = apply(lap, kind);
    incidents.push({
      lap, to, kind, who: r.code || r.name, name: r.name, mine: false,
      text: `${r.name} 사고 — ${FLAG_KO[kind]}${to > lap ? ` (${lap}–${to}랩)` : ''}`,
    });
  });

  // 내 드라이버의 사고 — 나면 그 랩에서 레이스가 끝난다
  let myOut = null;
  if (rand() < Math.min(0.9, myRisk * surf)) {
    myOut = rollLap();
    const kind = pickSeverity(rand, weights);
    const to = apply(myOut, kind);
    incidents.push({
      lap: myOut, to, kind, who: '내 차', name: opts.myName || '내 드라이버', mine: true,
      text: `${opts.myName || '내 드라이버'} 사고로 리타이어 — ${FLAG_KO[kind]}`,
    });
  }

  incidents.sort((a, b) => a.lap - b.lap);
  return { timeline, incidents, myOut, bands: toFlagBands(timeline) };
}

/** 타임라인 → [{from,to,type}] (간트 띠용). green 은 건너뛴다. */
export function toFlagBands(timeline) {
  const bands = [];
  let cur = null;
  timeline.forEach((s, i) => {
    const lap = i + 1;
    if (s === 'green') { if (cur) { bands.push(cur); cur = null; } return; }
    if (cur && cur.type === s && cur.to === lap - 1) cur.to = lap;
    else { if (cur) bands.push(cur); cur = { from: lap, to: lap, type: s }; }
  });
  if (cur) bands.push(cur);
  return bands;
}

export { FLAG_KO };

/** 깃발이 하나도 없으면 true — 화면에서 "중단 없음" 을 말할 때 */
export const isCleanRace = (timeline) => timeline.every((s) => s === 'green');

/** SC/VSC 로만 이뤄진 기존 타임라인과 섞어 쓸 때의 안전장치 */
export const hasHeavyFlag = (timeline) =>
  timeline.some((s) => s === 'sc' || s === 'red');

export const SC_CONST = SAFETY_CAR;
