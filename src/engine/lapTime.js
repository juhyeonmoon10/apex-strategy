// 기획서 6.2 랩타임 공식
import { TYRE, SURFACE_PENALTY, SURFACE_WEAR, TRAFFIC_DELTA, RACE } from './params.js';
import { degradation, fuelEffect, trackEvolution } from './degradation.js';
import { lapMultiplier } from './safetyCar.js';
import { docLapTerms } from './docModel.js';

/**
 * 한 랩의 소요 시간(초)을 구성 요소별로 계산한다.
 * 총합 근사가 아니라 랩 단위로 쌓는 것이 v2 의 핵심 변경점.
 *
 * @returns {{ total:number, parts:object }}
 */
export function lapTime(ctx) {
  const {
    circuit, team, driver, weather, traffic,
    compound, age, lap, totalLaps, scStatus, noise,
  } = ctx;

  const surface = weather.surface; // 'dry' | 'rain' | 'heavy'

  const base = circuit.baseLap;
  const car = team.pace;
  const drv = driver.pace;

  // 타이어 항 — 모델에 따라 다르게 계산한다. 나머지 항은 두 모델이 같다.
  let comp, deg, temp = 0, tyreTemp = null;
  if (ctx.model === 'doc') {
    // 조사 문서 수식: F5 컴파운드 계수 × 미디엄 기준, F2 꺾은선 열화, F3·F4 온도 보정.
    // 기존 모델의 워밍업·노면온도 마모 증가는 F4 와 겹치므로 쓰지 않는다 (문서 5-4 "중복 금지").
    const surfaceF = (SURFACE_WEAR[surface] && SURFACE_WEAR[surface][compound]) || 1;
    const mult = circuit.degMultiplier * team.degMultiplier * driver.mgmt * surfaceF;
    const d = docLapTerms(ctx, base + car + drv, mult, lapMultiplier(scStatus));
    comp = d.comp; deg = d.deg; temp = d.temp; tyreTemp = d.tyreTemp;
  } else {
    comp = TYRE[compound].delta;
    const wearCtx = {
      trackTemp: weather.trackTemp,
      surface,
      circuitDeg: circuit.degMultiplier,
      teamDeg: team.degMultiplier,
      driverMgmt: driver.mgmt,
    };
    deg = degradation(compound, age, wearCtx);
  }

  const fuel = fuelEffect(lap, totalLaps, circuit.fuelPerLap);
  const evo = trackEvolution(lap, surface);

  let surf = SURFACE_PENALTY[surface][compound];
  // 웨트 컨디션에서는 드라이버의 우천 실력이 크게 갈린다
  if (surface !== 'dry') surf += ((100 - driver.wetSkill) / 100) * 1.8;

  const trafficD = TRAFFIC_DELTA[traffic] || 0;

  const green =
    base + car + drv + comp + deg + temp + fuel + evo + surf + trafficD + noise;

  // 깃발 구간에는 실제 주행 속도가 강제로 낮아진다 (safetyCar.js 가 계수를 갖는다)
  const total = green * lapMultiplier(scStatus);

  return {
    total,
    parts: { base, car, drv, comp, deg, temp, tyreTemp, fuel, evo, surf, traffic: trafficD, noise },
  };
}



/** 그리드 위치로 인한 1랩차 손실 (초). 스타트 직후에만 적용 */
export function gridLoss(gridPos) {
  return Math.max(0, gridPos - 1) * RACE.gridPenaltyPerPos * 10;
}
