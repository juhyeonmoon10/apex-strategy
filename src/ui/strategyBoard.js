// 전략 보드 — 피렐리 "Possible Race Strategies" 그래픽을 구조·서체·배치까지 따른다.
//   헤더 2단 (작은 대회명 / 큰 "POSSIBLE RACE STRATEGIES" + "(PIT WINDOWS)")
//   행: 시작 타이어 · 컴파운드 막대 · 피트 지점 타이어 · 타이어 바로 왼쪽의 "LAP a TO b"
//       · 오른쪽 "THE QUICKEST / ONE-STOPPER" · 행 끝 마지막 타이어
//   하단: 한 줄 안내 · 큰 타이어 3개 + "WHITE HARD C2" 식 범례
// 로고·브랜드명은 쓰지 않는다. 윈도우 숫자는 engine/pitWindow.js 가 실제로 계산한다.

import { h, mount } from './dom.js';
import { tyreIcon } from './tyreIcon.js';
import { COMPOUND_KO } from '../engine/params.js';
import { fmtRaceTime, fmtGap } from '../engine/simulate.js';

const EN = { SOFT: 'SOFT', MEDIUM: 'MEDIUM', HARD: 'HARD', INTER: 'INTER', WET: 'WET' };
const COLOR_WORD = { HARD: 'WHITE', MEDIUM: 'YELLOW', SOFT: 'RED', INTER: 'GREEN', WET: 'BLUE' };
const TONE = { fastest: 'THE QUICKEST', safe: 'ALTERNATIVE', aggressive: 'SLOWER' };
const STOPPER = ['', 'ONE-STOPPER', 'TWO-STOPPER', 'THREE-STOPPER', 'FOUR-STOPPER'];
const DARK_ON = new Set(['HARD', 'MEDIUM']);   // 밝은 막대 위에서는 검정 글자

export function renderStrategyBoard(root, ctx) {
  const { plans, results, windows, selected, totalLaps, circuit, onSelect } = ctx;
  if (!plans.length) {
    mount(root, h('p.empty', '이 조건에서 규정을 충족하는 전략을 찾지 못했습니다.'));
    return;
  }
  const valid = results.filter((r) => r && !r.invalid);
  const best = valid.length ? Math.min(...valid.map((r) => r.total)) : 0;

  const rows = plans.map((plan, i) => {
    const res = results[i];
    const isSel = selected === i;
    const win = windows[i] || [];
    const stops = plan.stints.length - 1;

    const bar = h('div.board-bar', { 'aria-hidden': 'true' });
    const overlay = h('div.board-overlay');
    let acc = 0;
    plan.stints.forEach((st, si) => {
      const from = acc;
      acc += st.laps;
      bar.append(h(`div.board-seg.c-${st.compound}`, { style: { flex: `${st.laps} 1 0` } }));
      if (si < plan.stints.length - 1) {
        const pct = (acc / totalLaps) * 100;
        const next = plan.stints[si + 1].compound;
        overlay.append(h('div.board-tyre', { style: { left: `${pct}%` } }, tyreIcon(next, 50)));
        const w = win[si];
        if (w) {
          // 타이어 바로 왼쪽. 글자색은 그 자리 막대 색에 맞춘다
          overlay.append(h('div.board-window', {
            class: DARK_ON.has(st.compound) ? 'on-light' : 'on-dark',
            style: { left: `${pct}%` },
          }, 'LAP ', h('b', String(w.from)), ' TO ', h('b', String(w.to))));
        }
      }
    });
    overlay.prepend(h('div.board-tyre.start', tyreIcon(plan.stints[0].compound, 50)));

    return h('div.board-row', {
      role: 'radio', tabindex: isSel ? '0' : '-1', 'aria-checked': String(isSel),
      'data-style': plan.style,
      'aria-label': `${plan.label}, ${stops}스톱, ${plan.stints.map((s) => `${COMPOUND_KO[s.compound]} ${s.laps}랩`).join(', ')}`,
      onclick: () => onSelect(i),
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); }
        if (e.key === 'ArrowDown') onSelect((i + 1) % plans.length);
        if (e.key === 'ArrowUp') onSelect((i - 1 + plans.length) % plans.length);
      },
    },
      h('div.board-track', bar, overlay),
      h('div.board-name',
        h('div.board-tone', TONE[plan.style] || plan.label),
        h('div.board-stopper', STOPPER[stops] || `${stops}-STOPPER`),
        res && !res.invalid && h('div.board-time',
          h('span.board-ko', plan.label),
          h('b.num', fmtRaceTime(res.total)),
          h('span.num', { class: Math.abs(res.total - best) < 0.05 ? 'best' : '' },
            Math.abs(res.total - best) < 0.05 ? '최적' : fmtGap(res.total - best)))),
      h('div.board-end', tyreIcon(plan.stints[plan.stints.length - 1].compound, 50)));
  });

  // 범례는 레퍼런스처럼 "이 경기에 지정된 세트" 전체를 보여준다 — 쓰이지 않은 컴파운드도 포함
  const used = new Set(plans.flatMap((p) => p.stints.map((s) => s.compound)));
  const wet = used.has('INTER') || used.has('WET');
  const order = wet ? ['HARD', 'MEDIUM', 'SOFT', 'INTER', 'WET'].filter((c) => used.has(c) || c === 'INTER')
                    : ['HARD', 'MEDIUM', 'SOFT'];
  const legend = h('div.board-legend',
    h('div.board-legend-tyres', order.map((c) => tyreIcon(c, 96))),
    h('div.board-legend-text',
      order.map((c) => h('div', { class: `board-legend-line c-${c}` },
        `${COLOR_WORD[c]} ${EN[c]}`,
        circuit.pirelli && circuit.pirelli[c] ? h('b', ` ${circuit.pirelli[c]}`) : null,
        h('small', ` ${COMPOUND_KO[c]}`)))));

  mount(root,
    h('div.board',
      h('div.board-head',
        h('div.board-mark', h('i'), h('i'), h('i')),
        h('div.board-head-text',
          h('div.board-event', `FORMULA 1 · ${circuit.name} · 2026`),
          h('div.board-title',
            h('span.outline', circuit.track),
            h('span.strong', 'POSSIBLE RACE STRATEGIES')),
          h('div.board-sub', '(PIT WINDOWS) · 예상 레이스 전략 · 피트 윈도우'))),
      h('div.board-rows', { role: 'radiogroup', 'aria-label': '추천 전략' }, rows),
      h('div.board-note', 'DIFFERENT PERMUTATIONS OF COMPOUND USAGE WITHIN ANY OF THESE PLANS ARE POSSIBLE'),
      legend,
      h('div.board-foot', `${totalLaps} LAPS · 윈도우는 최적 대비 1.5초 이내인 피트 랩 범위 · 각 전략 안에서 컴파운드 순서는 바뀔 수 있습니다`)));
}
