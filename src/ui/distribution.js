import { h, mount } from './dom.js';
import { explainMonteCarlo } from '../engine/explain.js';

export function renderDistribution(root, { mc, plans }) {
  if (!mc) {
    mount(root, h('p.empty',
      '아직 단일 시나리오만 계산했습니다. 좌측의 "500회 몬테카를로 실행"을 누르면 세이프티카 변동을 포함한 승률 분포가 나옵니다.'));
    return;
  }

  // 절대 완주 시간이 아니라 "회차별 1위 대비 갭" 을 그린다.
  // 절대 시간은 세이프티카 발생 여부가 분산을 지배해서 전략 비교에 쓸 수 없다.
  const hi = Math.max(...mc.perPlan.map((p) => p.gapP90), 1);
  const pos = (t) => Math.min(100, (t / hi) * 100);

  const lines = explainMonteCarlo(mc, plans);

  mount(root,
    h('div.dist-rows',
      mc.perPlan.map((p) =>
        h('div.dist-row',
          h('span.name', p.label),
          h('div.bar', {
            role: 'img',
            'aria-label':
              `${p.label}: 1위 대비 갭 P10 ${p.gapP10.toFixed(1)}초, 중앙값 ${p.gapP50.toFixed(1)}초, P90 ${p.gapP90.toFixed(1)}초. 승률 ${Math.round(p.winRate * 100)}퍼센트.`,
          },
            h('div.box', {
              style: {
                left: `${pos(p.gapP10)}%`,
                width: `${Math.max(1.5, pos(p.gapP90) - pos(p.gapP10))}%`,
              },
            }),
            h('div.p50', { style: { left: `${pos(p.gapP50)}%` } })),
          h('span.val', `${Math.round(p.winRate * 100)}%`)))),

    h('div', {
      style: {
        display: 'flex', justifyContent: 'space-between', fontSize: '10px',
        color: 'var(--fg-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 'var(--s-2)',
      },
    },
      h('span', '1위와 동률'),
      h('span', { style: { fontFamily: 'var(--font-ui)' } }, '회차별 1위 대비 갭 (P10 – P90, 세로선 = 중앙값) · 우측 = 승률'),
      h('span', `+${hi.toFixed(0)}초`)),

    h('table.laps', { style: { marginTop: 'var(--s-5)' } },
      h('caption', { class: 'sr-only' }, '전략별 몬테카를로 요약'),
      h('thead', h('tr',
        h('th', { style: { textAlign: 'left' } }, '전략'),
        h('th', '승률'),
        h('th', '중앙 갭'),
        h('th', '최악 갭'),
        h('th', 'SC 시 승률'),
        h('th', '클린 시 승률'))),
      h('tbody', mc.perPlan.map((p) =>
        h('tr',
          h('td', { style: { textAlign: 'left', color: 'var(--fg-secondary)' } }, p.label),
          h('td', { class: 'num' }, `${Math.round(p.winRate * 100)}%`),
          h('td', { class: 'num' }, `+${p.gapP50.toFixed(1)}초`),
          h('td', { class: 'num' }, `+${p.gapWorst.toFixed(1)}초`),
          h('td', { class: 'num' }, `${Math.round(p.scWinRate * 100)}%`),
          h('td', { class: 'num' }, `${Math.round(p.cleanWinRate * 100)}%`))))),

    h('div.mc-summary', { style: { marginTop: 'var(--s-5)' } },
      lines.map((t) => h('p', t))),
  );
}
