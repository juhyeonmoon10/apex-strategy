// 기획서 6.2 랩타임 공식
import { TYRE, SURFACE_PENALTY, TRAFFIC_DELTA, RACE } from './params.js';
import { degradation, fuelEffect, trackEvolution } from './degradation.js';

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
  const comp = TYRE[compound].delta;

  const wearCtx = {
    trackTemp: weather.trackTemp,
    surface,
    circuitDeg: circuit.degMultiplier,
    teamDeg: team.degMultiplier,
    driverMgmt: driver.mgmt,
  };
  const deg = degradation(compound, age, wearCtx);

  const fuel = fuelEffect(lap, totalLaps, circuit.fuelPerLap);
  const evo = trackEvolution(lap, surface);

  let surf = SURFACE_PENALTY[surface][compound];
  // 웨트 컨디션에서는 드라이버의 우천 실력이 크게 갈린다
  if (surface !== 'dry') surf += ((100 - driver.wetSkill) / 100) * 1.8;

  const trafficD = TRAFFIC_DELTA[traffic] || 0;

  const green =
    base + car + drv + comp + deg + fuel + evo + surf + trafficD + noise;

  // SC/VSC 중에는 실제 주행 속도가 강제로 낮아진다
  const total = green * (scStatus === 'green' ? 1 : scMult(scStatus));

  return {
    total,
    parts: { base, car, drv, comp, deg, fuel, evo, surf, traffic: trafficD, noise },
  };
}

function scMult(status) {
  return status === 'sc' ? 1.35 : 1.15;
}

/** 그리드 위치로 인한 1랩차 손실 (초). 스타트 직후에만 적용 */
export function gridLoss(gridPos) {
  return Math.max(0, gridPos - 1) * RACE.gridPenaltyPerPos * 10;
}
