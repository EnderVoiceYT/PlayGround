// -----------------------------------------------------------------------------
// Blackmoor sound design. Everything is synthesized at runtime: room tone,
// fluorescent buzz, drips, creature vocalisations, gunshots and a whisper of
// score. Spatialised with the Web Audio PannerNode.
// -----------------------------------------------------------------------------

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.8;
    this.listenerPos = { x: 0, y: 1.4, z: 0 };
    this.ambientTimer = 4;
    this.musicTimer = 12;
    this.dripTimer = 3;
    this.tension = 0;
    this.powerOn = false;
    this.lastWhisper = 0;
  }

  init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -16;
    this.compressor.knee.value = 24;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.005;
    this.compressor.release.value = 0.25;
    this.compressor.connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.9;
    this.dry.connect(this.compressor);

    this.wet = ctx.createGain();
    this.wet.gain.value = 0.34;
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(2.8, 2.4);
    this.wet.connect(conv);
    conv.connect(this.compressor);

    this.ambientBus = ctx.createGain();
    this.ambientBus.gain.value = 0.55;
    this.ambientBus.connect(this.dry);
    this.ambientBus.connect(this.wet);

    this.noise = this.makeNoise(3.0);
    this.ready = true;
    this.setListener(this.listenerPos);
    this.startAmbience();
    this.setPower(this.powerOn);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
    try { localStorage.setItem('blackmoor_volume', String(v)); } catch {}
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
    try { localStorage.setItem('blackmoor_muted', m ? '1' : '0'); } catch {}
  }

  setListener(pos, forward = { x: 0, z: -1 }) {
    this.listenerPos = { x: pos.x, y: 1.4, z: pos.z };
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(1.4, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(0, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(pos.x, 1.4, pos.z);
      l.setOrientation(forward.x, 0, forward.z, 0, 1, 0);
    }
  }

  makeImpulse(duration, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * duration);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (0.4 + 0.6 * Math.exp(-t * 3));
      }
    }
    return buf;
  }

  makeNoise(duration) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  get t() { return this.ctx.currentTime; }

  route(node, wetAmt = 0.3, spatial = null) {
    if (spatial) {
      const pan = this.ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = 2.2;
      pan.maxDistance = 40;
      pan.rolloffFactor = 1.1;
      pan.positionX.value = spatial.x;
      pan.positionY.value = spatial.y ?? 1.4;
      pan.positionZ.value = spatial.z;
      node.connect(pan);
      pan.connect(this.dry);
      const w = this.ctx.createGain();
      w.gain.value = wetAmt;
      pan.connect(w);
      w.connect(this.wet);
      return pan;
    }
    node.connect(this.dry);
    if (wetAmt > 0.001) {
      const w = this.ctx.createGain();
      w.gain.value = wetAmt;
      node.connect(w);
      w.connect(this.wet);
    }
    return node;
  }

  // ---------------------------------------------------------------------------
  // Primitive synthesis helpers
  // ---------------------------------------------------------------------------

  noiseBurst(dur, filterType, freq, q, gain, spatial = null, wet = 0.25, freqEnd = null) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    if (freqEnd !== null) {
      filter.frequency.setValueAtTime(freq, this.t);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), this.t + dur);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, this.t);
    g.gain.linearRampToValueAtTime(gain, this.t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    src.connect(filter);
    filter.connect(g);
    this.route(g, wet, spatial);
    src.start(this.t);
    src.stop(this.t + dur + 0.03);
  }

  tone(type, f0, f1, dur, gain, spatial = null, wet = 0.18, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const start = this.t + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    this.route(g, wet, spatial);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }

  tremoloNoise(dur, freq, q, gain, rate, spatial = null, wet = 0.2) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, this.t);
    g.gain.linearRampToValueAtTime(gain, this.t + 0.08);
    g.gain.setValueAtTime(gain, this.t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = gain * 0.7;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(filter);
    filter.connect(g);
    this.route(g, wet, spatial);
    src.start(this.t);
    src.stop(this.t + dur + 0.05);
    lfo.start(this.t);
    lfo.stop(this.t + dur + 0.05);
  }

  startAmbience() {
    const ctx = this.ctx;
    // Deep structural drone.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.022;
    droneGain.connect(this.ambientBus);
    for (const [f, a] of [[36, 0.6], [54, 0.3], [77, 0.12]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.04 + Math.random() * 0.06;
      const lg = ctx.createGain();
      lg.gain.value = 0.2;
      lfo.connect(lg);
      lg.connect(g.gain);
      o.connect(g);
      g.connect(droneGain);
      o.start();
      lfo.start();
    }
    // Air / distant ventilation.
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'lowpass';
    airFilter.frequency.value = 320;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.012;
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(this.ambientBus);
    air.start();

    // Fluorescent / electrical buzz loop (silent until power).
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humGain.connect(this.ambientBus);
    for (const f of [60, 120, 180]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = f === 60 ? 0.015 : 0.006;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      o.connect(filter);
      filter.connect(g);
      g.connect(this.humGain);
      o.start();
    }
    // Distant heartbeat bed, barely there.
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0;
    this.bedGain.connect(this.ambientBus);
  }

  setPower(on) {
    this.powerOn = on;
    if (!this.ready) return;
    const target = on ? 0.7 : 0;
    this.humGain.gain.cancelScheduledValues(this.t);
    this.humGain.gain.setValueAtTime(this.humGain.gain.value, this.t);
    this.humGain.gain.linearRampToValueAtTime(target, this.t + 2.5);
    if (on) {
      this.noiseBurst(0.16, 'highpass', 1500, 0.8, 0.2);
      this.tone('sawtooth', 42, 60, 1.4, 0.08, null, 0.4);
      setTimeout(() => {
        if (this.ready) {
          this.noiseBurst(0.08, 'bandpass', 2400, 1.2, 0.14);
          this.tone('square', 90, 48, 0.4, 0.05);
        }
      }, 320);
    }
  }

  setTension(v) {
    this.tension = v;
  }

  update(dt) {
    if (!this.ready) return;
    this.ambientTimer -= dt;
    this.musicTimer -= dt;
    this.dripTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 6 + Math.random() * 12;
      const kind = Math.random();
      if (kind < 0.35) this.distantImpact();
      else if (kind < 0.62) this.creak(null, 0.35);
      else if (kind < 0.82) this.drip(null, 0.4);
      else this.whisper(null, 0.25);
    }
    if (this.dripTimer <= 0) {
      this.dripTimer = 4 + Math.random() * 9;
      if (Math.random() < 0.6) this.drip(null, 0.25 + Math.random() * 0.3);
    }
    if (this.musicTimer <= 0) {
      this.musicTimer = 22 + Math.random() * 26;
      this.eeriePiano();
    }
  }

  distantImpact() {
    this.tone('sine', 56, 28, 0.7, 0.06, this.randomNear(18), 0.9);
    this.noiseBurst(0.5, 'lowpass', 260, 0.6, 0.05, this.randomNear(18), 0.9);
  }

  eeriePiano() {
    const notes = [146.83, 174.61, 196.0, 233.08, 293.66];
    const f = notes[Math.floor(Math.random() * notes.length)];
    this.tone('sine', f, f * 0.999, 5.5, 0.022, null, 0.95);
    this.tone('sine', f * 2.01, f * 2.0, 4.2, 0.008, null, 0.95);
    if (Math.random() < 0.4) this.tone('sine', f * 1.498, f * 1.497, 4.8, 0.01, null, 0.95, 0.7);
  }

  randomNear(radius = 10) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    return { x: this.listenerPos.x + Math.cos(a) * r, y: 1.4, z: this.listenerPos.z + Math.sin(a) * r };
  }

  // ---------------------------------------------------------------------------
  // Player sounds
  // ---------------------------------------------------------------------------

  shot() {
    if (!this.ready) return;
    this.noiseBurst(0.18, 'lowpass', 2600, 0.8, 0.42, null, 0.5, 300);
    this.noiseBurst(0.05, 'highpass', 2600, 0.6, 0.24, null, 0.5);
    this.tone('sine', 80, 38, 0.32, 0.36, null, 0.35);
    this.tone('sawtooth', 180, 60, 0.12, 0.08, null, 0.3);
  }

  dryFire() {
    this.noiseBurst(0.04, 'bandpass', 1700, 3, 0.2);
    this.tone('square', 1100, 700, 0.025, 0.03);
  }

  reload() {
    this.noiseBurst(0.045, 'bandpass', 2200, 3, 0.15);
    this.tone('square', 620, 400, 0.03, 0.025);
    setTimeout(() => {
      if (!this.ready) return;
      this.noiseBurst(0.06, 'bandpass', 1400, 2, 0.18);
      this.tone('square', 460, 300, 0.04, 0.03);
      setTimeout(() => {
        if (!this.ready) return;
        this.noiseBurst(0.05, 'bandpass', 1800, 2, 0.14);
        this.tone('square', 900, 520, 0.035, 0.025);
      }, 210);
    }, 160);
  }

  flashlight() {
    this.noiseBurst(0.03, 'bandpass', 2600, 4, 0.12);
    this.tone('square', 1240, 760, 0.025, 0.018);
  }

  emptyBattery() {
    this.tone('square', 220, 90, 0.18, 0.035);
    this.noiseBurst(0.06, 'lowpass', 600, 1, 0.08);
  }

  footstep(surface = 'tile', sprint = false) {
    if (!this.ready) return;
    const g = (sprint ? 0.08 : 0.055);
    if (surface === 'water') {
      this.noiseBurst(0.12, 'bandpass', 900, 0.8, g * 1.2, null, 0.25, 400);
      this.tone('sine', 180, 90, 0.08, 0.02);
    } else if (surface === 'metal') {
      this.noiseBurst(0.06, 'bandpass', 1800, 2.2, g * 0.8);
      this.tone('square', 420, 240, 0.035, 0.012);
    } else {
      this.noiseBurst(0.07, 'lowpass', 700, 0.9, g);
      this.noiseBurst(0.02, 'highpass', 2400, 1.2, g * 0.25);
    }
  }

  hurt() {
    this.noiseBurst(0.2, 'lowpass', 500, 0.7, 0.28);
    this.tone('sine', 90, 45, 0.4, 0.2);
    this.tone('sawtooth', 220, 80, 0.2, 0.05);
  }

  death() {
    this.tone('sine', 60, 24, 3.5, 0.2, null, 0.6);
    this.noiseBurst(2.5, 'lowpass', 260, 0.5, 0.12, null, 0.9, 40);
    this.heartbeat(1);
  }

  heartbeat(intensity = 0.5) {
    if (!this.ready) return;
    const g = 0.08 + intensity * 0.22;
    this.tone('sine', 62, 38, 0.14, g, null, 0.12);
    this.tone('sine', 52, 30, 0.12, g * 0.7, null, 0.12, 0.17);
    if (intensity > 0.7) {
      this.tone('sine', 62, 38, 0.12, g * 0.55, null, 0.12, 0.36);
    }
  }

  breath(intensity = 0.5) {
    this.noiseBurst(0.55, 'bandpass', 500 + intensity * 300, 0.7, 0.018 + intensity * 0.03, null, 0.08, 260);
  }

  pickup(kind = 'supply') {
    if (!this.ready) return;
    if (kind === 'key') {
      this.tone('sine', 660, 880, 0.25, 0.03, null, 0.4);
      this.tone('sine', 990, 1320, 0.3, 0.018, null, 0.4, 0.06);
    } else {
      this.noiseBurst(0.05, 'bandpass', 2200, 2, 0.08);
      this.tone('sine', 420, 620, 0.13, 0.025, null, 0.2);
    }
  }

  battery() {
    this.noiseBurst(0.04, 'bandpass', 1600, 2, 0.1);
    this.tone('sine', 240, 480, 0.25, 0.025);
    this.tone('sine', 480, 960, 0.3, 0.012, null, 0.1, 0.05);
  }

  heal() {
    this.noiseBurst(0.4, 'highpass', 900, 0.7, 0.05, null, 0.2, 1600);
    this.tone('sine', 150, 120, 0.3, 0.03);
    this.breath(0.3);
  }

  save() {
    if (!this.ready) return;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (!this.ready) return;
        this.tone('sine', 660 + i * 220, 660 + i * 220, 0.12, 0.03, null, 0.4);
      }, i * 130);
    }
    this.noiseBurst(0.1, 'bandpass', 2200, 2, 0.05);
  }

  ui() {
    this.tone('square', 900, 700, 0.025, 0.014);
  }

  locked() {
    if (!this.ready) return;
    this.noiseBurst(0.06, 'bandpass', 1500, 4, 0.16);
    this.tone('square', 220, 140, 0.1, 0.04);
    this.noiseBurst(0.12, 'bandpass', 800, 2, 0.08);
  }

  door(open = true) {
    if (!this.ready) return;
    const start = this.t;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(open ? 72 : 90, start);
    osc.frequency.linearRampToValueAtTime(open ? 140 : 60, start + 0.8);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 1.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(0.045, start + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.95);
    osc.connect(filter); filter.connect(g);
    this.route(g, 0.45, { x: 0, y: 1.4, z: 0 });
    osc.start(start); osc.stop(start + 1.0);
    this.noiseBurst(0.35, 'bandpass', 900, 1.4, 0.03, null, 0.4);
  }

  drip(spatial = null, gain = 0.4) {
    if (!this.ready) return;
    if (spatial) {
      this.tone('sine', 1400, 600, 0.09, 0.03 * gain, spatial, 0.7);
      this.tone('sine', 2200, 1200, 0.05, 0.012 * gain, spatial, 0.6, 0.02);
    } else {
      const p = this.randomNear(14);
      this.tone('sine', 1200 + Math.random() * 900, 600, 0.1, 0.02 * gain, p, 0.85);
    }
  }

  creak(spatial = null, gain = 0.4) {
    if (!this.ready) return;
    const p = spatial || this.randomNear(16);
    this.tremoloNoise(0.9 + Math.random() * 0.7, 220 + Math.random() * 240, 8, 0.02 * gain, 16 + Math.random() * 20, p, 0.6);
  }

  whisper(spatial = null, gain = 0.4) {
    if (!this.ready) return;
    const p = spatial || this.randomNear(12);
    this.tremoloNoise(1.1, 780 + Math.random() * 500, 7, 0.012 * gain, 2.2, p, 0.8);
  }

  // ---------------------------------------------------------------------------
  // Creatures and environment
  // ---------------------------------------------------------------------------

  hollowScreech(spatial) {
    if (!this.ready) return;
    this.noiseBurst(0.5, 'bandpass', 1200, 5, 0.1, spatial, 0.65, 380);
    this.tone('sawtooth', 880, 240, 0.45, 0.045, spatial, 0.6);
    this.tone('square', 1100, 320, 0.26, 0.02, spatial, 0.6, 0.04);
  }

  hollowGrowl(spatial) {
    this.tremoloNoise(1.4, 260, 4, 0.07, 3.4, spatial, 0.5);
    this.tone('sawtooth', 74, 54, 1.1, 0.035, spatial, 0.5);
    this.tone('sine', 48, 38, 1.4, 0.04, spatial, 0.5);
  }

  hollowHurt(spatial) {
    this.tone('sawtooth', 640, 230, 0.28, 0.05, spatial, 0.4);
    this.noiseBurst(0.2, 'highpass', 1400, 1, 0.07, spatial, 0.4);
  }

  mothWhisper(spatial) {
    this.tremoloNoise(1.6, 620, 5, 0.03, 5.5, spatial, 0.7);
    this.tone('sine', 1760, 1680, 1.4, 0.009, spatial, 0.8);
  }

  mothHurt(spatial) {
    this.tone('triangle', 1200, 420, 0.35, 0.04, spatial, 0.5);
    this.noiseBurst(0.16, 'highpass', 2000, 1, 0.05, spatial, 0.5);
  }

  gauntRoar(spatial) {
    if (!this.ready) return;
    this.tone('sawtooth', 58, 34, 1.8, 0.12, spatial, 0.75);
    this.tone('square', 72, 40, 1.3, 0.04, spatial, 0.7);
    this.tremoloNoise(1.7, 180, 3, 0.08, 3.1, spatial, 0.65);
  }

  gauntBreath(spatial) {
    this.tremoloNoise(1.9, 220, 2.5, 0.05, 1.4, spatial, 0.55);
  }

  gauntHurt(spatial) {
    this.tone('sawtooth', 120, 60, 0.5, 0.08, spatial, 0.5);
    this.noiseBurst(0.25, 'lowpass', 500, 1, 0.09, spatial, 0.5);
  }

  gauntSwing(spatial) {
    this.noiseBurst(0.36, 'bandpass', 340, 1.2, 0.14, spatial, 0.4, 120);
    this.tone('sine', 52, 30, 0.3, 0.1, spatial, 0.3);
  }

  enemySwing(spatial) {
    this.noiseBurst(0.18, 'bandpass', 900, 1.4, 0.07, spatial, 0.35, 300);
  }

  enemyStrike(spatial) {
    this.tone('sine', 90, 40, 0.32, 0.16, spatial, 0.3);
    this.noiseBurst(0.2, 'lowpass', 800, 0.9, 0.12, spatial, 0.35);
    this.hurt();
  }

  enemyDeath(spatial, type = 'hollow') {
    if (type === 'gaunt') {
      this.tone('sawtooth', 80, 24, 1.8, 0.12, spatial, 0.6);
      this.noiseBurst(1.4, 'lowpass', 400, 0.8, 0.1, spatial, 0.7);
    } else {
      this.tone('sawtooth', 420, 70, 0.7, 0.05, spatial, 0.5);
      this.noiseBurst(0.7, 'lowpass', 600, 0.8, 0.06, spatial, 0.5);
    }
  }

  ventBurst(spatial) {
    this.noiseBurst(0.14, 'bandpass', 1600, 1.2, 0.2, spatial, 0.4);
    this.tone('square', 260, 90, 0.3, 0.04, spatial, 0.3);
    this.noiseBurst(0.5, 'lowpass', 500, 0.8, 0.12, spatial, 0.5);
  }

  doorBurst(spatial) {
    this.noiseBurst(0.18, 'bandpass', 700, 1.4, 0.1, spatial, 0.4);
    this.tone('sine', 70, 40, 0.22, 0.06, spatial, 0.3);
  }

  flareThrow(spatial) {
    this.noiseBurst(0.25, 'bandpass', 900, 0.8, 0.05, spatial, 0.3, 500);
  }

  flareLand(spatial) {
    this.noiseBurst(0.4, 'highpass', 700, 0.7, 0.1, spatial, 0.4, 1400);
    this.tone('sine', 80, 50, 0.2, 0.04, spatial, 0.2);
  }

  flareCrackle(spatial) {
    this.noiseBurst(0.04, 'highpass', 1600, 0.8, 0.03, spatial, 0.2);
  }

  power() {
    if (!this.ready) return;
    this.tone('sawtooth', 30, 60, 3.2, 0.08, null, 0.5);
    this.tone('sine', 120, 60, 2.4, 0.05, null, 0.5, 0.2);
    this.noiseBurst(0.9, 'lowpass', 1200, 0.8, 0.09, null, 0.6);
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (!this.ready) return;
        this.noiseBurst(0.05, 'bandpass', 2000 + Math.random() * 800, 4, 0.06);
        this.tone('square', 90 + Math.random() * 40, 60, 0.12, 0.02);
      }, 500 + i * 420);
    }
    this.setPower(true);
  }

  finalAlarm() {
    if (!this.ready) return;
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (!this.ready) return;
        this.tone('square', 420, 420, 0.45, 0.035, null, 0.5);
        this.tone('square', 300, 300, 0.45, 0.028, null, 0.5, 0.5);
      }, i * 1200);
    }
  }

  victory() {
    if (!this.ready) return;
    this.tone('sine', 110, 110, 5, 0.07, null, 0.8);
    this.tone('sine', 164.81, 164.81, 4.5, 0.05, null, 0.8, 0.2);
    this.tone('sine', 220, 220, 4, 0.035, null, 0.8, 0.5);
    this.tone('sine', 329.63, 329.63, 3.5, 0.022, null, 0.8, 0.9);
    this.setPower(false);
  }
}
