/* eslint-disable */
// @ts-nocheck
/**
 * Spider Climb engine — ported VERBATIM from the author's original
 * "Spider-Climb.html".
 *
 * Everything that makes the game look and feel the way it does is unchanged:
 * the dusk sky gradient, the moon and its glow, the two parallax skylines
 * with amber windows, the street with traffic lights, the anchor spires, the
 * rope with its sag and web-splat, the inverse-kinematics hero poses, the
 * particles, debris, screen shake and the synthesised audio.
 *
 * Exactly four things were changed, each marked `PORT:` below:
 *   1. The React/template host was removed; `setState` now forwards to a
 *      callback so our own HUD renders the chrome.
 *   2. `chapters()` returns questions injected from the student's own chapter
 *      instead of the hard-coded Physics bank.
 *   3. `choose()` no longer decides correctness — it asks the server through
 *      the host, because a game must never hold the answer key.
 *   4. Mount/unmount are plain methods instead of React lifecycle hooks.
 *
 * It is deliberately excluded from type-checking and linting: it is ported
 * third-party-shaped code, and reformatting it would make future diffs
 * against the original impossible.
 */

/** PORT: module-level constants the original defined outside the class. */
/**
 * The original kept the chosen suit in a page-level variable set by its
 * menu. We skip that menu, so the suit lives here and can be set by the
 * adapter later if we ever offer the choice again.
 */
let suit = 0;
/** The original's page-level mute flag, set by its own sound button. */
let sound = true;
export function setSuit(i) { suit = Math.max(0, Math.min(2, i | 0)); }
export function setSound(on) { sound = !!on; }

const SUITS=[{name:'Scarlet',main:'#f0525c',dark:'#253e78',tag:'The original rooftop runner'},{name:'Ghost',main:'#e8edf7',dark:'#8150a6',tag:'A little mystery. A lot of style.'},{name:'Volt',main:'#93e6b2',dark:'#183d46',tag:'Bring a spark to the skyline'}];

export class SpiderEngine {
  /** PORT 1: the template host is gone; state changes are pushed to the HUD. */
  constructor(opts) {
    this.canvasRef = { current: opts.canvas };
    this._onState = opts.onState || (() => {});
    this._onChoose = opts.onChoose || (() => {});
    this._chapters = opts.chapters || [];
    this.frame = this.frame.bind(this);
  }
  /**
   * PORT: the original re-rendered its own toast/banner nodes here. Our HUD
   * is a React component driven by `onState`, so there is nothing to refresh
   * imperatively — but the engine calls this from several places, so it has
   * to exist.
   */
  refreshTransient() {}
  setState(v) {
    this.state = { ...this.state, ...(typeof v === "function" ? v(this.state) : v) };
    this._onState(this.state);
  }

  state = { screen: 'menu', ci: 0, qi: 0, phase: 'move', hearts: 3, score: 0, streak: 0, bestStreak: 0, firstTry: 0, tried: [], selected: -1, toast: null, banner: null, feedback: null, shakeT: 0, bests: {}, result: null, hintKey: 'run' };
  
  LETTERS = ['A', 'B', 'C', 'D']; BADGE = ['#e0242b', '#2f6fd6', '#ffa62b', '#8f5bff'];

  chapters() {
    /** PORT 2: the hard-coded Physics bank is replaced by the live chapter. */
    return this._chapters;
  }

  /** PORT 4 */
  mount() {
    this.C = this.chapters(); this.t = 0; this.timeScale = 1; this.particles = []; this.ropes = []; this.debris = []; this.cam = { x: 0, y: 20 }; this.shake = 0;
    let bests = {}; try { bests = JSON.parse(localStorage.getItem('spiderClimb3.bests') || '{}'); } catch (e) {}
    this.setState({ bests });
    this.buildWorld(0); this.h = { x: 6, y: this.blds[0].top, vx: 0, vy: 0, mode: 'run', t: 0, squash: 0 }; this.pose = this.blankPose(); this.demo = true;
    this.last = performance.now(); this.raf = requestAnimationFrame(this.frame);
  }
  /** PORT 4 */
  unmount() { cancelAnimationFrame(this.raf); }

