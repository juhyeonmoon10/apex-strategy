// 실제 그랑프리 기록 → 화면이 쓸 수 있는 형태로.
//
// 시뮬레이션 결과(simulate.js)와 달리 실제 기록에는 구멍이 있다.
//   · 리타이어한 차는 랩 수가 모자란다
//   · 랩타임이 비어 있는 랩이 있다 (아웃랩·계측 누락)
//   · 적기 중단 랩의 랩타임에는 중단 시간이 통째로 들어 있다 (몬차 2026: 4랩 1955초)
// 그래서 시뮬레이션용 trace.js 를 쓰지 않고 여기서 따로 순위·간격을 계산한다.
//
// DOM 을 참조하지 않는다 — engine/ 규칙.

import { COMPOUND_OF } from '../data/races.js';

const STOPPAGE_RATIO = 3;   // 중앙값의 3배가 넘는 랩은 중단(적기)이 섞인 것으로 본다

/**
 * @param {object} race  data/races/*.json
 * @returns {{totalLaps:number, drivers:Array, bands:Array, events:Array,
 *            standingsAt:(lap:number)=>Array, raceTimeAt:(driver,lap)=>number}}
 */
export function buildRealRace(race) {
  const totalLaps = race.totalLaps;

  const drivers = race.drivers.map((d) => {
    const times = d.lapTimes.slice(0, totalLaps);
    const known = times.filter((t) => typeof t === 'number' && t > 0);
    const median = known.length
      ? known.slice().sort((a, b) => a - b)[Math.floor(known.length / 2)]
      : 90;

    // 누적 시간 — 빈 랩은 중앙값으로 메우고 추정 표시. 완주 랩 수는 따로 센다.
    const cum = [];
    const est = [];
    const racing = [];              // 중단 시간을 뺀 "달린 시간" — 재생 속도에만 쓴다
    let acc = 0, accRacing = 0, done = 0;
    for (let i = 0; i < totalLaps; i++) {
      const raw = times[i];
      const ok = typeof raw === 'number' && raw > 0;
      if (!ok && i >= (d.laps ?? 0)) break;          // 리타이어 이후는 기록이 없다
      const t = ok ? raw : median;
      acc += t;
      accRacing += Math.min(t, median * STOPPAGE_RATIO);
      cum.push(acc);
      racing.push(accRacing);
      est.push(!ok);
      done = i + 1;
    }

    const stints = (d.stints || [])
      .map((s) => ({ compound: COMPOUND_OF[s.compound] || 'MEDIUM', from: s.from, to: Math.min(s.to, totalLaps), age: s.age || 0 }))
      .filter((s) => s.to >= s.from);

    // 랩 길이가 중앙값의 3배를 넘는 피트는 적기 중 교체다 (정상 스톱 손실이 아니다)
    const pits = (d.pits || []).map((p) => ({ lap: p.lap, lane: p.lane, stoppage: p.lane > median * STOPPAGE_RATIO }));

    return {
      num: d.num, code: d.code, name: d.name, team: d.team, colour: d.colour ? `#${d.colour}` : '#9aa1ab',
      pos: d.pos, dnf: !!d.dnf, officialLaps: d.laps ?? done, total: d.total, gapFinal: d.gap,
      stints, pits, times, cum, racing, est, median,
      lapsDone: done,
      outLap: done < totalLaps ? done : null,      // 완주하지 못했으면 마지막으로 기록된 랩
    };
  });

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
        time: done > 0 ? d.cum[done - 1] : 0,
        // 랩다운으로 랩 수가 모자란 차와 리타이어한 차를 구분한다.
        // dnf 가 아니면 그냥 뒤처진 것이므로 "+N랩" 으로 보여야 한다.
        out: d.dnf && L > d.lapsDone,
        justOut: d.dnf && L === d.lapsDone + 1,
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
    const base = k <= 0 ? 0 : drv.racing[Math.min(k, drv.racing.length) - 1] || 0;
    const nextIdx = Math.min(k, drv.racing.length - 1);
    const step = nextIdx >= 0 && drv.racing[nextIdx] != null
      ? (drv.racing[nextIdx] - (nextIdx > 0 ? drv.racing[nextIdx - 1] : 0))
      : drv.median;
    return base + frac * step;
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
    race, totalLaps, drivers, bands: mergeBands(race.bands), events: race.events || [],
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
 * 실제 스틴트 → 우리 엔진의 plan. 총 랩 수가 맞지 않으면(리타이어) null.
 * 모델 대조(백테스트)에 쓴다.
 */
export function planFromStints(stints, totalLaps) {
  if (!stints.length) return null;
  const laps = stints.map((s) => s.to - s.from + 1);
  const sum = laps.reduce((a, b) => a + b, 0);
  if (sum !== totalLaps) {
    // 마지막 스틴트로 길이를 맞춘다 (아웃랩 경계 때문에 1~2랩 어긋나는 경우)
    const diff = totalLaps - sum;
    laps[laps.length - 1] += diff;
    if (laps.some((n) => n < 1)) return null;
  }
  return {
    id: 'real',
    label: '실제 전략',
    stints: stints.map((s, i) => ({ compound: s.compound, laps: laps[i] })),
  };
}
