// ★ F-19 설명 엔진 — v2 의 핵심 차별화 요소.
//
// 경쟁 서비스(PITWALL, f1strategysim)는 전부 "숫자"를 준다.
// 우리는 "왜 그 숫자인지"를 한국어 문장으로 만든다.
// 여기 있는 모든 문장은 실제 시뮬레이션 결과에서 유도된다 — 하드코딩된 카피가 아니다.

import { COMPOUND_KO, TYRE } from './params.js';
import { fmtGap } from './simulate.js';

/**
 * 한국어 조사 선택. 앞말의 받침 유무로 갈린다.
 * "미디엄를" 같은 문장이 나오면 설명 엔진 전체의 신뢰가 깎인다.
 */
function josa(word, withFinal, withoutFinal) {
  const last = word.charCodeAt(word.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  if (!isHangul) return withoutFinal;
  const hasFinal = (last - 0xac00) % 28 !== 0;
  return hasFinal ? withFinal : withoutFinal;
}
const eul = (w) => w + josa(w, '을', '를');
const eun = (w) => w + josa(w, '은', '는');
const gwa = (w) => w + josa(w, '과', '와');

/**
 * 하나의 전략에 대한 근거 문장 목록.
 * @returns {Array<{tag:string, text:string}>}
 */
export function explainPlan(scenario, plan, res, allPlans, allRes) {
  const out = [];
  const { circuit, team, driver, weather } = scenario;
  const stops = res.stops;

  // 1) 시간 예산 분해 — 어디서 시간을 잃었나
  out.push({
    tag: '시간 예산',
    text:
      `총 주행 시간 중 피트스톱으로 ${res.pitTime.toFixed(1)}초, ` +
      `타이어 마모로 ${res.degTime.toFixed(1)}초를 잃었습니다. ` +
      `연료가 줄면서 마지막 랩은 첫 랩보다 약 ` +
      `${(circuit.fuelPerLap * (circuit.laps - 1)).toFixed(1)}초 빨라집니다.`,
  });

  // 2) 스톱 수 트레이드오프 — 다른 전략과 직접 비교
  const other = allRes.find((r) => r && !r.invalid && r.stops !== stops);
  if (other) {
    const pitDiff = res.pitTime - other.pitTime;
    const degDiff = res.degTime - other.degTime;
    const net = res.total - other.total;
    const otherPlan = allPlans[allRes.indexOf(other)];
    out.push({
      tag: '스톱 수',
      text:
        `${stops}스톱은 ${other.stops}스톱(${otherPlan.label})보다 ` +
        `피트에서 ${pitDiff >= 0 ? `${pitDiff.toFixed(1)}초를 더 쓰지만` : `${Math.abs(pitDiff).toFixed(1)}초를 아끼지만`}, ` +
        `마모에서 ${degDiff >= 0 ? `${degDiff.toFixed(1)}초를 더 잃습니다` : `${Math.abs(degDiff).toFixed(1)}초를 아낍니다`}. ` +
        `합치면 ${net <= 0 ? `${Math.abs(net).toFixed(1)}초 유리` : `${net.toFixed(1)}초 불리`}합니다.`,
    });
  }

  // 3) 언더컷 성립 여부 — 신품 타이어 이득 vs 피트 손실
  if (res.pitLaps.length > 0) {
    const firstPit = res.pitLaps[0];
    const gainPerLap = freshTyreGain(plan, scenario, firstPit);
    const pitCost = circuit.pitLoss + team.pitStop;
    const lapsToRecover = gainPerLap > 0.01 ? pitCost / gainPerLap : Infinity;
    out.push({
      tag: '언더컷',
      text: Number.isFinite(lapsToRecover)
        ? `${firstPit}랩에 피트인하면 신품 타이어로 랩당 약 ${gainPerLap.toFixed(2)}초를 법니다. ` +
          `피트 손실 ${pitCost.toFixed(1)}초를 되찾는 데 ${Math.ceil(lapsToRecover)}랩이 필요합니다. ` +
          (lapsToRecover <= 12
            ? '언더컷이 성립하는 구간입니다.'
            : '회수 랩이 길어 언더컷보다 오버컷이 유리할 수 있습니다.')
        : `이 조건에서는 신품 타이어 이득이 거의 없어 언더컷이 성립하지 않습니다.`,
    });
  }

  // 4) 클리프 — 스틴트가 한계를 넘었나
  plan.stints.forEach((s, i) => {
    const cliff = TYRE[s.compound].cliffLap;
    if (s.laps > cliff) {
      out.push({
        tag: '클리프',
        text:
          `${i + 1}스틴트에서 ${eul(COMPOUND_KO[s.compound])} ${s.laps}랩 사용합니다. ` +
          `${cliff}랩을 넘어서면 마모가 제곱으로 증가하므로, ` +
          `마지막 ${s.laps - cliff}랩에서 페이스가 크게 떨어집니다.`,
      });
    }
  });

  // 5) 노면 온도와 마모의 관계
  const hottest = plan.stints.reduce((a, s) =>
    TYRE[s.compound].idealTemp < TYRE[a.compound].idealTemp ? s : a, plan.stints[0]);
  const excess = weather.trackTemp - TYRE[hottest.compound].idealTemp;
  if (excess > 4) {
    out.push({
      tag: '노면 온도',
      text:
        `노면 ${weather.trackTemp}°C는 ${COMPOUND_KO[hottest.compound]} 최적 온도보다 ` +
        `${excess.toFixed(0)}°C 높습니다. 마모가 약 ${(excess * TYRE[hottest.compound].thermalK * 100).toFixed(0)}% 빨라지므로 ` +
        `피트 윈도우를 앞당기는 편이 안전합니다.`,
    });
  } else if (excess < -6) {
    out.push({
      tag: '노면 온도',
      text:
        `노면 ${weather.trackTemp}°C는 낮은 편입니다. 마모는 느리지만 ` +
        `타이어를 작동 온도에 올리는 데 시간이 걸려 스틴트 초반 페이스가 떨어집니다.`,
    });
  }

  // 6) 우천 크로스오버
  if (weather.surface !== 'dry') {
    out.push({
      tag: '크로스오버',
      text:
        `노면이 젖어 있습니다. 인터미디에이트에서 슬릭으로 바꾸는 시점이 이 레이스를 가릅니다. ` +
        `한 랩 이르면 스핀 위험, 한 랩 늦으면 랩당 ${(TYRE.INTER.delta).toFixed(1)}초를 버립니다. ` +
        `섹터 타임과 드라이 라인 형성을 함께 보고 판단하세요.`,
    });
  }

  // 7) 드라이버·팀 특성
  const mgmt = team.degMultiplier * driver.mgmt;
  if (Math.abs(mgmt - 1) > 0.03) {
    out.push({
      tag: '팀·드라이버',
      text:
        `${gwa(team.name)} ${driver.name}의 타이어 관리 계수는 ${mgmt.toFixed(3)}입니다. ` +
        (mgmt < 1
          ? `평균보다 마모가 적어 스틴트를 ${Math.round((1 - mgmt) * 60)}% 정도 더 끌 여지가 있습니다.`
          : `평균보다 마모가 커서 피트 윈도우를 앞당겨야 합니다.`),
    });
  }

  return out;
}

/** 첫 피트 시점에서 신품 타이어가 벌어주는 랩당 시간 */
function freshTyreGain(plan, scenario, firstPitLap) {
  const oldC = plan.stints[0].compound;
  const newC = plan.stints[1] ? plan.stints[1].compound : oldC;
  const age = plan.stints[0].laps;
  const t = TYRE[oldC];
  const n = TYRE[newC];
  const wornLoss = t.wear * age * scenario.circuit.degMultiplier * scenario.team.degMultiplier;
  const freshLoss = n.wear * 1 * scenario.circuit.degMultiplier * scenario.team.degMultiplier;
  const compoundDiff = t.delta - n.delta;
  return wornLoss - freshLoss + compoundDiff - n.warmup / 3;
}

/**
 * 모델 신뢰도. 왜 그 값인지도 함께 돌려준다.
 * v1 은 숫자만 보여줬다 — 근거가 없으면 신뢰도 표시가 장식이 된다.
 */
export function confidence(scenario, hasMonteCarlo) {
  let score = 62;
  const reasons = [];

  reasons.push({ delta: 0, text: '실주행(FP) 데이터 없이 범용 초기값으로 계산했습니다.' });

  if (scenario.weather.surface !== 'dry') {
    score -= 16;
    reasons.push({ delta: -16, text: '우천 조건은 변동성이 커서 예측 정확도가 크게 떨어집니다.' });
  }
  const tempOff = Math.abs(scenario.weather.trackTemp - 32);
  if (tempOff > 8) {
    score -= Math.round(tempOff * 0.4);
    reasons.push({ delta: -Math.round(tempOff * 0.4), text: `노면 온도가 기준(32°C)에서 ${tempOff.toFixed(0)}°C 벗어나 마모 외삽 오차가 커집니다.` });
  }
  if (hasMonteCarlo) {
    score += 9;
    reasons.push({ delta: +9, text: '몬테카를로 반복으로 세이프티카 변동을 반영했습니다.' });
  } else {
    reasons.push({ delta: 0, text: '아직 단일 시나리오만 계산했습니다. 500회 실행 시 신뢰도가 올라갑니다.' });
  }
  if (scenario.traffic === 'heavy') {
    score -= 6;
    reasons.push({ delta: -6, text: '트래픽이 많은 조건은 추월 변수 때문에 모델 오차가 큽니다.' });
  }

  score = Math.max(30, Math.min(78, score));
  const band = score >= 65 ? '보통' : score >= 50 ? '낮음~보통' : '낮음';
  return { score, band, reasons };
}

/** 몬테카를로 결과를 한 문장으로 */
export function explainMonteCarlo(mc, plans) {
  const best = mc.perPlan.reduce((a, b) => (b.winRate > a.winRate ? b : a));
  const bestScIdx = mc.perPlan.reduce((a, b, i) => (b.scWinRate > mc.perPlan[a].scWinRate ? i : a), 0);
  const bestCleanIdx = mc.perPlan.reduce((a, b, i) => (b.cleanWinRate > mc.perPlan[a].cleanWinRate ? i : a), 0);

  const lines = [];
  const worst = mc.perPlan.reduce((a, b) => (b.gapP50 > a.gapP50 ? b : a));
  lines.push(
    `${mc.runs}회 중 ${eun(best.label)} ${Math.round(best.winRate * 100)}%로 가장 자주 이겼습니다. ` +
    `절반의 회차에서 2위 전략과의 차이는 ${worst.gapP50.toFixed(1)}초 이내였고, ` +
    `최악의 경우 ${worst.gapWorst.toFixed(1)}초까지 벌어졌습니다.`
  );
  if (worst.gapP50 < 3) {
    lines.push(
      '세 전략의 중앙 갭이 3초 이내입니다. 이 정도 차이는 피트스톱 한 번의 실수나 ' +
      '추월 한 번으로 뒤집히는 범위이므로, 숫자만 보고 한 전략을 확정하지 마세요.'
    );
  }

  if (mc.scRuns > 0) {
    lines.push(
      `세이프티카가 나온 ${mc.scRuns}회에서는 ${plans[bestScIdx].label}이, ` +
      `클린 레이스 ${mc.runs - mc.scRuns}회에서는 ${plans[bestCleanIdx].label}이 가장 강했습니다.` +
      (bestScIdx !== bestCleanIdx
        ? ' 세이프티카 여부가 최적 전략을 뒤집습니다 — 레이스 중 재판단이 필요합니다.'
        : ' 세이프티카 여부와 무관하게 같은 전략이 우세합니다.')
    );
  } else {
    lines.push('이 서킷은 세이프티카 확률이 낮아 500회 중 한 번도 발생하지 않았습니다.');
  }

  return lines;
}

export { fmtGap };
