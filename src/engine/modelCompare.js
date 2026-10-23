// 두 모델 비교 — 기존 모델과 조사 문서 수식이 각각 고른 전략을 서로의 식으로 다시 계산한다.
//
// "누가 더 빠른 전략을 골랐나"가 아니라 "같은 전략을 두 식이 어떻게 다르게 평가하나"를 보는 것이
// 목적이다. 그래서 2×2 표를 만든다.
//
//                  기존 모델로 계산    문서 수식으로 계산
//   기존 모델 추천        A                 B (+ 문서 수명 초과 여부)
//   문서 수식 추천        C                 D
//
// DOM 을 참조하지 않는다.

import { searchStrategies } from './strategySearch.js';
import { simulate } from './simulate.js';
import { validatePlan } from './rules.js';

export function compareModels(scenario, seed, timeline) {
  const base = { ...scenario, model: 'base' };
  const doc = { ...scenario, model: 'doc' };
  const tl = timeline && timeline.length === scenario.circuit.laps
    ? timeline : new Array(scenario.circuit.laps).fill('green');

  const pickB = searchStrategies(base, seed, tl)[0] || null;
  const pickD = searchStrategies(doc, seed, tl)[0] || null;

  const evalPlan = (plan) => plan && ({
    plan,
    base: simulate(base, plan, seed, tl),
    doc: simulate(doc, plan, seed, tl),
    underBase: validatePlan(plan, base),
    underDoc: validatePlan(plan, doc),
  });

  const B = evalPlan(pickB);
  const D = evalPlan(pickD);
  const same = !!(pickB && pickD) && JSON.stringify(pickB.stints) === JSON.stringify(pickD.stints);
  return { B, D, same };
}
