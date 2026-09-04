// 공통 셸 — 헤더·푸터 주입, 발표 모드. 4개 페이지가 공유한다.
import { h } from './ui/dom.js';

const NAV = [
  ['index.html', '홈'],
  ['sim.html', '시뮬레이터'],
  ['research.html', '연구'],
  ['team.html', '팀'],
];

function currentPage() {
  const f = location.pathname.split('/').pop() || 'index.html';
  return f === '' ? 'index.html' : f;
}

/** 로고 마크 — 3스틴트 추상 (기획서 7-4 시그니처 요소) */
export function brandMark() {
  return h('span.brand-mark', { 'aria-hidden': 'true' },
    h('i', { style: { background: 'var(--soft)', flex: '13' } }),
    h('i', { style: { background: 'var(--medium)', flex: '22' } }),
    h('i', { style: { background: 'var(--hard)', flex: '17' } }));
}

/* ---------- 발표 모드 ---------- */
const KEY = 'compound.present';

export function isPresent() {
  const q = new URLSearchParams(location.search);
  if (q.has('present')) return q.get('present') !== '0';
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setPresent(on) {
  document.documentElement.toggleAttribute('data-present', on);
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ }
  document.querySelectorAll('.present-toggle').forEach((b) => {
    b.setAttribute('aria-pressed', String(on));
    b.querySelector('span').textContent = on ? '발표 모드 켜짐' : '발표 모드';
  });
}

export function mountShell() {
  const page = currentPage();
  const on = isPresent();
  document.documentElement.toggleAttribute('data-present', on);

  const header = h('header.topbar',
    h('a.brand', { href: 'index.html', 'aria-label': 'COMPOUND 홈' },
      brandMark(), h('span.brand-name', 'COMPOUND')),
    h('nav.nav', { 'aria-label': '주 메뉴' },
      NAV.map(([href, label]) =>
        h('a', { href, 'aria-current': page === href ? 'page' : null }, label))),
    h('button.present-toggle', {
      type: 'button', 'aria-pressed': String(on),
      title: '빔프로젝터용 고대비·큰 글씨',
      onclick: () => setPresent(!document.documentElement.hasAttribute('data-present')),
    }, '◐ ', h('span', on ? '발표 모드 켜짐' : '발표 모드')));

  const footer = h('footer.foot',
    h('p', '이 시뮬레이터는 공개 데이터로 만든 근사 모델입니다. 결과는 예측이며 실제 레이스 결과가 아닙니다.'),
    h('p', 'Formula 1, F1 및 관련 상표는 Formula One Licensing BV의 자산이며, 본 사이트는 상표권자와 무관한 비영리 학생 프로젝트입니다.'),
    h('p', '15팀 컴파운드 · 2026 런포런 · ', h('a', { href: 'https://github.com/juhyeonmoon10/apex-strategy' }, '소스 코드')));

  const shell = document.querySelector('.shell') || document.body;
  shell.prepend(header);
  shell.append(footer);
}
