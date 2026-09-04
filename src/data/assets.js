// 공식 이미지 소스 (F1 미디어 CDN).
//
// URL 패턴은 v1 사이트가 이미 쓰고 있던 것을 그대로 계승했다.
// 경로에 d_(default) 파라미터가 들어 있어, 해당 파일이 없으면 CDN 이 공식 실루엣을 대신 준다
// → 깨진 이미지가 뜨지 않는다. 그래도 네트워크 자체가 실패할 수 있으므로
//   최종 폴백으로 carArt.js 의 SVG 아트를 쓴다 (garage.js 의 onerror).
//
// ⚠ 이 이미지들은 Formula One 의 자산이다. 비영리 팬 프로젝트 전제로 참조하며,
//   재배포하지 않고 원본 CDN 을 그대로 가리킨다. 자체 호스팅하려면
//   LOCAL_ASSETS 를 true 로 바꾸고 assets/ 폴더에 파일을 넣으면 된다.

const BASE = 'https://media.formula1.com/image/upload';
const VER = 'v1740000001';
const YEAR = '2026';

/** 로컬 파일로 전환하려면 true. assets/cars/{teamId}.webp 등을 읽는다. */
export const LOCAL_ASSETS = false;

/**
 * 타이어 이미지. assets/tyres/soft.png · medium.png · hard.png · inter.png · wet.png
 * 를 넣고 true 로 바꾸면 전략 보드가 SVG 대신 이 파일을 쓴다. 파일이 없으면 SVG 로 자동 복귀.
 */
export const TYRE_IMAGES = false;
export function tyreImage(compound) {
  return `assets/tyres/${String(compound).toLowerCase()}.png`;
}

/** F1 CDN 이 쓰는 팀 슬러그 */
export const TEAM_SLUG = {
  mercedes: 'mercedes',
  ferrari: 'ferrari',
  mclaren: 'mclaren',
  'red-bull-racing': 'redbullracing',
  'racing-bulls': 'racingbulls',
  'aston-martin': 'astonmartin',
  alpine: 'alpine',
  williams: 'williams',
  haas: 'haasf1team',
  audi: 'audi',
  cadillac: 'cadillac',
};

/** 드라이버 슬러그 = 이름3 + 성3 + 01 */
export const DRIVER_SLUG = {
  russell: 'georus01',
  antonelli: 'kimant01',
  leclerc: 'chalec01',
  hamilton: 'lewham01',
  norris: 'lannor01',
  piastri: 'oscpia01',
  verstappen: 'maxver01',
  hadjar: 'isahad01',
  lawson: 'lialaw01',
  lindblad: 'arvlin01',
  alonso: 'feralo01',
  stroll: 'lanstr01',
  gasly: 'piegas01',
  colapinto: 'fracol01',
  albon: 'alealb01',
  sainz: 'carsai01',
  ocon: 'estoco01',
  bearman: 'olibea01',
  hulkenberg: 'nichul01',
  bortoleto: 'gabbor01',
  perez: 'serper01',
  bottas: 'valbot01',
};

/** 차량 측면도. height 로 크기 조절 */
export function carImage(teamId, h = 224) {
  if (LOCAL_ASSETS) return `assets/cars/${teamId}.webp`;
  const slug = TEAM_SLUG[teamId];
  if (!slug) return null;
  const fallback = `d_common:f1:${YEAR}:fallback:car:${YEAR}fallbackcarright.webp`;
  return `${BASE}/c_lfill,h_${h}/q_auto/${fallback}/${VER}/common/f1/${YEAR}/${slug}/${YEAR}${slug}carright.webp`;
}

/** 드라이버 전신 사진. width 로 크기 조절 */
export function driverImage(driverId, teamId, w = 240) {
  if (LOCAL_ASSETS) return `assets/drivers/${driverId}.webp`;
  const team = TEAM_SLUG[teamId];
  const drv = DRIVER_SLUG[driverId];
  if (!team || !drv) return null;
  const fallback = `d_common:f1:${YEAR}:fallback:driver:${YEAR}fallbackdriverright.webp`;
  return `${BASE}/c_lfill,w_${w}/q_auto/${fallback}/${VER}/common/f1/${YEAR}/${team}/${drv}/${YEAR}${team}${drv}right.webp`;
}

/** 드라이버 얼굴 정사각 크롭. 그리드 슬롯용 — Cloudinary 얼굴 인식 사용 */
export function driverFace(driverId, teamId, size = 96) {
  if (LOCAL_ASSETS) return `assets/faces/${driverId}.webp`;
  const team = TEAM_SLUG[teamId];
  const drv = DRIVER_SLUG[driverId];
  if (!team || !drv) return null;
  const fallback = `d_common:f1:${YEAR}:fallback:driver:${YEAR}fallbackdriverright.webp`;
  return `${BASE}/c_thumb,g_face,w_${size},h_${size}/q_auto/${fallback}/${VER}/common/f1/${YEAR}/${team}/${drv}/${YEAR}${team}${drv}right.webp`;
}

/** 팀 로고 (흰색 버전) */
export function teamLogo(teamId, w = 96) {
  if (LOCAL_ASSETS) return `assets/logos/${teamId}.webp`;
  const slug = TEAM_SLUG[teamId];
  if (!slug) return null;
  return `${BASE}/c_lfill,w_${w}/q_auto/${VER}/common/f1/${YEAR}/${slug}/${YEAR}${slug}logowhite.webp`;
}
