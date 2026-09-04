// 전략 보드 — 피렐리 "Possible Race Strategies" 그래픽의 레이아웃을 그대로 따른다.
//   헤더 2단 · 행마다 시작 타이어 → 컴파운드 막대 → 피트 지점 타이어 → 오른쪽 등급/스톱 수 → 행 끝 타이어
//   막대 위 타이어 바로 왼쪽에 피트 윈도우 · 하단 한 줄 안내 · 타이어 범례
// 글은 전부 한국어 실용 문구. 장식용 영어 문구는 쓰지 않는다.
// 윈도우 숫자는 engine/pitWindow.js 가 실제로 계산한다.

import { h, mount } from './dom.js';
import { tyreIcon } from './tyreIcon.js';
import { COMPOUND_KO } from '../engine/params.js';
import { fmtRaceTime, fmtGap } from '../engine/simulate.js';

const GRADE = ['가장 빠른 전략', '대안 전략', '더 느린 전략'];   // 피렐리의 QUICKEST / ALTERNATIVE / SLOWER
const DARK_ON = new Set(['HARD', 'MEDIUM']);                 // 밝은 막대 위에서는 검정 글자

export function renderStrategyBoard(root, ctx) {
  const { plans, results, windows, selected, totalLaps, circuit, onSelect } = ctx;
  if (!plans.length) {
    mount(root, h('p.empty', '이 조건에서 규정을 충족하는 전략을 찾지 못했습니다.'));
    return;
  }

  // 피렐리 그래픽처럼 빠른 순서로 나열하고 등급을 매긴다
  const order = plans.map((p, i) => ({ i, t: results[i] && !results[i].invalid ? results[i].total : Infinity }))
    .sort((a, b) => a.t - b.t).map((x) => x.i);
  const best = order.length ? results[order[0]].total : 0;

  const rows = order.map((i, rank) => {
    const plan = plans[i];
    const res = results[i];
    const isSel = selected === i;
    const win = windows[i] || [];
    const stops = plan.stints.length - 1;

    const bar = h('div.board-bar', { 'aria-hidden': 'true' });
    const overlay = h('div.board-overlay');
    let acc = 0;
    plan.stints.forEach((st, si) => {
      acc += st.laps;
      bar.append(h(`div.board-seg.c-${st.compound}`, { style: { flex: `${st.laps} 1 0` } }));
      if (si < plan.stints.length - 1) {
        const pct = (acc / totalLaps) * 100;
        overlay.append(h('div.board-tyre', { style: { left: `${pct}%` } }, tyreIcon(plan.stints[si + 1].compound, 50)));
        const w = win[si];
        if (w) {
          overlay.append(h('div.board-window', {
            class: DARK_ON.has(st.compound) ? 'on-light' : 'on-dark',
            style: { left: `${pct}%` },
          }, h('b', `${w.from}–${w.to}`), '랩'));
        }
      }
    });
    overlay.prepend(h('div.board-tyre.start', tyreIcon(plan.stints[0].compound, 50)));

    return h('div.board-row', {
      role: 'radio', tabindex: isSel ? '0' : '-1', 'aria-checked': String(isSel),
      'aria-label': `${GRADE[rank]}, ${stops}스톱, ${plan.stints.map((s) => `${COMPOUND_KO[s.compound]} ${s.laps}랩`).join(', ')}`,
      onclick: () => onSelect(i),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); }
        if (e.key === 'ArrowDown') onSelect(order[(rank + 1) % order.length]);
        if (e.key === 'ArrowUp') onSelect(order[(rank - 1 + order.length) % order.length]);
      },
    },
      h('div.board-track', bar, overlay),
      h('div.board-name',
        h('div.board-tone', GRADE[rank] || plan.label),
        h('div.board-stopper', `${stops}스톱`),
        res && !res.invalid && h('div.board-time',
          h('b.num', fmtRaceTime(res.total)),
          h('span.num', { class: rank === 0 ? 'best' : '' }, rank === 0 ? '기준' : fmtGap(res.total - best)))),
      h('div.board-end', tyreIcon(plan.stints[plan.stints.length - 1].compound, 50)));
  });

  // 범례 — 이 경기에 지정된 세트 전체 (쓰이지 않은 컴파운드도 포함)
  const used = new Set(plans.flatMap((p) => p.stints.map((s) => s.compound)));
  const wet = used.has('INTER') || used.has('WET');
  const legendSet = wet ? ['HARD', 'MEDIUM', 'SOFT', 'INTER', 'WET'].filter((c) => used.has(c) || c === 'INTER')
                        : ['HARD', 'MEDIUM', 'SOFT'];
  const legend = h('div.board-legend',
    h('div.board-legend-tyres', legendSet.map((c) => tyreIcon(c, 96))),
    h('div.board-legend-text',
      legendSet.map((c) => h('div', { class: `board-legend-line c-${c}` },
        COMPOUND_KO[c],
        circuit.pirelli && circuit.pirelli[c] ? h('b', ` ${circuit.pirelli[c]}`) : null))));

  mount(root,
    h('div.board',
      h('div.board-head',
        h('div.board-mark', h('i'), h('i'), h('i')),
        h('div.board-head-text',
          h('div.board-event', `${circuit.name} · ${totalLaps}랩`),
          h('div.board-title', h('span.strong', '예상 레이스 전략')),
          h('div.board-sub', '피트 윈도우 — 타이어 왼쪽 숫자는 그 피트스톱을 넣기 좋은 랩 범위'))),
      h('div.board-rows', { role: 'radiogroup', 'aria-label': '추천 전략' }, rows),
      h('div.board-note', '각 전략 안에서 컴파운드 순서는 바뀔 수 있습니다'),
      legend,
      h('div.board-foot', '피트 윈도우는 피트 랩을 앞뒤로 옮겨 시뮬레이션했을 때 최적 대비 1.5초 이내인 범위입니다')));
}
