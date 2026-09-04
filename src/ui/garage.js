// 가라지 + 스타팅 그리드 — 화면에 사람과 기계를 넣는 부분.
//
// 공식 이미지를 1순위로 쓰고, 네트워크 실패 시 carArt.js 의 SVG 아트로 자동 대체한다.
// 이미지가 없다고 화면이 비면 안 되기 때문에 폴백은 유지한다.

import { h, mount } from './dom.js';
import { carSvg, helmetSvg, teamMark } from './carArt.js';
import { tyreIcon } from './tyreIcon.js';
import { DRIVERS, teamById } from '../data/teams.js';
import { carImage, driverImage, driverFace, teamLogo } from '../data/assets.js';
import { COMPOUND_KO, COMPOUND_COLOR } from '../engine/params.js';

/**
 * 팀·드라이버 페이스로 예상 예선 순서를 만든 뒤,
 * 사용자가 고른 그리드 위치에 선택 드라이버를 끼워 넣는다.
 */
export function gridOrder(scenario, gridPos) {
  const others = DRIVERS
    .filter((d) => d.id !== scenario.driver.id)
    .map((d) => ({ driver: d, team: teamById(d.teamId) }))
    .sort((a, b) => (a.team.pace + a.driver.pace) - (b.team.pace + b.driver.pace));

  const me = { driver: scenario.driver, team: scenario.team, me: true };
  const out = others.slice();
  out.splice(Math.min(gridPos - 1, out.length), 0, me);
  return out.map((x, i) => ({ ...x, pos: i + 1 }));
}

/**
 * 이미지를 시도하고, 실패하면 SVG 로 교체하는 래퍼.
 * @param {string|null} src
 * @param {() => Node} fallback
 */
function imgOrArt(src, fallback, { alt, cls, width, height }) {
  if (!src) return fallback();
  const wrap = h(`div.${cls}-wrap`);
  const img = h('img', {
    src, alt, class: cls,
    loading: 'lazy', decoding: 'async',
    width, height,
  });
  img.addEventListener('error', () => {
    wrap.replaceChildren(fallback());
    wrap.dataset.fallback = 'svg';
  }, { once: true });
  wrap.append(img);
  return wrap;
}

export function renderGarage(root, { scenario, compound, gridPos }) {
  const { team, driver, circuit } = scenario;
  const order = gridOrder(scenario, gridPos);
  const meIdx = order.findIndex((x) => x.me);
  const window_ = order.slice(Math.max(0, meIdx - 4), meIdx + 5);

  const logo = teamLogo(team.id, 96);

  mount(root,
    h('div.garage',
      h('div.garage-driver',
        imgOrArt(driverImage(driver.id, team.id, 240),
          () => helmetSvg(team, driver, 76),
          { alt: `${driver.name} 공식 사진`, cls: 'driver-photo', width: 240, height: 690 }),

        h('div.gd-info',
          h('div.gd-numrow',
            h('div.gd-num.num', String(driver.num)),
            logo
              ? h('img.team-logo', { src: logo, alt: `${team.name} 로고`, loading: 'lazy', width: 32, height: 32 })
              : teamMark(team, 26)),
          h('div.gd-name', driver.name),
          h('div.gd-team', team.name),
          h('div.gd-tags',
            driver.ea
              ? [tag('OVR', `${driver.ea.ovr}`), tag('PAC', `${driver.ea.pac}`), tag('RAC', `${driver.ea.rac}`), tag('EXP', `${driver.ea.exp}`)]
              : [tag('우천', `${driver.wetSkill}`), tag('타이어 관리', driver.mgmt.toFixed(2))],
            tag('그리드', `P${gridPos}`)),
          driver.ea && h('div.gd-src', 'EA SPORTS F1 25 · 2026 Season Pack 레이팅'))),

      h('div.garage-car',
        imgOrArt(carImage(team.id, 224),
          () => carSvg(team, driver, compound),
          { alt: `${team.name} ${circuit.track} 머신`, cls: 'car-photo', width: 1018, height: 224 }),
        h('div.gc-caption',
          h('span', `${circuit.track} · ${circuit.laps}랩`),
          h('span.gc-tyre',
            tyreIcon(compound, 22),
            `스타트 ${COMPOUND_KO[compound]}`))),
    ),

    h('div.grid-strip', { role: 'list', 'aria-label': '예상 스타팅 그리드' },
      window_.map((x) => {
        const face = driverFace(x.driver.id, x.team.id, x.me ? 128 : 96);
        return h('div.grid-slot', {
          role: 'listitem',
          class: x.me ? 'me' : '',
          title: `P${x.pos} ${x.driver.name} (${x.team.name})`,
          style: { '--slot': x.team.colors.team },
        },
          h('span.gs-pos.num', `P${x.pos}`),
          imgOrArt(face,
            () => helmetSvg(x.team, x.driver, x.me ? 44 : 34),
            { alt: `${x.driver.name}`, cls: 'gs-face', width: 64, height: 64 }),
          h('span.gs-name', x.driver.name.split(' ').slice(-1)[0]));
      })),
  );
}

function tag(label, value) {
  return h('span.gd-tag', h('em', label), h('b.num', value));
}
