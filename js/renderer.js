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

const TEX_FS = `
precision mediump float;
varying vec4 v_col;
varying vec2 v_uv;
uniform sampler2D u_tex;
void main() {
  vec4 tex = texture2D(u_tex, v_uv);
  if (tex.a < 0.02) discard;
  gl_FragColor = tex * v_col;
}`;

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
    this.texProg = this._prog(FLAT_VS, TEX_FS);
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
    this.background = this._loadImageTexture('image/background.png');
    this.horseSprites = this._loadHorseSprites(8);

    this.visibleMeters = 140;
    this.targetVisibleMeters = 140;
    this.cinematicQueue = [];
    this.cinematic = null;
    this.cinematicDuration = 1.0;
    this.userPanOffset = 0;
    this.userPanLocked = false;
  }

  queueCinematics(events) {
    if (!events || !events.length) return;
    for (const e of events) {
      this.cinematicQueue.push({
        sourceLane: e.sourceLane,
        sourceName: e.sourceName,
        sourceColor: e.sourceColor,
        icon: e.icon,
        abilityName: e.abilityName,
        message: e.message,
        duration: this.cinematicDuration,
        elapsed: 0,
      });
    }
  }

  isCinematicActive() {
    return !!this.cinematic || this.cinematicQueue.length > 0;
  }

  _updateCinematic(dt) {
    if (this.cinematic) {
      this.cinematic.elapsed += dt;
      if (this.cinematic.elapsed >= this.cinematic.duration) {
        this.cinematic = null;
      }
    }
    if (!this.cinematic && this.cinematicQueue.length > 0) {
      this.cinematic = this.cinematicQueue.shift();
    }
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
    this.mToPx = W / this.visibleMeters;
    return { W, H };
  }

  worldX(meters) {
    return (meters - this.cameraX) * this.mToPx;
  }

  getVisualPosition(horse) {
    return horse.displayPosition ?? horse.position;
  }

  isAnimating(gameState) {
    return gameState.horses.some(h => (h.moveProgress ?? 1) < 1);
  }

  isRunningEffect(horse) {
    return (horse.moveProgress ?? 1) < 1 || horse.runningEffectActive || (horse.runEffectTime ?? 0) > 0;
  }

  _easeAlmostLinear(t) {
    const linear = t;
    const smooth = t * t * (3 - 2 * t);
    return linear * 0.85 + smooth * 0.15;
  }

  _advanceHorseAnimations(horses, dt) {
    horses.forEach(horse => {
      horse.runEffectTime = Math.max(0, (horse.runEffectTime ?? 0) - dt);
      horse.dustTimer = Math.max(0, (horse.dustTimer ?? 0) - dt);
      horse.abilityFlashTime = Math.max(0, (horse.abilityFlashTime ?? 0) - dt);
      if (horse.runEffectTime === 0 && (horse.moveProgress ?? 1) >= 1) {
        horse.runningEffectActive = false;
      }

      if ((horse.moveProgress ?? 1) >= 1) {
        horse.displayPosition = horse.position;
        return;
      }

      const duration = Math.max(0.1, horse.moveDuration || 2.2);
      horse.moveProgress = Math.min(1, horse.moveProgress + dt / duration);
      const eased = this._easeAlmostLinear(horse.moveProgress);
      const start = horse.moveStartPosition ?? horse.displayPosition ?? horse.position;
      const target = horse.moveTargetPosition ?? horse.position;
      horse.displayPosition = start + (target - start) * eased;

      if (horse.moveProgress >= 1) {
        horse.displayPosition = horse.position;
      }
    });
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

  _loadImageTexture(src) {
    const gl = this.gl;
    const texture = gl.createTexture();
    const imageTexture = {
      texture,
      ready: false,
      width: 1,
      height: 1,
    };

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0])
    );

    const img = new Image();
    img.onload = () => {
      imageTexture.ready = true;
      imageTexture.width = img.naturalWidth || img.width || 1;
      imageTexture.height = img.naturalHeight || img.height || 1;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    };
    img.src = src;

    return imageTexture;
  }

  _loadHorseSprites(count) {
    const sprites = [];

    for (let i = 1; i <= count; i++) {
      sprites.push(this._loadImageTexture(`image/horse_${i}.png`));
    }

    return sprites;
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

  _drawTexture(texture, x, y, w, h, alpha = 1) {
    const gl = this.gl;
    const W = this.glc.width, H = this.glc.height;
    const data = new Float32Array(32);

    this._addQ(data, 0, x, y, w, h, 1, 1, 1, alpha);

    gl.useProgram(this.texProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);

    const stride = 32;
    const loc = (name) => gl.getAttribLocation(this.texProg, name);
    const uloc = (name) => gl.getUniformLocation(this.texProg, name);

    const aPos = loc('a_pos'), aCol = loc('a_col'), aUv = loc('a_uv');
    gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(aCol); gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(aUv);  gl.vertexAttribPointer(aUv,  2, gl.FLOAT, false, stride, 24);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uloc('u_tex'), 0);
    gl.uniform2f(uloc('u_res'), W, H);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  _drawBackground(W, H) {
    if (this.background.ready) {
      const aspect = this.background.width / this.background.height;
      const visibleH = H * 0.48;
      const tileW = W;
      const tileH = tileW / aspect;
      const drawH = Math.max(visibleH, tileH);
      const drawW = drawH * aspect;
      const scroll = (this.cameraX * this.mToPx * 0.18) % drawW;
      let x = -scroll - tileW;

      while (x < W + drawW) {
        this._drawTexture(this.background.texture, x, 0, drawW, drawH, 1);
        x += drawW;
      }

      return;
    }

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

  _drawDistanceMarkers(W, H, trackTop, trackH, finishLine) {
    const step = finishLine >= 1000 ? 100 : 10;
    for (let d = 0; d <= finishLine; d += step) {
      const sx = this.worldX(d);
      if (sx < -20 || sx > W + 20) continue;
      const alpha = d === finishLine ? 0.9 : 0.35;
      this.addFlat(sx - 1, trackTop, 2, trackH, 0.8, 0.8, 0.6, alpha);
    }
  }

  _drawFinishLine(H, trackTop, trackH, finishLine) {
    const sx = this.worldX(finishLine);
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

  _drawHorseAura(horse, laneY, laneH, time) {
    const flash = horse.abilityFlashTime ?? 0;
    const hasBuff = (horse.buffs ?? []).length > 0;
    if (flash <= 0 && !hasBuff) return;
    const sprite = this.horseSprites[horse.spriteIndex ?? horse.laneIndex] || this.horseSprites[0];
    const spriteH = laneH * 0.82;
    const aspect = sprite ? sprite.width / sprite.height : 1.6;
    const spriteW = spriteH * aspect;
    const sx = this.worldX(this.getVisualPosition(horse)) - spriteW * 0.7;
    const sy = laneY + (laneH - spriteH) / 2;
    const [gr, gg, gb] = horse.type.glColor || [1, 1, 1];
    const pulse = 0.5 + 0.5 * Math.sin(time * 8);
    const flashAlpha = Math.min(1, flash) * 0.6;
    const buffAlpha = hasBuff ? 0.18 + pulse * 0.2 : 0;
    const alpha = Math.max(flashAlpha, buffAlpha);
    const pad = laneH * 0.18 + flash * 10;
    this.addRound(sx - pad, sy - pad, spriteW + pad * 2, spriteH + pad * 2, gr, gg, gb, alpha);
  }

  _drawHorse(horse, laneY, laneH, time) {
    const sprite = this.horseSprites[horse.spriteIndex ?? horse.laneIndex] || this.horseSprites[0];
    const spriteH = laneH * 0.82;
    const aspect = sprite ? sprite.width / sprite.height : 1.6;
    const spriteW = spriteH * aspect;
    const sx = this.worldX(this.getVisualPosition(horse)) - spriteW * 0.7;
    const sy = laneY + (laneH - spriteH) / 2;

    if (sprite && sprite.ready) {
      const moving = this.isRunningEffect(horse);
      const bobSpeed = moving ? Math.max(8, horse.lastMove * 4) : 3;
      const bob = Math.sin(time * bobSpeed) * Math.min(moving ? 4 : 1.5, laneH * 0.05);
      this._drawTexture(sprite.texture, sx, sy + bob, spriteW, spriteH, 1);
    }

    // Name + position tag (on overlay)
    return { sx, sy, bodyW: spriteW, bodyH: spriteH };
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
    const visualPosition = this.getVisualPosition(horse);
    if (visualPosition <= 0 || horse.lastMove < 1 || !this.isRunningEffect(horse)) return;
    if ((horse.dustTimer ?? 0) > 0) return;

    const moving = (horse.moveProgress ?? 1) < 1;
    horse.dustTimer = moving ? 0.04 : 0.12;
    const bodyW = laneH * 1.9;
    const bodyH = laneH * 0.45;
    const legY = laneY + (laneH - bodyH) / 2 + bodyH;
    for (let i = 0; i < 2; i++) {
      this.particles.push({
        x: visualPosition - bodyW / this.mToPx * 0.1,
        y: legY + Math.random() * 8 - 4,
        speed: 0.5 + Math.random() * 1.5,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
        size: 6 + Math.random() * 10,
      });
    }
  }

  _drawOverlay(horses, numHorses, trackTop, laneH, W, H, finishLine) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    // Distance labels
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(220,210,180,0.7)';
    ctx.textAlign = 'center';
    const step = finishLine >= 1000 ? 100 : 10;
    for (let d = 0; d <= finishLine; d += step) {
      const sx = this.worldX(d);
      if (sx < 0 || sx > W) continue;
      ctx.fillText(d === finishLine ? 'GOAL' : `${d}M`, sx, trackTop - 5);
    }

    // Horse name tags
    const sorted = [...horses].sort((a, b) => {
      if (a.finished && b.finished) return a.rank - b.rank;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return this.getVisualPosition(b) - this.getVisualPosition(a);
    });
    horses.forEach((horse, i) => {
      const laneY = trackTop + i * laneH;
      const sprite = this.horseSprites[horse.spriteIndex ?? horse.laneIndex] || this.horseSprites[0];
      const bodyH = laneH * 0.82;
      const aspect = sprite ? sprite.width / sprite.height : 1.6;
      const bodyW = bodyH * aspect;
      const visualPosition = this.getVisualPosition(horse);
      const sx = this.worldX(visualPosition) - bodyW * 0.7;
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
      ctx.fillText(`${horse.type.name} ${visualPosition.toFixed(1)}M`, 5, laneY + laneH * 0.4);

      // Ability flash icon
      const flash = horse.abilityFlashTime ?? 0;
      if (flash > 0 && horse.type.ability) {
        const alpha = Math.min(1, flash);
        const lift = (1 - Math.min(1, flash)) * laneH * 0.4;
        const iconSize = Math.max(20, laneH * 0.4);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `${iconSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(horse.type.ability.icon, sx + bodyW * 0.5, sy - 8 - lift);
        ctx.restore();
      }
    });

    if (this.cinematic) {
      this._drawCinematicBanner(W, H);
    }
  }

  _drawCinematicBanner(W, H) {
    const c = this.cinematic;
    const t = c.elapsed / c.duration;
    let alpha = 1;
    if (t < 0.15) alpha = t / 0.15;
    else if (t > 0.85) alpha = (1 - t) / 0.15;
    alpha = Math.max(0, Math.min(1, alpha));

    const ctx = this.ctx;
    const barH = Math.min(120, H * 0.18);
    const barY = H * 0.14;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Side vignette to dim the rest of the screen
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, W, barY);
    ctx.fillRect(0, barY + barH, W, H - (barY + barH));

    // Banner background gradient
    const grad = ctx.createLinearGradient(0, barY, 0, barY + barH);
    grad.addColorStop(0, 'rgba(8, 8, 22, 0.92)');
    grad.addColorStop(0.5, 'rgba(20, 18, 45, 0.95)');
    grad.addColorStop(1, 'rgba(8, 8, 22, 0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, barY, W, barH);

    // Color accent lines top/bottom
    ctx.fillStyle = c.sourceColor;
    ctx.fillRect(0, barY, W, 3);
    ctx.fillRect(0, barY + barH - 3, W, 3);

    // Pop-in scale for title
    const popT = Math.min(1, t * 8);
    const scale = 0.65 + popT * 0.35;
    const titleY = barY + barH * 0.48;

    ctx.textAlign = 'center';
    ctx.shadowColor = c.sourceColor;
    ctx.shadowBlur = 22;
    ctx.fillStyle = c.sourceColor;
    const titleSize = Math.min(54, Math.max(28, W * 0.05));
    ctx.font = `bold ${titleSize}px sans-serif`;

    ctx.save();
    ctx.translate(W / 2, titleY);
    ctx.scale(scale, scale);
    ctx.fillText(`${c.icon}  ${c.abilityName}`, 0, 0);
    ctx.restore();

    ctx.shadowBlur = 0;
    const subSize = Math.min(20, Math.max(13, W * 0.018));
    ctx.font = `${subSize}px sans-serif`;
    ctx.fillStyle = '#e8e0ff';
    ctx.fillText(c.message || c.sourceName, W / 2, titleY + titleSize * 0.7);

    ctx.restore();
  }

  render(gameState, dt) {
    this._updateCinematic(dt);
    const worldDt = this.cinematic ? 0 : dt;
    this.time += worldDt;
    this._advanceHorseAnimations(gameState.horses, worldDt);

    let cinematicHorse = null;
    if (this.cinematic) {
      cinematicHorse = gameState.horses.find(h => h.laneIndex === this.cinematic.sourceLane);
    }

    // Auto camera target + zoom
    let autoCX, autoZoom;
    if (cinematicHorse) {
      autoZoom = 80;
      const pos = this.getVisualPosition(cinematicHorse);
      autoCX = pos - autoZoom * 0.45;
    } else {
      const racing = gameState.horses.filter(h => !h.finished);
      const positions = (racing.length > 0 ? racing : gameState.horses).map(h => this.getVisualPosition(h));
      const leadPos = Math.max(...positions);
      const lastPos = Math.min(...positions);
      const spread = leadPos - lastPos;
      autoZoom = Math.max(70, Math.min(180, spread + 40));
      const packCenter = lastPos * 0.4 + leadPos * 0.6;
      autoCX = packCenter - autoZoom * 0.5;
    }

    this.targetVisibleMeters = autoZoom;
    this.visibleMeters += (this.targetVisibleMeters - this.visibleMeters) * Math.min(1, dt * 5);

    // Decay user pan offset when not actively held
    if (!this.cinematic && !this.userPanLocked) {
      this.userPanOffset += (0 - this.userPanOffset) * Math.min(1, dt * 1.5);
      if (Math.abs(this.userPanOffset) < 0.05) this.userPanOffset = 0;
    }

    const { W, H } = this.resize();
    const gl = this.gl;
    gl.clearColor(0.1, 0.1, 0.18, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Camera target with optional user pan
    let targetCX = autoCX;
    if (!this.cinematic) targetCX += this.userPanOffset;
    const finishLine = gameState.finishLine ?? 100;
    targetCX = Math.max(0, Math.min(finishLine - this.visibleMeters * 0.7, targetCX));

    const followSpeed = cinematicHorse ? 7 : (this.userPanLocked ? 9 : 4);
    this.targetCX = targetCX;
    this.cameraX += (this.targetCX - this.cameraX) * Math.min(1, dt * followSpeed);

    this.flatN = 0;
    this.roundN = 0;

    this._drawBackground(W, H);
    const { trackTop, trackH, laneH } = this._drawTrack(W, H, gameState.horses.length);
    this._drawDistanceMarkers(W, H, trackTop, trackH, finishLine);
    this._drawFinishLine(H, trackTop, trackH, finishLine);

    // Dust particles (frozen during cinematic)
    this._drawParticles(worldDt);

    // Flush flat geometry first
    this._flush(this.flatProg, this.flatV, this.flatN);
    this.flatN = 0;

    // Ability auras (drawn behind sprites)
    gameState.horses.forEach((horse) => {
      const laneY = trackTop + horse.laneIndex * laneH;
      this._drawHorseAura(horse, laneY, laneH, this.time);
    });
    this._flush(this.roundProg, this.roundV, this.roundN);
    this.roundN = 0;

    // Horse sprites
    gameState.horses.forEach((horse) => {
      const laneY = trackTop + horse.laneIndex * laneH;
      this._drawHorse(horse, laneY, laneH, this.time);
      this.emitDust(horse, laneY, laneH);
    });

    this._flush(this.roundProg, this.roundV, this.roundN);

    // Overlay text
    this._drawOverlay(gameState.horses, gameState.horses.length, trackTop, laneH, W, H, finishLine);
  }
}
