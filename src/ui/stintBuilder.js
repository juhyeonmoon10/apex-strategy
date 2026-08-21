// ★ StintBuilder — v2 의 핵심 UX. v1 에는 사용자가 개입할 지점이 아예 없었다.
// 피트 마커를 끌면 인접 두 스틴트가 동시에 변하고 총시간이 즉시 갱신된다.

import { h, mount } from './dom.js';
import { textClassFor } from './theme.js';
import { COMPOUND_KO, COMPOUND_COLOR, SLICKS, RACE } from '../engine/params.js';
import { fmtRaceTime, fmtGap } from '../engine/simulate.js';

let popover = null;

export function renderBuilder(root, ctx) {
  const { plan, totalLaps, result, refTotal, validation, surface, onChange, onUndo, onRedo, canUndo, canRedo } = ctx;

  if (!plan) {
    mount(root, h('p.empty', '추천 전략에서 "빌더로 복사"를 누르면 여기서 직접 편집할 수 있습니다.'));
    return;
  }

  const track = h('div.builder-track', { role: 'group', 'aria-label': '전략 편집 타임라인' });
  let acc = 0;
  const bounds = [];

  plan.stints.forEach((s, i) => {
    const from = acc + 1;
    acc += s.laps;
    bounds.push(acc);
    track.append(
      h(`div.b-seg.c-${s.compound}`, {
        class: textClassFor(s.compound),
        style: { flex: `${s.laps} 1 0` },
        title: `${from}–${acc}랩 · ${COMPOUND_KO[s.compound]} — 클릭하면 컴파운드 변경`,
        onclick: (e) => openCompoundPicker(e, i, plan, surface, onChange),
      },
        s.laps / totalLaps > 0.11 ? s.compound : '',
        h('span.lapcount', ` ${s.laps}`)),
    );
  });

  // 피트 핸들 (마지막 경계는 결승선이므로 제외)
  bounds.slice(0, -1).forEach((lap, i) => {
    track.append(makeHandle(lap, i, plan, totalLaps, onChange));
  });

  // 재렌더로 핸들이 교체되면 포커스가 body 로 날아간다.
  // 키보드만 쓰는 사용자는 화살표 한 번에 조작이 끊긴다 — 반드시 복원해야 한다.
  const focusedIdx = document.activeElement?.classList?.contains('b-handle')
    ? Number(document.activeElement.dataset.idx)
    : null;

  const delta = result && refTotal ? result.total - refTotal : null;

  mount(root,
    h('div.builder',
      track,
      h('div.builder-axis',
        h('span', 'LAP 1'),
        h('span', `LAP ${Math.round(totalLaps / 2)}`),
        h('span', `LAP ${totalLaps}`)),

      h('div.builder-actions',
        h('button.btn-ghost', { type: 'button', onclick: () => addStint(plan, onChange) }, '+ 스틴트'),
        h('button.btn-ghost', {
          type: 'button',
          disabled: plan.stints.length <= 2,
          onclick: () => removeStint(plan, onChange),
        }, '− 스틴트'),
        h('button.btn-ghost', { type: 'button', disabled: !canUndo, onclick: onUndo }, '되돌리기'),
        h('button.btn-ghost', { type: 'button', disabled: !canRedo, onclick: onRedo }, '다시'),
        h('div.spacer'),
        result && !result.invalid && h('div.builder-total',
          h('span.t', fmtRaceTime(result.total)),
          delta != null && h('span.d', { class: delta <= 0 ? 'good' : 'bad' },
            delta <= 0 ? `추천안보다 ${fmtGap(delta)}` : `추천안보다 ${fmtGap(delta)}`))),

      validation.errors.map((e) => h('div.notice.err', e)),
      validation.warnings.map((w) => h('div.notice.warn', w)),
      validation.legal && !validation.errors.length &&
        h('div.notice.ok', '✓ FIA 규정 충족 — 서로 다른 슬릭 컴파운드 2종 이상, 모든 스틴트가 최소 랩 수를 만족합니다.'),
    ));

  if (focusedIdx != null) {
    const next = root.querySelector(`.b-handle[data-idx="${focusedIdx}"]`)
      || root.querySelector('.b-handle');
    next?.focus({ preventScroll: true });
  }
}

