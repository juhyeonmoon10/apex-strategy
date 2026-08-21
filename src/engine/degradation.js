// 기획서 6.3 마모 / 6.4 연료 / 6.5 트랙 진화
import { TYRE, CLIFF_CAP, SURFACE_WEAR, RACE } from './params.js';

/**
 * 타이어 마모로 인한 랩타임 손실 (초).
 * @param {string} compound
 * @param {number} age        현재 스틴트에서의 타이어 나이 (1 = 신품 첫 랩)
 * @param {object} ctx        { trackTemp, surface, circuitDeg, teamDeg, driverMgmt }
 */
export function degradation(compound, age, ctx) {
  const t = TYRE[compound];
  if (!t) throw new Error(`unknown compound: ${compound}`);

  const tempExcess = Math.max(0, ctx.trackTemp - t.idealTemp);
  const tempF = 1 + tempExcess * t.thermalK;

  const surfaceF = (SURFACE_WEAR[ctx.surface] && SURFACE_WEAR[ctx.surface][compound]) || 1;
  const mgmtF = ctx.teamDeg * ctx.driverMgmt * ctx.circuitDeg * surfaceF;

  const linear = t.wear * tempF * mgmtF * age;

  let cliff = 0;
  if (age > t.cliffLap) {
    const over = age - t.cliffLap;
    cliff = Math.min(CLIFF_CAP, t.cliffK * over * over);
  }

  // 워밍업: 첫 랩만 손실
  const warmup = age === 1 ? t.warmup : 0;

  return linear + cliff + warmup;
}

/**
 * 6.4 연료 효과. 차가 가벼워질수록 빨라진다 (음수 = 이득).
 * v1 에 없던 항 — 이게 빠지면 언더컷이 항상 이기는 잘못된 결과가 난다.
 */
export function fuelEffect(lap, totalLaps, fuelPerLap) {
  return fuelPerLap * (totalLaps - lap);
}

/** 6.5 트랙 진화. 랩이 갈수록 그립이 올라간다 (음수 = 이득). */
export function trackEvolution(lap, surface) {
  const total = surface === 'dry' ? RACE.trackEvoDry : RACE.trackEvoWet;
  return -total * (1 - Math.exp(-lap / RACE.trackEvoTau));
}

/** 특정 컴파운드가 몇 랩째에 클리프에 진입하는지 (UI 경고용) */
export function cliffLapFor(compound) {
  return TYRE[compound].cliffLap;
}
