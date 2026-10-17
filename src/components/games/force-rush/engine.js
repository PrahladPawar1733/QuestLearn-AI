/* eslint-disable */
// @ts-nocheck
/**
 * Force Rush engine — ported VERBATIM from the author's original
 * "Force Rush.html".
 *
 * Everything that makes the game look and feel the way it does is unchanged:
 * the two-stop night gradient sky (#1b1c26 -> #2b2434), the parallax tower
 * blocks, the sampled terrain with its hot-pink road line, the warning sign
 * on its post with the diamond and the "!", the checkpoint flag and pad, the
 * five obstacles (lock gate, ramp over the pit, drawbridge, spike strip,
 * closing door with boost pads), the car silhouette with its pink stripe, the
 * 240Hz fixed-step physics, the particle bursts and smoke puffs, the camera
 * lerp, the verdict banner and the explanation card.
 *
 * Six things were changed, each marked `PORT:` below:
 *   1. The template host was removed. The canvas, the chapter bank and two
 *      callbacks arrive through the constructor, `setState` merges and pushes
 *      at the HUD, and the two per-frame DOM ref writes (speed, timer) became
 *      plain fields the host republishes.
 *   2. `chapters()` returns the chapter injected by the adapter instead of
 *      the hard-coded Physics bank.
 *   3. `answer(i)` is split in two. `choose(i)` only RECORDS the choice and
 *      asks the host; `resolveChoice(ok)` applies the verdict the SERVER
 *      produced. A game in this app may never hold the answer key.
 *   4. React lifecycle hooks became plain `mount()` / `unmount()`.
 *   5. The `showHintOnWrong` editor prop became a constructor option.
 *   6. `renderVals()` lost the chapter-chooser groups and the three DOM refs:
 *      the host owns that screen. The author's tier labels, tier colours and
 *      star glyphs are kept for the chapter in play.
 *
 * It is deliberately excluded from type-checking and linting: it is ported
 * code, and reformatting it would make future diffs against the original
 * impossible.
 */

export class ForceRushEngine {
  /** PORT 1: the template host is gone. */
  constructor(opts) {
    this.canvasRef = { current: opts.canvas };
    this._onState = opts.onState || (() => {});
    this._onChoose = opts.onChoose || (() => {});
    this._chapters = opts.chapters || [];
    /** PORT 5: was the `showHintOnWrong` editor prop. */
    this._showHintOnWrong = opts.showHintOnWrong !== false;
    this._pending = null;
  }
  /** PORT 1: merge, then push the new state at the HUD. */
  setState(v) {
    this.state = { ...this.state, ...(typeof v === 'function' ? v(this.state) : v) };
    this._onState(this.state);
  }

  state = { screen: 'menu', ci: 0, oi: 0, phase: 'drive', hearts: 3, verdict: null, card: null, progress: {} };
  /** PORT 1: `canvasRef` is a plain holder (the constructor fills it), and the
   * speed and timer readouts the original wrote into the DOM every frame are
   * fields now, because React owns that text. */
  canvasRef = { current: null }; speed = '0.0'; qLeft = 0;

  // ---------- content: one reusable format ----------
  // obstacle types: gate (lock gate), jump (ramp over pit), bridge (drawbridge), trap (spike strip), door (closing door + boost pads)
  chapters() {
    /** PORT 2: the original's hard-coded Physics bank is replaced by the
     * student's own chapter, injected in exactly the same shape:
     * { cls, title, tier, obs: [{ type, question, options, correct, explain }] } */
    return this._chapters;
  }

  /** PORT 4 */
  mount() {
    this.C = this.chapters(); this.particles = []; this.cam = { x: 0, y: 0 }; this.timeScale = 1;
    let progress = {}; try { progress = JSON.parse(localStorage.getItem('forceRush.progress') || '{}'); } catch (e) {}
    this.setState({ progress });
    this.loadChapter(0, false);
    this.last = performance.now(); this.raf = requestAnimationFrame(this.frame);
  }
  /** PORT 4 */
  unmount() { cancelAnimationFrame(this.raf); }

