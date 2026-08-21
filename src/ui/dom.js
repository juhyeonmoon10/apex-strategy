// 작은 DOM 헬퍼. 프레임워크 대신 이거 하나로 충분하다.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * h('div.card', {onclick}, child, child)
 * 태그 문자열에 .class 와 #id 를 붙여 쓸 수 있다.
 */
export function h(tag, props = null, ...children) {
  // 두 번째 인자가 props 객체가 아니면(노드/문자열/배열) 첫 자식으로 취급한다.
  // 이걸 구분하지 않으면 h('div', h('span'), '텍스트') 에서 span 이 조용히 사라진다.
  if (props != null && (props instanceof Node || Array.isArray(props) || typeof props !== 'object')) {
    children.unshift(props);
    props = null;
  }

  const [name, ...rest] = tag.split(/(?=[.#])/);
  const el = document.createElement(name || 'div');
  rest.forEach((token) => {
    if (token[0] === '.') el.classList.add(token.slice(1));
    else if (token[0] === '#') el.id = token.slice(1);
  });
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className += ` ${v}`;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

/** 숫자 카운트업. reduced-motion 이면 즉시 반영 */
export function countUp(el, to, fmt, ms = 200) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = Number(el.dataset.val || to);
  el.dataset.val = String(to);
  if (reduce || Math.abs(to - from) < 0.01) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - (1 - k) * (1 - k);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
