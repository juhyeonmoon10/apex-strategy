// 조사 문서 수식 — 화면 조각.
//   renderModelCard   1단계: 기존 모델 / 조사 문서 수식 선택 + 계수 표
//   renderDocPanel    2단계: F1 타이어 수명 표 · F3/F4 타이어 온도 · F2 열화 곡선(두 모델 겹쳐 보기)
//   renderCompare     2단계: 두 모델이 고른 전략을 서로의 식으로 다시 계산한 2×2 표

import { h, mount } from './dom.js';
import { COMPOUND_KO, COMPOUND_COLOR, DOC_MODEL } from '../engine/params.js';
import { fmtRaceTime } from '../engine/simulate.js';
import { degradation } from '../engine/degradation.js';
import {
  docDegradation, stintLives, circuitSpeed, tyreTemperature, tempPenalty, treadPerLap, wearMultiplier,
  LIFE_TERM_KO as TERM_KO,
} from '../engine/docModel.js';
import { DOC_MEASURED } from '../data/docParams.js';

const SLICK = ['SOFT', 'MEDIUM', 'HARD'];
const NS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  kids.forEach((k) => k != null && el.append(k instanceof Node ? k : document.createTextNode(String(k))));
  return el;
}

const fmt = (v, d = 3) => {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  let t = Number(v).toFixed(d);
  if (t.includes('.')) t = t.replace(/0+$/, '').replace(/\.$/, '');   // 정수의 0 은 지우지 않는다
  return t;
};

/* ======================= 1단계 — 모델 선택 + 계수 ======================= */

/**
 * @param {{model:string, doc:object, overrides:object, onModel:(m)=>void, onOverrides:(o)=>void}} o
 */