function makeHandle(lap, i, plan, totalLaps, onChange) {
  const pct = (lap / totalLaps) * 100;
  const handle = h('button.b-handle', {
    type: 'button',
    role: 'slider',
    tabindex: '0',
    'data-idx': String(i),
    style: { left: `${pct}%` },
    'aria-label': `${i + 1}번 피트스톱 랩`,
    'aria-valuemin': String(minFor(plan, i)),
    'aria-valuemax': String(maxFor(plan, i)),
    'aria-valuenow': String(lap),
    'aria-valuetext': `${lap}랩`,
  }, h('span.tip.num', `L${lap}`));

  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); movePit(plan, i, -step, onChange); }
    if (e.key === 'ArrowRight') { e.preventDefault(); movePit(plan, i, step, onChange); }
  });

  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rail = handle.parentElement;
    const rect = rail.getBoundingClientRect();
    const startLap = lap;
    const startX = e.clientX;
    handle.setPointerCapture(e.pointerId);
    let raf = 0;
    let pending = startLap;

    const onMove = (ev) => {
      const dLap = Math.round(((ev.clientX - startX) / rect.width) * totalLaps);
      const target = clampPit(plan, i, startLap + dLap);
      if (target === pending) return;
      pending = target;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setPit(plan, i, pending, onChange, true);
      });
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      setPit(plan, i, pending, onChange, false); // 드래그 종료 시 히스토리에 커밋
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });

  return handle;
}

const cum = (plan, i) => plan.stints.slice(0, i + 1).reduce((a, s) => a + s.laps, 0);
const minFor = (plan, i) => (i === 0 ? RACE.minStintLaps : cum(plan, i - 1) + RACE.minStintLaps);
const maxFor = (plan, i) => cum(plan, i + 1) - RACE.minStintLaps;

function clampPit(plan, i, lap) {
  return Math.max(minFor(plan, i), Math.min(maxFor(plan, i), lap));
}

function setPit(plan, i, lap, onChange, transient) {
  const target = clampPit(plan, i, lap);
  const prevEnd = i === 0 ? 0 : cum(plan, i - 1);
  const nextEnd = cum(plan, i + 1);
  const stints = plan.stints.map((s) => ({ ...s }));
  stints[i].laps = target - prevEnd;
  stints[i + 1].laps = nextEnd - target;
  onChange({ ...plan, stints }, { transient });
}

function movePit(plan, i, delta, onChange) {
  setPit(plan, i, cum(plan, i) + delta, onChange, false);
}

function addStint(plan, onChange) {
  const stints = plan.stints.map((s) => ({ ...s }));
  let longest = 0;
  stints.forEach((s, i) => { if (s.laps > stints[longest].laps) longest = i; });
  if (stints[longest].laps < RACE.minStintLaps * 2) return;
  const half = Math.floor(stints[longest].laps / 2);
  const rest = stints[longest].laps - half;
  const cur = stints[longest].compound;
  const alt = SLICKS.find((c) => c !== cur) || cur;
  stints[longest].laps = half;
  stints.splice(longest + 1, 0, { compound: alt, laps: rest });
  onChange({ ...plan, stints }, { transient: false });
}

function removeStint(plan, onChange) {
  if (plan.stints.length <= 2) return;
  const stints = plan.stints.map((s) => ({ ...s }));
  let shortest = 0;
  stints.forEach((s, i) => { if (s.laps < stints[shortest].laps) shortest = i; });
  const [gone] = stints.splice(shortest, 1);
  const target = Math.min(shortest, stints.length - 1);
  stints[target].laps += gone.laps;
  onChange({ ...plan, stints }, { transient: false });
}

function openCompoundPicker(e, index, plan, surface, onChange) {
  e.stopPropagation();
  closePicker();
  const pool = surface === 'dry'
    ? ['SOFT', 'MEDIUM', 'HARD']
    : surface === 'rain'
      ? ['INTER', 'SOFT', 'MEDIUM', 'HARD', 'WET']
      : ['WET', 'INTER'];

  popover = h('div.popover', { role: 'menu', 'aria-label': '컴파운드 선택' },
    pool.map((c) =>
      h('button', {
        type: 'button', role: 'menuitem',
        onclick: () => {
          const stints = plan.stints.map((s) => ({ ...s }));
          stints[index] = { ...stints[index], compound: c };
          closePicker();
          onChange({ ...plan, stints }, { transient: false });
        },
      },
        h('span.dot', { style: { background: COMPOUND_COLOR[c] } }),
        COMPOUND_KO[c])));

  document.body.append(popover);
  const r = e.currentTarget.getBoundingClientRect();
  popover.style.left = `${Math.min(r.left, innerWidth - popover.offsetWidth - 12)}px`;
  popover.style.top = `${r.bottom + scrollY + 6}px`;
  popover.style.position = 'absolute';
  setTimeout(() => document.addEventListener('click', closePicker, { once: true }), 0);
}

function closePicker() {
  if (popover) { popover.remove(); popover = null; }
}
