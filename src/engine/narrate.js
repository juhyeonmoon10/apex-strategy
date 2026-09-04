// "이 랩에서" — 재생 중 랩마다 바뀌는 한 문단.
// 트레이스 데이터에서 유도한다. 하드코딩된 카피 없음.
import { COMPOUND_KO, TYRE } from './params.js';
import { i as josaI, eun } from './josa.js';
import { snapshotAt } from './trace.js';

/**
 * @param {object} trace      buildTrace() 결과
 * @param {number} lap
 * @param {number} focusIdx   trace.series 에서 주인공 인덱스
 * @returns {string} HTML (b 태그만 사용)
 */
export function narrateLap(trace, lap, focusIdx) {
  if (!trace) return '';
  const ser = trace.series[focusIdx] || trace.series[0];
  const total = trace.totalLaps;

  if (lap <= 0) {
    const c = ser.stints[0].compound;
    return `그리드에서 출발을 기다립니다. <b>${COMPOUND_KO[c]}</b>로 스타트합니다.`;
  }
  if (lap >= total) {
    const snap = snapshotAt(trace, total);
    const me = snap.find((r) => r.label === ser.label);
    const lead = snap[0];
    return me.pos === 1
      ? `<b>결승선.</b> ${josaI(ser.label)} 2위 ${snap[1] ? snap[1].label : ''}에 <b>${snap[1] ? snap[1].gap.toFixed(1) : '0'}초</b> 앞서 완주했습니다.`
      : `<b>결승선.</b> ${eun(ser.label)} ${me.pos}위, 선두 ${lead.label}에 <b>${me.gap.toFixed(1)}초</b> 뒤졌습니다.`;
  }

  const pt = ser.points[lap];
  const snap = snapshotAt(trace, lap);
  const me = snap.find((r) => r.label === ser.label);
  const parts = [];

  // 이 랩에 피트인
  if (ser.pitLaps.includes(lap)) {
    const idx = stintIndexAt(ser.stints, lap);
    const next = ser.stints[idx + 1];
    parts.push(`<b>${lap}랩 피트인.</b> ${COMPOUND_KO[pt.compound]}에서 <b>${COMPOUND_KO[next.compound]}</b>로 교체합니다.`);
  } else {
    // 최근 피트 직후
    const recent = ser.pitLaps.filter((p) => p < lap && p >= lap - 3).pop();
    const age = ageAt(ser.stints, lap);
    if (recent) {
      parts.push(`신품 <b>${COMPOUND_KO[pt.compound]}</b> ${age}랩째. 피트 손실을 되찾는 중입니다.`);
    } else {
      const cliff = TYRE[pt.compound]?.cliffLap;
      if (cliff && age > cliff) {
        parts.push(`<b>${COMPOUND_KO[pt.compound]}</b> ${age}랩째 — 클리프(${cliff}랩)를 <b>${age - cliff}랩</b> 넘겼습니다. 페이스가 떨어지고 있습니다.`);
      } else if (cliff && age >= cliff - 2) {
        parts.push(`<b>${COMPOUND_KO[pt.compound]}</b> ${age}랩째. 클리프(${cliff}랩)가 가까워 피트 윈도우에 들어왔습니다.`);
      } else {
        parts.push(`<b>${COMPOUND_KO[pt.compound]}</b> ${age}랩째, 정상 페이스입니다.`);
      }
    }
  }

  // 순위·갭
  if (me.pos === 1 && snap[1]) {
    parts.push(`현재 <b>선두</b>, 2위와 <b>${snap[1].gap.toFixed(1)}초</b> 차.`);
  } else if (me) {
    parts.push(`현재 <b>${me.pos}위</b>, 선두에 <b>${me.gap.toFixed(1)}초</b> 뒤.`);
  }

  // 교차 지점
  const x = trace.crossovers.find((c) => c.lap === lap);
  if (x) parts.push(`<b>순위 역전.</b> ${x.kind ? x.kind + '이 성립했습니다.' : ''}`);

  // SC
  if (pt.sc && pt.sc !== 'green') {
    parts.push(pt.sc === 'sc' ? '<b>세이프티카</b> 상황입니다. 피트 손실이 절반 이하로 줄어듭니다.' : '<b>VSC</b> 상황입니다.');
  }

  return parts.join(' ');
}

function stintIndexAt(stints, lap) {
  let acc = 0;
  for (let i = 0; i < stints.length; i++) {
    acc += stints[i].laps;
    if (lap <= acc) return i;
  }
  return stints.length - 1;
}

function ageAt(stints, lap) {
  let acc = 0;
  for (const s of stints) {
    if (lap <= acc + s.laps) return lap - acc;
    acc += s.laps;
  }
  return lap - acc;
}
