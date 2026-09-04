// 홈 — 히어로 트레이스 애니메이션 + 숫자 타일
import { mountShell } from '../shell.js';
import { h, mount, countUp } from '../ui/dom.js';
import { applyTeamTheme, resolveAccent } from '../ui/theme.js';
import { renderRaceTrace } from '../ui/raceTrace.js';
import { circuitById } from '../data/circuits.js';
import { teamById, driverById } from '../data/teams.js';
import { searchStrategies } from '../engine/strategySearch.js';
import { simulate } from '../engine/simulate.js';
import { buildTrace } from '../engine/trace.js';
import { hashSeed } from '../engine/rng.js';

mountShell();

// 실버스톤·메르세데스 — 캘리브레이션된 서킷으로 첫인상
const scenario = {
  circuit: circuitById('britain'),
  team: teamById('mercedes'),
  driver: driverById('russell'),
  weather: { surface: 'dry', trackTemp: 32, airTemp: 22, humidity: 55 },
  grid: 2, traffic: 'light',
};
applyTeamTheme(scenario.team);

const seed = hashSeed('home');
const green = new Array(scenario.circuit.laps).fill('green');
const plans = searchStrategies(scenario, seed);
const results = plans.map((p) => simulate(scenario, p, seed, green));
const trace = buildTrace(plans.map((p, i) => ({ plan: p, result: results[i] })));

// 트레이스를 임시 컨테이너에 그린 뒤 svg 와 범례만 가져온다
const tmp = document.createElement('div');
renderRaceTrace(tmp, { trace, mineColor: resolveAccent(scenario.team.colors.team, 'data'), onScrub: () => {} });
const svg = tmp.querySelector('svg');
const legend = tmp.querySelector('.chart-legend');
const host = document.getElementById('heroTrace');
mount(host, h('div.chart-wrap', svg), legend);

// 선이 왼쪽부터 그려지는 애니메이션 (기획서 9절: 3초, 1회)
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
svg.querySelectorAll('path[stroke]').forEach((p, i) => {
  const len = p.getTotalLength();
  if (reduce) return;
  p.style.strokeDasharray = String(len);
  p.style.strokeDashoffset = String(len);
  p.style.transition = `stroke-dashoffset 3s cubic-bezier(0.4, 0, 0.2, 1) ${i * 120}ms`;
  requestAnimationFrame(() => requestAnimationFrame(() => { p.style.strokeDashoffset = '0'; }));
});

// 숫자 타일 카운트업
document.querySelectorAll('.tile .v[data-to]').forEach((el) => {
  const to = Number(el.dataset.to);
  const dec = Number(el.dataset.dec || 0);
  const suffix = el.dataset.suffix || '';
  el.textContent = '0';
  el.dataset.val = '0';
  const io = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    countUp(el, to, (v) => v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suffix, 800);
  });
  io.observe(el);
});
