// 기획서 6.9 세이프티카 / VSC
import { SAFETY_CAR } from './params.js';

/**
 * 레이스 전체의 SC/VSC 타임라인을 미리 굴린다.
 * 랩별 'green' | 'vsc' | 'sc' 배열을 반환. index 0 = 1랩.
 *
 * 몬테카를로에서 모든 전략에 같은 타임라인을 공유해야
 * "이 SC 상황에서 어느 전략이 이겼나" 를 공정하게 비교할 수 있다.
 */
export function buildSafetyCarTimeline(circuit, totalLaps, rand) {
  const timeline = new Array(totalLaps).fill('green');
  const pSc = circuit.scRate / totalLaps;
  const pVsc = circuit.vscRate / totalLaps;

  let lap = 1;
  while (lap <= totalLaps) {
    const roll = rand();
    if (roll < pSc) {
      const dur =
        SAFETY_CAR.minLaps +
        Math.floor(rand() * (SAFETY_CAR.maxLaps - SAFETY_CAR.minLaps + 1));
      for (let i = 0; i < dur && lap + i <= totalLaps; i++) timeline[lap + i - 1] = 'sc';
      lap += dur + 4; // 재출발 직후에는 다시 발생하지 않는다고 본다
      continue;
    }
    if (roll < pSc + pVsc) {
      for (let i = 0; i < SAFETY_CAR.vscLaps && lap + i <= totalLaps; i++)
        timeline[lap + i - 1] = 'vsc';
      lap += SAFETY_CAR.vscLaps + 2;
      continue;
    }
    lap++;
  }
  return timeline;
}

export function lapMultiplier(status) {
  if (status === 'sc') return SAFETY_CAR.lapMultiplier;
  if (status === 'vsc') return SAFETY_CAR.vscMultiplier;
  return 1;
}

export function pitLossFactor(status) {
  if (status === 'sc') return SAFETY_CAR.pitLossSc;
  if (status === 'vsc') return SAFETY_CAR.pitLossVsc;
  return 1;
}

export function wearFactor(status) {
  return status === 'green' ? 1 : SAFETY_CAR.wearFactor;
}

/** 타임라인을 [{from,to,type}] 구간 목록으로 (차트 밴드용) */
export function toBands(timeline) {
  const bands = [];
  let cur = null;
  timeline.forEach((s, i) => {
    const lap = i + 1;
    if (s === 'green') {
      if (cur) { bands.push(cur); cur = null; }
      return;
    }
    if (cur && cur.type === s && cur.to === lap - 1) cur.to = lap;
    else {
      if (cur) bands.push(cur);
      cur = { from: lap, to: lap, type: s };
    }
  });
  if (cur) bands.push(cur);
  return bands;
}