export function renderModelCard(o) {
  const isDoc = o.model === 'doc';
  const P = o.doc;

  // 계수 하나를 고치면 overrides 에 깊게 넣는다
  const setPath = (path, value) => {
    const next = JSON.parse(JSON.stringify(o.overrides || {}));
    let cur = next;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] = cur[path[i]] || {};
    cur[path[path.length - 1]] = value;
    o.onOverrides(next);
  };
  const num = (path, value, step, title) => h('input.doc-num', {
    type: 'number', step, value: String(value), title,
    'aria-label': title,
    onchange: (e) => {
      const v = Number(e.target.value);
      if (Number.isFinite(v)) setPath(path, v);
      else e.target.value = String(value);
    },
  });

  const tyreRows = SLICK.map((c) => {
    const t = P.tyre[c];
    return h('tr',
      h('th', h('i.doc-dot', { style: { background: COMPOUND_COLOR[c] } }), COMPOUND_KO[c]),
      h('td', num(['tyre', c, 'k1'], t.k1, 0.001, `${COMPOUND_KO[c]} k₁ 랩당 열화`)),
      h('td', num(['tyre', c, 'tau'], t.tau, 1, `${COMPOUND_KO[c]} τ 클리프 랩`)),
      h('td', num(['tyre', c, 'b2'], t.b2, 0.01, `${COMPOUND_KO[c]} β₂ 클리프 후 추가 기울기`)),
      h('td', num(['tyre', c, 'kc'], t.kc, 0.0001, `${COMPOUND_KO[c]} k_c 컴파운드 계수`)),
      h('td', num(['tyre', c, 'wear'], t.wear, 0.1, `${COMPOUND_KO[c]} 마모계수 k`)));
  });

  const fillMeasured = () => {
    const next = JSON.parse(JSON.stringify(o.overrides || {}));
    next.tyre = next.tyre || {};
    SLICK.forEach((c) => {
      const m = DOC_MEASURED.compounds[c];
      next.tyre[c] = { ...(next.tyre[c] || {}), k1: m.k1, ...(m.kc ? { kc: m.kc } : {}) };
    });
    o.onOverrides(next);
  };

  const changed = o.overrides && Object.keys(o.overrides).length > 0;

  return h('div.card.mode-card.doc-card',
    h('div.field', h('label', '계산 모델'),
      h('div.seg', { role: 'group', 'aria-label': '계산 모델' },
        h('button', { type: 'button', 'aria-pressed': String(!isDoc), onclick: () => o.onModel('base') }, '기존 모델'),
        h('button', { type: 'button', 'aria-pressed': String(isDoc), onclick: () => o.onModel('doc') }, '조사 문서 수식'))),
    isDoc
      ? h('div.mode-body',
        h('ul.doc-formulas',
          h('li', h('b', 'F1 타이어 수명'), ' 실제 스틴트 = min( √(2·T_pit / k₁) , a_cliff , h₀ / Δh_lap )'),
          h('li', h('b', 'F2 클리프'), ' t_tire(a) = β₀ + β₁·a + β₂·(a − τ)₊'),
          h('li', h('b', 'F3 타이어 온도'), ' T_track = (T_tire − q·T_air − b·v² − c) / p'),
          h('li', h('b', 'F4 온도 보정'), ' Δt = a(T_min − T)² · 0 · b(T − T_max)²'),
          h('li', h('b', 'F5 컴파운드 계수'), ' 예상 랩타임 = 미디엄 기준 × k_c'),
          h('li', h('b', 'F6 주행거리 마모'), ' Δh_lap = k · D_track · (km 당 마모)')),
        h('p.mode-note', '문서가 다루지 않는 연료·트랙 진화·팀/드라이버 페이스·비·트래픽·깃발은 기존 모델 것을 그대로 씁니다. '
          + '기존 모델의 워밍업과 노면 온도에 따른 마모 증가는 F4 와 겹치므로 이 모드에서는 빼고 계산합니다.'),
        h('details.doc-coef',
          h('summary', '계수 보기·고치기', changed ? h('span.doc-changed', '수정됨') : null),
          h('div.doc-table-wrap',
            h('table.doc-table',
              h('thead', h('tr', h('th', ''), h('th', 'k₁ (β₁)', h('small', '초/랩')), h('th', 'τ (a_cliff)', h('small', '랩')),
                h('th', 'β₂', h('small', '초/랩')), h('th', 'k_c', h('small', '미디엄=1')), h('th', '마모계수 k'))),
              h('tbody', tyreRows))),
          h('div.doc-grid',
            h('label', 'h₀ 초기 트레드 (mm)', num(['h0'], P.h0, 0.1, 'h₀')),
            h('label', 'km 당 마모 (mm, k=1)', num(['mmPerKm'], P.mmPerKm, 0.001, 'km 당 마모')),
            h('label', 'T_min (°C)', num(['temp', 'tMin'], P.temp.tMin, 1, 'T_min')),
            h('label', 'T_max (°C)', num(['temp', 'tMax'], P.temp.tMax, 1, 'T_max')),
            h('label', 'a 저온 (초/°C²)', num(['temp', 'a'], P.temp.a, 0.001, 'a')),
            h('label', 'b 과열 (초/°C²)', num(['temp', 'b'], P.temp.b, 0.001, 'b')),
            h('label', 'p 노면 비율', num(['tyreTemp', 'p'], P.tyreTemp.p, 0.1, 'p')),
            h('label', 'q 기온 비율', num(['tyreTemp', 'q'], P.tyreTemp.q, 0.1, 'q')),
            h('label', 'b 마찰 발열 (°C·s²/m²)', num(['tyreTemp', 'b'], P.tyreTemp.b, 0.001, 'b 마찰 발열')),
            h('label', 'c 상수 (°C)', num(['tyreTemp', 'c'], P.tyreTemp.c, 1, 'c'))),
          h('div.doc-actions',
            h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: fillMeasured }, '실측값 넣기 (k₁ · k_c)'),
            h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => o.onOverrides({}) }, '기본값으로')),
          h('p.mode-note',
            `기본값 출처 — k₁: 실측 랩 ${DOC_MEASURED.laps.toLocaleString('ko-KR')}개에서 문서 방법(스틴트 회귀)으로 계산. `
            + 'τ: 실측에서 클리프가 검출되지 않아(팀이 클리프 전에 피트인) 기존 모델 값. β₂: 기존 모델 클리프 곡률을 10랩 평균 기울기로 환산. '
            + 'k_c·마모계수·h₀·온도 범위·a·b: 문서 예시값. p·q·b·c: 문서에 값이 없어 프로젝트 가정.'),
          h('p.mode-note',
            `실측 k_c 는 소프트 ${fmt(DOC_MEASURED.compounds.SOFT.kc, 4)}, 하드 ${fmt(DOC_MEASURED.compounds.HARD.kc, 4)} 로 하드가 미디엄보다 빠르게 나옵니다. `
            + '하드는 경기 후반 고무가 깔린 트랙에서 주로 달리기 때문에 생기는 착시입니다. 그래서 기본값은 문서 예시를 씁니다.')))
      : h('div.mode-body', h('span.mode-note',
        '마모 = 선형 + 클리프 이후 제곱(최대 3초), 컴파운드 차이는 고정 초, 노면 온도가 높으면 마모가 빨라지는 모델입니다. '
        + '조사 문서 수식으로 바꾸면 같은 조건을 문서 식으로 다시 계산합니다.')));
}

