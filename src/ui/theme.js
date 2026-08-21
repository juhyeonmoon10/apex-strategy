// 기획서 7.1 — 색 역할 분리 + 자동 충돌 가드.
//
// 정체성 영역(헤더, 버튼, 포커스): 팀 컬러를 절대 건드리지 않는다. 페라리는 페라리 빨강이어야 한다.
// 데이터 영역(차트 선, 승률 막대): 컴파운드와 ΔE < 25 면 채도를 낮춘다.

import { COMPOUND_COLOR } from '../engine/params.js';

const COMPOUND_LIST = Object.values(COMPOUND_COLOR);

export function hexToRgb(hex) {
  const v = hex.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((c) => c + c).join('') : v, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const rgbToHex = ({ r, g, b }) =>
  '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');

/** sRGB → CIE Lab (D65) */
function toLab(hex) {
  let { r, g, b } = hexToRgb(hex);
  [r, g, b] = [r, g, b].map((c) => {
    c /= 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  });
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIE76 색차 */
export function deltaE(hex1, hex2) {
  const c1 = toLab(hex1);
  const c2 = toLab(hex2);
  return Math.sqrt((c1.L - c2.L) ** 2 + (c1.a - c2.a) ** 2 + (c1.b - c2.b) ** 2);
}

export function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [r, g, b].map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function desaturate(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const gray = 0.299 * r + 0.587 * g + 0.114 * b;
  return rgbToHex({
    r: r + (gray - r) * amount,
    g: g + (gray - g) * amount,
    b: b + (gray - b) * amount,
  });
}

/**
 * @param {string} teamColor
 * @param {'identity'|'data'} context
 */
export function resolveAccent(teamColor, context) {
  if (context === 'identity') return teamColor;
  const nearest = Math.min(...COMPOUND_LIST.map((c) => deltaE(teamColor, c)));
  return nearest < 25 ? desaturate(teamColor, 0.45) : teamColor;
}

/**
 * 팀 컬러 위에 올릴 텍스트 색 (하드코딩 금지).
 *
 * 임계값 0.179 는 눈대중이 아니라 WCAG 대비식의 교차점이다.
 *   검정 대비 = (L + 0.05) / 0.05
 *   흰색 대비 = 1.05 / (L + 0.05)
 *   두 값이 같아지는 지점: (L + 0.05)² = 0.0525  →  L ≈ 0.179
 * 이보다 높으면 검정이, 낮으면 흰색이 항상 더 잘 읽힌다.
 */
const CONTRAST_CROSSOVER = 0.179;

export function onColor(hex) {
  return relativeLuminance(hex) > CONTRAST_CROSSOVER ? '#0A0B0D' : '#F2F4F7';
}

/** 두 색의 WCAG 대비비 (검증용) */
export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 텍스트를 얹는 면(버튼, 배지)용 팀 컬러.
 * 원색 그대로는 페라리·아우디·레드불이 본문 대비 4.5:1 에 미달한다.
 * 4.5:1 을 넘길 때까지 명도만 조금씩 옮긴다 — 색상(hue)은 건드리지 않으므로
 * 여전히 그 팀의 색으로 읽힌다. 브랜드 마크·히어로·차 아트는 원색을 그대로 쓴다.
 */
function ctaColor(hex) {
  const on = onColor(hex);
  const towardDark = on === '#F2F4F7';
  let cur = hex;
  for (let i = 0; i < 24 && contrastRatio(cur, on) < 4.5; i++) {
    const { r, g, b } = hexToRgb(cur);
    const k = towardDark ? 0.94 : 1.06;
    cur = rgbToHex({
      r: towardDark ? r * k : r + (255 - r) * (k - 1),
      g: towardDark ? g * k : g + (255 - g) * (k - 1),
      b: towardDark ? b * k : b + (255 - b) * (k - 1),
    });
  }
  return cur;
}

/** 팀 테마를 문서 루트에 주입 */
export function applyTeamTheme(team) {
  const root = document.documentElement;
  const c = team.colors;
  root.setAttribute('data-team', team.id);
  root.style.setProperty('--team', c.team);
  root.style.setProperty('--team-accent', c.accent);
  root.style.setProperty('--team-secondary', c.secondary);
  root.style.setProperty('--team-on', onColor(c.team));
  root.style.setProperty('--team-cta', ctaColor(c.team));
  root.style.setProperty('--team-data', resolveAccent(c.team, 'data'));
}

/** 컴파운드 색 위의 텍스트 클래스 */
export function textClassFor(compound) {
  return relativeLuminance(COMPOUND_COLOR[compound]) > 0.45 ? 'dark-text' : 'light-text';
}
