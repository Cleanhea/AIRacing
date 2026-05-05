const FLAT_VS = `
attribute vec2 a_pos;
attribute vec4 a_col;
attribute vec2 a_uv;
uniform vec2 u_res;
varying vec4 v_col;
varying vec2 v_uv;
void main() {
  vec2 clip = (a_pos / u_res) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_col = a_col;
  v_uv = a_uv;
}`;

const FLAT_FS = `
precision mediump float;
varying vec4 v_col;
varying vec2 v_uv;
void main() { gl_FragColor = v_col; }`;

const ROUND_FS = `
precision mediump float;
varying vec4 v_col;
varying vec2 v_uv;
float roundBox(vec2 uv) {
  vec2 p = uv * 2.0 - 1.0;
  float r = 0.35;
  vec2 q = abs(p) - (1.0 - r);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  return 1.0 - smoothstep(-0.04, 0.04, d);
}
void main() {
  float alpha = roundBox(v_uv);
  gl_FragColor = v_col * alpha;
}`;

const MAX_Q = 8192;

export class Renderer {
  constructor(glCanvas, overlayCanvas) {
    this.glc = glCanvas;
    this.oc = overlayCanvas;
    this.gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
    this.ctx = overlayCanvas.getContext('2d');

    if (!this.gl) throw new Error('WebGL not supported');

    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.flatProg = this._prog(FLAT_VS, FLAT_FS);
    this.roundProg = this._prog(FLAT_VS, ROUND_FS);

    this.vbo = gl.createBuffer();
    this.ibo = gl.createBuffer();

    const idx = new Uint16Array(MAX_Q * 6);
    for (let i = 0; i < MAX_Q; i++) {
      const b = i * 4, o = i * 6;
      idx[o] = b; idx[o+1] = b+1; idx[o+2] = b+2;
      idx[o+3] = b+2; idx[o+4] = b+3; idx[o+5] = b;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

    this.flatV = new Float32Array(MAX_Q * 32);
    this.roundV = new Float32Array(MAX_Q * 32);
    this.flatN = 0;
    this.roundN = 0;

    this.cameraX = 0;
    this.targetCX = 0;
    this.mToPx = 1;
    this.particles = [];
    this.time = 0;
  }

  _prog(vs, fs) {
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  resize() {
    const { glc, oc, gl } = this;
    const W = glc.offsetWidth, H = glc.offsetHeight;
    if (glc.width !== W || glc.height !== H) {
      glc.width = oc.width = W;
      glc.height = oc.height = H;
      gl.viewport(0, 0, W, H);
    }
    this.mToPx = W / 22; // show ~22 meters wide
    return { W, H };
  }

  worldX(meters) {
    return (meters - this.cameraX) * this.mToPx;
  }

  _addQ(arr, n, x, y, w, h, r, g, b, a, u0=0, v0=0, u1=1, v1=1) {
    const i = n * 32;
    const x2 = x + w, y2 = y + h;
    const verts = [
      x,  y,  r,g,b,a, u0,v0,
      x2, y,  r,g,b,a, u1,v0,
      x2, y2, r,g,b,a, u1,v1,
      x,  y2, r,g,b,a, u0,v1,
    ];
    arr.set(verts, i);
    return n + 1;
  }

  addFlat(x, y, w, h, r, g, b, a) {
    this.flatN = this._addQ(this.flatV, this.flatN, x, y, w, h, r, g, b, a);
  }

  addRound(x, y, w, h, r, g, b, a) {
    this.roundN = this._addQ(this.roundV, this.roundN, x, y, w, h, r, g, b, a);
  }

  _flush(prog, data, count) {
    if (count === 0) return;
    const gl = this.gl;
    const W = this.glc.width, H = this.glc.height;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 32), gl.DYNAMIC_DRAW);

    const stride = 32;
    const loc = (name) => gl.getAttribLocation(prog, name);
    const uloc = (name) => gl.getUniformLocation(prog, name);

    const aPos = loc('a_pos'), aCol = loc('a_col'), aUv = loc('a_uv');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(aUv);  gl.vertexAttribPointer(aUv,  2, gl.FLOAT, false, stride, 24);

    gl.uniform2f(uloc('u_res'), W, H);
    gl.drawElements(gl.TRIANGLES, count * 6, gl.UNSIGNED_SHORT, 0);
  }

