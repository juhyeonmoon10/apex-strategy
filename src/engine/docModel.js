// 조사 문서 수식 모델.
//
// 자료 조사 문서 「자료 조사(빅데이터, 텔레메트리, 기초 F1 타이어 정보)」의 수식을
// 그대로 옮긴다. 기존 모델(degradation.js·lapTime.js)은 지우지 않고, 시나리오의
// model === 'doc' 일 때만 이 파일의 식이 마모·컴파운드·온도 항을 대신한다.
//
//   F1  실제 스틴트 = min( √(2·T_pit / k₁) , a_cliff , h₀ / Δh_lap )      타이어 수명
//   F2  t_tire(a) = β₀ + β₁·a + β₂·(a − τ)₊                                 클리프 꺾은선
//   F3  T_track = (T_tire − q·T_air − b·v² − c) / p                         노면·타이어 온도
//   F4  Δt_온도 = a(T_min − T)²  (T < T_min) · 0 · b(T − T_max)²  (T > T_max)  온도 보정
//   F5  k_c = t̄_c / t̄_M ,  예상 랩타임 = 미디엄 기준 랩타임 × k_c           컴파운드 계수
//   F6  M = k·D_track·N ,  N_max = M_max / (k·D_track)                      주행거리 마모
//
// 두 식이 같은 양을 가리키는 곳은 하나로 묶었다.
//   F1 의 k₁ = F2 의 β₁ (랩당 열화),  F1 의 a_cliff = F2 의 τ
//   F1 의 h₀/Δh_lap = F6 의 N_max  (Δh_lap = k·D_track·mmPerKm, M_max = h₀)
//
// DOM 을 참조하지 않는다 — engine/ 규칙.

import { DOC_MODEL } from './params.js';

/** 기본값 위에 화면에서 고친 값을 얹는다 (얕은 병합, 컴파운드는 한 단계 더) */
export function docParams(overrides) {
  const o = overrides || {};
  const tyre = {};
  for (const c of Object.keys(DOC_MODEL.tyre)) {
    tyre[c] = { ...DOC_MODEL.tyre[c], ...((o.tyre && o.tyre[c]) || {}) };
  }
  return {
    ...DOC_MODEL,
    ...o,
    tyre,
    temp: { ...DOC_MODEL.temp, ...(o.temp || {}) },
    tyreTemp: { ...DOC_MODEL.tyreTemp, ...(o.tyreTemp || {}) },
  };
}

/* ---------------- F2 — 클리프 꺾은선 ---------------- */

/**
 * 타이어 나이 a 에서의 열화 손실 (초). β₀ 는 랩타임 기준이라 여기서는 0.
 * @param {number} mult  서킷·팀·드라이버 마모 배수 (문서 밖 요소, 기존 모델과 같게)
 */
export function docDegradation(P, compound, age, mult = 1) {
  const t = P.tyre[compound] || P.tyre.MEDIUM;
  const over = Math.max(0, age - t.tau);
  return (t.k1 * age + t.b2 * over) * mult;
}

/* ---------------- F5 — 컴파운드 계수 ---------------- */

/** 예상 랩타임 = 미디엄 기준 × k_c  →  컴파운드 때문에 더해지는 시간 = 기준 × (k_c − 1) */
export function docCompoundTerm(P, compound, mediumLap) {
  const t = P.tyre[compound] || P.tyre.MEDIUM;
  return mediumLap * (t.kc - 1);
}

/** 문서의 계산법 그대로: 대표 랩타임의 비 */
export const compoundCoefficient = (tc, tm) => tc / tm;

/* ---------------- F3 · F4 — 온도 ---------------- */

/** 서킷 평균 속도 (m/s) — F3 의 v. 코너링 속도 대신 한 바퀴 평균을 쓴다 */
export const circuitSpeed = (circuit) => (circuit.lengthKm * 1000) / circuit.baseLap;

/** F3 를 타이어 온도에 대해 푼 식: T_tire = p·T_track + q·T_air + b·v² + c */
export function tyreTemperature(P, trackTemp, airTemp, v) {
  const k = P.tyreTemp;
  return k.p * trackTemp + k.q * airTemp + k.b * v * v + k.c;
}

