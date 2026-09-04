// 공통 셸 — 헤더·푸터 주입. 3개 페이지가 공유한다.
import { h } from './ui/dom.js';

const NAV = [
  ['index.html', '홈'],
  ['sim.html', '시뮬레이터'],
  ['research.html', '연구'],
];

function currentPage() {
  const f = location.pathname.split('/').pop() || 'index.html';
  return f === '' ? 'index.html' : f;
}

/** 로고 마크 — 3스틴트 추상 */
export function brandMark() {
  return h('span.brand-mark', { 'aria-hidden': 'true' },
    h('i', { style: { background: 'var(--soft)', flex: '13' } }),
    h('i', { style: { background: 'var(--medium)', flex: '22' } }),
    h('i', { style: { background: 'var(--hard)', flex: '17' } }));
}

/* 고대비·큰 글씨 모드 — URL `?present=1` 로만 켠다. 화면에는 스위치를 두지 않는다. */
export function isPresent() {
  const q = new URLSearchParams(location.search);
  return q.has('present') && q.get('present') !== '0';
}

export function mountShell() {
  const page = currentPage();
  document.documentElement.toggleAttribute('data-present', isPresent());

  const header = h('header.topbar',
    h('a.brand', { href: 'index.html', 'aria-label': 'COMPOUND 홈' },
      brandMark(), h('span.brand-name', 'COMPOUND')),
    h('nav.nav', { 'aria-label': '주 메뉴' },
      NAV.map(([href, label]) =>
        h('a', { href, 'aria-current': page === href ? 'page' : null }, label))));

  const footer = h('footer.foot',
    h('p', '이 시뮬레이터는 공개 데이터로 만든 근사 모델입니다. 결과는 예측이며 실제 레이스 결과가 아닙니다.'),
    h('p', 'Formula 1, F1 및 관련 상표는 Formula One Licensing BV의 자산이며, 본 사이트는 상표권자와 무관한 비영리 프로젝트입니다.'),
    h('p', h('a', { href: 'https://github.com/juhyeonmoon10/apex-strategy' }, '소스 코드')));

  const shell = document.querySelector('.shell') || document.body;
  shell.prepend(header);
  shell.append(footer);
}