  ac() { if (!this._ac) { try { this._ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (this._ac.state === 'suspended') this._ac.resume(); return this._ac; }
  tone(f, dur, type, vol, when, slide) { const ac = this.ac(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + (when || 0); o.type = type || 'square'; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02); }
  sfx(k) {
    if (!sound) return;
    if (k === 'thwip') this.tone(1600, 0.16, 'sine', 0.07, 0, 250);
    if (k === 'land') this.tone(160, 0.07, 'square', 0.06);
    if (k === 'ok') { this.tone(520, 0.08, 'square', 0.1); this.tone(780, 0.12, 'square', 0.1, 0.07); this.tone(1040, 0.2, 'triangle', 0.1, 0.14); }
    if (k === 'snap') { this.tone(1200, 0.05, 'square', 0.1, 0, 300); this.tone(150, 0.35, 'sawtooth', 0.12, 0.04, 60); }
    if (k === 'fall') this.tone(600, 0.6, 'sawtooth', 0.08, 0, 80);
    if (k === 'win') [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, 0.2, 'square', 0.1, i * 0.1));
    if (k === 'zip') this.tone(300, 0.3, 'sine', 0.08, 0, 1200);
    if (k === 'click') this.tone(700, 0.05, 'triangle', 0.08);
  }

  // ---------- world ----------
  rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  buildWorld(ci) {
    const ch = this.C[ci], N = ch.q.length, r = this.rng(ci * 977 + 31);
    this.blds = []; this.gaps = [];
    let x = 0, h = 28;
    this.blds.push({ x: 0, w: 30, top: h, seed: 11, kind: 'start' }); x = 30;
    for (let i = 0; i < N; i++) {
      const gapW = 24 + r() * 6, nextTop = Math.max(18, Math.min(36, h + (r() - 0.5) * 8));
      const xs = [0.28, 0.44, 0.6, 0.76].map(f => x + gapW * f + (r() - 0.5) * 2), ys = [11, 15, 13, 17].sort(() => r() - 0.5);
      const anchors = xs.map((ax, k) => ({ x: ax, y: Math.max(h, nextTop) + ys[k], k, state: 'idle', fall: 0 }));
      this.gaps.push({ q: i, x0: x, x1: x + gapW, anchors, fromTop: h, toTop: nextTop });
      x += gapW; const w = 24 + r() * 8;
      this.blds.push({ x, w, top: nextTop, seed: Math.floor(r() * 1e6), kind: i === N - 1 ? 'goal' : 'bld', hop: r() > 0.35 ? x + w * 0.45 : null });
      if (i === N - 1) this.goalX = x + w * 0.7;
      x += w; h = nextTop;
    }
  }
  bldAt(x) { return this.blds.find(b => x >= b.x - 0.01 && x <= b.x + b.w + 0.01); }

  defer(fn,ms) { this.timers ||= []; this.timers.push(setTimeout(fn,ms)); }
  start(ci) {
    (this.timers||[]).forEach(clearTimeout); this.acc=0;
    this.buildWorld(ci); this.particles = []; this.ropes = []; this.debris = []; this.timeScale = 1; this.demo = false; this.won = false;
    this.h = { x: 4, y: this.blds[0].top, vx: 0, vy: 0, mode: 'run', t: 0, squash: 0 }; this.pose = this.blankPose(); this.cam = { x: 12, y: this.h.y + 3 };
    this.setState({ screen: 'play', ci, qi: 0, phase: 'move', hearts: 3, score: 0, streak: 0, bestStreak: 0, firstTry: 0, tried: [], selected: -1, toast: null, banner: null, feedback: null, result: null, hintKey: 'run' });
  }

  // ---------- gameplay ----------
  choose(k) {
    if (this.state.phase !== 'question' || this.state.tried.includes(k)) return;
    /** PORT 3: ask the server. `resolveChoice` continues the animation. */
    this._pendingChoice = k;
    this.sfx('click');
    this.setState({ selected: k, phase: 'resolving' });
    this._onChoose(k);
  }
  /** PORT 3: the host calls this once the server has scored the choice. */
  resolveChoice(ok) {
    const k = this._pendingChoice;
    if (k == null) return;
    this._pendingChoice = null;
    const gap = this.gaps[this.state.qi], h = this.h;
    const a = gap.anchors[k];
    a.state = ok ? 'good' : 'weak';
    this.defer(() => {
      h.mode = 'shoot'; h.t = 0;
      h.rope = { ax: a.x, ay: a.y, t: 0, L: 0, anchor: a, ok };
      h.vx = 4; h.vy = 4;
      this.sfx('thwip');
      this.setState({ hintKey: 'swing' });
    }, 350);
  }
  resolveCorrect() {
    const q = (this.C[this.state.ci] && this.C[this.state.ci].q[this.state.qi]) || { options: [], correct: 0, explain: '' }, streak = this.state.streak + 1, pts = 100 * streak, first = this.state.tried.length === 0;
    this.sfx('ok'); this.timeScale = 0.35; this.slowT = 0.5; this.burst(this.h.x, this.h.y + 1.5, 30, ['#ffd23f', '#fff', '#5ed36a']);
    this.setState(s => ({ streak, bestStreak: Math.max(s.bestStreak, streak), score: s.score + pts, firstTry: s.firstTry + (first ? 1 : 0), toast: { text: ['THWIP!', 'NICE!', 'WALL-CRAWLER!', 'AMAZING!', 'SPECTACULAR!'][Math.min(streak - 1, 4)], color: '#ffd23f', t: Date.now() }, banner: { color: '#2fb56b', title: 'CORRECT  +' + pts, text: q.options[q.correct] + ' — ' + q.explain, t: Date.now() } }));
  }
  snapAnchor() {
    const h = this.h, a = h.rope.anchor; a.state = 'broken'; this.sfx('snap'); this.shake = 1;
    this.debris.push({ x: a.x, y: a.y, vx: 2, vy: 2, rot: 0, vr: 6, life: 2 });
    this.ropes.push({ ax: h.x, ay: h.y + 1, hx: a.x, hy: a.y - 2, life: 0.9, t: 0, loose: true });
    h.rope = null; h.mode = 'fall'; h.t = 0; h.vy = Math.min(h.vy, 2);
    this.setState({ shakeT: Date.now(), toast: { text: 'SNAP!', color: '#e0242b', t: Date.now() }, hintKey: 'fall' });
  }
  yankBack() {
    const h = this.h, gap = this.gaps[this.state.qi]; h.mode = 'yank'; h.t = 0; this.sfx('zip');
    h.yank = { x0: h.x, y0: h.y, x1: gap.x0 - 2.5, y1: gap.fromTop }; h.rope = { ax: gap.x0 - 2.5, ay: gap.fromTop + 0.8, t: 1, L: 0, zip: true };
  }
  afterYank() {
    const q = this.C[this.state.ci].q[this.state.qi], k = this.state.selected, hearts = this.state.hearts - 1, tried = [...this.state.tried, k];
    this.h.mode = 'edge'; this.h.t = 0;
    this.setState({ hearts, streak: 0, tried, phase: 'feedback', feedback: { ok: false, dead: hearts <= 0, title: 'WRONG ANSWER', sub: `“${q.options[k]}” couldn’t hold the web. You’re back at the checkpoint.`, letter: this.LETTERS[q.correct], answer: q.options[q.correct], explain: q.explain, button: hearts <= 0 ? 'SEE RESULT' : 'TRY AGAIN' } });
  }
  feedbackAction() {
    const fb = this.state.feedback; if (!fb) return;
    if (fb.dead) { this.finish(false); return; }
    // reset anchors for retry (keep the broken one broken)
    this.setState({ phase: 'question', feedback: null, selected: -1, hintKey: 'pick' });
  }
  arriveNext() {
    const qi = this.state.qi + 1, ch = this.C[this.state.ci];
    if (qi >= ch.q.length) { this.won = true; this.setState({ qi: ch.q.length - 1, phase: 'move' }); }
    else this.setState({ qi, tried: [], selected: -1, phase: 'move', hintKey: 'run' });
  }
  finish(won) {
    const ci = this.state.ci, prev = this.state.bests[ci] || 0, bests = { ...this.state.bests, [ci]: Math.max(prev, this.state.score) };
    try { localStorage.setItem('spiderClimb3.bests', JSON.stringify(bests)); } catch (e) {}
    this.h.mode = 'done';
    this.setState({ bests, phase: 'result', feedback: null, result: { won, kicker: won ? 'DISTRICT CLEARED' : 'OUT OF WEB FLUID', title: won ? 'YOU MADE IT!' : 'GAME OVER', text: won ? 'You crossed every rooftop. The skyline is yours.' : 'Three snapped webs and the fluid ran dry. Read the explanations and swing again.' } });
  }

  step(dt) {
    const h = this.h, g = 22, RUN = 9; h.t += dt; const px = h.x, py = h.y;
    const gap = this.gaps[this.state.qi];
    switch (h.mode) {
      case 'run': {
        h.vx += (RUN - h.vx) * Math.min(1, 5 * dt); h.x += h.vx * dt;
        const b = this.bldAt(h.x); if (b) h.y = b.top;
        if (this.demo) { if (h.x > this.blds[0].w - 3) { h.x = 2; } break; }
        if (b && b.hop && !b.hopped && h.x > b.hop - 3) { b.hopped = true; h.mode = 'hop'; h.t = 0; h.vy = 7.5; this.dust(h.x, h.y, 4); }
        if (this.won && h.x >= this.goalX) { h.mode = 'done'; h.t = 0; this.sfx('win'); this.rain(); this.defer(() => this.finish(true), 1500); }
        else if (!this.won && gap && h.x >= gap.x0 - 2.5) { h.x = gap.x0 - 2.5; h.mode = 'edge'; h.t = 0; h.vx = 0; this.dust(h.x, h.y, 5); this.setState({ phase: 'question', hintKey: 'pick' }); }
        break;
      }
      case 'hop': { h.vy -= g * dt; h.x += h.vx * dt; h.y += h.vy * dt; const b = this.bldAt(h.x); if (b && h.vy < 0 && h.y <= b.top) { h.y = b.top; h.mode = 'run'; h.squash = 0.15; this.dust(h.x, h.y, 4); this.sfx('land'); } break; }
      case 'edge': break;
      case 'shoot': { h.rope.t += dt; h.vy -= g * dt; h.x += h.vx * dt; h.y += h.vy * dt; if (h.rope.t >= 0.12) { h.mode = 'swing'; h.t = 0; h.rope.L = Math.hypot(h.rope.ax - h.x, h.rope.ay - h.y); h.rope.attachT = 0; h.vx = Math.max(h.vx, 6); } break; }
      case 'swing': {
        const R = h.rope; R.attachT += dt; h.vy -= g * dt; h.x += h.vx * dt; h.y += h.vy * dt;
        const dx = h.x - R.ax, dy = h.y - R.ay, d = Math.hypot(dx, dy);
        R.L = Math.max(6, R.L - 2 * dt);
        if (d > R.L) { const nx = dx / d, ny = dy / d; h.x = R.ax + nx * R.L; h.y = R.ay + ny * R.L; const vr = h.vx * nx + h.vy * ny; if (vr > 0) { h.vx -= vr * nx; h.vy -= vr * ny; } let tx = -ny, ty = nx; if (tx < 0) { tx = -tx; ty = -ty; } h.vx += tx * 8 * dt; h.vy += ty * 8 * dt; }
        if (!R.ok && (R.attachT > 0.45 || (dx > -1 && h.vy > -1))) { this.snapAnchor(); break; }
        const angle = Math.atan2(dx, -dy);
        if (R.ok && dx > 0 && h.vy > 0 && angle > 0.95) {
          this.ropes.push({ ax: R.ax, ay: R.ay, hx: h.x, hy: h.y + 0.8, life: 0.8, t: 0 }); h.rope = null; h.mode = 'air'; h.t = 0;
          // landing assist: aim for 4 m onto the next rooftop
          const target = this.bldAt(gap.x1 + 1), landX = gap.x1 + 4, top = target.top; const disc = h.vy * h.vy + 2 * g * (h.y - top);
          if (disc > 0) { const tf = (h.vy + Math.sqrt(disc)) / g; const req = (landX - h.x) / Math.max(0.3, tf); h.vx = h.vx * 0.3 + req * 0.7; }
        }
        break;
      }
      case 'air': {
        h.vy -= g * dt; h.x += h.vx * dt; h.y += h.vy * dt;
        const b = this.bldAt(h.x);
        if (b && h.vy < 0 && py >= b.top - 0.01 && h.y <= b.top) { h.y = b.top; h.mode = 'run'; h.t = 0; h.vx = RUN * 0.7; h.squash = 0.2; this.dust(h.x, h.y, 8); this.sfx('land'); this.resolveCorrect(); this.arriveNext(); }
        else if (b && h.x + 0.4 > b.x && px + 0.4 <= b.x && h.y < b.top - 0.3) { h.x = b.x - 0.4; h.mode = 'cling'; h.t = 0; h.wall = b; h.vx = 0; h.vy = 0; this.dust(h.x, h.y, 4); }
        break;
      }
      case 'cling': { h.y += 6 * dt; if (h.y >= h.wall.top) { h.y = h.wall.top; h.x = h.wall.x + 0.6; h.mode = 'run'; h.t = 0; h.vx = RUN * 0.6; h.squash = 0.15; this.dust(h.x, h.y, 5); this.resolveCorrect(); this.arriveNext(); } break; }
      case 'fall': { h.vy -= g * dt; h.x += h.vx * 0.3 * dt; h.y += h.vy * dt; if (h.y < gap.fromTop - 14 || h.y < 1) { this.yankBack(); } break; }
      case 'yank': { const k = Math.min(1, h.t / 0.8), e = 1 - Math.pow(1 - k, 3); h.x = h.yank.x0 + (h.yank.x1 - h.yank.x0) * e; h.y = h.yank.y0 + (h.yank.y1 - h.yank.y0) * e + Math.sin(k * Math.PI) * 4; if (k >= 1) { h.rope = null; h.squash = 0.2; this.dust(h.x, h.y, 8); this.sfx('land'); this.afterYank(); } break; }
      case 'done': { h.vx *= 1 - 5 * dt; h.x += h.vx * dt; break; }
    }
    if (h.squash > 0) h.squash = Math.max(0, h.squash - dt);
  }

  dust(x, y, n) { for (let i = 0; i < n; i++) this.particles.push({ x: x + (Math.random() - 0.5), y, vx: (Math.random() - 0.5) * 4, vy: 1 + Math.random() * 2, life: 0.4 + Math.random() * 0.3, color: 'rgba(200,205,230,0.7)', r: 0.12 + Math.random() * 0.15, smoke: true }); }
  burst(x, y, n, colors) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 10; this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.6, color: colors[i % colors.length], r: 0.1 + Math.random() * 0.14 }); } }
  rain() { for (let i = 0; i < 100; i++) this.particles.push({ x: this.h.x - 20 + Math.random() * 50, y: this.h.y + 20 + Math.random() * 15, vx: (Math.random() - 0.5) * 3, vy: -6 - Math.random() * 4, life: 4, color: ['#ffd23f', '#e0242b', '#2f6fd6', '#fff'][i % 4], r: 0.25, confetti: true }); }

  frame = (now) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; if (this.state.screen === 'menu') return; this.t += dt;
    const cv = this.canvasRef.current; if (!cv || !this.h) return;
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.timeScale = 1; }
    const paused = this.paused || this.state.phase === 'question' || this.state.phase === 'feedback' || this.state.phase === 'result';
    if (!paused) { const hh = 1 / 120; this.acc = (this.acc || 0) + dt * this.timeScale; let n = 0; while (this.acc >= hh && n++ < 8) { this.acc -= hh; this.step(hh); } }
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.smoke) p.r += dt * 0.3; else if (!p.confetti) { p.vy -= 22 * dt; p.vx *= 0.98; } }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const r of this.ropes) { r.t += dt; r.life -= dt; } this.ropes = this.ropes.filter(r => r.life > 0);
    for (const d of this.debris) { d.life -= dt; d.vy -= 22 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; } this.debris = this.debris.filter(d => d.life > 0);
    for (const gp of this.gaps) for (const a of gp.anchors) if (a.state === 'broken' && a.fall < 1) a.fall = Math.min(1, a.fall + dt);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    // camera: frame the gap while a question is open
    const h = this.h, gap = this.gaps[this.state.qi]; let tx, ty;
    if ((h.mode === 'edge' || this.state.phase === 'question' || this.state.phase === 'feedback') && gap && !this.demo) { tx = (gap.x0 + gap.x1) / 2 - 2; ty = Math.max(gap.fromTop, gap.toTop) + 9; }
    else { tx = h.x + 7 + Math.max(0, h.vx) * 0.45; ty = (h.mode === 'swing' && h.rope ? h.y * 0.6 + h.rope.ay * 0.4 : h.y) + 4; }
    const k = 1 - Math.pow(0.03, dt); this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    this.updatePose(dt);
    this.draw(cv); this.refreshTransient();
  };

  // ---------- pose ----------
  blankPose() { return { ang: 0, hr: [0.3, 0.2], hl: [-0.3, 0.2], fr: [0.2, -0.85], fl: [-0.2, -0.85], head: [0.05, 0.78] }; }
  updatePose(dt) {
    const h = this.h, p = this.pose, t = this.t, T = {}, spd = Math.abs(h.vx);
    if (h.mode === 'run') { const ph = t * (7 + spd * 0.6), s = Math.sin(ph), c = Math.cos(ph); T.ang = -0.18 - spd * 0.01; T.hr = [0.32 * c, 0.15 + 0.2 * s]; T.hl = [-0.32 * c, 0.15 - 0.2 * s]; T.fr = [0.45 * s, -0.85 + 0.22 * Math.max(0, c)]; T.fl = [-0.45 * s, -0.85 + 0.22 * Math.max(0, -c)]; T.head = [0.08, 0.78]; }
    else if (h.mode === 'edge' || h.mode === 'done') { const b = Math.sin(t * 2.5) * 0.03; T.ang = 0.12; T.hr = [0.45, -0.35 + b]; T.hl = [-0.3, -0.2 + b]; T.fr = [0.5, -0.55]; T.fl = [-0.35, -0.6]; T.head = [0.22, 0.55 + b]; }   // crouched, looking across the gap
    else if (h.mode === 'hop' || h.mode === 'air') { const k = Math.max(-1, Math.min(1, h.vy / 12)); T.ang = -0.1 + k * 0.25; if (h.vy > 2) { T.hr = [0.45, 0.55]; T.hl = [-0.35, 0.35]; T.fr = [0.5, -0.55]; T.fl = [-0.45, -0.75]; } else { T.hr = [0.7, 0.35]; T.hl = [-0.7, 0.35]; T.fr = [0.18, -0.85]; T.fl = [-0.18, -0.9]; } T.head = [0.05, 0.78]; }
    else if (h.mode === 'shoot') { T.ang = -0.2; T.hr = [0.45, 0.95]; T.hl = [-0.4, 0.2]; T.fr = [0.45, -0.6]; T.fl = [-0.3, -0.8]; T.head = [0.1, 0.78]; }
    else if (h.mode === 'swing') { const R = h.rope, ux = R.ax - h.x, uy = R.ay - h.y, L = Math.hypot(ux, uy) || 1; T.ang = Math.atan2(-ux / L, uy / L) * 0.85; const sw = Math.sin(t * 6) * 0.08; T.hr = [0.12, 1.0]; T.hl = [-0.35, 0.15]; T.fr = [-0.15 + sw, -0.75]; T.fl = [-0.45 - sw, -0.55]; T.head = [0.1, 0.78]; }
    else if (h.mode === 'cling') { const ph = t * 8; T.ang = 0.05; T.hr = [0.42, 0.5 + 0.25 * Math.sin(ph)]; T.hl = [0.42, 0.1 - 0.25 * Math.sin(ph)]; T.fr = [0.38, -0.55 + 0.2 * Math.cos(ph)]; T.fl = [0.38, -0.9 - 0.2 * Math.cos(ph)]; T.head = [0.15, 0.75]; }
    else if (h.mode === 'fall') { T.ang = p.ang + 6 * dt; const f = Math.sin(t * 22) * 0.2; T.hr = [0.6 + f, 0.6]; T.hl = [-0.6, 0.5 - f]; T.fr = [0.5, -0.6 + f]; T.fl = [-0.5 - f, -0.5]; T.head = [0, 0.78]; p.ang = T.ang; }
    else if (h.mode === 'yank') { T.ang = -0.5; T.hr = [-0.7, 0.6]; T.hl = [-0.2, 0.1]; T.fr = [0.5, -0.7]; T.fl = [0.7, -0.5]; T.head = [-0.1, 0.78]; }
    else { T.ang = 0; T.hr = [0.35, 0.65]; T.hl = [-0.35, 0.65]; T.fr = [0.2, -0.85]; T.fl = [-0.2, -0.85]; T.head = [0, 0.78]; }
    const k = 1 - Math.pow(0.0005, dt);
    if (h.mode !== 'fall') { let da = T.ang - p.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); p.ang += da * k; }
    for (const key of ['hr', 'hl', 'fr', 'fl', 'head']) { p[key][0] += (T[key][0] - p[key][0]) * k; p[key][1] += (T[key][1] - p[key][1]) * k; }
  }
  ik(r, tgt, l1, l2, bend) { const dx = tgt[0] - r[0], dy = tgt[1] - r[1]; const dd = Math.hypot(dx, dy) || 0.001; const d = Math.max(0.01, Math.min(dd, l1 + l2 - 0.001)); const a = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))); const ang = Math.atan2(dy, dx) + bend * a; return [[r[0] + Math.cos(ang) * l1, r[1] + Math.sin(ang) * l1], [r[0] + dx / dd * d, r[1] + dy / dd * d]]; }

  // ---------- drawing ----------
  draw(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ppm = Math.min(H / 36, W / 64), t = this.t, cam = this.cam, sx = this.shake > 0 ? (Math.random() - 0.5) * 14 * this.shake : 0, sy = this.shake > 0 ? (Math.random() - 0.5) * 8 * this.shake : 0;
    const X = x => (x - cam.x) * ppm + W * 0.45 + sx, Y = y => H * 0.5 - (y - cam.y) * ppm + sy;
    const sk = ctx.createLinearGradient(0, 0, 0, H); sk.addColorStop(0, '#090f22'); sk.addColorStop(0.55, '#26334f'); sk.addColorStop(1, '#d28b83'); ctx.fillStyle = sk; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) { const x = ((i * 173.3 - cam.x * ppm * 0.05) % W + W) % W, y = ((i * 97.7 + cam.y * ppm * 0.05) % (H * 0.7) + H) % H; ctx.globalAlpha = 0.3 + 0.4 * Math.sin(t * 2 + i); ctx.fillStyle = '#fff'; ctx.fillRect(x, y, i % 6 ? 2 : 3, i % 6 ? 2 : 3); } ctx.globalAlpha = 1;
    const mX = W * 0.82 - cam.x * ppm * 0.03, mY = H * 0.16 + cam.y * ppm * 0.05; const mg = ctx.createRadialGradient(mX, mY, 10, mX, mY, 140); mg.addColorStop(0, 'rgba(255,240,190,.35)'); mg.addColorStop(1, 'rgba(255,240,190,0)'); ctx.fillStyle = mg; ctx.fillRect(mX - 140, mY - 140, 280, 280); ctx.fillStyle = '#fff2c4'; ctx.beginPath(); ctx.arc(mX, mY, 36, 0, 7); ctx.fill();
    const rng = i => ((i * 9301 + 49297) % 233280) / 233280;
    [[0.12, '#161641', 70, 0.55], [0.3, '#1b1b4f', 46, 0.75]].forEach(([par, col, sz, hf], L) => { const off = cam.x * ppm * par, base = Y(0) + cam.y * ppm * (1 - par) * 0.2; for (let i = -2; i < W / sz + 3; i++) { const idx = Math.floor(off / (sz + 30)) + i, bx = idx * (sz + 30) - off, bh = 60 + rng(idx + L * 77) * H * hf; ctx.fillStyle = col; ctx.fillRect(bx, base - bh, sz, bh + 300); ctx.fillStyle = 'rgba(255,210,63,0.45)'; for (let r = 0; r < bh / 22 - 1; r++) for (let c = 0; c < sz / 16 - 1; c++) if (rng(idx * 31 + r * 7 + c + L) > 0.62) ctx.fillRect(bx + 5 + c * 16, base - bh + 8 + r * 22, 6, 9); } });
    // anchor spires
    for (const gp of this.gaps) for (const a of gp.anchors) this.drawSpire(ctx, a, gp, X, Y, ppm, H, rng);
    for (const b of this.blds) { const bx = X(b.x), bw = b.w * ppm; if (bx + bw < -60 || bx > W + 60) continue; this.drawBuilding(ctx, b, X, Y, ppm, W, H, rng); }
    // street
    const gy = Y(0); ctx.fillStyle = '#0a0b22'; ctx.fillRect(0, gy, W, H); ctx.fillStyle = '#2a2d5a'; ctx.fillRect(0, gy, W, 6 * ppm); ctx.fillStyle = 'rgba(255,210,63,0.6)'; for (let xx = Math.floor(cam.x / 8) * 8 - 40; xx < cam.x + 120; xx += 8) ctx.fillRect(X(xx), gy + 2.9 * ppm, 3 * ppm, 0.25 * ppm);
    for (let i = 0; i < 6; i++) { const cxw = ((t * (12 + i * 3) + i * 40) % 300) - 100 + cam.x; ctx.fillStyle = i % 2 ? '#ff5c5c' : '#fff6c9'; ctx.beginPath(); ctx.arc(X(i % 2 ? cam.x + 100 - (cxw - cam.x) : cxw), gy + (1.5 + (i % 3)) * ppm, 0.2 * ppm, 0, 7); ctx.fill(); }
    // checkpoint flag at gap edge
    const gap = this.gaps[this.state.qi]; if (gap && !this.demo && !this.won) { const fx = X(gap.x0 - 1), fy = Y(gap.fromTop); ctx.fillStyle = '#fff'; ctx.fillRect(fx - 2, fy - 3 * ppm, 3, 3 * ppm); ctx.fillStyle = '#7ee8fa'; ctx.beginPath(); ctx.moveTo(fx + 1, fy - 3 * ppm); ctx.lineTo(fx + 1 + 1.4 * ppm + Math.sin(t * 6) * 3, fy - 2.5 * ppm); ctx.lineTo(fx + 1, fy - 2 * ppm); ctx.closePath(); ctx.fill(); }
    for (const r of this.ropes) { ctx.globalAlpha = Math.min(1, r.life * 1.5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; const sag = r.t * 25 * ppm * 0.2; ctx.beginPath(); ctx.moveTo(X(r.ax), Y(r.ay)); ctx.quadraticCurveTo((X(r.ax) + X(r.hx)) / 2, (Y(r.ay) + Y(r.hy)) / 2 + sag, X(r.hx) + r.t * 8 * ppm * 0.4, Y(r.hy) + r.t * 30 * ppm * 0.3); ctx.stroke(); if (!r.loose) this.webSplat(ctx, X(r.ax), Y(r.ay), 0.5 * ppm); }
    ctx.globalAlpha = 1;
    for (const d of this.debris) { ctx.save(); ctx.globalAlpha = Math.min(1, d.life); ctx.translate(X(d.x), Y(d.y)); ctx.rotate(d.rot); ctx.fillStyle = '#4a4f8a'; ctx.fillRect(-1.2 * ppm, -0.6 * ppm, 2.4 * ppm, 1.2 * ppm); ctx.restore(); }
    this.drawHero(ctx, X, Y, ppm);
    for (const p of this.particles) { ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5)); ctx.fillStyle = p.color; if (p.confetti) { ctx.save(); ctx.translate(X(p.x), Y(p.y)); ctx.rotate(p.life * 3); ctx.fillRect(-0.3 * ppm, -0.15 * ppm, 0.6 * ppm, 0.3 * ppm); ctx.restore(); } else { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), p.r * ppm, 0, 7); ctx.fill(); } }
    ctx.globalAlpha = 1;
  }
  drawSpire(ctx, a, gp, X, Y, ppm, H, rng) {
    const ax = X(a.x); if (ax < -80 || ax > window.innerWidth + 80) return;
    const active = gp.q === this.state.qi && !this.demo && !this.won, fall = a.fall || 0, top = Y(a.y) + fall * fall * 30 * ppm;
    ctx.fillStyle = '#23255c'; ctx.fillRect(ax - 1.4 * ppm, Y(a.y) + (a.state === 'broken' ? 3 * ppm : 0), 2.8 * ppm, H); ctx.fillStyle = '#1a1c4a'; ctx.fillRect(ax + 0.7 * ppm, Y(a.y) + (a.state === 'broken' ? 3 * ppm : 0), 0.7 * ppm, H);
    ctx.fillStyle = 'rgba(255,210,63,0.35)'; for (let r = 2; r < 40; r++) { const yy = Y(a.y) + r * 1.6 * ppm; if (yy > H) break; if (rng(r * 13 + Math.floor(a.x * 10)) > 0.5) ctx.fillRect(ax - 1 * ppm, yy, 0.45 * ppm, 0.8 * ppm); if (rng(r * 17 + Math.floor(a.x * 10)) > 0.5) ctx.fillRect(ax - 0.1 * ppm, yy, 0.45 * ppm, 0.8 * ppm); }
    // anchor head: platform + letter badge
    ctx.save(); if (a.state === 'broken') { ctx.globalAlpha = 1 - fall; ctx.translate(ax, top); ctx.rotate(fall * 1.2); ctx.translate(-ax, -top); }
    ctx.fillStyle = '#0d1030'; ctx.fillRect(ax - 1.9 * ppm, top - 0.5 * ppm, 3.8 * ppm, 1 * ppm);
    ctx.fillStyle = a.state === 'good' ? '#5ed36a' : a.state === 'weak' || a.state === 'broken' ? '#e0242b' : '#4a4f8a'; ctx.fillRect(ax - 1.7 * ppm, top - 0.35 * ppm, 3.4 * ppm, 0.7 * ppm);
    if (active) {
      const col = this.BADGE[a.k], r = 1.1 * ppm, by = top - 2.2 * ppm;
      if (a.state === 'idle') { ctx.shadowColor = col; ctx.shadowBlur = 16 + Math.sin(this.t * 5 + a.k) * 6; }
      ctx.fillStyle = '#0d1030'; ctx.beginPath(); ctx.roundRect(ax - r - 3, by - r - 3, 2 * r + 6, 2 * r + 6, 0.4 * ppm); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = a.state === 'broken' ? '#6b7398' : col; ctx.beginPath(); ctx.roundRect(ax - r, by - r, 2 * r, 2 * r, 0.3 * ppm); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `${1.5 * ppm}px Bangers`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.LETTERS[a.k], ax, by + 1);
      // dotted web-line preview from hero to anchor while choosing
      if (this.state.phase === 'question' && a.state === 'idle' && !this.state.tried.includes(a.k)) { ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([3, 8]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(this.h.x), Y(this.h.y + 1.6)); ctx.lineTo(ax, top); ctx.stroke(); ctx.setLineDash([]); }
    }
    ctx.restore();
    ctx.fillStyle = '#0d1030'; ctx.fillRect(ax - 0.12 * ppm, top - 3.6 * ppm - (active ? 0.6 * ppm : 0), 0.24 * ppm, 1.2 * ppm); ctx.fillStyle = Math.sin(this.t * 4 + a.x) > 0 ? '#e0242b' : '#5a1020'; ctx.beginPath(); ctx.arc(ax, top - 3.7 * ppm - (active ? 0.6 * ppm : 0), 0.25 * ppm, 0, 7); ctx.fill();
  }
  drawBuilding(ctx, b, X, Y, ppm, W, H, rng) {
    const bx = X(b.x), bw = b.w * ppm, top = Y(b.top), isGoal = b.kind === 'goal';
    ctx.fillStyle = '#0d1030'; ctx.fillRect(bx - 4, top - 4, bw + 8, H);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, isGoal ? '#5a2a6e' : '#2b3070'); g.addColorStop(0.5, isGoal ? '#7a3a8e' : '#3a4090'); g.addColorStop(1, isGoal ? '#4a2260' : '#262a62'); ctx.fillStyle = g; ctx.fillRect(bx, top, bw, H);
    const cols = Math.floor(b.w / 2.2), rows = Math.floor(b.top / 2.6);
    for (let r = 0; r < rows; r++) { const wy = top + (0.9 + r * 2.6) * ppm; if (wy > H) break; for (let c = 0; c < cols; c++) { const lit = rng(b.seed + r * 31 + c * 7) > 0.45; ctx.fillStyle = lit ? (rng(b.seed + r + c) > 0.7 ? '#ffe9a8' : '#ffd23f') : '#141640'; ctx.fillRect(bx + (0.6 + c * 2.2) * ppm, wy, 1.2 * ppm, 1.5 * ppm); } }
    ctx.fillStyle = '#0d1030'; ctx.fillRect(bx - 4, top - 4, bw + 8, 0.35 * ppm + 4); ctx.fillStyle = '#4a4f8a'; ctx.fillRect(bx, top - 0.35 * ppm, bw, 0.35 * ppm);
    const s = rng(b.seed);
    if (b.hop) { const hx = X(b.hop); ctx.fillStyle = '#0d1030'; ctx.fillRect(hx - 1.3 * ppm, top - 1.6 * ppm, 2.6 * ppm, 1.6 * ppm); ctx.fillStyle = '#5a5f9a'; ctx.fillRect(hx - 1.1 * ppm, top - 1.4 * ppm, 2.2 * ppm, 1.4 * ppm); ctx.fillStyle = '#0d1030'; ctx.fillRect(hx - 0.8 * ppm, top - 1.1 * ppm, 1.6 * ppm, 0.3 * ppm); ctx.fillRect(hx - 0.8 * ppm, top - 0.6 * ppm, 1.6 * ppm, 0.3 * ppm); }
    if (s > 0.5 && b.w > 24) { const tx = bx + bw * 0.75; ctx.fillStyle = '#0d1030'; ctx.fillRect(tx - 0.1 * ppm, top - 3.2 * ppm, 2.4 * ppm, 3.2 * ppm); ctx.fillStyle = '#5a5f9a'; ctx.fillRect(tx, top - 3 * ppm, 2.2 * ppm, 2.2 * ppm); }
    if (isGoal) { const fx = X(this.goalX); ctx.fillStyle = '#ffd23f'; ctx.fillRect(fx - 0.15 * ppm, top - 6 * ppm, 0.3 * ppm, 6 * ppm); ctx.fillStyle = '#e0242b'; ctx.beginPath(); ctx.moveTo(fx + 0.15 * ppm, top - 6 * ppm); ctx.lineTo(fx + 3.4 * ppm + Math.sin(this.t * 6) * 4, top - 5 * ppm); ctx.lineTo(fx + 0.15 * ppm, top - 4 * ppm); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `${1.6 * ppm}px Bangers`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText('FINISH', fx, top - 6.6 * ppm); }
  }
  webSplat(ctx, x, y, r) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.stroke(); ctx.beginPath(); for (let ring = 1; ring <= 2; ring++) { const rr = r * ring / 2.4; for (let k = 0; k <= 8; k++) { const a = k * Math.PI / 4, px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } } ctx.stroke(); }
  drawHero(ctx, X, Y, ppm) {
    const h = this.h, p = this.pose, sq = h.squash > 0 ? 1 - Math.sin(h.squash / 0.2 * Math.PI) * 0.18 : 1, HS = 2.25;
    const hipX = X(h.x), hipY = Y(h.y + 0.95 * HS * sq);
    const rot = ([lx, ly]) => { const c = Math.cos(p.ang), s = Math.sin(p.ang); return [hipX + (lx * c - ly * s) * ppm * HS, hipY - (lx * s + ly * c) * ppm * HS * sq]; };
    if (h.rope) { const hand = rot(h.mode === 'yank' ? p.hl : p.hr); const ax = X(h.rope.ax), ay = Y(h.rope.ay); const k = h.mode === 'shoot' ? Math.min(1, h.rope.t / 0.12) : 1; const ex = hand[0] + (ax - hand[0]) * k, ey = hand[1] + (ay - hand[1]) * k; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); if (h.mode === 'swing' && h.rope.attachT < 0.35) { const segs = 14, wob = (0.35 - h.rope.attachT) * 22; for (let i = 1; i <= segs; i++) { const u = i / segs, nx = -(ey - hand[1]), ny = ex - hand[0], nl = Math.hypot(nx, ny) || 1; ctx.lineTo(hand[0] + (ex - hand[0]) * u + nx / nl * Math.sin(u * Math.PI * 3 + this.t * 40) * wob * (1 - u), hand[1] + (ey - hand[1]) * u + ny / nl * Math.sin(u * Math.PI * 3 + this.t * 40) * wob * (1 - u)); } } else ctx.lineTo(ex, ey); ctx.stroke(); if (k >= 1) this.webSplat(ctx, ax, ay, 0.55 * ppm); }
    const red = SUITS[suit].main, blue = SUITS[suit].dark, ink = '#080e20';
    const seg = (a, b, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w * ppm * HS; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
    const limb = (root, tgt, l1, l2, bend, c1, c2) => { const [k, e] = this.ik(root, tgt, l1, l2, bend); const R = rot(root), K = rot(k), E = rot(e); seg(R, K, 0.22, ink); seg(K, E, 0.22, ink); seg(R, K, 0.14, c1); seg(K, E, 0.14, c2); };
    const hipL = [-0.08, 0], hipR = [0.08, 0], sh = [0, 0.52];
    limb(hipL, p.fl, 0.45, 0.45, 1, blue, red); limb(sh, p.hl, 0.34, 0.34, -1, red, red);
    const T0 = rot([0, -0.05]), T1 = rot([0, 0.55]); seg(T0, T1, 0.5, ink); seg(T0, T1, 0.38, red); seg(rot([0, -0.05]), rot([0, 0.2]), 0.38, blue);
    ctx.save(); ctx.translate(...rot([0, 0.32])); ctx.rotate(-p.ang); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 0.22 * ppm * HS, Math.sin(a) * 0.22 * ppm * HS); } ctx.stroke(); ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(0, 0, 0.035 * ppm * HS, 0.07 * ppm * HS, 0, 0, 7); ctx.fill(); ctx.restore();
    limb(hipR, p.fr, 0.45, 0.45, 1, blue, red); limb(sh, p.hr, 0.34, 0.34, -1, red, red);
    const Hd = rot(p.head); ctx.save(); ctx.translate(Hd[0], Hd[1]); ctx.rotate(-p.ang); const r = 0.265 * ppm * HS;
    ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 1.3, 0, 0, 7); ctx.fill(); ctx.fillStyle = red; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.15, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 0.8; ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; ctx.moveTo(0, -r * 0.3); ctx.lineTo(Math.cos(a) * r * 1.1, -r * 0.3 + Math.sin(a) * r * 1.2); } ctx.stroke(); ctx.beginPath(); ctx.ellipse(0, -r * 0.3, r * 0.55, r * 0.6, 0, 0, 7); ctx.stroke();
    for (const e of [-1, 1]) { ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(e * r * 0.1, r * 0.05); ctx.lineTo(e * r * 0.85, -r * 0.55); ctx.lineTo(e * r * 0.75, r * 0.2); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(e * r * 0.2, r * 0.05); ctx.lineTo(e * r * 0.75, -r * 0.45); ctx.lineTo(e * r * 0.66, r * 0.12); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }


}
