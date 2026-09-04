// 전략 보드 — 피렐리 2026 "Possible Race Strategies" 그래픽의 규격을 그대로 따른다.
//   docs/ui-audit-pirelli.md 에 원본 치수(1500×844)가 있고, 크기는 전부 CSS 의 cqw(1cqw = 15px)로 환산했다.
//   헤더 2단(작은 경기 이름 · 큰 제목) → 행마다 3px 선 위에 피트 타이어 · 왼쪽 위 윈도우 랩 · 오른쪽 스톱 수 · 끝 타이어
//   → 구분선 → 범례 · 피트 손실 · 서킷 랩 수 → 하단 작은 안내.
// 원본에는 없는 것: 각 행의 완주 시간과 격차(선 아래 작은 글씨). 등급 문구는 원본처럼 두지 않고 위에서부터 빠른 순서.
// 글은 전부 한국어 실용 문구.

import { h, mount } from './dom.js';
import { tyreIcon } from './tyreIcon.js';
import { COMPOUND_KO } from '../engine/params.js';
import { fmtRaceTime, fmtGap } from '../engine/simulate.js';
import { carImage, circuitMap } from '../data/assets.js';
import { brandMark } from '../shell.js';

const LEGEND = {
  HARD:   { colour: '흰색',   role: '가장 오래 버팀' },
  MEDIUM: { colour: '노란색', role: '중간' },
  SOFT:   { colour: '빨간색', role: '가장 빠름' },
  INTER:  { colour: '초록색', role: '젖은 노면' },
  WET:    { colour: '파란색', role: '물이 고인 노면' },
};

export function renderStrategyBoard(root, ctx) {
  const { plans, results, windows, selected, totalLaps, circuit, team, onSelect } = ctx;
  if (!plans.length) {
    mount(root, h('p.empty', '이 조건에서 규정을 충족하는 전략을 찾지 못했습니다.'));
    return;
  }

  // 빠른 순서로 — 원본은 등급 글자 없이 위가 가장 빠른 전략이다
  const order = plans.map((p, i) => ({ i, t: results[i] && !results[i].invalid ? results[i].total : Infinity }))
    .sort((a, b) => a.t - b.t).map((x) => x.i);
  const best = order.length ? results[order[0]].total : 0;

  const rows = order.map((i, rank) => {
    const plan = plans[i];
    const res = results[i];
    const isSel = selected === i;
    const win = windows[i] || [];
    const stops = plan.stints.length - 1;
    const last = plan.stints.length - 1;

    // 선: 스틴트마다 한 구간. 피트 타이어의 중심 = 윈도우 중앙 랩 ÷ 총 랩 (원본 규칙)
    const line = h('div.board-line');
    let acc = 0, prevPct = 0;
    plan.stints.forEach((st, si) => {
      acc += st.laps;
      const w = win[si];
      const mid = w ? (w.from + w.to) / 2 : acc;
      const pct = si < last ? Math.min(97, Math.max(3, (mid / totalLaps) * 100)) : 100;
      line.append(h(`div.board-seg.c-${st.compound}`, {
        class: `${si > 0 ? 'fade-l' : ''} ${si < last ? 'fade-r' : ''}`,
        style: { left: `${prevPct}%`, width: `${pct - prevPct}%` },
      }));
      if (si < last) {
        line.append(h('div.board-pit', { style: { left: `${pct}%` } }, tyreIcon(plan.stints[si + 1].compound, 66)));
        line.append(h('div.board-win', { class: pct < 20 ? 'near-left' : '', style: { left: `${pct}%` } },
          w ? [h('b', String(w.from)), ' ~ ', h('b', String(w.to)), h('span', '랩')]
            : [h('b', String(acc)), h('span', '랩')]));
      }
      prevPct = pct;
    });

    return h('div.board-row', {
      role: 'radio', tabindex: isSel ? '0' : '-1', 'aria-checked': String(isSel),
      'aria-label': `${rank + 1}번째로 빠른 전략, ${stops}스톱, ${plan.stints.map((s) => `${COMPOUND_KO[s.compound]} ${s.laps}랩`).join(', ')}`,
      onclick: () => onSelect(i),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); }
        if (e.key === 'ArrowDown') onSelect(order[(rank + 1) % order.length]);
        if (e.key === 'ArrowUp') onSelect(order[(rank - 1 + order.length) % order.length]);
      },
    },
      line,
      h('div.board-lab', `${stops}스톱`),
      res && !res.invalid && h('div.board-sub',
        h('span', fmtRaceTime(res.total)), ' · ',
        h('span', { class: rank === 0 ? 'best' : '' }, rank === 0 ? '기준' : fmtGap(res.total - best))),
      h('div.board-endtyre', tyreIcon(plan.stints[last].compound, 66)));
  });

  // 범례 — 이 경기 세트 (건조: 하드·미디엄·소프트 / 우천이 섞이면 쓰인 것 + 인터)
  const used = new Set(plans.flatMap((p) => p.stints.map((s) => s.compound)));
  const wet = used.has('INTER') || used.has('WET');
  const legendSet = wet ? ['HARD', 'MEDIUM', 'SOFT', 'INTER', 'WET'].filter((c) => used.has(c) || c === 'INTER')
                        : ['HARD', 'MEDIUM', 'SOFT'];
  const legend = legendSet.map((c) => h('div.board-lg',
    tyreIcon(c, 72),
    h('div.board-lg-txt',
      h('small', LEGEND[c].colour), h('small', LEGEND[c].role),
      h('b', { class: `c-${c}` }, COMPOUND_KO[c]))));

  const country = circuit.name.split(' 그랑프리')[0];
  const car = team && carImage(team.id, 120);
  const map = circuitMap(circuit.id);
  const carEl = car ? h('img', { src: car, alt: `${team.name} 머신`, loading: 'lazy', decoding: 'async',
    onerror: (e) => e.target.remove() }) : null;
  const mapEl = map ? h('img', { src: map, alt: `${circuit.track} 코스`, loading: 'lazy', decoding: 'async',
    onerror: (e) => e.target.remove() }) : null;

  mount(root,
    h('div.board',
      h('div.board-head',
        h('div',
          h('div.board-h1', h('b', country), h('i', '|'), circuit.name),
          h('div.board-h2', circuit.track, h('i', '|'), '예상 레이스 전략')),
        h('div.board-logos', brandMark(), 'COMPOUND')),
      h('div.board-rows', { role: 'radiogroup', 'aria-label': '추천 전략 — 위가 가장 빠름' }, rows),
      h('div.board-sep'),
      h('div.board-footer',
        legend,
        h('div.board-div'),
        h('div.board-loss', carEl,
          h('div.board-loss-txt', '평균', h('br'), '피트스톱 손실', h('b', `${circuit.pitLoss.toFixed(1)}초`))),
        h('div.board-div'),
        h('div.board-track', mapEl, h('span', h('b', String(totalLaps)), ' 랩'))),
      h('div.board-copy',
        h('span', '타이어 왼쪽 숫자는 피트 윈도우 — 피트 랩을 앞뒤로 옮겨 시뮬레이션했을 때 최적 대비 1.5초 이내인 랩 범위. 각 전략 안에서 컴파운드 순서는 바뀔 수 있습니다.'),
        h('span', '시뮬레이션 결과 · 실제 레이스가 아닙니다'))));
}
