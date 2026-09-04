// 2026 그리드. 팔레트는 v1 에서 추출한 값을 그대로 계승한다 (기획서 부록 B).
//
// ── 드라이버 능력치: EA SPORTS F1 25 · 2026 Season Pack DLC (출시 시점 공식 레이팅) ──
//   출처: EA 공식 발표를 옮긴 Yahoo Sports / ClutchPoints 기사, 두 매체 수치 일치 확인.
//   EA 6월 업데이트에서 일부 수치가 바뀌었으나(예: Norris 94→92, Antonelli 83→88)
//   전체 표를 구하지 못해 출시 시점 표를 일관되게 쓴다.
//   라인업은 6월 업데이트 기준(Hadjar → Red Bull Racing).
//
//   EA 항목 → 엔진 파라미터 매핑 (이 프로젝트의 정의. 게임 내부 공식이 아님)
//     pace     = (88 − PAC) × 0.03          랩당 초. PAC 96 → −0.24, PAC 72 → +0.48
//     mgmt     = 1 − (EXP − 80) × 0.0015     경험이 많을수록 타이어를 아낀다고 본다
//     wetSkill = OVR                          우천 실력의 직접 지표가 없어 종합치로 대체
//
// ── 팀(차량) 성능치: EA 가 공개 페이지에 싣지 않아 프로젝트 추정값 유지 ──
//   pace / degMultiplier / pitStop 은 2025 시즌 상대 전력 기반 근사값.

export const TEAMS = [
  { id: 'mclaren',         name: 'McLaren',          pace: -0.15, degMultiplier: 0.95, pitStop: 2.5, colors: { team: '#FF8000', accent: '#FF8000', secondary: '#FFB15B' } },
  { id: 'mercedes',        name: 'Mercedes',         pace: -0.10, degMultiplier: 0.97, pitStop: 2.6, colors: { team: '#00A19C', accent: '#27F4D2', secondary: '#111820' } },
  { id: 'red-bull-racing', name: 'Red Bull Racing',  pace: -0.08, degMultiplier: 1.00, pitStop: 2.4, colors: { team: '#3671C6', accent: '#4F7DDD', secondary: '#FFCB24' } },
  { id: 'ferrari',         name: 'Ferrari',          pace: -0.05, degMultiplier: 1.03, pitStop: 2.7, colors: { team: '#E80020', accent: '#ED1731', secondary: '#7B0013' } },
  { id: 'williams',        name: 'Williams',         pace:  0.35, degMultiplier: 1.02, pitStop: 2.9, colors: { team: '#64C4FF', accent: '#64C4FF', secondary: '#1E65D6' } },
  { id: 'aston-martin',    name: 'Aston Martin',     pace:  0.40, degMultiplier: 1.04, pitStop: 2.8, colors: { team: '#229971', accent: '#2EB58A', secondary: '#B9E629' } },
  { id: 'racing-bulls',    name: 'Racing Bulls',     pace:  0.45, degMultiplier: 1.01, pitStop: 2.7, colors: { team: '#6692FF', accent: '#82A8FF', secondary: '#EDF3FF' } },
  { id: 'haas',            name: 'Haas F1 Team',     pace:  0.50, degMultiplier: 1.05, pitStop: 3.0, colors: { team: '#B6BABD', accent: '#E8ECEF', secondary: '#D92735' } },
  { id: 'audi',            name: 'Audi',             pace:  0.55, degMultiplier: 1.03, pitStop: 2.9, colors: { team: '#E31B23', accent: '#EF3340', secondary: '#9B111E' } },
  { id: 'alpine',          name: 'Alpine',           pace:  0.60, degMultiplier: 1.06, pitStop: 3.1, colors: { team: '#0093CC', accent: '#FF76BD', secondary: '#2798D8' } },
  { id: 'cadillac',        name: 'Cadillac',         pace:  0.85, degMultiplier: 1.06, pitStop: 3.4, colors: { team: '#B8B8B8', accent: '#C7C9CB', secondary: '#C9A84D' } },
];

/** EA 레이팅 → 엔진 파라미터 */
function fromEA(id, name, teamId, num, ea) {
  const [ovr, exp, rac, awa, pac] = ea;
  return {
    id, name, teamId, num,
    ea: { ovr, exp, rac, awa, pac },
    pace: +((88 - pac) * 0.03).toFixed(3),
    mgmt: +(1 - (exp - 80) * 0.0015).toFixed(4),
    wetSkill: ovr,
  };
}

//                                                          OVR EXP RAC AWA PAC
export const DRIVERS = [
  fromEA('norris',     'Lando Norris',      'mclaren',         4,  [94, 81, 89, 80, 94]),
  fromEA('piastri',    'Oscar Piastri',     'mclaren',         81, [91, 77, 95, 81, 92]),
  fromEA('russell',    'George Russell',    'mercedes',        63, [93, 83, 94, 93, 94]),
  fromEA('antonelli',  'Kimi Antonelli',    'mercedes',        12, [83, 70, 83, 75, 85]),
  fromEA('verstappen', 'Max Verstappen',    'red-bull-racing', 1,  [95, 87, 96, 85, 96]),
  fromEA('hadjar',     'Isack Hadjar',      'red-bull-racing', 6,  [83, 71, 81, 82, 85]),
  fromEA('leclerc',    'Charles Leclerc',   'ferrari',         16, [92, 83, 92, 91, 93]),
  fromEA('hamilton',   'Lewis Hamilton',    'ferrari',         44, [91, 98, 93, 91, 89]),
  fromEA('albon',      'Alex Albon',        'williams',        23, [85, 84, 87, 77, 85]),
  fromEA('sainz',      'Carlos Sainz',      'williams',        55, [86, 88, 88, 80, 86]),
  fromEA('alonso',     'Fernando Alonso',   'aston-martin',    14, [90, 99, 90, 81, 87]),
  fromEA('stroll',     'Lance Stroll',      'aston-martin',    18, [77, 84, 77, 73, 77]),
  fromEA('lawson',     'Liam Lawson',       'racing-bulls',    30, [79, 73, 79, 71, 81]),
  fromEA('lindblad',   'Arvid Lindblad',    'racing-bulls',    41, [68, 32, 70, 60, 72]),
  fromEA('ocon',       'Esteban Ocon',      'haas',            31, [84, 83, 85, 84, 84]),
  fromEA('bearman',    'Oliver Bearman',    'haas',            87, [83, 72, 88, 70, 83]),
  fromEA('hulkenberg', 'Nico Hulkenberg',   'audi',            27, [85, 88, 85, 85, 85]),
  fromEA('bortoleto',  'Gabriel Bortoleto', 'audi',            5,  [80, 69, 81, 77, 81]),
  fromEA('gasly',      'Pierre Gasly',      'alpine',          10, [84, 83, 83, 78, 85]),
  fromEA('colapinto',  'Franco Colapinto',  'alpine',          43, [73, 69, 71, 74, 75]),
  fromEA('perez',      'Sergio Perez',      'cadillac',        11, [85, 92, 83, 81, 85]),
  fromEA('bottas',     'Valtteri Bottas',   'cadillac',        77, [84, 89, 75, 95, 87]),
];

export const teamById = (id) => TEAMS.find((t) => t.id === id) || TEAMS[1];
export const driversOf = (teamId) => DRIVERS.filter((d) => d.teamId === teamId);
export const driverById = (id) => DRIVERS.find((d) => d.id === id) || DRIVERS[2];
