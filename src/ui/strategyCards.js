import { h, mount } from './dom.js';
import { textClassFor } from './theme.js';
import { COMPOUND_KO } from '../engine/params.js';
import { fmtRaceTime, fmtGap } from '../engine/simulate.js';

/** 스틴트 바 (읽기 전용) */
export function stintBar(stints, totalLaps) {
  return h('div.stint-bar', { 'aria-hidden': 'true' },
    stints.map((s) =>
      h(`div.stint-seg.c-${s.compound}`, {
        class: textClassFor(s.compound),
        style: { flex: `${s.laps} 1 0` },
        title: `${COMPOUND_KO[s.compound]} ${s.laps}랩`,
      }, s.laps / totalLaps > 0.13 ? `${s.compound} ${s.laps}` : `${s.laps}`)));
}

/** 스틴트를 텍스트로 (스크린리더 + 색맹 대응) */
export function stintText(stints) {
  let acc = 0;
  return stints.map((s) => {
    const from = acc + 1;
    acc += s.laps;
    return `${from}–${acc}랩 ${COMPOUND_KO[s.compound]}`;
  }).join(', ');
}

export function renderCards(root, { plans, results, selected, mc, totalLaps, onSelect, onCopy }) {
  if (!plans.length) {
    mount(root, h('p.empty', '이 조건에서 규정을 충족하는 전략을 찾지 못했습니다. 노면 상태나 서킷을 바꿔보세요.'));
    return;
  }

  const valid = results.filter((r) => r && !r.invalid);
  const bestTime = valid.length ? Math.min(...valid.map((r) => r.total)) : 0;

  mount(root,
    h('div.cards', { role: 'radiogroup', 'aria-label': '추천 전략' },
      plans.map((plan, i) => {
        const res = results[i];
        const stat = mc ? mc.perPlan[i] : null;
        const isBest = res && !res.invalid && Math.abs(res.total - bestTime) < 0.05;

        return h('div.strategy-card', {
          role: 'radio',
          tabindex: selected === i ? '0' : '-1',
          'aria-checked': selected === i,
          'aria-label': `${plan.label}, ${plan.stints.length - 1}스톱, ${stintText(plan.stints)}`,
          onclick: () => onSelect(i),
          onkeydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); }
            if (e.key === 'ArrowRight') onSelect((i + 1) % plans.length);
            if (e.key === 'ArrowLeft') onSelect((i - 1 + plans.length) % plans.length);
          },
        },
          h('div.sc-head',
            h('span.no', `0${i + 1}`),
            h('span.label', plan.label),
            h('span.risk', `위험도 ${plan.risk}`)),

          stintBar(plan.stints, totalLaps),
          h('span.sr-only', stintText(plan.stints)),

          res && !res.invalid && h('div.sc-time',
            h('span.total', fmtRaceTime(res.total)),
            h('span.gap', { class: isBest ? 'best' : '' },
              isBest ? '최적' : fmtGap(res.total - bestTime))),

          res && !res.invalid && h('div.sc-stats',
            row('스톱', `${res.stops}회`),
            row('피트 손실', `${res.pitTime.toFixed(1)}초`),
            row('마모 손실', `${res.degTime.toFixed(1)}초`),
            row('평균 랩', `${res.avgLap.toFixed(2)}초`)),

          stat && h('div.winrate',
            h('span', '승률'),
            h('span.track', h('i', { style: { width: `${stat.winRate * 100}%` } })),
            h('b', `${Math.round(stat.winRate * 100)}%`)),

          stat && h('div', { style: { fontSize: '11px', color: 'var(--fg-tertiary)' } },
            `P10 ${fmtGap(stat.p10 - stat.p50)} / P90 ${fmtGap(stat.p90 - stat.p50)}`),

          h('div.sc-foot',
            h('button.btn-ghost', {
              type: 'button',
              onclick: (e) => { e.stopPropagation(); onCopy(i); },
            }, '빌더로 복사')),
        );
      })));
}

function row(k, v) {
  return h('div', h('span', k), h('b', v));
}
