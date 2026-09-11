// 실제 그랑프리 기록 → 화면이 쓸 수 있는 형태로, 그리고 그 경기에 내 전략을 넣기.
//
// 시뮬레이션 결과(simulate.js)와 달리 실제 기록에는 구멍이 있다.
//   · 리타이어한 차는 랩 수가 모자란다
//   · 랩타임이 비어 있는 랩이 있다 (아웃랩·계측 누락)
//   · 적기 중단 랩의 랩타임에는 중단 시간이 통째로 들어 있다 (몬차 2026: 4랩 1,955초)
// 그래서 시뮬레이션용 trace.js 를 쓰지 않고 여기서 따로 순위·간격을 계산한다.
//
// 내 차를 끼워 넣을 때는 기준을 맞추는 것이 핵심이다. 실제 누적 시간에는 적기 중단이
// 들어 있지만 내 시뮬레이션에는 없다. 중단분을 경기 전체에서 같은 값으로 빼면
// (모두에게 같은 값이라 서로의 간격은 그대로) 내 시간과 같은 축에서 비교할 수 있다.
//
// DOM 을 참조하지 않는다 — engine/ 규칙.

import { COMPOUND_OF } from '../data/races.js';
import { SAFETY_CAR } from './params.js';

const RED_LAP_MULT = SAFETY_CAR.lapMultiplier;   // 중단분을 뺀 뒤 남길 랩타임 배수

const med = (arr) => {
  const a = arr.filter((x) => typeof x === 'number' && x > 0).sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : 0;
};

/** 적기 구간에 속한 랩 번호 집합 */
function redLaps(bands) {
  const set = new Set();
  (bands || []).forEach((b) => {
    if (b.type !== 'red') return;
    for (let l = b.from; l <= b.to; l++) set.add(l);
  });
  return set;
}

/**
 * 적기로 멈춰 있던 시간을 랩별로 추정한다.
 * 그 랩 필드 중앙값에서 "SC 페이스로 돈 랩"만큼만 남기고 나머지를 중단분으로 본다.
 * 모든 드라이버에게 같은 값을 빼므로 서로의 간격은 바뀌지 않는다.
 */
function stoppagePerLap(race, reds, base) {
  const out = new Map();
  reds.forEach((lap) => {
    const field = race.drivers.map((d) => d.lapTimes[lap - 1]).filter((t) => t);
    out.set(lap, Math.max(0, med(field) - base * RED_LAP_MULT));
  });
  return out;
}

/** 한 드라이버의 원본 기록 → 누적 시간·스틴트·피트가 정리된 형태 */
function normalise(d, totalLaps, stoppage, base) {
  const times = d.lapTimes.slice(0, totalLaps);
  const own = med(times) || base;

  const cum = [];      // 실제 누적 (중단 포함) — 공식 기록 그대로
  const racing = [];   // 중단분을 뺀 누적 — 내 시뮬레이션과 같은 축
  let acc = 0, accR = 0, done = 0;
  for (let i = 0; i < totalLaps; i++) {
    const raw = times[i];
    const ok = typeof raw === 'number' && raw > 0;
    if (!ok && i >= (d.laps ?? 0)) break;              // 리타이어 이후는 기록이 없다
    const t = ok ? raw : own;
    acc += t;
    accR += Math.max(own * 0.5, t - (stoppage.get(i + 1) || 0));
    cum.push(acc);
    racing.push(accR);
    done = i + 1;
  }

  const stints = (d.stints || [])
    .map((s) => ({ compound: COMPOUND_OF[s.compound] || 'MEDIUM', from: s.from, to: Math.min(s.to, totalLaps), age: s.age || 0 }))
    .filter((s) => s.to >= s.from);

  return {
    num: d.num, code: d.code, name: d.name, team: d.team,
    colour: d.colour ? `#${d.colour}` : '#9aa1ab',
    pos: d.pos, dnf: !!d.dnf, officialLaps: d.laps ?? done, total: d.total, gapFinal: d.gap,
    stints,
    pits: (d.pits || []).map((p) => ({ lap: p.lap, lane: p.lane, stoppage: p.lane > own * 3 })),
    times, cum, racing, median: own,
    lapsDone: done,
    outLap: done < totalLaps ? done : null,
  };
}

/**
 * 시뮬레이션 결과 → 실제 필드에 끼워 넣을 수 있는 "가상 드라이버".
 * 실제 드라이버와 같은 모양이라 순위·간트·트랙 맵이 그대로 동작한다.
 */