  // ---------- world ----------
  loadChapter(ci, play) {
    const ch = this.C[ci];
    this.obs = ch.obs.map((o, i) => ({ ...o, pad: 22 + i * 62, x: 22 + i * 62 + 18, solved: false, doorH: 6, ang: 1.15, spikeH: 0, bumped: false }));
    this.finish = 22 + ch.obs.length * 62 - 8;
    this.car = { x: 0, y: 0, s: 0, angle: 0, vx: 0, vy: 0, angVel: 0, air: false, wobble: 0 };
    this.sim = { target: 10, t: 0, ok: null, respawn: false, done: false, timer: 0 };
    this.particles = []; this.timeScale = 1; this.cam.x = 18; this.cam.y = 0;
    this.setState({ ci, oi: 0, phase: 'drive', hearts: 3, verdict: null, card: null, wrongs: 0, screen: play ? 'play' : this.state.screen });
  }

  groundAt(x) {
    for (const ob of this.obs) {
      if (ob.type === 'jump') {
        if (x >= ob.x - 8 && x < ob.x) return 3 * (x - ob.x + 8) / 8;
        if (x >= ob.x && x < ob.x + 14) return ob.solved || ob.plank ? 3 : null;
        if (x >= ob.x + 14 && x <= ob.x + 20) return 3 * (1 - (x - ob.x - 14) / 6);
      }
      if (ob.type === 'bridge' && x >= ob.x && x < ob.x + 10) {
        const L = 10 * Math.cos(ob.ang);
        return x - ob.x <= L ? Math.tan(ob.ang) * (x - ob.x) : null;
      }
    }
    return 0;
  }
  slopeAt(x) { const r = this.groundAt(x - 1.2), f = this.groundAt(x + 1.2); return r == null || f == null ? 0 : Math.atan2(f - r, 2.4); }

  /**
   * PORT 3: the original decided correctness right here (`i === ob.correct`).
   * A game in this app may never hold the answer key, so this half only
   * records the pending choice and asks the host, which scores it on the
   * server and calls `resolveChoice` with the verdict.
   */
  choose(i) {
    if (this.state.phase !== 'question' || this._pending != null) return;
    this._pending = i;
    this._onChoose(i);
  }
  /** PORT 3: the timer running out is a miss the engine can call on its own —
   * no answer was given, so no answer key is needed to know that. */
  timeout() { if (this.state.phase !== 'question') return; this._pending = -1; this.resolveChoice(false); }
  /** PORT 3: the rest of the original `answer(i)`, unchanged apart from `ok`
   * arriving from the server instead of being computed from `ob.correct`. */
  resolveChoice(ok) {
    const i = this._pending == null ? -1 : this._pending; this._pending = null;
    const ob = this.obs[this.state.oi]; if (!ob) return;
    this.sim.ok = ok; this.sim.t = 0; this.sim.chosen = i; this.timeScale = 1; ob.bumped = false;
    if (!ok && i >= 0) { ob.wrong = ob.wrong || {}; ob.wrong[i] = true; }
    this.setState({ phase: 'resolve', verdict: { ok, title: ok ? 'CORRECT' : 'WRONG', sub: i < 0 ? 'Time ran out' : (ok ? ob.options[i] : 'You chose ' + ob.options[i]) } });
  }