/** F3 를 문서에 적힌 모양 그대로: T_track = (T_tire − q·T_air − b·v² − c) / p */
export function trackTemperatureFrom(P, tyreTemp, airTemp, v) {
  const k = P.tyreTemp;
  return (tyreTemp - k.q * airTemp - k.b * v * v - k.c) / k.p;
}

/** F4 — 적정 범위를 벗어난 온도 차의 제곱에 비례하는 추가 시간 (초) */
export function tempPenalty(P, T) {
  const { tMin, tMax, a, b } = P.temp;
  if (T < tMin) return a * (tMin - T) ** 2;
  if (T > tMax) return b * (T - tMax) ** 2;
  return 0;
}

/* ---------------- F6 · F1 — 마모량과 타이어 수명 ---------------- */

/** F6 랩당 트레드 마모 Δh_lap (mm/랩) = k · D_track · (km 당 마모) */
export function treadPerLap(P, compound, lengthKm) {
  const t = P.tyre[compound] || P.tyre.MEDIUM;
  return t.wear * lengthKm * P.mmPerKm;
}

/** F6 M = k·D·N — N 랩 뒤 누적 마모 (mm) */
export const wearAfter = (P, compound, lengthKm, laps) => treadPerLap(P, compound, lengthKm) * laps;

/**
 * F1 실제 스틴트 = min( √(2·T_pit/k₁), a_cliff, h₀/Δh_lap )
 * 세 값과 그중 가장 짧은 것(= 수명), 어느 항이 이겼는지를 돌려준다.
 *  econ   √(2·T_pit/k₁) — 피트 손실과 누적 열화가 같아지는 경제적 스틴트
 *  cliff  a_cliff        — 성능이 무너지는 랩
 *  tread  h₀/Δh_lap      — 트레드가 다 닳는 랩
 */
export function stintLife(P, compound, circuit, pitLoss, mult = 1) {
  const t = P.tyre[compound] || P.tyre.MEDIUM;
  const k1 = Math.max(1e-6, t.k1 * mult);
  const econ = Math.sqrt((2 * pitLoss) / k1);
  const cliff = t.tau;
  const tread = P.h0 / treadPerLap(P, compound, circuit.lengthKm);
  const terms = { econ, cliff, tread };
  const binding = Object.keys(terms).reduce((a, b) => (terms[a] <= terms[b] ? a : b));
  return { ...terms, limit: Math.floor(terms[binding]), binding };
}

/** F1 세 항의 한국어 이름 — 수명을 정한 항을 화면·설명 문장에 쓸 때 */
export const LIFE_TERM_KO = { econ: '경제적 스틴트', cliff: '클리프', tread: '트레드 소진' };

/** 서킷·팀·드라이버 마모 배수 — 기존 모델과 같은 곱 (문서 밖 요소) */
export const wearMultiplier = (scenario) =>
  scenario.circuit.degMultiplier * scenario.team.degMultiplier * scenario.driver.mgmt;

/** 시나리오 기준 컴파운드별 수명 표 */
export function stintLives(scenario, compounds = ['SOFT', 'MEDIUM', 'HARD']) {
  const P = scenario.doc || docParams();
  const pit = scenario.circuit.pitLoss + scenario.team.pitStop;
  const mult = wearMultiplier(scenario);
  const out = {};
  compounds.forEach((c) => { out[c] = stintLife(P, c, scenario.circuit, pit, mult); });
  return out;
}

/**
 * 문서 모델 한 랩의 타이어 관련 항. lapTime.js 가 기존 항 대신 쓴다.
 * @returns {{comp:number, deg:number, temp:number, tyreTemp:number}}
 */
export function docLapTerms(ctx, mediumLap, mult, flagMult) {
  const P = ctx.doc || docParams();
  const comp = docCompoundTerm(P, ctx.compound, mediumLap);
  const deg = docDegradation(P, ctx.compound, ctx.age, mult);
  // 깃발 구간에는 코너링 속도가 줄어 타이어가 식는다 (F3 의 v² 항)
  const v = circuitSpeed(ctx.circuit) / (flagMult || 1);
  const air = ctx.weather.airTemp ?? 22;
  const tyreTemp = tyreTemperature(P, ctx.weather.trackTemp, air, v);
  const temp = tempPenalty(P, tyreTemp);
  return { comp, deg, temp, tyreTemp };
}