export function myCarFrom(result, plan, { label, colour, team, offset = 0 }) {
  let from = 1;
  const stints = plan.stints.map((s) => {
    const seg = { compound: s.compound, from, to: from + s.laps - 1, age: 0 };
    from += s.laps;
    return seg;
  });
  // offset: 우리 모델의 기본 페이스를 그 경기 실제 기록에 맞추는 랩당 보정(초).
  // 이걸 하지 않으면 근사 초기값 서킷에서 랩당 몇 초씩 어긋나 순위가 의미를 잃는다.
  const cum = result.laps.map((l, i) => l.cumulative + offset * (i + 1));
  return {
    num: -1, code: '내차', name: label, team, colour, mine: true,
    pos: null, dnf: false, officialLaps: result.laps.length, total: result.total, gapFinal: null,
    stints,
    pits: result.pitLaps.map((lap) => ({ lap, lane: 0, stoppage: false })),
    times: result.laps.map((l) => l.time + (l.pit || 0) + offset),
    cum, racing: cum.slice(),
    median: med(result.laps.map((l) => l.time)) + offset,
    offset,
    lapsDone: result.laps.length, outLap: null,
  };
}

/**
 * @param {object} race  data/races/*.json
 * @param {object} [myCar] myCarFrom() 결과 — 있으면 필드에 끼워 넣는다
 */
export function buildRealRace(race, myCar) {
  const totalLaps = race.totalLaps;
  const bands = mergeBands(race.bands);
  const reds = redLaps(bands);
  const base = med(race.drivers.flatMap((d) => d.lapTimes));
  const stoppage = stoppagePerLap(race, reds, base);

  const drivers = race.drivers.map((d) => normalise(d, totalLaps, stoppage, base));
  if (myCar) drivers.push(myCar);

  // 내 차가 있으면 "중단분을 뺀 시간"으로 순위를 매겨야 기준이 같다
  const useRacing = !!myCar;
  const timeOf = (d, n) => (n > 0 ? (useRacing ? d.racing : d.cum)[n - 1] || 0 : 0);

  const compoundAt = (drv, lap) => {
    const s = drv.stints.find((x) => lap >= x.from && lap <= x.to);
    return s ? s.compound : (drv.stints[drv.stints.length - 1] || {}).compound || 'MEDIUM';
  };
  const ageAt = (drv, lap) => {
    const s = drv.stints.find((x) => lap >= x.from && lap <= x.to);
    return s ? s.age + (lap - s.from) + 1 : 0;
  };

  /** lap 시점의 순위표. 완주 랩이 많은 순 → 누적 시간이 적은 순 */
  function standingsAt(lap) {
    const L = Math.max(0, Math.min(totalLaps, Math.round(lap)));
    const rows = drivers.map((d) => {
      const done = Math.min(L, d.lapsDone);
      return {
        driver: d,
        lapsDone: done,
        time: timeOf(d, done),
        // 랩다운으로 랩 수가 모자란 차와 리타이어한 차를 구분한다.
        out: d.dnf && L > d.lapsDone,
        compound: compoundAt(d, Math.max(1, done)),
        age: ageAt(d, Math.max(1, done)),
        inPit: d.pits.some((p) => p.lap === done),
      };
    });
    rows.sort((a, b) => {
      if (a.out !== b.out) return a.out ? 1 : -1;
      if (a.lapsDone !== b.lapsDone) return b.lapsDone - a.lapsDone;
      return a.time - b.time;
    });
    const lead = rows.find((r) => !r.out);
    return rows.map((r, i) => {
      const lapsBehind = lead ? lead.lapsDone - r.lapsDone : 0;
      return {
        ...r,
        pos: i + 1,
        lapsBehind,
        gap: !lead || r.out ? null : lapsBehind > 0 ? null : r.time - lead.time,
      };
    });
  }

  /** 기준 드라이버의 랩 v(소수)에 해당하는 "달린 시간" — 재생 시계 */
  function racingTimeAt(drv, v) {
    const k = Math.floor(v), frac = v - k;
    const b = k <= 0 ? 0 : drv.racing[Math.min(k, drv.racing.length) - 1] || 0;
    const idx = Math.min(k, drv.racing.length - 1);
    const step = idx >= 0 && drv.racing[idx] != null
      ? drv.racing[idx] - (idx > 0 ? drv.racing[idx - 1] : 0)
      : drv.median;
    return b + frac * step;
  }

  /** 달린 시간 T 에 그 드라이버가 몇 번째 랩의 어디쯤인지 (0~1) */
  function progressAt(drv, T) {
    if (!drv.racing.length) return { lap: 0, frac: 0, out: true };
    if (T >= drv.racing[drv.racing.length - 1]) {
      const finished = drv.lapsDone >= totalLaps;
      return { lap: drv.lapsDone, frac: finished ? 1 : 0, out: !finished, finished };
    }
    let i = 0;
    while (i < drv.racing.length && drv.racing[i] <= T) i++;
    const prev = i > 0 ? drv.racing[i - 1] : 0;
    const span = drv.racing[i] - prev || drv.median;
    return { lap: i + 1, frac: (T - prev) / span, out: false };
  }

  return {
    race, totalLaps, drivers, bands, events: race.events || [],
    myCar: myCar || null, reds,
    standingsAt, racingTimeAt, progressAt, compoundAt, ageAt,
  };
}

