// F-19 설명 패널 + F-20 용어 툴팁 바인딩
import { h, mount } from './dom.js';
import { GLOSSARY } from '../data/glossary.js';

const TERM_PATTERNS = [
  [/언더컷/g, 'undercut'],
  [/오버컷/g, 'overcut'],
  [/클리프/g, 'cliff'],
  [/크로스오버/g, 'crossover'],
  [/세이프티카/g, 'sc'],
  [/VSC/g, 'vsc'],
  [/피트 손실/g, 'pitloss'],
  [/스틴트/g, 'stint'],
  [/컴파운드/g, 'compound'],
  [/마모/g, 'degradation'],
  [/연료/g, 'fuel'],
  [/트랙 진화/g, 'trackevo'],
];

/** 문장에서 용어를 찾아 툴팁 마크업으로 감싼다. 용어당 첫 등장 1회만. */
function annotate(text) {
  const used = new Set();
  let out = escapeHtml(text);
  for (const [re, key] of TERM_PATTERNS) {
    if (used.has(key)) continue;
    let replaced = false;
    out = out.replace(re, (m) => {
      if (replaced) return m;
      replaced = true;
      used.add(key);
      return `<b data-term="${key}" tabindex="0" role="button" aria-describedby="term-pop">${m}</b>`;
    });
  }
  // 숫자+단위는 강조
  out = out.replace(/(\d+(?:\.\d+)?(?:초|랩|%|°C))/g, '<b>$1</b>');
  return out;
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export function renderExplain(root, items) {
  if (!items.length) {
    mount(root, h('p.empty', '전략을 선택하면 근거가 표시됩니다.'));
    return;
  }
  mount(root,
    h('div.explain',
      items.map((it) =>
        h('div.explain-item',
          h('span.tag', it.tag),
          h('p', { html: annotate(it.text) })))));
}

/* ---------- 용어 툴팁 ---------- */

let pop = null;

export function initGlossary() {
  const show = (el) => {
    const key = el.dataset.term;
    const g = GLOSSARY[key];
    if (!g) return;
    hide();
    pop = h('div.term-pop#term-pop', { role: 'tooltip' },
      h('h4', g.title),
      h('p', g.body));
    document.body.append(pop);
    const r = el.getBoundingClientRect();
    const w = pop.offsetWidth;
    pop.style.left = `${Math.max(10, Math.min(innerWidth - w - 10, r.left))}px`;
    const below = r.bottom + 8;
    pop.style.top = below + pop.offsetHeight > innerHeight
      ? `${r.top - pop.offsetHeight - 8}px`
      : `${below}px`;
  };
  const hide = () => { if (pop) { pop.remove(); pop = null; } };

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-term]');
    if (el) show(el);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('[data-term]')) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-term]');
    if (el) show(el); else hide();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, { passive: true });
}
