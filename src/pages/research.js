// 연구 — 목차 활성 표시
import { mountShell } from '../shell.js';
import { applyTeamTheme } from '../ui/theme.js';
import { teamById } from '../data/teams.js';

mountShell();
applyTeamTheme(teamById('mercedes'));

const links = [...document.querySelectorAll('.toc a')];
const secs = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);

const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${e.target.id}`));
  });
}, { rootMargin: '-20% 0px -70% 0px' });
secs.forEach((s) => io.observe(s));