  _drawBackground(W, H) {
    // Sky gradient (manual with 2 quads)
    this.addFlat(0, 0,       W, H * 0.28,  0.18, 0.3, 0.55, 1.0);
    this.addFlat(0, H*0.15, W, H * 0.13,  0.25, 0.45, 0.7, 1.0);
    // Far hills
    for (let i = 0; i < 5; i++) {
      const hx = (i * 220 - (this.cameraX * 0.3 * this.mToPx) % 220) - 40;
      const hh = 50 + i * 10;
      this.addFlat(hx, H * 0.28 - hh, 180, hh, 0.2, 0.45, 0.25, 0.85);
    }
    // Crowd stands
    this.addFlat(0, H * 0.28, W, H * 0.07, 0.25, 0.2, 0.35, 1.0);
    // Crowd dots (simulated)
    for (let ci = 0; ci < 60; ci++) {
      const cx = (ci * 19 - (this.cameraX * 0.5 * this.mToPx) % (W + 100) + W) % (W + 50) - 25;
      const cy = H * 0.28 + (ci % 4) * 10 + 2;
      const cr = 0.4 + (ci % 3) * 0.2;
      const cg = 0.2 + (ci % 5) * 0.1;
      const cb = 0.5 + (ci % 2) * 0.3;
      this.addFlat(cx, cy, 8, 8, cr, cg, cb, 0.8);
    }
  }

  _drawTrack(W, H, numHorses) {
    const trackTop = H * 0.35;
    const trackH = H * 0.6;
    const laneH = trackH / numHorses;

    for (let i = 0; i < numHorses; i++) {
      const even = i % 2 === 0;
      const r = even ? 0.42 : 0.38, g = even ? 0.30 : 0.27, b = even ? 0.18 : 0.15;
      this.addFlat(0, trackTop + i * laneH, W, laneH, r, g, b, 1.0);
    }
    // Lane dividers
    for (let i = 1; i < numHorses; i++) {
      this.addFlat(0, trackTop + i * laneH - 1, W, 2, 0.6, 0.5, 0.3, 0.5);
    }
    // Ground grass
    this.addFlat(0, trackTop + trackH, W, H - (trackTop + trackH), 0.15, 0.45, 0.1, 1.0);

    return { trackTop, trackH, laneH };
  }

  _drawDistanceMarkers(W, H, trackTop, trackH) {
    for (let d = 0; d <= 100; d += 10) {
      const sx = this.worldX(d);
      if (sx < -20 || sx > W + 20) continue;
      const alpha = d === 100 ? 0.9 : 0.35;
      this.addFlat(sx - 1, trackTop, 2, trackH, 0.8, 0.8, 0.6, alpha);
    }
  }

  _drawFinishLine(H, trackTop, trackH) {
    const sx = this.worldX(100);
    if (sx < -20 || sx > this.glc.width + 20) return;
    // Checkered pattern
    const tileH = 16;
    for (let t = 0; t < Math.ceil(trackH / tileH); t++) {
      const white = t % 2 === 0;
      const [r, g, b] = white ? [1, 1, 1] : [0.05, 0.05, 0.05];
      this.addFlat(sx - 8, trackTop + t * tileH, 8, tileH, r, g, b, 0.9);
      this.addFlat(sx,     trackTop + t * tileH, 8, tileH, white?0.05:1, white?0.05:1, white?0.05:1, 0.9);
    }
  }

  _drawHorse(horse, laneY, laneH, time) {
    const [r, g, b] = horse.type.glColor;
    const bodyW = laneH * 1.9;
    const bodyH = laneH * 0.45;
    const headW = laneH * 0.35;
    const headH = bodyH * 0.7;
    const sx = this.worldX(horse.position) - bodyW * 0.7;
    const sy = laneY + (laneH - bodyH) / 2;

    // Shadow
    this.addFlat(sx + 4, sy + bodyH + 2, bodyW, 6, 0, 0, 0, 0.25);

    // Body (rounded)
    this.addRound(sx, sy, bodyW, bodyH, r, g, b, 1.0);

    // Head (rounded)
    this.addRound(sx + bodyW - headW * 0.6, sy - headH + bodyH * 0.2, headW, headH, r * 0.8, g * 0.8, b * 0.8, 1.0);

    // Jockey
    const jockeyW = laneH * 0.22;
    const jockeyH = laneH * 0.3;
    this.addRound(sx + bodyW * 0.55 - jockeyW / 2, sy - jockeyH + 4, jockeyW, jockeyH, 0.95, 0.95, 0.95, 1.0);

    // Animated legs
    const speed = Math.max(0.5, horse.lastMove);
    const freq = speed * 8;
    const legW = 3;
    const legH = laneH * 0.28;
    const legY = sy + bodyH;
    const legPositions = [0.2, 0.4, 0.6, 0.8];
    for (let i = 0; i < 4; i++) {
      const phase = i % 2 === 0 ? 0 : Math.PI;
      const swing = Math.sin(time * freq + phase) * legH * 0.4;
      const lx = sx + bodyW * legPositions[i] - legW / 2;
      this.addFlat(lx, legY + Math.max(0, swing), legW, legH - Math.abs(swing) * 0.5, r * 0.5, g * 0.5, b * 0.5, 1.0);
    }

    // Name + position tag (on overlay)
    return { sx, sy, bodyW, bodyH };
  }