  burst(x, y, n, color, up) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 8; this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + (up || 2), life: 0.6 + Math.random() * 0.6, color, r: 0.12 + Math.random() * 0.25 }); }
  }
  puff(x, y, color, vx) { this.particles.push({ x, y, vx: (vx || 0) + (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, life: 0.5 + Math.random() * 0.4, color, r: 0.25 + Math.random() * 0.3, smoke: true }); }

  bump(c, ob, strength) {
    if (ob.bumped) return; ob.bumped = true;
    this.burst(c.x + 2, c.y + 0.8, 30, '#ffd166', 3); this.burst(c.x + 2, c.y + 0.8, 14, '#ff3fa0', 3);
    c.s = -(strength || 5); c.wobble = 1;
  }

  step(h) {
    const c = this.car, s = this.sim, ob = this.obs[this.state.oi], G = 10, ph = this.state.phase;
    if (ph === 'drive' && ob && c.x >= ob.pad && !c.air) { this.timeScale = 0; s.qTime = this.C[this.state.ci].tier === 3 ? 12 : this.C[this.state.ci].tier === 2 ? 20 : 0; this.setState({ phase: 'question' }); return; }
    if (!ob && ph === 'drive' && c.x >= this.finish && !s.done) { s.done = true; s.target = 0; s.timer = 0.8; return; }

    // wrong answer: car never moves. Engine stalls at the checkpoint, obstacle locks, then the card.
    if (ph === 'resolve' && s.ok === false) {
      s.t += h; s.target = 0; c.s = 0; c.wobble = Math.max(c.wobble, 0.6);
      if (Math.random() < 0.25) this.puff(c.x + 1.6, c.y + 1.2, 'rgba(120,116,130,0.7)', 0.5);
      if (s.t < 0.05) { this.burst(ob.x + (ob.type === 'door' ? 30 : 2), 2.5, 16, '#ff3fa0', 2); ob.result = false; ob.locked = true; }
      if (s.t > 1.4) { this.endObstacle(false); }
      return;
    }
    // obstacle animation + rules
    if (ph === 'resolve') {
      s.t += h;
      const r = this.resolve(ob, c, s, h);
      if (r) { this.endObstacle(r === 'ok'); return; }
    }

    // motion
    if (c.air) {
      c.vy -= G * h; c.x += c.vx * h; c.y += c.vy * h; c.angle += c.angVel * h;
      const gy = this.groundAt(c.x);
      if (gy != null && c.y <= gy) { c.air = false; c.y = gy; c.angle = this.slopeAt(c.x); c.s = Math.max(4, c.vx); c.angVel = 0; for (let i = 0; i < 10; i++) this.puff(c.x + (Math.random() - 0.5) * 3, gy, '#8a8797', c.s * 0.2); }
    } else {
      const sl = this.slopeAt(c.x);
      const dv = s.target - c.s; c.s += Math.max(-10 * h, Math.min(14 * h, dv));
      const nx = c.x + c.s * Math.cos(sl) * h, ny = c.y + c.s * Math.sin(sl) * h;
      const gy = this.groundAt(nx);
      c.x = nx;
      if (gy == null || ny > gy + 0.15) { c.air = true; c.vx = c.s * Math.cos(sl); c.vy = c.s * Math.sin(sl); c.y = ny; c.angVel = -0.25; }
      else { c.y = gy; c.angle += (this.slopeAt(nx) - c.angle) * Math.min(1, 25 * h); if (Math.abs(c.s) > 6 && Math.random() < 0.5) this.puff(c.x - 1.5, gy, 'rgba(150,146,160,0.5)', -c.s * 0.15); }
    }
    c.wobble = Math.max(0, c.wobble - h * 1.2);
  }

  // returns 'ok' | 'fail' | null
  resolve(ob, c, s, h) {
    const ok = s.ok, t = s.t;
    switch (ob.type) {
      case 'gate':
        s.target = 12;
        if (ok) { ob.doorH = Math.max(0, ob.doorH - 9 * h); if (c.x > ob.x + 6) return 'ok'; }
        else { if (c.x + 2.1 >= ob.x) { this.bump(c, ob, 6); } if (ob.bumped) { if (c.s < 0 && c.x < ob.x - 6) s.target = 0; else if (!ob.hold) s.target = -4; if (t > 0 && c.s <= 0.2 && c.x < ob.x - 5) { ob.hold = (ob.hold || 0) + h; if (ob.hold > 0.7) return 'fail'; } } }
        return null;
      case 'jump':
        if (!ob.launched) s.target = ok ? 17 : 9.5;
        if (c.air && !ob.launched) { ob.launched = true; if (!ok) c.angVel = -1.2; }
        if (ok && ob.launched && !c.air && c.x > ob.x + 14) return 'ok';
        if (!ok && c.y < -9) { s.respawn = true; return 'fail'; }
        return null;
      case 'bridge':
        s.target = 8;
        if (ok) { ob.ang = Math.max(0, ob.ang - 1.3 * h); if (c.x > ob.x + 11) return 'ok'; }
        else {
          ob.ang = Math.max(0.62, ob.ang - 1.3 * h);
          if (c.x >= ob.x + 2.8 && !ob.bumped) { this.bump(c, ob, 5); ob.slipT = 0; }
          if (ob.bumped) { s.target = c.x > ob.x - 4 ? -5 : 0; ob.slipT += h; if (ob.slipT > 1.4) return 'fail'; }
        }
        return null;
      case 'trap':
        s.target = ob.bumped ? 3 : 11;
        if (ok) { ob.spikeH = Math.max(0, ob.spikeH - 3 * h); if (c.x > ob.x + 9) return 'ok'; }
        else { if (c.x + 1.3 >= ob.x && c.x < ob.x + 7) { if (!ob.bumped) { ob.bumped = true; c.wobble = 1.4; } if (Math.random() < 0.6) this.burst(c.x - 1.3, c.y + 0.1, 2, '#ffd166', 1); } if (c.x > ob.x + 9) return 'fail'; }
        return null;
      case 'door':
        ob.doorH = Math.min(6, 6 * (t / 2.2));
        s.target = ok ? 30 : 9;
        if (ok && c.x > ob.x && c.x < ob.x + 12 && Math.random() < 0.7) this.burst(c.x - 2, c.y + 0.3, 2, '#7dff9a', 1);
        if (c.x > ob.x + 30 + 1) { s.target = 10; if (c.x > ob.x + 36) return 'ok'; }
        if (!ok && c.x + 2.1 >= ob.x + 30 && ob.doorH > 4) { this.bump(c, ob, 6); }
        if (ob.bumped) { s.target = c.x < ob.x + 24 ? 0 : -4; ob.hold = (ob.hold || 0) + (c.s <= 0.2 ? h : 0); if (ob.hold > 0.7) return 'fail'; }
        return null;
    }
    return null;
  }

  endObstacle(ok) {
    const ob = this.obs[this.state.oi], s = this.sim;
    ob.solved = true; ob.result = ok; s.target = 10;
    if (ok) {
      ob.doorH = ob.type === 'door' ? 6 : 0; ob.ang = 0; ob.spikeH = 0;
      this.burst(ob.pad, 6, 24, '#7dff9a', 4);
      this.timeScale = 0;
      this.setState({ phase: 'card', verdict: null, card: { color: '#7dff9a', title: 'CORRECT', text: 'Checkpoint reached. Here is the working:', explain: ob.explain, button: 'DRIVE ON', pass: true } });
    } else {
      const hearts = this.state.hearts - 1, wrongs = (this.state.wrongs || 0) + 1;
      this.timeScale = 0;
      const dead = hearts <= 0;
      this.setState({ hearts, wrongs, phase: 'card', verdict: null, card: {
        color: '#ff3fa0', title: dead ? 'OUT OF HEALTH' : 'WRONG ANSWER',
        text: dead ? 'The car can’t take another hit. Restart the chapter and try again.' : this.consequence(ob) + ' The car goes back to the checkpoint. Try the question again.',
        explain: dead || !this._showHintOnWrong ? '' : this.hintFor(ob) /* PORT 5 */, button: dead ? 'RESTART CHAPTER' : 'TRY AGAIN', dead } });
    }
  }
  hintFor(ob) { const parts = ob.explain.split('\n')[0].split('='); return 'Hint: ' + (parts.length > 1 ? parts.slice(0, 2).join('=').trim() : parts[0].trim()); }
  consequence(ob) {
    return { gate: 'The lock gate stays shut. The engine stalled.', jump: 'The engine didn’t get the power for the jump. The car won’t go.', bridge: 'The drawbridge stays up. The engine stalled.', trap: 'The spike strip stays armed. The car won’t go.', door: 'The boost pads stay dead. The door won’t open for you.' }[ob.type];
  }
  continueAfterFail() {
    const ob = this.obs[this.state.oi], c = this.car, s = this.sim;
    if (this.state.card?.dead) { this.loadChapter(this.state.ci, true); return; }
    // reset the obstacle and put the car back at the checkpoint; ask the same question again
    ob.locked = false; ob.solved = false; ob.result = undefined; ob.doorH = ob.type === 'door' ? 0 : 6; ob.ang = 1.15; ob.spikeH = 0; ob.bumped = false; ob.hold = 0; ob.launched = false; ob.slipT = 0;
    ob.wrong = ob.wrong || {}; if (s.chosen >= 0) ob.wrong[s.chosen] = true;
    c.x = ob.pad - 0.5; c.y = this.groundAt(ob.pad) || 0; c.air = false; c.vx = c.vy = 0; c.angle = 0; c.angVel = 0; c.s = 0; s.respawn = false;
    s.target = 0; s.t = 0; s.ok = null; this.timeScale = 0;
    s.qTime = this.C[this.state.ci].tier === 3 ? 12 : this.C[this.state.ci].tier === 2 ? 20 : 0;
    this.setState({ phase: 'question', card: null });
  }
  finishChapter() {
    const ci = this.state.ci, wrongs = this.state.wrongs || 0, stars = Math.max(1, 3 - wrongs);
    const progress = { ...this.state.progress, [ci]: Math.max(this.state.progress[ci] || 0, stars) };
    try { localStorage.setItem('forceRush.progress', JSON.stringify(progress)); } catch (e) {}
    this.timeScale = 0;
    this.setState({ progress, phase: 'card', card: { color: '#7dff9a', title: 'CHAPTER CLEARED', text: `${this.C[ci].title} complete with ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} — ${wrongs === 0 ? 'no wrong answers.' : wrongs + (wrongs === 1 ? ' wrong answer.' : ' wrong answers.')}`, explain: '', button: ci < this.C.length - 1 ? 'NEXT CHAPTER' : 'BACK TO CHAPTERS', next: ci < this.C.length - 1 } });
  }

  frame = (now) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const cv = this.canvasRef.current; if (!cv) return;
    const { screen, phase } = this.state;
    if (screen === 'play') {
      if (phase === 'question' && this.sim.qTime > 0) { this.sim.qTime -= dt; this.qLeft = Math.max(0, Math.ceil(this.sim.qTime)); /* PORT 1 */ if (this.sim.qTime <= 0) { this.sim.qTime = 0; this.timeout(); } } /* PORT 3 */
      if (phase !== 'card') {
        const h = 1 / 240; this.acc = (this.acc || 0) + dt * this.timeScale;
        while (this.acc >= h) { this.acc -= h; this.step(h); }
        if (this.sim.done && this.sim.timer > 0) { this.sim.timer -= dt; if (this.sim.timer <= 0) this.finishChapter(); }
      }
    } else { this.car.x += 6 * dt; this.sim.target = 6; if (this.car.x > 20) this.car.x = -20; this.car.y = 0; this.car.air = false; }
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (!p.smoke) p.vy -= 10 * dt; else p.r += dt * 0.6; }
    this.particles = this.particles.filter(p => p.life > 0);
    /* PORT 1 */ { const c = this.car; this.speed = (c.air ? Math.hypot(c.vx, c.vy) : Math.abs(c.s)).toFixed(1); }
    this.draw(cv, dt);
  };

  // ---------- drawing ----------
  draw(cv, dt) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c = this.car, ppm = Math.max(H / 34, W / 80);
    const tx = c.x + 14, ty = Math.max(0, c.y) * 0.7 + 1.5, k = 1 - Math.pow(0.001, dt);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
    const ox = W * 0.4 - this.cam.x * ppm, oy = H * 0.7 + this.cam.y * ppm;
    const X = wx => ox + wx * ppm, Y = wy => oy - wy * ppm;

    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1b1c26'); g.addColorStop(1, '#2b2434');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#20212c';
    for (let i = -2; i < 16; i++) { const bx = i * 140 - (this.cam.x * ppm * 0.25) % 140, bh = 60 + ((i * 37) % 5) * 28; ctx.fillRect(bx, H * 0.7 - bh + this.cam.y * ppm * 0.2, 90, bh + 400); }

    // terrain (sampled)
    const x0 = this.cam.x - W / ppm, x1 = this.cam.x + W / ppm, stepW = 0.5;
    let path = null;
    const flush = () => { if (!path) return; ctx.lineTo(X(path.end), H + 50); ctx.lineTo(X(path.start), H + 50); ctx.closePath(); ctx.fillStyle = '#2e2f3c'; ctx.fill(); ctx.beginPath(); for (let i = 0; i < path.pts.length; i++) { const p = path.pts[i]; i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])); } ctx.strokeStyle = '#ff3fa0'; ctx.lineWidth = 4; ctx.stroke(); path = null; };
    for (let x = Math.floor(x0); x <= x1; x += stepW) {
      const y = this.groundAt(x);
      if (y == null) { flush(); continue; }
      if (!path) { path = { start: x, end: x, pts: [] }; ctx.beginPath(); ctx.moveTo(X(x), Y(y)); }
      else ctx.lineTo(X(x), Y(y));
      path.end = x; path.pts.push([x, y]);
    }
    flush();

    // pit hazards, obstacles, signs, checkpoints
    for (const ob of this.obs) this.drawObstacle(ctx, ob, X, Y, ppm, H);
    // finish
    const fx = X(this.finish), fy = Y(0) - 7 * ppm * 0.8, cs = ppm * 0.6;
    ctx.fillStyle = '#f4f2f5'; ctx.fillRect(fx, fy, 3, 7 * ppm * 0.8);
    for (let r = 0; r < 2; r++) for (let q = 0; q < 4; q++) { ctx.fillStyle = (r + q) % 2 ? '#f4f2f5' : '#15161c'; ctx.fillRect(fx + 3 + q * cs, fy + r * cs, cs, cs); }

    for (const q of this.particles) { ctx.globalAlpha = Math.max(0, Math.min(1, q.life)); ctx.fillStyle = q.color; ctx.beginPath(); ctx.arc(X(q.x), Y(q.y), q.r * ppm, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    const wob = c.wobble > 0 ? Math.sin(performance.now() / 30) * 0.08 * c.wobble : 0;
    this.drawCar(ctx, X(c.x), Y(c.y) + (c.wobble > 0 ? Math.abs(Math.sin(performance.now() / 40)) * -4 * c.wobble : 0), -c.angle + wob, ppm);
  }

  drawObstacle(ctx, ob, X, Y, ppm, H) {
    const solved = ob.solved, col = ob.result === false ? '#ff3fa0' : '#7dff9a';
    // checkpoint flag at pad
    const px = X(ob.pad), gy = Y(this.groundAt(ob.pad) ?? 0);
    if (ob.locked) { ctx.fillStyle = 'rgba(255,63,160,0.12)'; ctx.fillRect(X(ob.x - 1), 0, (ob.type === 'door' ? 32 : ob.type === 'jump' ? 16 : 12) * ppm, H); }
    ctx.fillStyle = '#9a97a3'; ctx.fillRect(px, gy - 5 * ppm, 3, 5 * ppm);
    ctx.fillStyle = solved ? col : '#3a3b48'; ctx.beginPath(); ctx.moveTo(px + 3, gy - 5 * ppm); ctx.lineTo(px + 3 + 2.2 * ppm, gy - 4.4 * ppm); ctx.lineTo(px + 3, gy - 3.8 * ppm); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,63,160,0.25)'; ctx.fillRect(X(ob.pad - 2), gy - 4, 4 * ppm, 4);
    // warning sign
    const sx = X(ob.x - 9), sy = Y(0);
    ctx.fillStyle = '#6b6772'; ctx.fillRect(sx - 2, sy - 6.5 * ppm, 4, 6.5 * ppm);
    ctx.save(); ctx.translate(sx, sy - 7.6 * ppm); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-1.1 * ppm, -1.1 * ppm, 2.2 * ppm, 2.2 * ppm);
    ctx.fillStyle = '#15161c'; ctx.fillRect(-0.9 * ppm, -0.9 * ppm, 1.8 * ppm, 1.8 * ppm);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(-0.75 * ppm, -0.75 * ppm, 1.5 * ppm, 1.5 * ppm); ctx.restore();
    ctx.fillStyle = '#15161c'; ctx.font = `bold ${ppm * 1.2}px "Archivo Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', sx, sy - 7.55 * ppm);
    ctx.fillStyle = '#ffd166'; ctx.font = `600 ${Math.max(10, ppm * 0.62)}px "Chakra Petch", sans-serif`;
    ctx.fillText({ gate: 'LOCK GATE', jump: 'JUMP', bridge: 'DRAWBRIDGE', trap: 'SPIKE STRIP', door: 'CLOSING DOOR' }[ob.type], sx, sy - 5.6 * ppm);
    ctx.fillText('AHEAD', sx, sy - 4.9 * ppm);

    if (ob.type === 'gate' || ob.type === 'door') {
      const gx = X(ob.type === 'gate' ? ob.x : ob.x + 30), hpx = ob.doorH * ppm;
      ctx.fillStyle = '#3a3b48'; ctx.fillRect(gx - 0.4 * ppm, Y(0) - 7 * ppm, 1.6 * ppm, 0.6 * ppm);
      ctx.fillStyle = ob.result === false ? '#ff3fa0' : (ob.result ? '#7dff9a' : '#ffd166'); ctx.fillRect(gx, Y(0) - hpx, 0.8 * ppm, hpx);
      ctx.fillStyle = '#15161c'; for (let i = 0; i < 3; i++) ctx.fillRect(gx, Y(0) - hpx + hpx * (i * 2 + 1) / 6, 0.8 * ppm, hpx / 14);
      if (ob.type === 'door') { for (let i = 0; i < 4; i++) { ctx.fillStyle = ob.result === false ? '#5a2440' : '#7dff9a'; const bx = X(ob.x + i * 3); ctx.beginPath(); ctx.moveTo(bx, Y(0) - 3); ctx.lineTo(bx + 1.6 * ppm, Y(0) - 3); ctx.lineTo(bx + 2.4 * ppm, Y(0) - 0.5 * ppm); ctx.lineTo(bx + 0.8 * ppm, Y(0) - 0.5 * ppm); ctx.closePath(); ctx.fill(); } }
    }
    if (ob.type === 'jump') {
      ctx.fillStyle = '#0c0c10'; ctx.fillRect(X(ob.x), Y(3), 14 * ppm, H);
      for (let i = 0; i < 7; i++) { ctx.fillStyle = '#5a2440'; ctx.beginPath(); ctx.moveTo(X(ob.x + i * 2), Y(-6)); ctx.lineTo(X(ob.x + i * 2 + 1), Y(-4)); ctx.lineTo(X(ob.x + i * 2 + 2), Y(-6)); ctx.closePath(); ctx.fill(); }
      if (ob.plank) { ctx.fillStyle = '#7fc7ff'; ctx.fillRect(X(ob.x), Y(3), 14 * ppm, 0.5 * ppm); }
      // arrow
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; const ax = X(ob.x - 4), ay = Y(1.4 + 3 * 4 / 8) - 2 * ppm; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 1.5 * ppm, ay - 0.8 * ppm); ctx.lineTo(ax + 1.5 * ppm, ay - 0.3 * ppm); ctx.lineTo(ax + 3 * ppm, ay - 0.3 * ppm); ctx.lineTo(ax + 3 * ppm, ay + 0.3 * ppm); ctx.lineTo(ax + 1.5 * ppm, ay + 0.3 * ppm); ctx.lineTo(ax + 1.5 * ppm, ay + 0.8 * ppm); ctx.closePath(); ctx.fill();
    }
    if (ob.type === 'bridge') {
      ctx.fillStyle = '#0c0c10'; ctx.fillRect(X(ob.x), Y(0), 10 * ppm, H);
      ctx.fillStyle = '#1e3a6b'; ctx.fillRect(X(ob.x), Y(-3), 10 * ppm, H);
      ctx.save(); ctx.translate(X(ob.x), Y(0)); ctx.rotate(-ob.ang); ctx.fillStyle = ob.result === false ? '#ff3fa0' : '#7fc7ff'; ctx.fillRect(0, -0.5 * ppm, 10 * ppm, 0.5 * ppm); ctx.restore();
      ctx.fillStyle = '#3a3b48'; ctx.fillRect(X(ob.x + 10) - 4, Y(0) - 8 * ppm, 8, 8 * ppm);
    }
    if (ob.type === 'trap') {
      const hpx = (1.2 - ob.spikeH) * ppm; ctx.fillStyle = '#3a3b48'; ctx.fillRect(X(ob.x), Y(0) - 3, 7 * ppm, 3 + 0.3 * ppm);
      if (!ob.result || ob.result === false) { ctx.fillStyle = ob.result === false ? '#ff3fa0' : '#d8d5e0'; for (let i = 0; i < 9; i++) { const bx = X(ob.x + 0.4 + i * 0.75); ctx.beginPath(); ctx.moveTo(bx, Y(0)); ctx.lineTo(bx + 0.3 * ppm, Y(0) - hpx); ctx.lineTo(bx + 0.6 * ppm, Y(0)); ctx.closePath(); ctx.fill(); } }
    }
  }

  drawCar(ctx, x, y, rot, u) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = '#f4f2f5'; ctx.beginPath();
    ctx.moveTo(-2 * u, -0.5 * u); ctx.lineTo(2 * u, -0.5 * u); ctx.lineTo(1.9 * u, -1.1 * u); ctx.lineTo(0.9 * u, -1.2 * u); ctx.lineTo(0.4 * u, -1.8 * u); ctx.lineTo(-1.2 * u, -1.8 * u); ctx.lineTo(-1.9 * u, -1.1 * u); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ff3fa0'; ctx.fillRect(-2 * u, -0.85 * u, 4 * u, 0.18 * u);
    ctx.fillStyle = '#1b1c26'; ctx.beginPath(); ctx.moveTo(-1.05 * u, -1.2 * u); ctx.lineTo(0.3 * u, -1.2 * u); ctx.lineTo(-0.05 * u, -1.62 * u); ctx.lineTo(-0.85 * u, -1.62 * u); ctx.closePath(); ctx.fill();
    for (const wx of [-1.3, 1.3]) { ctx.fillStyle = '#15161c'; ctx.beginPath(); ctx.arc(wx * u, -0.05 * u, 0.55 * u, 0, 7); ctx.fill(); ctx.fillStyle = '#9a97a3'; ctx.beginPath(); ctx.arc(wx * u, -0.05 * u, 0.25 * u, 0, 7); ctx.fill(); }
    ctx.restore();
  }

  renderVals() {
    const { screen, ci, oi, phase, hearts, verdict, card, progress } = this.state;
    const C = this.C || this.chapters(), ch = C[ci], ob = ch.obs[Math.min(oi, ch.obs.length - 1)];
    return {
      /** PORT 6: the chapter chooser is the host's own screen, so the menu
       * groups are gone and the three DOM refs with them. The author's tier
       * labels, tier colours and star glyphs are kept for the chapter in play,
       * and the speed and timer readouts come through as values. */
      speed: this.speed, qLeft: this.qLeft,
      tierLabel: ['EASY', 'TIMED · 20s', 'TIMED · 12s'][ch.tier - 1], tierColor: ['#7dff9a', '#ffd166', '#ff3fa0'][ch.tier - 1],
      stars: progress[ci] ? '★'.repeat(progress[ci]) + '☆'.repeat(3 - progress[ci]) : '☆☆☆',
      playing: screen === 'play', showMenu: screen === 'menu',
      classLabel: ch.cls, chapterTitle: ch.title,
      dots: ch.obs.map((o, i) => ({ color: (this.obs && this.obs[i]?.solved) ? (this.obs[i].result ? '#7dff9a' : '#ff3fa0') : i === oi ? '#ffd166' : '#3a3b48' })),
      hearts: [0, 1, 2].map(i => ({ color: i < hearts ? '#ff3fa0' : '#3a3b48' })),
      obstacleWarning: { gate: 'LOCK GATE AHEAD · THE RIGHT ANSWER OPENS IT', jump: 'JUMP AHEAD · THE RIGHT ANSWER POWERS THE ENGINE', bridge: 'DRAWBRIDGE AHEAD · THE RIGHT ANSWER LOWERS IT', trap: 'SPIKE STRIP AHEAD · THE RIGHT ANSWER RETRACTS IT', door: 'CLOSING DOOR AHEAD · THE RIGHT ANSWER GIVES YOU BOOST' }[ob.type],
      timed: ch.tier > 1, question: ob.question,
      options: ob.options.map((label, i) => { const w = !!(this.obs && this.obs[oi]?.wrong?.[i]); return { label, pick: w ? () => {} : () => this.choose(i) /* PORT 3 */, bg: w ? '#1a1b22' : '#2a2b36', fg: w ? '#5a5866' : '#fff', cursor: w ? 'not-allowed' : 'pointer', deco: w ? 'line-through' : 'none' }; }),
      showQuestion: screen === 'play' && phase === 'question',
      showVerdict: screen === 'play' && phase === 'resolve' && !!verdict,
      verdictBg: verdict?.ok ? '#7dff9a' : '#ff3fa0', verdictTitle: verdict ? (verdict.ok ? '✓ ' : '✗ ') + verdict.title : '', verdictSub: verdict?.sub || '',
      showCard: screen === 'play' && phase === 'card' && !!card,
      cardColor: card?.color || '#ff3fa0', cardTitle: card?.title || '', cardText: card?.text || '', cardExplain: card?.explain || '', cardHasExplain: !!card?.explain, cardButton: card?.button || '',
      cardAction: () => { if (card?.pass) { this.timeScale = 1; this.sim.target = 10; this.setState(st => ({ oi: st.oi + 1, phase: 'drive', card: null })); return; } if (card?.color === '#7dff9a') { if (card.next) this.loadChapter(ci + 1, true); else this.setState({ screen: 'menu', card: null }); } else this.continueAfterFail(); },
    };
  }
}
