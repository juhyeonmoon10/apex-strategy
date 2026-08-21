// 2026 캘린더 기준 24개 서킷.
//
// ⚠ baseLap / degMultiplier / scRate 는 공개 기록에 근거한 "근사 초기값"이다.
//   실제 팀 데이터가 아니며, 캘리브레이션 대상이다.
//   pitLoss(피트레인 손실)와 laps/lengthKm 는 공식 값에 가깝다.
//
//   fuelPerLap = 0.0055 × 트랙 길이 + 0.004  (연료 1랩 소모분의 랩타임 이득)

const mk = (o) => ({ ...o, fuelPerLap: +(0.0055 * o.lengthKm + 0.004).toFixed(4) });

export const CIRCUITS = [
  mk({ id: 'australia',   name: '호주 그랑프리',        track: '앨버트 파크',        laps: 58, lengthKm: 5.278, baseLap: 80.5,  pitLoss: 20.5, degMultiplier: 0.90, scRate: 0.55, vscRate: 0.35 }),
  mk({ id: 'china',       name: '중국 그랑프리',        track: '상하이 인터내셔널',  laps: 56, lengthKm: 5.451, baseLap: 95.0,  pitLoss: 21.5, degMultiplier: 1.10, scRate: 0.40, vscRate: 0.30 }),
  mk({ id: 'japan',       name: '일본 그랑프리',        track: '스즈카 서킷',        laps: 53, lengthKm: 5.807, baseLap: 92.5,  pitLoss: 22.0, degMultiplier: 1.20, scRate: 0.35, vscRate: 0.30 }),
  mk({ id: 'bahrain',     name: '바레인 그랑프리',      track: '사키르 서킷',        laps: 57, lengthKm: 5.412, baseLap: 94.0,  pitLoss: 22.5, degMultiplier: 1.35, scRate: 0.30, vscRate: 0.25 }),
  mk({ id: 'saudi',       name: '사우디아라비아 그랑프리', track: '제다 코니시',     laps: 50, lengthKm: 6.174, baseLap: 92.0,  pitLoss: 20.0, degMultiplier: 0.85, scRate: 0.65, vscRate: 0.40 }),
  mk({ id: 'miami',       name: '마이애미 그랑프리',    track: '마이애미 인터내셔널', laps: 57, lengthKm: 5.412, baseLap: 91.5,  pitLoss: 19.5, degMultiplier: 1.20, scRate: 0.45, vscRate: 0.30 }),
  mk({ id: 'canada',      name: '캐나다 그랑프리',      track: '질 빌뇌브',          laps: 70, lengthKm: 4.361, baseLap: 75.5,  pitLoss: 18.0, degMultiplier: 0.85, scRate: 0.50, vscRate: 0.35 }),
  mk({ id: 'monaco',      name: '모나코 그랑프리',      track: '모나코 시가지',      laps: 78, lengthKm: 3.337, baseLap: 74.5,  pitLoss: 19.5, degMultiplier: 0.60, scRate: 0.75, vscRate: 0.45 }),
  mk({ id: 'barcelona',   name: '바르셀로나-카탈루냐 그랑프리', track: '카탈루냐',   laps: 66, lengthKm: 4.657, baseLap: 79.5,  pitLoss: 21.0, degMultiplier: 1.20, scRate: 0.25, vscRate: 0.25 }),
  mk({ id: 'austria',     name: '오스트리아 그랑프리',  track: '레드불링',           laps: 71, lengthKm: 4.318, baseLap: 68.5,  pitLoss: 20.0, degMultiplier: 1.05, scRate: 0.35, vscRate: 0.30 }),
  // ★ 실버스톤은 OpenF1 실측으로 캘리브레이션됨 (tools/calibrate.py, 2023~2025)
  //   baseLap  2023 건조 레이스 최속랩 90.275 + 모델 보정 1.47
  //   pitLoss  (인랩+아웃랩) − 2×정상랩 = 19.9초.  lane_duration(28.75)은 피트레인
  //            통과 시간이라 손실값이 아니다 — 그대로 쓰면 9초 과대평가된다.
  mk({ id: 'britain',     name: '영국 그랑프리',        track: '실버스톤 서킷',      laps: 52, lengthKm: 5.891, baseLap: 91.75, pitLoss: 19.9, degMultiplier: 1.25, scRate: 0.40, vscRate: 0.30, calibrated: true }),
  mk({ id: 'belgium',     name: '벨기에 그랑프리',      track: '스파-프랑코샹',      laps: 44, lengthKm: 7.004, baseLap: 108.0, pitLoss: 19.0, degMultiplier: 1.15, scRate: 0.45, vscRate: 0.35 }),
  mk({ id: 'hungary',     name: '헝가리 그랑프리',      track: '헝가로링',           laps: 70, lengthKm: 4.381, baseLap: 78.0,  pitLoss: 20.5, degMultiplier: 1.05, scRate: 0.30, vscRate: 0.25 }),
  mk({ id: 'netherlands', name: '네덜란드 그랑프리',    track: '잔드보르트',         laps: 72, lengthKm: 4.259, baseLap: 73.0,  pitLoss: 20.0, degMultiplier: 1.10, scRate: 0.40, vscRate: 0.30 }),
  mk({ id: 'italy',       name: '이탈리아 그랑프리',    track: '몬차',               laps: 53, lengthKm: 5.793, baseLap: 84.0,  pitLoss: 22.0, degMultiplier: 0.85, scRate: 0.35, vscRate: 0.30 }),
  mk({ id: 'spain',       name: '스페인 그랑프리',      track: '마드리드 (마드링)',  laps: 57, lengthKm: 5.474, baseLap: 88.0,  pitLoss: 21.0, degMultiplier: 1.05, scRate: 0.35, vscRate: 0.30 }),
  mk({ id: 'azerbaijan',  name: '아제르바이잔 그랑프리', track: '바쿠 시가지',       laps: 51, lengthKm: 6.003, baseLap: 104.0, pitLoss: 19.0, degMultiplier: 0.80, scRate: 0.70, vscRate: 0.40 }),
  mk({ id: 'singapore',   name: '싱가포르 그랑프리',    track: '마리나 베이',        laps: 62, lengthKm: 4.940, baseLap: 94.0,  pitLoss: 23.0, degMultiplier: 1.00, scRate: 0.80, vscRate: 0.45 }),
  mk({ id: 'usa',         name: '미국 그랑프리',        track: 'COTA',               laps: 56, lengthKm: 5.513, baseLap: 96.0,  pitLoss: 21.0, degMultiplier: 1.15, scRate: 0.35, vscRate: 0.30 }),
  mk({ id: 'mexico',      name: '멕시코시티 그랑프리',  track: '에르마노스 로드리게스', laps: 71, lengthKm: 4.304, baseLap: 79.0, pitLoss: 21.5, degMultiplier: 0.95, scRate: 0.45, vscRate: 0.35 }),
  mk({ id: 'brazil',      name: '상파울루 그랑프리',    track: '인터라고스',         laps: 71, lengthKm: 4.309, baseLap: 72.5,  pitLoss: 20.0, degMultiplier: 1.10, scRate: 0.50, vscRate: 0.35 }),
  mk({ id: 'lasvegas',    name: '라스베이거스 그랑프리', track: '라스베이거스 스트립', laps: 50, lengthKm: 6.201, baseLap: 95.0, pitLoss: 20.0, degMultiplier: 0.70, scRate: 0.60, vscRate: 0.40 }),
  mk({ id: 'qatar',       name: '카타르 그랑프리',      track: '루사일',             laps: 57, lengthKm: 5.419, baseLap: 85.5,  pitLoss: 22.0, degMultiplier: 1.40, scRate: 0.30, vscRate: 0.25 }),
  mk({ id: 'abudhabi',    name: '아부다비 그랑프리',    track: '야스 마리나',        laps: 58, lengthKm: 5.281, baseLap: 85.5,  pitLoss: 21.0, degMultiplier: 0.95, scRate: 0.30, vscRate: 0.25 }),
];

export const circuitById = (id) => CIRCUITS.find((c) => c.id === id) || CIRCUITS[10];
