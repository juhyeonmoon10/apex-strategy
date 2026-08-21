// 레이스 트레이스 — F1 전략 분석의 표준 그래프.
//
// 랩타임 차트는 "이 랩이 몇 초였나"를 보여준다.
// 트레이스는 "지금 누가 앞서 있나"를 보여준다. 전략 비교에는 후자가 훨씬 중요하다.
//
//   delta(n) = 기준페이스 × n − 누적시간(n)
//   양수 = 기준보다 앞섬(시간을 벌었음), 음수 = 뒤처짐
//
// 피트스톱은 아래로 꺾이는 계단으로, 신품 타이어 구간은 위로 올라가는 기울기로 나타난다.
// 두 선이 교차하는 지점이 곧 언더컷/오버컷이 성립한 순간이다.

import { i, eul, eun } from './josa.js';

/**
 * @param {Array<{plan:object, result:object}>} entries
 * @returns {{ref:number, totalLaps:number, series:Array, crossovers:Array, range:{min:number,max:number}}}
 */
export function buildTrace(entries) {
  const valid = entries.filter((e) => e.result && !e.result.invalid);
  if (!valid.length) return null;

  const totalLaps = valid[0].result.laps.length;

  // 기준 페이스 = 비교 대상들의 평균 랩타임.
  // 특정 전략을 기준으로 삼으면 그 전략이 항상 직선이 되어 비교가 왜곡된다.
  const ref =
    valid.reduce((a, e) => a + e.result.total / totalLaps, 0) / valid.length;

  const series = valid.map((e) => {
    const points = [{ lap: 0, delta: 0 }];
    e.result.laps.forEach((l) => {
      points.push({ lap: l.lap, delta: ref * l.lap - l.cumulative, pit: l.pit > 0, compound: l.compound, sc: l.sc });
    });
    return {
      planId: e.plan.id,
      label: e.plan.label,
      isMine: e.plan.id === 'my',
      stints: e.plan.stints,
      pitLaps: e.result.pitLaps,
      points,
    };
  });

  const all = series.flatMap((s) => s.points.map((p) => p.delta));
  const range = { min: Math.min(...all), max: Math.max(...all) };

  return { ref, totalLaps, series, crossovers: findCrossovers(series, totalLaps), range };
}

/**
 * 선두가 바뀌는 지점을 찾는다. 이게 트레이스의 핵심 정보다.
 *
 * ⚠ 가장 중요한 제약: **스톱 수가 같은 시점끼리만 비교한다.**
 * 한 차가 피트인하면 트레이스가 26초 아래로 꺾이고, 아직 안 들어간 차가 자동으로 앞선다.
 * 그건 전략의 우열이 아니라 그냥 톱니다. 이걸 거르지 않으면
 * "22초 차 오버컷" 같은 허위 신호가 쏟아진다.
 *
 * 나머지 노이즈 필터: 최소 3랩 유지 + 0.4초 이상 마진.
 */
function findCrossovers(series, totalLaps) {
  if (series.length < 2) return [];

  const stopsAt = (ser, lap) => ser.pitLaps.filter((p) => p <= lap).length;

  const SETTLE = 3; // 피트 직후 몇 랩은 아직 정산 중으로 본다

  /**
   * 비교 가능한 랩인가.
   *  (1) 모든 전략의 스톱 수가 같고
   *  (2) 아무도 최근 SETTLE 랩 안에 피트인하지 않았다
   * (2)가 없으면 "상대가 방금 들어가서 26초 잃은" 순간을 역전으로 잡아버린다.
   */
  const comparable = (lap) => {
    const n = stopsAt(series[0], lap);
    if (!series.every((ser) => stopsAt(ser, lap) === n)) return false;
    return series.every((ser) => !ser.pitLaps.some((p) => p > lap - SETTLE && p <= lap));
  };

  const leaderAt = (lap) => {
    let best = 0;
    for (let i = 1; i < series.length; i++) {
      if (series[i].points[lap].delta > series[best].points[lap].delta) best = i;
    }
    return best;
  };

  const out = [];
  let cur = null;

  for (let lap = 2; lap <= totalLaps; lap++) {
    if (!comparable(lap)) continue;
    const next = leaderAt(lap);
    if (cur === null) { cur = next; continue; }
    if (next === cur) continue;

    // 이후 3랩(비교 가능한 랩 기준) 동안 유지되는가
    let stable = true;
    let checked = 0;
    for (let k = lap + 1; k <= totalLaps && checked < 3; k++) {
      if (!comparable(k)) continue;
      checked++;
      if (leaderAt(k) !== next) { stable = false; break; }
    }
    const margin = series[next].points[lap].delta - series[cur].points[lap].delta;
    if (!stable || margin < 0.4) continue;

    const from = series[cur];
    const to = series[next];

    // 여기까지 왔다면 양쪽 스톱 수가 같고, 둘 다 피트 직후가 아니다.
    // 즉 이 역전은 진짜다. 가장 최근 스톱의 선후로 언더컷/오버컷을 가른다.
    const myPit = to.pitLaps.filter((p) => p <= lap).pop();
    const rivalPit = from.pitLaps.filter((p) => p <= lap).pop();

    let kind = null;
    let cause;
    if (myPit && rivalPit && myPit < rivalPit) {
      kind = '언더컷';
      cause = `${myPit}랩에 먼저 들어가 ${rivalPit}랩까지 신품 타이어로 벌어놓은 것이 살아나면서`;
    } else if (myPit && rivalPit && myPit > rivalPit) {
      kind = '오버컷';
      cause = `${rivalPit}랩에 들어간 ${eul(from.label)} 두고 ${myPit}랩까지 코스에 남은 것이 통해서`;
    } else if (myPit && rivalPit) {
      cause = '같은 랩에 피트인했지만 스톱 실행과 타이어 워밍업 차이가 누적되어';
    } else {
      cause = '아직 아무도 피트인하지 않은 상태에서 스틴트 페이스만으로';
    }

    // 결승선까지 유지되는 역전인가. 일시적 역전을 성공으로 읽히게 두면 안 된다.
    const holdsToEnd =
      to.points[totalLaps].delta > from.points[totalLaps].delta;
    const finalGap = Math.abs(to.points[totalLaps].delta - from.points[totalLaps].delta);

    out.push({
      lap,
      fromLabel: from.label,
      toLabel: to.label,
      kind,
      margin,
      holdsToEnd,
      text:
        `${lap}랩 — ${cause} ${i(to.label)} ${eul(from.label)} 앞섭니다. ` +
        `${kind ? `(${kind}, ` : '('}${margin.toFixed(1)}초 차)` +
        (holdsToEnd
          ? ' 이 우위는 결승선까지 유지됩니다.'
          : ` 다만 일시적입니다 — ${eun(from.label)} 이후 페이스로 되찾아 결승선에서는 ${finalGap.toFixed(1)}초 앞섭니다.`),
    });
    cur = next;
  }
  return out;
}

/** 특정 랩 시점의 순위/갭 스냅샷 (재생 중 표시용) */
export function snapshotAt(trace, lap) {
  const l = Math.max(0, Math.min(trace.totalLaps, lap));
  const rows = trace.series.map((s) => ({
    label: s.label,
    isMine: s.isMine,
    delta: s.points[l].delta,
    compound: s.points[l].compound,
    sc: s.points[l].sc,
  }));
  rows.sort((a, b) => b.delta - a.delta);
  const lead = rows[0].delta;
  return rows.map((r, i) => ({ ...r, pos: i + 1, gap: lead - r.delta }));
}
