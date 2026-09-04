// ★ StintBuilder — 드래그 중에는 화면을 다시 그리지 않는다.
//
// 드래그 도중 매 프레임 상위에 알리면(onChange transient) 앱 전체가 재렌더되어
// 화면이 흔들리고, 핸들 DOM 이 교체되면서 포인터 캡처도 끊긴다.
// 그래서 드래그 중에는 이 컴포넌트 안에서만 DOM 을 제자리 갱신하고(preview),
// 손을 뗐을 때 한 번 onChange 를 부른다.

import { h, mount } from './dom.js';
import { textClassFor } from './theme.js';
import { COMPOUND_KO, COMPOUND_COLOR, SLICKS, RACE } from '../engine/params.js';
import { fmtRaceTime, fmtGap } from '../engine/simulate.js';

let popover = null;

export function renderBuilder(root, ctx) {
  const { plan, totalLaps, result, refTotal, validation, surface, onChange, onPreview, onUndo, onRedo, canUndo, canRedo } = ctx;

  if (!plan) {
    mount(root, h('p.empty', '추천 전략을 선택하면 여기서 직접 편집할 수 있습니다.'));
    return;
  }

  // 편집 중인 로컬 사본. 커밋 전까지 상위 상태와 분리
  let live = { ...plan, stints: plan.stints.map((s) => ({ ...s })) };

  const track = h('div.builder-track', { role: 'group', 'aria-label': '전략 편집 타임라인' });
  const segs = [];
  const handles = [];

  live.stints.forEach((s, i) => {
    const seg = h(`div.b-seg.c-${s.compound}`, {
      class: textClassFor(s.compound),
      style: { flex: `${s.laps} 1 0` },
      onclick: (e) => openCompoundPicker(e, i, live, surface, onChange),
    }, h('span.b-seg-name', s.laps / totalLaps > 0.11 ? s.compound : ''), h('span.lapcount', ` ${s.laps}`));
    segs.push(seg);
    track.append(seg);
  });
  for (let i = 0; i < live.stints.length - 1; i++) {
    const hd = makeHandle(i);
    handles.push(hd);
    track.append(hd);
  }

  const totalEl = h('span.t', result && !result.invalid ? fmtRaceTime(result.total) : '—');
  const deltaEl = h('span.d');
  const setDelta = (total) => {
    if (total == null || refTotal == null) { deltaEl.textContent = ''; return; }
    const d = total - refTotal;
    deltaEl.className = `d ${d <= 0 ? 'good' : 'bad'}`;
    deltaEl.textContent = `추천안보다 ${fmtGap(d)}`;
  };
  setDelta(result && !result.invalid ? result.total : null);

  const focusedIdx = document.activeElement?.classList?.contains('b-handle')
    ? Number(document.activeElement.dataset.idx) : null;

  mount(root,
    h('div.builder',
      track,
      h('div.builder-axis', h('span', 'LAP 1'), h('span', `LAP ${Math.round(totalLaps / 2)}`), h('span', `LAP ${totalLaps}`)),
      h('div.builder-actions',
        h('button.btn-ghost', { type: 'button', onclick: () => addStint(live, onChange) }, '+ 스틴트'),
        h('button.btn-ghost', { type: 'button', disabled: live.stints.length <= 2, onclick: () => removeStint(live, onChange) }, '− 스틴트'),
        h('button.btn-ghost', { type: 'button', disabled: !canUndo, onclick: onUndo }, '되돌리기'),
        h('button.btn-ghost', { type: 'button', disabled: !canRedo, onclick: onRedo }, '다시'),
        h('div.spacer'),
        h('div.builder-total', totalEl, deltaEl)),
      validation.errors.map((e) => h('div.notice.err', e)),
      validation.warnings.map((w) => h('div.notice.warn', w)),
      validation.legal && !validation.errors.length &&
        h('div.notice.ok', '✓ FIA 규정 충족 — 서로 다른 슬릭 컴파운드 2종 이상, 모든 스틴트가 최소 랩 수를 만족합니다.'),
    ));

  if (focusedIdx != null) {
    (root.querySelector(`.b-handle[data-idx="${focusedIdx}"]`) || root.querySelector('.b-handle'))?.focus({ preventScroll: true });
  }

  /* ---- 제자리 갱신 (드래그 프리뷰) ---- */
  function refresh() {
    let acc = 0;
    live.stints.forEach((s, i) => {
      segs[i].style.flex = `${s.laps} 1 0`;
      segs[i].querySelector('.lapcount').textContent = ` ${s.laps}`;
      segs[i].querySelector('.b-seg-name').textContent = s.laps / totalLaps > 0.11 ? s.compound : '';
      acc += s.laps;
      if (i < handles.length) {
        handles[i].style.left = `${(acc / totalLaps) * 100}%`;
        handles[i].querySelector('.tip').textContent = `L${acc}`;
        handles[i].setAttribute('aria-valuenow', String(acc));
        handles[i].setAttribute('aria-valuetext', `${acc}랩`);
      }
    });
    if (onPreview) {
      const r = onPreview(live);
      totalEl.textContent = r && !r.invalid ? fmtRaceTime(r.total) : '—';
      setDelta(r && !r.invalid ? r.total : null);
    }
  }

  function cum(i) { return live.stints.slice(0, i + 1).reduce((a, s) => a + s.laps, 0); }
  function minFor(i) { return i === 0 ? RACE.minStintLaps : cum(i - 1) + RACE.minStintLaps; }
  function maxFor(i) { return cum(i + 1) - RACE.minStintLaps; }
  function clampPit(i, lap) { return Math.max(minFor(i), Math.min(maxFor(i), lap)); }
  function setPitLocal(i, lap) {
    const target = clampPit(i, lap);
    const prevEnd = i === 0 ? 0 : cum(i - 1);
    const nextEnd = cum(i + 1);
    live.stints[i].laps = target - prevEnd;
    live.stints[i + 1].laps = nextEnd - target;
  }
  function commit() {
    onChange({ ...live, stints: live.stints.map((s) => ({ ...s })) }, { transient: false });
  }

  function makeHandle(i) {
    const lap = cum(i);
    const handle = h('button.b-handle', {
      type: 'button', role: 'slider', tabindex: '0', 'data-idx': String(i),
      style: { left: `${(lap / totalLaps) * 100}%` },
      'aria-label': `${i + 1}번 피트스톱 랩`,
      'aria-valuemin': String(minFor(i)), 'aria-valuemax': String(maxFor(i)),
      'aria-valuenow': String(lap), 'aria-valuetext': `${lap}랩`,
    }, h('span.tip.num', `L${lap}`));

    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 5 : 1;
      if (e.key === 'ArrowLeft') { e.preventDefault(); setPitLocal(i, cum(i) - step); refresh(); commit(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setPitLocal(i, cum(i) + step); refresh(); commit(); }
    });

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      let rect = track.getBoundingClientRect();
      const startLap = cum(i);
      const startX = e.clientX;
      try { handle.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트·구형 브라우저 */ }
      handle.classList.add('dragging');
      let pending = startLap;
      let moved = false;
      let lastPaint = 0;

      // 프리뷰는 동기적으로 갱신한다(시뮬레이션 1회 ≈ 1ms). rAF 에 걸면 탭이 가려졌을 때 멈춘다.
      const onMove = (ev) => {
        if (!(rect.width > 0)) rect = track.getBoundingClientRect();   // 접힘 직후 등 폭이 0 이면 다시 잰다
        const dLap = Math.round(((ev.clientX - startX) / rect.width) * totalLaps);
        if (!Number.isFinite(dLap)) return;                            // NaN 이 스틴트에 들어가면 안 된다
        const target = clampPit(i, startLap + dLap);
        if (target === pending) return;
        pending = target; moved = true;
        const now = performance.now();
        if (now - lastPaint < 16) return;                              // 60fps 상한
        lastPaint = now;
        setPitLocal(i, pending); refresh();
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        handle.classList.remove('dragging');
        setPitLocal(i, pending); refresh();                            // 스로틀에 걸려 못 그린 마지막 값 반영
        if (moved) commit();                                           // 손을 뗐을 때 딱 한 번 상위에 알린다
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
    return handle;
  }
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
  stints[Math.min(shortest, stints.length - 1)].laps += gone.laps;
  onChange({ ...plan, stints }, { transient: false });
}