/* ======================= 2단계 — 문서 수식 패널 ======================= */

/** 열화 곡선: 기존 모델(점선) vs 문서 F2(실선), 문서 수명 F1 표시 */
function degChart(sc, lives) {
  const W = 640, H = 220, L = 44, R = 14, T = 14, B = 30;
  const maxAge = 40, maxY = 4;
  const x = (a) => L + ((a - 1) / (maxAge - 1)) * (W - L - R);
  const y = (v) => T + (1 - Math.min(maxY, v) / maxY) * (H - T - B);
  const P = sc.doc;
  const mult = wearMultiplier(sc);
  const ctx = {
    trackTemp: sc.weather.trackTemp, surface: sc.weather.surface,
    circuitDeg: sc.circuit.degMultiplier, teamDeg: sc.team.degMultiplier, driverMgmt: sc.driver.mgmt,
  };

  const g = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'doc-chart', role: 'img', 'aria-label': '타이어 나이별 열화 손실 — 기존 모델과 문서 수식' });
  for (let v = 0; v <= maxY; v++) {
    g.append(s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'dc-grid' }),
      s('text', { x: L - 6, y: y(v) + 4, class: 'dc-tick', 'text-anchor': 'end' }, `${v}초`));
  }
  for (let a = 5; a <= maxAge; a += 5) {
    g.append(s('text', { x: x(a), y: H - 10, class: 'dc-tick', 'text-anchor': 'middle' }, `${a}`));
  }
  g.append(s('text', { x: W - R, y: H - 10, class: 'dc-tick', 'text-anchor': 'end' }, '타이어 나이(랩)'));

  SLICK.forEach((c) => {
    const col = c === 'HARD' ? '#e9ebee' : COMPOUND_COLOR[c];
    const ptsBase = [], ptsDoc = [];
    for (let a = 1; a <= maxAge; a++) {
      // 기존 모델 1랩째의 워밍업 튐은 곡선 모양을 가려서 2랩부터 그린다
      if (a >= 2) ptsBase.push(`${x(a).toFixed(1)},${y(degradation(c, a, ctx)).toFixed(1)}`);
      ptsDoc.push(`${x(a).toFixed(1)},${y(docDegradation(P, c, a, mult)).toFixed(1)}`);
    }
    g.append(
      s('polyline', { points: ptsBase.join(' '), fill: 'none', stroke: col, 'stroke-width': 2, 'stroke-dasharray': '5 5', opacity: 0.7 }),
      s('polyline', { points: ptsDoc.join(' '), fill: 'none', stroke: col, 'stroke-width': 2.6 }));
    const lim = lives[c].limit;
    if (lim <= maxAge) {
      g.append(s('line', { x1: x(lim), x2: x(lim), y1: y(docDegradation(P, c, lim, mult)) - 10, y2: y(docDegradation(P, c, lim, mult)) + 10, stroke: col, 'stroke-width': 3 }),
        s('text', { x: x(lim) + 4, y: y(docDegradation(P, c, lim, mult)) - 12, class: 'dc-lab', fill: col }, `${COMPOUND_KO[c]} 수명 ${lim}`));
    }
  });
  return g;
}

