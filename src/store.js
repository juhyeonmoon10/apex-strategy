// 단일 상태 저장소 + URL 직렬화. 프레임워크 없이 구독/통지만.
import { circuitById, CIRCUITS } from './data/circuits.js';
import { teamById, driversOf, driverById } from './data/teams.js';
import { hashSeed } from './engine/rng.js';

const listeners = new Set();

export const state = {
  circuitId: 'britain',
  teamId: 'mercedes',
  driverId: 'russell',
  surface: 'dry',
  trackTemp: 32,
  airTemp: 22,
  humidity: 55,
  grid: 2,
  traffic: 'light',
  seed: 20260821,
  selected: 0,
  plans: [],
  myPlan: null,
  results: [],
  myResult: null,
  mc: null,
};

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify(reason) { listeners.forEach((fn) => fn(reason)); }

export function set(patch, reason = 'set') {
  Object.assign(state, patch);
  notify(reason);
}

/** 엔진에 넘길 시나리오 객체 */
export function scenarioOf() {
  const circuit = circuitById(state.circuitId);
  const team = teamById(state.teamId);
  const driver = driverById(state.driverId);
  return {
    circuit, team, driver,
    weather: {
      surface: state.surface,
      trackTemp: state.trackTemp,
      airTemp: state.airTemp,
      humidity: state.humidity,
    },
    grid: state.grid,
    traffic: state.traffic,
  };
}

/** 시나리오가 바뀌면 시드도 결정론적으로 따라간다 (같은 조건 = 같은 추천) */
export function scenarioSeed() {
  return hashSeed(
    [state.circuitId, state.teamId, state.driverId, state.surface,
     state.trackTemp, state.grid, state.traffic].join('|')
  );
}

/* ---------- URL 직렬화 ---------- */

const KEYS = ['circuitId', 'teamId', 'driverId', 'surface', 'trackTemp', 'airTemp', 'humidity', 'grid', 'traffic'];

export function toQuery() {
  const p = new URLSearchParams();
  KEYS.forEach((k) => p.set(k, String(state[k])));
  if (state.myPlan) {
    p.set('plan', state.myPlan.stints.map((s) => `${s.compound[0]}${s.laps}`).join('.'));
  }
  return p.toString();
}

export function syncUrl() {
  const q = toQuery();
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

const LETTER = { S: 'SOFT', M: 'MEDIUM', H: 'HARD', I: 'INTER', W: 'WET' };

export function fromQuery() {
  const p = new URLSearchParams(location.search);
  if (![...p.keys()].length) return;

  KEYS.forEach((k) => {
    if (!p.has(k)) return;
    const v = p.get(k);
    state[k] = ['trackTemp', 'airTemp', 'humidity', 'grid'].includes(k) ? Number(v) : v;
  });

  if (!CIRCUITS.some((c) => c.id === state.circuitId)) state.circuitId = 'britain';
  const team = teamById(state.teamId);
  state.teamId = team.id;
  if (!driversOf(team.id).some((d) => d.id === state.driverId)) {
    state.driverId = driversOf(team.id)[0].id;
  }

  const plan = p.get('plan');
  if (plan) {
    try {
      const stints = plan.split('.').map((tok) => ({
        compound: LETTER[tok[0]],
        laps: Number(tok.slice(1)),
      }));
      if (stints.every((s) => s.compound && s.laps > 0)) {
        state.myPlan = { id: 'my', label: '내 전략', stints };
      }
    } catch { /* 잘못된 링크는 무시 */ }
  }
}
