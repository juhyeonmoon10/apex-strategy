// 2026 그리드. 팔레트는 v1 에서 추출한 값을 그대로 계승한다 (기획서 부록 B).
//
// ⚠ pace / degMultiplier / pitStop 은 상대적 초기값이며 실제 팀 데이터가 아니다.
//   라인업이 바뀌면 이 파일만 고치면 된다.
//
//   pace           랩당 초 (음수 = 빠름)
//   degMultiplier  타이어 마모 배율 (1 = 평균)
//   pitStop        정지 시간 (초)

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

//  pace       팀 대비 드라이버 델타 (초/랩)
//  mgmt       타이어 관리 (낮을수록 마모 적음)
//  wetSkill   우천 실력 0~100
export const DRIVERS = [
  { id: 'norris',    name: 'Lando Norris',      teamId: 'mclaren',         num: 4,  pace: -0.03, mgmt: 0.98, wetSkill: 88 },
  { id: 'piastri',   name: 'Oscar Piastri',     teamId: 'mclaren',         num: 81, pace:  0.00, mgmt: 0.97, wetSkill: 84 },
  { id: 'russell',   name: 'George Russell',    teamId: 'mercedes',        num: 63, pace: -0.02, mgmt: 0.98, wetSkill: 86 },
  { id: 'antonelli', name: 'Kimi Antonelli',    teamId: 'mercedes',        num: 12, pace:  0.06, mgmt: 1.02, wetSkill: 78 },
  { id: 'verstappen',name: 'Max Verstappen',    teamId: 'red-bull-racing', num: 1,  pace: -0.09, mgmt: 0.95, wetSkill: 96 },
  { id: 'hadjar',    name: 'Isack Hadjar',      teamId: 'red-bull-racing', num: 6,  pace:  0.10, mgmt: 1.02, wetSkill: 76 },
  { id: 'leclerc',   name: 'Charles Leclerc',   teamId: 'ferrari',         num: 16, pace: -0.04, mgmt: 1.00, wetSkill: 87 },
  { id: 'hamilton',  name: 'Lewis Hamilton',    teamId: 'ferrari',         num: 44, pace: -0.01, mgmt: 0.96, wetSkill: 94 },
  { id: 'albon',     name: 'Alex Albon',        teamId: 'williams',        num: 23, pace: -0.02, mgmt: 0.99, wetSkill: 80 },
  { id: 'sainz',     name: 'Carlos Sainz',      teamId: 'williams',        num: 55, pace: -0.03, mgmt: 0.98, wetSkill: 83 },
  { id: 'alonso',    name: 'Fernando Alonso',   teamId: 'aston-martin',    num: 14, pace: -0.05, mgmt: 0.95, wetSkill: 92 },
  { id: 'stroll',    name: 'Lance Stroll',      teamId: 'aston-martin',    num: 18, pace:  0.12, mgmt: 1.04, wetSkill: 74 },
  { id: 'lawson',    name: 'Liam Lawson',       teamId: 'racing-bulls',    num: 30, pace:  0.02, mgmt: 1.01, wetSkill: 78 },
  { id: 'lindblad',  name: 'Arvid Lindblad',    teamId: 'racing-bulls',    num: 41, pace:  0.11, mgmt: 1.03, wetSkill: 72 },
  { id: 'ocon',      name: 'Esteban Ocon',      teamId: 'haas',            num: 31, pace:  0.01, mgmt: 1.00, wetSkill: 79 },
  { id: 'bearman',   name: 'Oliver Bearman',    teamId: 'haas',            num: 87, pace:  0.05, mgmt: 1.02, wetSkill: 76 },
  { id: 'hulkenberg',name: 'Nico Hulkenberg',   teamId: 'audi',            num: 27, pace:  0.00, mgmt: 0.99, wetSkill: 85 },
  { id: 'bortoleto', name: 'Gabriel Bortoleto', teamId: 'audi',            num: 5,  pace:  0.08, mgmt: 1.03, wetSkill: 74 },
  { id: 'gasly',     name: 'Pierre Gasly',      teamId: 'alpine',          num: 10, pace: -0.01, mgmt: 1.00, wetSkill: 82 },
  { id: 'colapinto',  name: 'Franco Colapinto', teamId: 'alpine',          num: 43, pace:  0.09, mgmt: 1.03, wetSkill: 75 },
  { id: 'perez',     name: 'Sergio Perez',      teamId: 'cadillac',        num: 11, pace: -0.02, mgmt: 0.97, wetSkill: 84 },
  { id: 'bottas',    name: 'Valtteri Bottas',   teamId: 'cadillac',        num: 77, pace:  0.01, mgmt: 0.98, wetSkill: 83 },
];

export const teamById = (id) => TEAMS.find((t) => t.id === id) || TEAMS[1];
export const driversOf = (teamId) => DRIVERS.filter((d) => d.teamId === teamId);
export const driverById = (id) => DRIVERS.find((d) => d.id === id) || DRIVERS[2];