  _drawParticles(dt) {
    this.particles = this.particles.filter(p => {
      p.x -= p.speed * dt * 60;
      p.life -= dt;
      return p.life > 0;
    });
    for (const p of this.particles) {
      const alpha = (p.life / p.maxLife) * 0.4;
      const sx = this.worldX(p.x);
      this.addFlat(sx, p.y, p.size, p.size, 0.85, 0.78, 0.65, alpha);
    }
  }

  emitDust(horse, laneY, laneH) {
    if (horse.position <= 0 || horse.lastMove < 1) return;
    const bodyW = laneH * 1.9;
    const bodyH = laneH * 0.45;
    const legY = laneY + (laneH - bodyH) / 2 + bodyH;
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: horse.position - bodyW / this.mToPx * 0.1,
        y: legY + Math.random() * 8 - 4,
        speed: 0.5 + Math.random() * 1.5,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
        size: 6 + Math.random() * 10,
      });
    }
  }

  _drawOverlay(horses, numHorses, trackTop, laneH, W, H) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    // Distance labels
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(220,210,180,0.7)';
    ctx.textAlign = 'center';
    for (let d = 0; d <= 100; d += 10) {
      const sx = this.worldX(d);
      if (sx < 0 || sx > W) continue;
      ctx.fillText(d === 100 ? 'GOAL' : `${d}M`, sx, trackTop - 5);
    }

    // Horse name tags
    const sorted = [...horses].sort((a, b) => b.position - a.position);
    horses.forEach((horse, i) => {
      const laneY = trackTop + i * laneH;
      const bodyW = laneH * 1.9;
      const bodyH = laneH * 0.45;
      const sx = this.worldX(horse.position) - bodyW * 0.7;
      const sy = laneY + (laneH - bodyH) / 2;
      const rank = sorted.findIndex(h => h.id === horse.id) + 1;

      // Rank badge
      const bx = sx + bodyW + 5;
      const by = sy + bodyH / 2;
      ctx.beginPath();
      ctx.arc(bx + 10, by, 10, 0, Math.PI * 2);
      ctx.fillStyle = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#553399';
      ctx.fill();
      ctx.fillStyle = rank <= 3 ? '#111' : '#fff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(rank, bx + 10, by + 4);

      // Name above lane
      ctx.font = `bold ${Math.max(10, laneH * 0.22)}px sans-serif`;
      ctx.fillStyle = horse.type.color;
      ctx.textAlign = 'left';
      ctx.fillText(`${horse.type.name} ${horse.position.toFixed(1)}M`, 5, laneY + laneH * 0.4);
    });
  }

  render(gameState, dt) {
    this.time += dt;
    const { W, H } = this.resize();
    const gl = this.gl;
    gl.clearColor(0.1, 0.1, 0.18, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Camera follow
    const leadPos = gameState.leader.position;
    this.targetCX = Math.max(0, Math.min(85, leadPos - 8));
    this.cameraX += (this.targetCX - this.cameraX) * Math.min(1, dt * 4);

    this.flatN = 0;
    this.roundN = 0;

    this._drawBackground(W, H);
    const { trackTop, trackH, laneH } = this._drawTrack(W, H, gameState.horses.length);
    this._drawDistanceMarkers(W, H, trackTop, trackH);
    this._drawFinishLine(H, trackTop, trackH);

    // Dust particles
    this._drawParticles(dt);

    // Flush flat geometry first
    this._flush(this.flatProg, this.flatV, this.flatN);
    this.flatN = 0;

    // Horses (rounded)
    gameState.horses.forEach((horse) => {
      const laneY = trackTop + horse.laneIndex * laneH;
      this._drawHorse(horse, laneY, laneH, this.time);
      this.emitDust(horse, laneY, laneH);
    });

    this._flush(this.roundProg, this.roundV, this.roundN);

    // Overlay text
    this._drawOverlay(gameState.horses, gameState.horses.length, trackTop, laneH, W, H);
  }
}