export function renderDocPanel(root, sc) {
  const P = sc.doc;
  const lives = stintLives(sc);
  const pit = sc.circuit.pitLoss + sc.team.pitStop;
  const v = circuitSpeed(sc.circuit);
  const air = sc.weather.airTemp ?? 22;
  const Tt = tyreTemperature(P, sc.weather.trackTemp, air, v);
  const pen = tempPenalty(P, Tt);
  const inWin = Tt >= P.temp.tMin && Tt <= P.temp.tMax;

  mount(root,
    h('p.doc-lead', '타이어 수명은 세 값 중 가장 짧은 것이 이깁니다 (F1). 문서 수식 모드에서는 이 수명을 넘는 스틴트가 있는 전략을 후보에서 뺍니다.'),
    h('div.doc-table-wrap',
      h('table.doc-table.doc-life',
        h('thead', h('tr',
          h('th', ''),
          h('th', '√(2·T_pit/k₁)', h('small', '경제적 스틴트')),
          h('th', 'a_cliff', h('small', '클리프')),
          h('th', 'h₀ / Δh_lap', h('small', '트레드 소진')),
          h('th', '수명', h('small', '셋 중 최소')))),
        h('tbody', SLICK.map((c) => {
          const l = lives[c];
          const cell = (k, val, d) => h('td.num', { class: l.binding === k ? 'bind' : '' }, fmt(val, d));
          return h('tr',
            h('th', h('i.doc-dot', { style: { background: COMPOUND_COLOR[c] } }), COMPOUND_KO[c]),
            cell('econ', l.econ, 1), cell('cliff', l.cliff, 0), cell('tread', l.tread, 1),
            h('td.num.life', `${l.limit}랩`, h('small', TERM_KO[l.binding])));
        })))),
    h('p.mode-note',
      `T_pit = 피트 손실 ${pit.toFixed(1)}초 (서킷 ${sc.circuit.pitLoss.toFixed(1)} + 팀 ${sc.team.pitStop.toFixed(1)}) · `
      + `Δh_lap = ${SLICK.map((c) => `${COMPOUND_KO[c]} ${treadPerLap(P, c, sc.circuit.lengthKm).toFixed(3)}`).join(' / ')} mm/랩 `
      + `(트랙 ${sc.circuit.lengthKm.toFixed(3)} km) · h₀ = ${P.h0} mm`),

    h('h4.doc-h', '타이어 온도 (F3 → F4)'),
    h('p.doc-temp',
      `T_tire = ${P.tyreTemp.p}·${sc.weather.trackTemp} + ${P.tyreTemp.q}·${air} + ${P.tyreTemp.b}·${v.toFixed(1)}² + ${P.tyreTemp.c} = `,
      h('b', `${Tt.toFixed(1)}°C`),
      inWin
        ? ` — 적정 범위 ${P.temp.tMin}~${P.temp.tMax}°C 안이라 보정 0초`
        : ` — 적정 범위 ${P.temp.tMin}~${P.temp.tMax}°C 를 벗어나 랩당 `,
      inWin ? null : h('b', `+${pen.toFixed(3)}초`)),
    h('p.mode-note', `v 는 서킷 평균 속도(트랙 길이 ÷ 기준 랩타임)를 코너링 속도 대신 씁니다. 깃발 구간에는 속도가 줄어 타이어가 식습니다. `
      + '문서 기본값은 컴파운드마다 같은 적정 범위를 쓰므로, 이 항은 모든 전략에 같은 시간을 더하고 순위는 바꾸지 않습니다.'),

    h('h4.doc-h', '열화 곡선 — 기존 모델(점선)과 문서 F2(실선)'),
    h('div.doc-chart-wrap', degChart(sc, lives)),
    h('p.mode-note', '기존 모델은 클리프 이후 제곱으로 늘다가 3초에서 멈추고, 문서 F2 는 τ 이후 기울기가 β₂ 만큼 꺾여 직선으로 늘어납니다. '
      + '세로 막대는 문서 F1 의 수명입니다.'));
}

/* ======================= 2단계 — 두 모델 비교 ======================= */

