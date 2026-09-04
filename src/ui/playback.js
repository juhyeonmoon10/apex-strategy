// 재생 컨트롤러. 랩을 시간축으로 삼아 트레이스 플레이헤드를 움직인다.
//
// 재생 중에는 앱 전체를 재렌더하지 않는다 — 등록된 구독자에게 랩 번호만 던진다.
// 전체 재렌더를 걸면 52랩 × 5배속에서 화면이 버벅인다.

import { h, mount } from './dom.js';

const SPEEDS = [1, 2, 5, 10];

export function createPlayback() {
  const subs = new Set();
  let lap = null;
  let totalLaps = 0;
  let playing = false;
  let speed = 1;
  let raf = 0;
  let lastT = 0;
  let acc = 0;
  let onStateChange = () => {};

  const emit = () => subs.forEach((fn) => fn(lap));

  function tick(t) {
    if (!playing) return;
    if (!lastT) lastT = t;
    // 탭이 백그라운드였다 돌아오면 rAF 델타가 수 초씩 튄다. 한 프레임 250ms 로 상한.
    acc += Math.min(0.25, (t - lastT) / 1000);
    lastT = t;

    // 랩을 소수로 진행시킨다 — 트랙 위 차가 부드럽게 움직이도록. 구독자는 필요하면 내림한다.
    const lapsPerSec = 1.6 * speed; // 52랩 ≈ 32초 @1배속
    lap = Math.min(totalLaps, (lap ?? 0) + acc * lapsPerSec);
    acc = 0;
    emit();
    if (lap >= totalLaps) { stop(); return; }
    raf = requestAnimationFrame(tick);
  }

  function play() {
    if (playing || !totalLaps) return;
    if (lap == null || lap >= totalLaps) lap = 0;
    playing = true;
    lastT = 0;
    acc = 0;
    raf = requestAnimationFrame(tick);
    onStateChange();
    emit();
  }

  function pause() {
    playing = false;
    cancelAnimationFrame(raf);
    onStateChange();
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    onStateChange();
  }

  function reset() {
    stop();
    lap = null;
    emit();
    onStateChange();
  }

  function seek(n) {
    if (!totalLaps) return;
    pause();
    lap = Math.max(0, Math.min(totalLaps, Math.round(n)));
    emit();
  }

  return {
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    setTotal(n) {
      totalLaps = n;
      if (lap != null && lap > n) lap = n;
    },
    onStateChange(fn) { onStateChange = fn; },
    play, pause, stop, reset, seek,
    toggle() { playing ? pause() : play(); },
    setSpeed(v) { speed = v; onStateChange(); },
    get lap() { return lap; },
    get playing() { return playing; },
    get speed() { return speed; },
    get totalLaps() { return totalLaps; },
  };
}

/** 재생 버튼 · 속도 · 랩 슬라이더 */
export function renderTransport(root, pb) {
  const lap = Math.floor(pb.lap ?? 0);

  const slider = h('input.tp-range', {
    type: 'range', min: 0, max: Math.max(1, pb.totalLaps), value: lap, step: 1,
    'aria-label': `레이스 진행 랩 (0 ~ ${pb.totalLaps})`,
    oninput: (e) => pb.seek(Number(e.target.value)),
  });

  mount(root,
    h('div.transport',
      h('button.tp-play', {
        type: 'button',
        'aria-label': pb.playing ? '일시정지' : '재생',
        onclick: () => pb.toggle(),
      }, pb.playing ? '❚❚' : '▶'),
      h('button.btn-ghost', { type: 'button', onclick: () => pb.reset() }, '처음으로'),
      slider,
      h('span.tp-lap.num', pb.lap == null ? '전체' : `L${lap}`),
      h('div.tp-speeds', { role: 'group', 'aria-label': '재생 속도' },
        SPEEDS.map((v) =>
          h('button', {
            type: 'button',
            'aria-pressed': String(pb.speed === v),
            onclick: () => pb.setSpeed(v),
          }, `${v}×`)))),
  );

  // 재생 중 슬라이더만 따라 움직이게 (전체 재렌더 없이)
  return {
    sync(n) {
      slider.value = String(n ?? 0);
      const label = root.querySelector('.tp-lap');
      if (label) label.textContent = n == null ? '전체' : `L${n}`;
    },
  };
}
