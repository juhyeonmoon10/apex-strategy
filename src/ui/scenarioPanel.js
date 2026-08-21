import { h, mount, $ } from './dom.js';
import { CIRCUITS } from '../data/circuits.js';
import { TEAMS, driversOf } from '../data/teams.js';
import { state, set, scenarioOf } from '../store.js';
import { confidence } from '../engine/explain.js';

const SURFACES = [
  ['dry', '건조'],
  ['rain', '비'],
  ['heavy', '폭우'],
];
const TRAFFIC = [
  ['clean', '없음'],
  ['light', '적음'],
  ['medium', '보통'],
  ['heavy', '많음'],
];

export function renderPanel(root, { onRun, running }) {
  const sc = scenarioOf();
  const { circuit } = sc;
  const drivers = driversOf(state.teamId);

  const stack = h('div.stack',
    // 01 시나리오
    h('section.card',
      h('div.panel-title', h('span.idx', '01'), '시나리오'),
      field('서킷',
        select(CIRCUITS.map((c) => [c.id, c.name]), state.circuitId, (v) => set({ circuitId: v }, 'scenario'))),
      h('div.circuit-meta',
        meta(circuit.laps, '랩'),
        meta(circuit.lengthKm.toFixed(3), 'KM'),
        meta(circuit.pitLoss.toFixed(1), '초 피트 손실'),
        meta(circuit.degMultiplier.toFixed(2), '마모 계수')),
      h('div', { style: { marginTop: 'var(--s-4)' } },
        field('팀',
          select(TEAMS.map((t) => [t.id, t.name]), state.teamId, (v) => {
            const first = driversOf(v)[0];
            set({ teamId: v, driverId: first.id }, 'scenario');
          })),
        field('드라이버',
          select(drivers.map((d) => [d.id, `${d.name} (#${d.num})`]), state.driverId,
            (v) => set({ driverId: v }, 'scenario')))),
    ),

    // 02 주행 조건
    h('section.card',
      h('div.panel-title', h('span.idx', '02'), '주행 조건'),
      h('div.field',
        h('label', { for: 'surface-seg' }, '노면 상태'),
        h('div.seg#surface-seg', { role: 'group', 'aria-label': '노면 상태' },
          SURFACES.map(([v, ko]) =>
            h('button', {
              type: 'button',
              'aria-pressed': state.surface === v,
              onclick: () => set({ surface: v }, 'scenario'),
            }, ko)))),
      slider('노면 온도', 'trackTemp', 10, 60, '°C'),
      slider('기온', 'airTemp', 0, 45, '°C'),
      slider('습도', 'humidity', 10, 100, '%'),
    ),

    // 03 레이스 상황
    h('section.card',
      h('div.panel-title', h('span.idx', '03'), '레이스 상황'),
      field('스타팅 그리드',
        h('input', {
          type: 'number', min: 1, max: 22, value: state.grid,
          'aria-label': '스타팅 그리드 순위',
          oninput: (e) => set({ grid: Math.max(1, Math.min(22, Number(e.target.value) || 1)) }, 'scenario'),
        })),
      h('div.field',
        h('label', { for: 'traffic-seg' }, '예상 트래픽'),
        h('div.seg#traffic-seg', { role: 'group', 'aria-label': '예상 트래픽' },
          TRAFFIC.map(([v, ko]) =>
            h('button', {
              type: 'button',
              'aria-pressed': state.traffic === v,
              onclick: () => set({ traffic: v }, 'scenario'),
            }, ko)))),

      h('div', { style: { marginTop: 'var(--s-4)' } },
        h('button.btn-primary', {
          type: 'button', disabled: running,
          onclick: onRun,
        }, running ? '계산 중…' : '500회 몬테카를로 실행')),

      confidenceBlock(sc),
    ),
  );

  mount(root, stack);
}

function confidenceBlock(sc) {
  const { score, band, reasons } = confidence(sc, !!state.mc);
  return h('div.conf',
    h('div.conf-head',
      h('span', { style: { fontSize: '12px', color: 'var(--fg-secondary)' } }, '모델 신뢰도'),
      h('b.num', `${score}%`)),
    h('div.conf-bar', h('i', { style: { width: `${score}%` } })),
    h('div', { style: { fontSize: '11px', color: 'var(--fg-tertiary)', marginBottom: 'var(--s-2)' } }, band),
    h('ul', reasons.map((r) =>
      h('li',
        h('em', r.delta === 0 ? '·' : (r.delta > 0 ? `+${r.delta}` : `${r.delta}`)),
        h('span', r.text)))),
  );
}

function meta(value, label) {
  return h('div', h('b.num', String(value)), h('span', label));
}

function field(label, control) {
  const id = `f-${label.replace(/\s/g, '')}-${Math.random().toString(36).slice(2, 7)}`;
  control.id = id;
  return h('div.field', h('label', { for: id }, label), control);
}

function select(options, value, onchange) {
  return h('select', { onchange: (e) => onchange(e.target.value) },
    options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
}

function slider(label, key, min, max, unit) {
  const id = `s-${key}`;
  return h('div.field',
    h('div.slider-row',
      h('label', { for: id }, label),
      h('span.val.num', `${state[key]}${unit}`)),
    h('input', {
      id, type: 'range', min, max, value: state[key],
      'aria-label': `${label} (${min}${unit} ~ ${max}${unit})`,
      oninput: (e) => {
        const v = Number(e.target.value);
        e.target.closest('.field').querySelector('.val').textContent = `${v}${unit}`;
        set({ [key]: v }, 'scenario');
      },
    }));
}