function openCompoundPicker(e, index, plan, surface, onChange) {
  e.stopPropagation();
  closePicker();
  const pool = surface === 'dry' ? ['SOFT', 'MEDIUM', 'HARD']
    : surface === 'rain' ? ['INTER', 'SOFT', 'MEDIUM', 'HARD', 'WET'] : ['WET', 'INTER'];
  popover = h('div.popover', { role: 'menu', 'aria-label': '컴파운드 선택' },
    pool.map((c) => h('button', {
      type: 'button', role: 'menuitem',
      onclick: () => {
        const stints = plan.stints.map((s) => ({ ...s }));
        stints[index] = { ...stints[index], compound: c };
        closePicker();
        onChange({ ...plan, stints }, { transient: false });
      },
    }, h('span.dot', { style: { background: COMPOUND_COLOR[c] } }), COMPOUND_KO[c])));
  document.body.append(popover);
  const r = e.currentTarget.getBoundingClientRect();
  popover.style.position = 'absolute';
  popover.style.left = `${Math.min(r.left, innerWidth - popover.offsetWidth - 12)}px`;
  popover.style.top = `${r.bottom + scrollY + 6}px`;
  setTimeout(() => document.addEventListener('click', closePicker, { once: true }), 0);
}

function closePicker() { if (popover) { popover.remove(); popover = null; } }