/**
 * 같은 종류가 이어지거나 겹치는 구간을 하나로 합친다.
 * 관제에서 세이프티카가 두 번 연달아 선언되면(모나코 2026: 60–66, 66–68)
 * 간트에 줄무늬가 두 겹으로 겹쳐 보인다.
 */
function mergeBands(bands) {
  const sorted = (bands || []).slice().sort((a, b) => a.from - b.from || a.to - b.to);
  const out = [];
  sorted.forEach((b) => {
    const last = out[out.length - 1];
    if (last && last.type === b.type && b.from <= last.to + 1) {
      last.to = Math.max(last.to, b.to);
      return;
    }
    out.push({ ...b });
  });
  return out;
}

/** 랩 번호 → 그 랩의 깃발 상태 ('green' | 'sc' | 'vsc' | 'red') */
const FLAG_RANK = { red: 3, sc: 2, vsc: 1 };
export function flagAt(bands, lap) {
  // 같은 랩에 SC 와 적기가 겹치면 더 강한 쪽을 보여준다 (몬차 2026: 3랩 SC → 적기)
  let best = null;
  (bands || []).forEach((b) => {
    if (lap < b.from || lap > b.to) return;
    if (!best || (FLAG_RANK[b.type] || 0) > (FLAG_RANK[best] || 0)) best = b.type;
  });
  return best || 'green';
}

/**
 * 실제 경기의 중단 구간 → simulate() 가 받는 랩별 타임라인.
 * 엔진은 green/sc/vsc 만 안다. 적기는 SC 로 넘긴다 — 느린 랩 + 싼 피트라는 점이 같다.
 * 중단 중 무손실 타이어 교체는 모델에 없으므로 화면에서 그렇게 밝힌다.
 */
export function timelineFromRace(bands, totalLaps) {
  const out = new Array(totalLaps).fill('green');
  (bands || []).forEach((b) => {
    const kind = b.type === 'vsc' ? 'vsc' : 'sc';
    for (let l = b.from; l <= Math.min(b.to, totalLaps); l++) {
      if (out[l - 1] === 'green' || kind === 'sc') out[l - 1] = kind;
    }
  });
  return out;
}

/**
 * 우리 모델의 기본 페이스를 그 경기 실제 기록에 맞추는 랩당 보정값.
 *
 * 기준 드라이버의 "실제 전략"을 우리 모델로 돌린 시간과 그 드라이버의 실제 기록을
 * 비교해 차이를 랩 수로 나눈다. 이 값을 더하면 같은 전략으로 달렸을 때 실제 기록과
 * 같아지고, 순위 차이에는 전략 차이만 남는다.
 *
 * @param {number} realTotal 기준 드라이버의 달린 시간 (중단분 제외)
 * @param {number} simTotal  같은 전략을 우리 모델로 돌린 시간
 */
export function paceOffset(realTotal, simTotal, totalLaps) {
  if (!realTotal || !simTotal || !totalLaps) return 0;
  return (realTotal - simTotal) / totalLaps;
}

/** 실제 스틴트 → 우리 엔진의 plan. 총 랩 수가 안 맞으면 마지막 스틴트로 맞춘다. */
export function planFromStints(stints, totalLaps) {
  if (!stints.length) return null;
  const laps = stints.map((s) => s.to - s.from + 1);
  const sum = laps.reduce((a, b) => a + b, 0);
  if (sum !== totalLaps) {
    laps[laps.length - 1] += totalLaps - sum;
    if (laps.some((n) => n < 1)) return null;
  }
  return {
    id: 'real',
    label: '실제 전략',
    stints: stints.map((s, i) => ({ compound: s.compound, laps: laps[i] })),
  };
}
