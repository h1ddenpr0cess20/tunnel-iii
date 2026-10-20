// Keyboard and touch. Left and right (or A and D) carve while held, up (or
// W) pops an air; dragging carves by following your finger, and a flick up
// airs too; a tap or space drops in, paddles back out, unpauses and, while
// you ride, pops an air.
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const STEER = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1],
};

export function bindInput(h) {
  const state = { touch: window.matchMedia?.('(pointer: coarse)').matches ?? false };
  const held = new Set();

  function steer() {
    let x = 0, y = 0;
    for (const k of held) { x += STEER[k][0]; y += STEER[k][1]; }
    const l = Math.hypot(x, y);
    h.steer(l > 1 ? [x / l, y / l] : [x, y]);
  }

  window.addEventListener('keydown', e => {
    const k = e.code;
    if (GAME_KEYS.has(k)) e.preventDefault();
    if (e.target?.closest?.('button') && (k === 'Space' || k === 'Enter')) return;
    if (STEER[k]) { held.add(k); steer(); }
    if (e.repeat) return;
    switch (k) {
      case 'KeyM': h.mute(); break;
      case 'KeyP': case 'Escape': h.pause(); break;
      case 'Space': case 'Enter': h.primary(); break;
    }
  });
  window.addEventListener('keyup', e => {
    if (held.delete(e.code)) steer();
  });
  window.addEventListener('blur', () => { held.clear(); steer(); });

  // Touch: dragging across half the screen's short side carves you a good
  // way round the barrel. A tap is a press.
  let ptr = null;
  window.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    if (e.pointerType === 'touch') state.touch = true;
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false };
  });
  window.addEventListener('pointermove', e => {
    if (!ptr || ptr.id !== e.pointerId) return;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    ptr.x = e.clientX; ptr.y = e.clientY;
    if (Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0) > 10) ptr.moved = true;
    const k = 3.2 / Math.min(window.innerWidth, window.innerHeight);
    h.nudge(dx * k, -dy * k);
  });
  window.addEventListener('pointerup', e => {
    if (!ptr || ptr.id !== e.pointerId) return;
    if (!ptr.moved) h.primary();
    ptr = null;
  });
  window.addEventListener('pointercancel', () => { ptr = null; });

  return state;
}