export function renderCompare(root, cmp) {
  if (!cmp || !cmp.B || !cmp.D) {
    mount(root, h('p.empty', '이 조건에서는 두 모델 중 하나가 조건을 만족하는 전략을 찾지 못했습니다.'));
    return;
  }
  const chips = (plan) => plan.stints.map((st) => h('span.rr-chip', { class: `c-${st.compound}` }, `${COMPOUND_KO[st.compound]} ${st.laps}`));
  const cell = (res, check, isOwn) => h('td.num', { class: isOwn ? 'own' : '' },
    res && !res.invalid ? fmtRaceTime(res.total) : '—',
    check && !check.legal ? h('small.doc-viol', '수명 초과') : null);

  const bb = cmp.B.base.total, bd = cmp.B.doc.total, db = cmp.D.base.total, dd = cmp.D.doc.total;
  // 어느 쪽이 빠른지 부호를 보고 문장을 고른다. last 면 문장을 끝맺는다.
  const faster = (tB, tD, last) => {
    const d = tD - tB;
    if (Math.abs(d) < 0.05) return last ? '두 추천의 시간이 같습니다' : '두 추천의 시간이 같고';
    const who = d > 0 ? '기존' : '문서';
    return `${who} 추천이 ${Math.abs(d).toFixed(1)}초 ${last ? '빠릅니다' : '빠르고'}`;
  };
  const notes = [];
  if (cmp.same) {
    notes.push('두 모델이 같은 전략을 골랐습니다. 식이 달라도 이 조건에서는 결론이 같습니다.');
  } else {
    notes.push(`기존 모델로 계산하면 ${faster(bb, db, false)}, 문서 수식으로 계산하면 ${faster(bd, dd, true)}.`);
  }
  const violD = !cmp.D.underBase.legal ? cmp.D.underBase.errors[0] : null;
  if (violD) notes.push(`문서 추천은 기존 모델의 조건에 걸립니다 — ${violD}`);

  // 왜 다른가 — 수명을 넘는 스틴트, 스톱 수, 클리프 처리, 온도 보정 순으로
  const why = [];
  if (!cmp.same) {
    const over = cmp.B.plan.stints
      .map((st, i) => ({ st, i, L: cmp.lives[st.compound] }))
      .filter((x) => x.L && x.st.laps > x.L.limit);
    if (over.length) {
      const stints = over.map((x) => `${x.i + 1}스틴트 ${COMPOUND_KO[x.st.compound]} ${x.st.laps}랩`).join(', ');
      const limits = [...new Set(over.map((x) => `${COMPOUND_KO[x.st.compound]} ${x.L.limit}랩 · ${TERM_KO[x.L.binding]}`))].join(', ');
      why.push(`기존 추천의 ${stints}이 문서 F1 수명(${limits})을 넘습니다. 문서 수식은 이런 스틴트를 허용하지 않아 다른 전략을 고릅니다.`
        + (bd < dd ? ' 랩타임만 보면 문서 식으로 계산해도 기존 추천이 더 빠릅니다.' : ''));
    }
    const sb = cmp.B.plan.stints.length - 1, sd = cmp.D.plan.stints.length - 1;
    why.push(sb === sd
      ? `스톱 수는 ${sb}스톱으로 같고, 스틴트 길이와 컴파운드 배분이 다릅니다.`
      : `스톱 수가 ${sb}스톱에서 ${sd}스톱으로 ${sd > sb ? '늘었습니다. 짧아진 스틴트를 피트스톱 한 번으로 메웁니다' : '줄었습니다. 수명이 긴 컴파운드로 스틴트를 늘립니다'}.`);
    if (over.some((x) => x.L.binding === 'cliff')) {
      why.push('기존 모델은 클리프 이후 손실이 3초에서 멈춰, 클리프를 넘겨 타도 손해가 작게 계산됩니다. '
        + '문서 F1 에서는 클리프 τ 가 수명의 한 항이라 넘길 수 없습니다. 1단계 계수 표에서 τ 를 바꾸면 차이가 어떻게 변하는지 볼 수 있습니다.');
    }
    const tt = cmp.D.doc.tempTime;
    why.push(tt > 0.05
      ? `문서 수식의 시간에는 F4 온도 보정 ${tt.toFixed(1)}초가 들어 있습니다. 모든 전략에 같게 붙어 순위는 바꾸지 않습니다.`
      : '이 조건에서 F4 온도 보정은 0초라, 시간 차이는 전부 마모·컴파운드 식과 전략 차이에서 나옵니다.');
  }

  mount(root,
    h('div.doc-table-wrap',
      h('table.doc-table.doc-cmp',
        h('thead', h('tr', h('th', '추천한 모델'), h('th', '전략'), h('th', '기존 모델로 계산'), h('th', '문서 수식으로 계산'))),
        h('tbody',
          h('tr', h('th', '기존 모델'), h('td', h('div.rr-cmp-chips', chips(cmp.B.plan))), cell(cmp.B.base, null, true), cell(cmp.B.doc, cmp.B.underDoc, false)),
          h('tr', h('th', '조사 문서 수식'), h('td', h('div.rr-cmp-chips', chips(cmp.D.plan))), cell(cmp.D.base, cmp.D.underBase, false), cell(cmp.D.doc, null, true))))),
    h('ul.doc-notes', notes.map((n) => h('li', n))),
    why.length ? h('h4.doc-h', '왜 다른가') : null,
    why.length ? h('ul.doc-notes', why.map((n) => h('li', n))) : null,
    h('p.mode-note', '같은 조건·같은 시드에서 깃발 없이 계산합니다. 굵은 칸은 각 모델이 자기 식으로 계산한 자기 추천입니다.'));
}

export { DOC_MODEL };
