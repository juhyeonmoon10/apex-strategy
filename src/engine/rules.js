// FIA 규정 검증 + 전략 상식 경고
import { SLICKS, COMPOUND_KO, TYRE } from './params.js';
import { RACE } from './params.js';
import { stintLives } from './docModel.js';

/**
 * @returns {{ legal:boolean, errors:string[], warnings:string[] }}
 */
export function validatePlan(plan, scenario) {
  const errors = [];
  const warnings = [];
  const { circuit, weather } = scenario;
  const stints = plan.stints;

  const sum = stints.reduce((a, s) => a + s.laps, 0);
  if (sum !== circuit.laps) {
    errors.push(`스틴트 합계가 ${sum}랩입니다. 레이스는 ${circuit.laps}랩이어야 합니다.`);
  }

  if (stints.length < 2) {
    errors.push('최소 1회의 피트스톱이 필요합니다.');
  }

  // 드라이 레이스: 서로 다른 슬릭 컴파운드 2종 이상 사용 의무
  if (weather.surface === 'dry') {
    const usedSlicks = new Set(stints.map((s) => s.compound).filter((c) => SLICKS.includes(c)));
    if (usedSlicks.size < 2) {
      errors.push('드라이 레이스에서는 서로 다른 슬릭 컴파운드를 2종 이상 사용해야 합니다.');
    }
  }

  // 조사 문서 수식 모델: F1 "실제 스틴트 = min(√(2·T_pit/k₁), a_cliff, h₀/Δh_lap)" 를 수명 상한으로 쓴다
  const lives = scenario.model === 'doc' ? stintLives(scenario, [...new Set(stints.map((s) => s.compound))]) : null;
  const TERM_KO = { econ: '경제적 스틴트 √(2·T_pit/k₁)', cliff: '클리프 a_cliff', tread: '트레드 소진 h₀/Δh_lap' };

  stints.forEach((s, i) => {
    if (s.laps < RACE.minStintLaps) {
      errors.push(`${i + 1}스틴트가 ${s.laps}랩입니다. 최소 ${RACE.minStintLaps}랩 이상이어야 합니다.`);
    }
    if (lives && lives[s.compound] && s.laps > lives[s.compound].limit) {
      const L = lives[s.compound];
      errors.push(`${i + 1}스틴트: ${COMPOUND_KO[s.compound]} ${s.laps}랩 — 문서 공식 수명 ${L.limit}랩(${TERM_KO[L.binding]})을 넘습니다.`);
    }
    const cliff = lives ? scenario.doc.tyre[s.compound].tau : TYRE[s.compound].cliffLap;
    if (!lives && s.laps > cliff + 6) {
      warnings.push(
        `${i + 1}스틴트: ${COMPOUND_KO[s.compound]} ${s.laps}랩 — 클리프(${cliff}랩)를 ${s.laps - cliff}랩 넘겼습니다. 후반 페이스가 급격히 떨어집니다.`
      );
    }
  });

  if (weather.surface !== 'dry') {
    const hasSlick = stints.some((s) => SLICKS.includes(s.compound));
    const allWet = stints.every((s) => !SLICKS.includes(s.compound));
    if (allWet && weather.surface === 'rain') {
      warnings.push('노면이 마르기 시작하면 슬릭으로의 크로스오버를 놓칠 수 있습니다.');
    }
    if (hasSlick && weather.surface === 'heavy') {
      warnings.push('폭우 중 슬릭 스틴트가 있습니다. 실제 레이스라면 사실상 주행이 불가능합니다.');
    }
  }

  if (stints.length - 1 > 4) {
    warnings.push(`피트스톱 ${stints.length - 1}회는 현실적인 범위를 벗어납니다.`);
  }

  return { legal: errors.length === 0, errors, warnings };
}
