// 전략 보드 — 피렐리 "Possible Race Strategies" 그래픽의 레이아웃 언어.
//   가로 막대 · 피트 지점의 타이어 아이콘 · 랩 윈도우 라벨 · 오른쪽 전략명 · 하단 범례
// 로고·브랜딩은 쓰지 않는다. 윈도우 숫자는 engine/pitWindow.js 가 실제로 계산한다.

import { h, mount } from './dom.js';
import { tyreIcon } from './tyreIcon.js';
import { COMPOUND_KO } from '../engine/params.js';
import { fmtRaceTime, fmtGap } from '../engine/simulate.js';

const EN = { SOFT: 'SOFT', MEDIUM: 'MEDIUM', HARD: 'HARD', INTER: 'INTER', WET: 'WET' };
const TONE = { fastest: 'THE QUICKEST', safe: 'ALTERNATIVE', aggressive: 'AGGRESSIVE' };
const STOPPER = ['', 'ONE-STOPPER', 'TWO-STOPPER', 'THREE-STOPPER', 'FOUR-STOPPER'];

/**
 * @param {object} ctx
 *   plans, results, windows (plan idx -> pitWindows[]), selected, totalLaps,
 *   circuit, onSelect(i)
 */
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

    // 막대
    const bar = h('div.board-bar', { 'aria-hidden': 'true' });
    let acc = 0;
    const junctions = [];
    plan.stints.forEach((st, si) => {
      const from = acc;
      acc += st.laps;
      bar.append(h(`div.board-seg.c-${st.compound}`, {
        style: { flex: `${st.laps} 1 0` },
      }, st.laps / totalLaps > 0.12 ? h('span.board-seg-label', EN[st.compound] || st.compound) : null));
      if (si < plan.stints.length - 1) junctions.push({ lap: acc, next: plan.stints[si + 1].compound });
    });

    // 오버레이: 시작 타이어, 피트 지점 타이어, 윈도우 라벨
    const overlay = h('div.board-overlay');
    overlay.append(h('div.board-tyre.start', tyreIcon(plan.stints[0].compound, 46)));
    junctions.forEach((j, k) => {
      const pct = (j.lap / totalLaps) * 100;
      overlay.append(h('div.board-tyre', { style: { left: `${pct}%` } }, tyreIcon(j.next, 46)));
      const w = win[k];
      if (w) {
        const c = ((w.from + w.to) / 2 / totalLaps) * 100;
        overlay.append(h('div.board-window', { style: { left: `${c}%` } },
          h('span', 'LAP '), h('b', String(w.from)), h('span', ' TO '), h('b', String(w.to))));
      }
    });
    overlay.append(h('div.board-tyre.finish', h('span.board-flag', '🏁')));

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
        h('div.board-ko', plan.label),
        res && !res.invalid && h('div.board-time',
          h('b.num', fmtRaceTime(res.total)),
          h('span.num', { class: Math.abs(res.total - best) < 0.05 ? 'best' : '' },
            Math.abs(res.total - best) < 0.05 ? '최적' : fmtGap(res.total - best)))));
  });

  // 범례
  const used = [...new Set(plans.flatMap((p) => p.stints.map((s) => s.compound)))];
  const order = ['HARD', 'MEDIUM', 'SOFT', 'INTER', 'WET'].filter((c) => used.includes(c));
  const legend = h('div.board-legend',
    order.map((c) => h('div.board-legend-item',
      tyreIcon(c, 72),
      h('div',
        h('div.board-legend-en', `${legendColor(c)} ${EN[c]}`),
        h('div.board-legend-ko', COMPOUND_KO[c],
          circuit.pirelli && circuit.pirelli[c] ? h('b', ` ${circuit.pirelli[c]}`) : null)))));

  mount(root,
    h('div.board',
      h('div.board-head',
        h('div.board-head-l',
          h('span.board-kicker', circuit.track),
          h('span.board-title', '예상 레이스 전략'),
          h('span.board-sub', '(피트 윈도우)')),
        h('div.board-head-r', `${totalLaps} LAPS`)),
      h('div.board-rows', { role: 'radiogroup', 'aria-label': '추천 전략' }, rows),
      h('div.board-note', '각 전략 안에서 컴파운드 순서는 바뀔 수 있습니다. 윈도우는 최적 대비 1.5초 이내인 피트 랩 범위입니다.'),
      legend));
}

function legendColor(c) {
  return { HARD: 'WHITE', MEDIUM: 'YELLOW', SOFT: 'RED', INTER: 'GREEN', WET: 'BLUE' }[c] || '';
}
