// 실제 그랑프리 기록 로더.
//
// data/races/ 의 JSON 은 tools/collect_races.py 가 OpenF1 에서 받아 만든다.
// 경기 하나가 20~60KB 라 전부 번들에 넣지 않고 고를 때마다 받아 온다.

const DIR = 'data/races';
const cache = new Map();

let indexPromise = null;

/** 재현할 수 있는 경기 목록 (연도·날짜 순) */
export function loadRaceIndex() {
  if (!indexPromise) {
    indexPromise = fetch(`${DIR}/index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return indexPromise;
}

/** 경기 하나의 전체 기록 */
export function loadRace(key) {
  if (!cache.has(key)) {
    cache.set(key, fetch(`${DIR}/${key}.json`).then((r) => {
      if (!r.ok) throw new Error(`${key} 기록을 찾지 못했습니다`);
      return r.json();
    }));
  }
  return cache.get(key);
}

/** OpenF1 컴파운드 이름 → 엔진 컴파운드 */
export const COMPOUND_OF = {
  SOFT: 'SOFT', MEDIUM: 'MEDIUM', HARD: 'HARD',
  INTERMEDIATE: 'INTER', WET: 'WET', UNKNOWN: 'MEDIUM',
};

/** OpenF1 팀 이름 → src/data/teams.js 의 팀 id (사진·색을 붙이기 위해) */
export const TEAM_OF = {
  'Mercedes': 'mercedes',
  'Ferrari': 'ferrari',
  'McLaren': 'mclaren',
  'Red Bull Racing': 'red-bull-racing',
  'Racing Bulls': 'racing-bulls',
  'RB': 'racing-bulls',
  'Aston Martin': 'aston-martin',
  'Alpine': 'alpine',
  'Williams': 'williams',
  'Haas F1 Team': 'haas',
  'Audi': 'audi',
  'Kick Sauber': 'audi',
  'Cadillac': 'cadillac',
};
