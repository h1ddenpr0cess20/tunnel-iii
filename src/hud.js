// HUD, whispers and the title / wipeout / pause panels.
import { lightLeft } from './game.js';

const $ = id => document.getElementById(id);

export function fmtLen(L) {
  if (L >= 1) return `${L.toFixed(2)} m`;
  if (L < 1e-12) return `${L.toExponential(3)} m`;
  return `${L.toFixed(Math.min(16, 3 - Math.floor(Math.log10(L))))} m`;
}
const fmtM = m => Math.floor(m).toLocaleString('en-US');

const MILESTONES = [
  [60, 'pitted'], [200, 'stay in it'], [420, 'you can see daylight'],
  [700, 'the lip is throwing harder'], [1050, 'deeper'], [1500, 'almost out'],
  [2100, 'you can see the beach'], [2900, 'it was right there a second ago'],
  [3900, 'any moment now'], [5200, 'nearly'], [7000, 'the longest barrel ever ridden'],
];
const HINTS = {
  surfer: ['carve round them', 'drag to carve'],
  fin: ['air over the fins: space', 'tap to air over the fins'],
  turtle: ['go round, or over', 'go round, or tap to go over'],
  board: ['loose board', 'loose board'],
  pack: ['find the gap', 'find the gap'],
  shark: ['shark', 'shark'],
  jelly: ['jellyfish', 'jellyfish'],
};
const DEATH = {
  surfer: 'you ran into a surfer', pack: 'you ran into a surfer', fin: 'you ran over a shark',
  shark: 'a shark got in the way', board: 'a loose board got you', turtle: 'you hit a turtle',
  jelly: 'you got stung',
};

export function createHud(store) {
  const el = {
    hud: $('hud'), dist: $('dist'), light: $('light'), whisper: $('whisper'),
    title: $('title'), bestTitle: $('best-title'),
    over: $('over'), overHead: $('over-head'), overDist: $('over-dist'), overLight: $('over-light'), overBest: $('over-best'),
    paused: $('paused'), pauseBtn: $('pause'), snd: $('snd'), error: $('error'), errorMsg: $('error-msg'),
  };
  let best = Number(store.get('nt3-best')) || 0;
  let milestone = 0;
  let timer = 0;
  let last = '';
  const hinted = {};

  function whisper(text, ms = 2600) {
    el.whisper.textContent = text;
    el.whisper.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => el.whisper.classList.remove('on'), ms);
  }

  if (best) {
    el.bestTitle.hidden = false;
    el.bestTitle.textContent = `Your best: ${fmtM(best)} m. The way out was ${fmtLen(lightLeft(best))} away.`;
  }

  return {
    start() {
      milestone = 0; last = '';
      el.title.hidden = true; el.over.hidden = true; el.paused.hidden = true;
      el.hud.hidden = false; el.pauseBtn.hidden = false; el.pauseBtn.textContent = 'Pause';
    },
    progress(m) {
      const t = `${fmtM(m)} m|${fmtLen(lightLeft(m))}`;
      if (t !== last) {
        last = t;
        const [d, l] = t.split('|');
        el.dist.textContent = d;
        el.light.textContent = l;
      }
      const ms = MILESTONES[milestone];
      if (ms && m >= ms[0]) { milestone++; whisper(ms[1]); return true; }
      return false;
    },
    approach(kind, touch) {
      if (hinted[kind] || !HINTS[kind]) return;
      hinted[kind] = true;
      whisper(HINTS[kind][touch ? 1 : 0], 1800);
    },
    die() { el.pauseBtn.hidden = true; },
    over(kind, m) {
      const isBest = m > best;
      if (isBest) { best = m; store.set('nt3-best', String(Math.floor(m))); }
      el.overHead.textContent = DEATH[kind] || 'wiped out';
      el.overDist.textContent = `${fmtM(m)} m`;
      el.overLight.textContent = `The way out is still ${fmtLen(lightLeft(m))} away.`;
      el.overBest.textContent = isBest && m > 0 ? 'Your longest ride yet.' : `Your best: ${fmtM(best)} m`;
      el.hud.hidden = true; el.over.hidden = false;
    },
    pause(p) {
      el.paused.hidden = !p;
      el.pauseBtn.textContent = p ? 'Resume' : 'Pause';
    },
    sound(muted) { el.snd.textContent = muted ? 'Sound off' : 'Sound on'; },
    error(msg) {
      el.title.hidden = true;
      el.error.hidden = false;
      el.errorMsg.textContent = msg;
    },
    buttons: { pause: el.pauseBtn, sound: el.snd },
  };
}
