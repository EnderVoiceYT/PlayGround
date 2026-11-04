import { CELL, GRID_W, GRID_H, ROOMS, gridIndex } from './leveldata.js';

const MAP_ZONE_COLORS = {
  hospital: '#3b463f',
  lab: '#354a47',
  industrial: '#4a4133',
  tunnel: '#333b36',
  corridorH: '#424a42',
  corridorV: '#3d4a47',
  corridorT: '#443d31',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * All DOM presentation for Blackmoor. The game owns simulation; this class owns
 * screens, HUD state, minimap rendering and touch-stick interpretation.
 */
export class UI {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'),
      loading: $('loading'),
      loadingFill: $('loading-fill'),
      loadingStatus: $('loading-status'),
      screenTitle: $('title-screen'),
      screenHelp: $('help-screen'),
      screenPause: $('pause-screen'),
      screenInventory: $('inventory-screen'),
      screenNote: $('note-screen'),
      screenDeath: $('death-screen'),
      screenVictory: $('victory-screen'),
      fade: $('fade'),
      damage: $('damage-flash'),
      dangerLine: $('danger-line'),
      threat: $('threat'),
      threatText: $('threat-text'),
      objectiveTitle: $('objective-title'),
      objectiveSub: $('objective-sub'),
      objectiveDistance: $('objective-distance'),
      fuseTrack: $('fuse-track'),
      roomName: $('room-name'),
      roomSub: $('room-sub'),
      minimap: $('minimap'),
      crosshair: $('crosshair'),
      healthFill: $('health-fill'),
      healthText: $('health-text'),
      staminaRow: $('stamina-row'),
      staminaFill: $('stamina-fill'),
      batteryFill: $('battery-fill'),
      batteryText: $('battery-text'),
      batteryIcon: $('battery-icon'),
      flashState: $('flash-state'),
      quickBattery: $('q-battery'),
      quickMedkit: $('q-medkit'),
      quickFlare: $('q-flare'),
      ammoMag: $('ammo-mag'),
      ammoReserve: $('ammo-reserve'),
      weapon: $('weapon'),
      reloadHint: $('reload-hint'),
      interact: $('interact'),
      interactKey: $('interact-key'),
      interactLabel: $('interact-label'),
      messages: $('messages'),
      banner: $('banner'),
      bannerKicker: $('banner-kicker'),
      bannerTitle: $('banner-title'),
      bannerSub: $('banner-sub'),
      touchUI: $('touch-ui'),
      moveStick: $('move-stick'),
      moveKnob: $('move-knob'),
      aimStick: $('aim-stick'),
      aimKnob: $('aim-knob'),
      pauseStats: $('pause-stats'),
      invGrid: $('inv-grid'),
      invNotes: $('inv-notes'),
      invObjective: $('inv-objective'),
      noteTitle: $('note-title'),
      noteMeta: $('note-meta'),
      noteBody: $('note-body'),
      noteIndex: $('note-index'),
      deathStats: $('death-stats'),
      victoryStats: $('victory-stats'),
      btnContinue: $('btn-continue'),
      titleSaveInfo: $('title-save-info'),
      btnMute: $('btn-mute'),
      volume: $('volume'),
      setGrain: $('set-grain'),
      setShake: $('set-shake'),
      setTouch: $('set-touch'),
      btnRestart: $('btn-restart'),
      btnLoad: $('btn-load'),
      btnNewRun: $('btn-new-run'),
    };

    this.mapCtx = this.el.minimap.getContext('2d');
    this.handlers = {};
    this.touch = {
      move: { x: 0, y: 0, active: false },
      aim: { x: 0, y: 0, active: false },
      fire: false,
    };
    this.touchMode = false;
    this.lastHud = {};
    this.lastObjective = {};
    this.msgTimers = new Set();
    this.bannerTimer = 0;
    this.damageTimer = 0;
    this.lastRoom = '';
    this.hitTimer = 0;
    this.time = 0;
    this.inventoryData = null;
    this.notesData = [];
    this._bindScreens();
    this._setupSticks();
  }

  // -------------------------------------------------------------------------
  // Binding
  // -------------------------------------------------------------------------

  bind(handlers) {
    this.handlers = handlers;
    const on = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', (e) => { e.preventDefault(); fn(e); });
    };
    on('btn-begin', () => this.handlers.begin?.());
    on('btn-continue', () => this.handlers.continue?.());
    on('btn-help', () => this.handlers.help?.());
    on('btn-help-close', () => this.handlers.helpClose?.());
    on('btn-resume', () => this.handlers.resume?.());
    on('btn-pause-inventory', () => this.handlers.pauseInventory?.());
    on('btn-pause-help', () => this.handlers.pauseHelp?.());
    on('btn-restart', () => this.handlers.restart?.());
    on('btn-quit', () => this.handlers.quit?.());
    on('btn-inv-close', () => this.handlers.invClose?.());
    on('btn-note-close', () => this.handlers.noteClose?.());
    on('btn-load', () => this.handlers.loadCheckpoint?.());
    on('btn-new-run', () => this.handlers.newRun?.());
    on('btn-replay', () => this.handlers.replay?.());
    on('btn-victory-title', () => this.handlers.victoryTitle?.());

    document.querySelectorAll('[data-quick]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const kind = btn.dataset.quick;
        if (kind === 'inventory') this.handlers.pauseInventory?.();
        else this.handlers.quickItem?.(kind);
      });
    });

    this.el.volume.addEventListener('input', () => {
      this.handlers.volume?.(Number(this.el.volume.value));
    });
    this.el.btnMute.addEventListener('click', () => this.handlers.mute?.());
    this.el.setGrain.addEventListener('change', () => this.handlers.setting?.('grain', this.el.setGrain.checked));
    this.el.setShake.addEventListener('change', () => this.handlers.setting?.('shake', this.el.setShake.checked));
    this.el.setTouch.addEventListener('change', () => this.handlers.setting?.('touch', this.el.setTouch.checked));

    this.el.invGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-use]');
      if (!btn) return;
      e.preventDefault();
      this.handlers.useItem?.(btn.dataset.use);
    });
    this.el.invNotes.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-note]');
      if (!btn) return;
      e.preventDefault();
      this.handlers.openNote?.(btn.dataset.note);
    });

    // Touch action buttons.
    const touch = (id, action) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.handlers.touchAction?.(action, true);
      });
      el.addEventListener('pointerup', (e) => { e.preventDefault(); this.handlers.touchAction?.(action, false); });
      el.addEventListener('pointercancel', () => this.handlers.touchAction?.(action, false));
      el.addEventListener('pointerleave', () => { if (action === 'fire') this.handlers.touchAction?.(action, false); });
    };
    touch('tb-fire', 'fire');
    touch('tb-interact', 'interact');
    touch('tb-reload', 'reload');
    touch('tb-flare', 'flare');
    touch('tb-flash', 'flashlight');
    touch('tb-inventory', 'inventory');
    touch('tb-pause', 'pause');
  }

  _bindScreens() {
    // Prevent interaction clicks from leaking through overlays.
    for (const id of ['screenHelp', 'screenPause', 'screenInventory', 'screenNote', 'screenDeath', 'screenVictory']) {
      const el = this.el[id];
      if (el) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
  }

  _setupSticks() {
    this._stick(this.el.moveStick, this.el.moveKnob, (x, y, active) => {
      this.touch.move.x = x;
      this.touch.move.y = y;
      this.touch.move.active = active;
      this.handlers.stickMove?.(x, y, active);
    });
    this._stick(this.el.aimStick, this.el.aimKnob, (x, y, active) => {
      this.touch.aim.x = x;
      this.touch.aim.y = y;
      this.touch.aim.active = active;
      this.handlers.stickAim?.(x, y, active);
    });
  }

  _stick(base, knob, onChange) {
    if (!base || !knob) return;
    let pointerId = null;
    let cx = 0, cy = 0, radius = 46;
    const move = (clientX, clientY) => {
      let dx = (clientX - cx) / radius;
      let dy = (cy - clientY) / radius;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      const dead = 0.13;
      const mag = Math.hypot(dx, dy);
      const active = mag > dead;
      knob.style.transform = `translate(${dx * radius * 0.82}px, ${-dy * radius * 0.82}px)`;
      onChange(active ? dx : 0, active ? dy : 0, active);
    };
    const reset = () => {
      pointerId = null;
      base.classList.remove('active');
      knob.style.transform = 'translate(0px, 0px)';
      onChange(0, 0, false);
    };
    base.addEventListener('pointerdown', (e) => {
      if (pointerId !== null) return;
      e.preventDefault();
      e.stopPropagation();
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      radius = Math.max(28, r.width * 0.32);
      pointerId = e.pointerId;
      base.classList.add('active');
      base.setPointerCapture?.(e.pointerId);
      move(e.clientX, e.clientY);
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      move(e.clientX, e.clientY);
    });
    base.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      reset();
    });
    base.addEventListener('pointercancel', () => { if (pointerId !== null) reset(); });
    base.addEventListener('lostpointercapture', () => { if (pointerId !== null) reset(); });
  }

  // -------------------------------------------------------------------------
  // Screen management
  // -------------------------------------------------------------------------

  hideScreens() {
    for (const key of ['screenTitle', 'screenHelp', 'screenPause', 'screenInventory', 'screenNote', 'screenDeath', 'screenVictory']) {
      this.el[key].classList.remove('active');
    }
  }

  showTitle(hasSave, saveInfo = '') {
    this.hideScreens();
    this.el.hud.classList.add('hidden');
    this.el.screenTitle.classList.add('active');
    this.el.btnContinue.classList.toggle('hidden', !hasSave);
    this.el.titleSaveInfo.textContent = hasSave ? saveInfo : 'NO RECORDED CHECKPOINT';
    document.body.classList.remove('playing');
    this.setTouchMode(this.touchMode);
  }

  showHelp(fromPause = false) {
    this.hideScreens();
    this.el.screenHelp.classList.add('active');
    this.el.screenHelp.dataset.from = fromPause ? 'pause' : 'title';
  }

  closeHelp() {
    const from = this.el.screenHelp.dataset.from;
    if (from === 'pause') {
      this.el.screenHelp.classList.remove('active');
      this.el.screenPause.classList.add('active');
    } else {
      this.el.screenHelp.classList.remove('active');
      this.el.screenTitle.classList.add('active');
    }
  }

  showPause(stats, hasSave) {
    this.hideScreens();
    this.el.screenPause.classList.add('active');
    this.el.pauseStats.innerHTML = this._statMarkup(stats);
    const restart = this.el.btnRestart;
    if (hasSave) {
      restart.textContent = 'LOAD LAST RECORD';
      restart.classList.remove('hidden');
    } else {
      restart.textContent = 'NO RECORDED CHECKPOINT';
      restart.classList.add('hidden');
    }
  }

  showInventory(items, notes, objective) {
    this.hideScreens();
    this.el.screenInventory.classList.add('active');
    this.renderInventory(items, notes, objective);
  }

  showNote(note, indexLabel = 'RECOVERED DOCUMENT') {
    this.hideScreens();
    this.el.screenNote.classList.add('active');
    this.el.noteTitle.textContent = note.title;
    this.el.noteMeta.textContent = note.meta || '';
    this.el.noteBody.textContent = note.body || '';
    this.el.noteIndex.textContent = indexLabel;
    this.el.screenNote.scrollTop = 0;
  }

  showDeath(stats, hasSave) {
    this.hideScreens();
    this.el.screenDeath.classList.add('active');
    this.el.deathStats.innerHTML = this._statMarkup(stats);
    this.el.btnLoad.classList.toggle('hidden', !hasSave);
    this.el.btnNewRun.textContent = hasSave ? 'BEGIN AGAIN' : 'DESCEND AGAIN';
    this.el.hud.classList.add('hidden');
    document.body.classList.remove('playing');
    this.setTouchMode(this.touchMode);
  }

  showVictory(stats) {
    this.hideScreens();
    this.el.screenVictory.classList.add('active');
    this.el.victoryStats.innerHTML = this._statMarkup(stats);
    this.el.hud.classList.add('hidden');
    document.body.classList.remove('playing');
    this.setTouchMode(this.touchMode);
  }

  showGame() {
    this.hideScreens();
    this.el.hud.classList.remove('hidden');
    document.body.classList.add('playing');
    this.setTouchMode(this.touchMode);
  }

  setTouchMode(enabled) {
    this.touchMode = !!enabled;
    document.body.classList.toggle('touch', this.touchMode);
    this.el.touchUI.classList.toggle('hidden', !this.touchMode);
    this.el.setTouch.checked = this.touchMode;
  }

  setLoading(progress, status) {
    this.el.loading.classList.add('active');
    this.el.loadingFill.style.width = `${Math.max(2, Math.min(100, progress))}%`;
    if (status) this.el.loadingStatus.textContent = status;
  }

  hideLoading() {
    this.el.loadingFill.style.width = '100%';
    this.el.loading.classList.add('leaving');
    setTimeout(() => this.el.loading.classList.remove('active', 'leaving'), 850);
    this.el.fade.classList.add('clear');
  }

  fadeOut(instant = false) {
    this.el.fade.classList.remove('white', 'clear');
    if (instant) this.el.fade.style.transition = 'none';
    else this.el.fade.style.transition = '';
    // Force style flush for the instant case.
    void this.el.fade.offsetWidth;
  }

  fadeIn() {
    this.el.fade.classList.add('clear');
  }

  fadeToWhite(onDone) {
    this.el.fade.classList.remove('clear');
    this.el.fade.classList.add('white');
    void this.el.fade.offsetWidth;
    this.el.fade.classList.add('on');
    setTimeout(() => onDone?.(), 2200);
  }

  resetFadeWhite() {
    this.el.fade.classList.remove('white', 'on', 'clear');
  }

  setContinueAvailability(hasSave, saveInfo = '') {
    this.el.btnContinue.classList.toggle('hidden', !hasSave);
    this.el.titleSaveInfo.textContent = hasSave ? saveInfo : 'NO RECORDED CHECKPOINT';
  }

  updatePauseStats(stats) {
    this.el.pauseStats.innerHTML = this._statMarkup(stats);
  }

  _statMarkup(stats) {
    if (!stats) return '';
    return `
      <span><b>${escapeHtml(stats.time || '00:00')}</b>TIME BELOW</span>
      <span><b>${escapeHtml(String(stats.kills ?? 0))}</b>KILLS</span>
      <span><b>${escapeHtml(String(stats.fuses ?? 0))}/3</b>FUSES</span>
      <span><b>${escapeHtml(stats.room || '—')}</b>LOCATION</span>
    `;
  }

  setVolume(v) {
    this.el.volume.value = String(v);
  }

  setMuted(m) {
    this.el.btnMute.textContent = m ? 'SOUND OFF' : 'SOUND ON';
    this.el.btnMute.classList.toggle('active', m);
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  setVitals(v) {
    const h = this.lastHud;
    const health = Math.max(0, Math.round(v.health));
    if (h.health !== health) {
      this.el.healthFill.style.width = `${health}%`;
      this.el.healthFill.classList.toggle('low', health <= 30);
      this.el.healthText.textContent = String(health);
      h.health = health;
    }
    if (h.stamina !== Math.round(v.stamina)) {
      this.el.staminaFill.style.width = `${Math.max(0, Math.min(100, v.stamina))}%`;
      this.el.staminaRow.style.opacity = v.stamina < 99.5 ? '0.85' : '0.4';
      h.stamina = Math.round(v.stamina);
    }
    const battery = Math.max(0, Math.round(v.battery));
    if (h.battery !== battery) {
      this.el.batteryFill.style.width = `${battery}%`;
      this.el.batteryFill.classList.toggle('low', battery <= 20);
      this.el.batteryText.textContent = `${battery}%`;
      h.battery = battery;
    }
    if (h.flash !== v.flashOn || h.batteryEmpty !== (battery <= 0)) {
      this.el.flashState.textContent = v.flashOn ? 'FLASHLIGHT · ON' : (battery <= 0 ? 'FLASHLIGHT · DEPLETED' : 'FLASHLIGHT · OFF');
      this.el.flashState.classList.toggle('on', !!v.flashOn);
      this.el.batteryIcon.style.color = v.flashOn ? 'var(--amber)' : 'var(--faint)';
      h.flash = v.flashOn;
      h.batteryEmpty = battery <= 0;
    }
    if (h.ammo !== v.ammo || h.reserve !== v.reserve) {
      this.el.ammoMag.textContent = String(v.ammo);
      this.el.ammoReserve.textContent = String(v.reserve);
      this.el.weapon.classList.toggle('empty', v.ammo <= 0);
      h.ammo = v.ammo;
      h.reserve = v.reserve;
    }
    if (h.reloading !== v.reloading) {
      this.el.reloadHint.textContent = v.reloading ? 'RELOADING…' : 'R · RELOAD';
      this.el.reloadHint.classList.toggle('active', !!v.reloading);
      h.reloading = v.reloading;
    }
    if (h.bats !== v.batteries) {
      this.el.quickBattery.textContent = String(v.batteries);
      this.el.quickBattery.parentElement.classList.toggle('disabled', v.batteries <= 0);
      h.bats = v.batteries;
    }
    if (h.meds !== v.medkits) {
      this.el.quickMedkit.textContent = String(v.medkits);
      this.el.quickMedkit.parentElement.classList.toggle('disabled', v.medkits <= 0);
      h.meds = v.medkits;
    }
    if (h.flares !== v.flares) {
      this.el.quickFlare.textContent = String(v.flares);
      this.el.quickFlare.parentElement.classList.toggle('disabled', v.flares <= 0);
      h.flares = v.flares;
    }
  }

  setObjective(title, sub, distance, fuses, installed) {
    if (this.lastObjective.title !== title) {
      this.el.objectiveTitle.textContent = title;
      this.lastObjective.title = title;
    }
    if (this.lastObjective.sub !== sub) {
      this.el.objectiveSub.textContent = sub;
      this.lastObjective.sub = sub;
    }
    this.setObjectiveDistance(distance);
    const key = `${fuses?.ward}|${fuses?.cold}|${fuses?.pump}|${installed}`;
    if (this.lastObjective.fuses !== key) {
      for (const chip of this.el.fuseTrack.children) {
        const id = chip.dataset.fuse;
        chip.classList.toggle('has', !!fuses?.[id]);
        chip.classList.toggle('installed', !!installed && !!fuses?.[id]);
      }
      this.lastObjective.fuses = key;
    }
  }

  setObjectiveDistance(distance) {
    const text = Number.isFinite(distance) ? `DISTANCE · ${Math.round(distance)} M` : '';
    if (this.lastObjective.distance !== text) {
      this.el.objectiveDistance.textContent = text;
      this.lastObjective.distance = text;
    }
  }

  setRoom(name, sub) {
    if (this.lastRoom !== name) {
      this.el.roomName.textContent = name || 'Sublevel 3';
      this.el.roomSub.textContent = sub || 'St. Aldric Hospital';
      this.lastRoom = name;
    }
  }

  setInteract(label, key = 'E', locked = false, visible = true) {
    if (!visible) {
      this.el.interact.classList.add('hidden');
      return;
    }
    if (this.lastInteract !== label || this.lastInteractLocked !== locked) {
      this.el.interactLabel.textContent = label;
      this.el.interactKey.textContent = key;
      this.el.interact.classList.toggle('locked', locked);
      this.lastInteract = label;
      this.lastInteractLocked = locked;
    }
    this.el.interact.classList.remove('hidden');
  }

  setCrosshair(x, y, visible, hot = false) {
    const el = this.el.crosshair;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.classList.toggle('hidden', !visible);
    el.classList.toggle('target', hot);
  }

  crosshairHit() {
    const el = this.el.crosshair;
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
    clearTimeout(this.hitTimer);
    this.hitTimer = setTimeout(() => el.classList.remove('hit'), 230);
  }

  setThreat(level) {
    const visible = level > 0.32;
    this.el.threat.classList.toggle('hidden', !visible);
    if (visible) {
      const text = level > 0.74 ? 'IT HAS YOUR SCENT' : level > 0.52 ? 'SOMETHING IS HUNTING' : 'SOMETHING IS NEAR';
      if (this.el.threatText.textContent !== text) this.el.threatText.textContent = text;
      this.el.threat.style.opacity = String(0.42 + level * 0.58);
    }
    this.el.dangerLine.classList.toggle('on', level > 0.45);
  }

  message(text, kind = 'info', duration = 3000) {
    const div = document.createElement('div');
    div.className = `msg ${kind}`;
    div.textContent = text;
    this.el.messages.appendChild(div);
    while (this.el.messages.children.length > 4) this.el.messages.removeChild(this.el.messages.firstChild);
    const t1 = setTimeout(() => {
      div.classList.add('fade');
      const t2 = setTimeout(() => {
        div.remove();
        this.msgTimers.delete(t1);
        this.msgTimers.delete(t2);
      }, 520);
      this.msgTimers.add(t2);
    }, duration);
    this.msgTimers.add(t1);
  }

  banner(kicker, title, sub = '', duration = 3200) {
    clearTimeout(this.bannerTimer);
    this.el.bannerKicker.textContent = kicker;
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub;
    this.el.banner.classList.remove('hidden');
    this.el.banner.classList.remove('show');
    void this.el.banner.offsetWidth;
    this.el.banner.classList.add('show');
    this.bannerTimer = setTimeout(() => {
      this.el.banner.classList.add('hidden');
      this.el.banner.classList.remove('show');
    }, duration);
  }

  damageFlash(strength = 1) {
    this.el.damage.style.opacity = String(Math.min(1, 0.45 + strength * 0.55));
    clearTimeout(this.damageTimer);
    this.damageTimer = setTimeout(() => { this.el.damage.style.opacity = '0'; }, 110);
  }

  // -------------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------------

  renderInventory(items, notes = [], objective = '') {
    this.inventoryData = items;
    this.notesData = notes;
    this.el.invGrid.innerHTML = items.map((item) => {
      const cls = [item.key ? 'key' : '', item.med ? 'med' : '', item.count === 0 && !item.always ? 'empty' : ''].join(' ');
      const count = typeof item.count === 'string' ? item.count : String(item.count);
      return `
        <article class="inv-item ${cls}">
          <div class="inv-icon">${item.icon || '·'}</div>
          <div class="inv-count">${escapeHtml(count)}</div>
          <div class="inv-name">${escapeHtml(item.name)}</div>
          <div class="inv-desc">${escapeHtml(item.desc || '')}</div>
          ${item.usable && item.count > 0 ? `<button class="inv-use" data-use="${escapeHtml(item.id)}">USE</button>` : ''}
        </article>
      `;
    }).join('');

    if (!notes.length) {
      this.el.invNotes.innerHTML = '<div class="inv-empty">No documents recovered. Paper remembers what people tried to erase.</div>';
    } else {
      this.el.invNotes.innerHTML = notes.map((n) => `
        <button class="inv-note ${n.read ? '' : 'unread'}" data-note="${escapeHtml(n.id)}">
          ${escapeHtml(n.title)}
          <span>${n.read ? 'RECOVERED' : 'UNREAD'} · ${escapeHtml(n.meta || '')}</span>
        </button>
      `).join('');
    }
    this.el.invObjective.innerHTML = `<b>CURRENT DIRECTIVE</b>${escapeHtml(objective || '')}`;
  }

  // -------------------------------------------------------------------------
  // Minimap
  // -------------------------------------------------------------------------

  drawMinimap(state) {
    const ctx = this.mapCtx;
    const W = this.el.minimap.width;
    const H = this.el.minimap.height;
    const pad = 14;
    const scale = Math.min((W - pad * 2) / GRID_W, (H - pad * 2) / GRID_H);
    const ox = (W - GRID_W * scale) / 2;
    const oy = (H - GRID_H * scale) / 2;
    const time = state.time || 0;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(2,5,5,0.85)';
    ctx.fillRect(0, 0, W, H);

    // Grid texture.
    ctx.strokeStyle = 'rgba(150,170,155,0.025)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= GRID_W; x += 8) {
      ctx.beginPath();
      ctx.moveTo(ox + x * scale, oy);
      ctx.lineTo(ox + x * scale, oy + GRID_H * scale);
      ctx.stroke();
    }
    for (let y = 0; y <= GRID_H; y += 8) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + y * scale);
      ctx.lineTo(ox + GRID_W * scale, oy + y * scale);
      ctx.stroke();
    }

    const world = state.world;
    if (world) {
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const i = gridIndex(x, y);
          if (!world.explored.has(i)) continue;
          const zone = world.zone[i] || 'hospital';
          ctx.fillStyle = MAP_ZONE_COLORS[zone] || '#3a423c';
          ctx.fillRect(ox + x * scale, oy + y * scale, scale + 0.4, scale + 0.4);
        }
      }

      // Room outlines for discovered rooms.
      ctx.lineWidth = 1;
      for (const [id, room] of Object.entries(ROOMS)) {
        if (!world.discoveredRooms?.has(id)) continue;
        const [x1, y1, x2, y2] = room.rect;
        ctx.strokeStyle = 'rgba(180,196,178,0.12)';
        ctx.strokeRect(ox + x1 * scale, oy + y1 * scale, (x2 - x1 + 1) * scale, (y2 - y1 + 1) * scale);
      }

      // Doors.
      for (const door of world.doors) {
        const dx = door.x / CELL;
        const dz = door.z / CELL;
        ctx.strokeStyle = door.locked ? 'rgba(224,86,66,0.8)' : 'rgba(150,190,160,0.55)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (door.orient === 'h') {
          ctx.moveTo(ox + (dx - 0.9) * scale, oy + dz * scale);
          ctx.lineTo(ox + (dx + 0.9) * scale, oy + dz * scale);
        } else {
          ctx.moveTo(ox + dx * scale, oy + (dz - 0.9) * scale);
          ctx.lineTo(ox + dx * scale, oy + (dz + 0.9) * scale);
        }
        ctx.stroke();
      }

      // Save stations.
      for (const st of world.stations || []) {
        const sx = st.position.x / CELL;
        const sz = st.position.z / CELL;
        ctx.fillStyle = st.charges > 0 ? 'rgba(168,216,188,0.9)' : 'rgba(110,120,108,0.5)';
        ctx.fillRect(ox + sx * scale - 2, oy + sz * scale - 2, 4, 4);
      }

      // Objective marker.
      const obj = state.objective;
      if (obj && Number.isFinite(obj.x) && Number.isFinite(obj.z)) {
        const gx = obj.x / CELL;
        const gz = obj.z / CELL;
        const px = ox + gx * scale;
        const py = oy + gz * scale;
        const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
        ctx.strokeStyle = `rgba(217,165,95,${0.35 + pulse * 0.55})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 6 + pulse * 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(240,205,140,0.95)';
        ctx.beginPath();
        ctx.moveTo(px, py - 5);
        ctx.lineTo(px + 4.4, py + 3.4);
        ctx.lineTo(px - 4.4, py + 3.4);
        ctx.closePath();
        ctx.fill();
      }

      // Nearby active threats.
      for (const e of state.enemies || []) {
        if (!e || e.dead || e.hidden) continue;
        if (!(e.state === 'chase' || e.state === 'attack' || e.state === 'emerge' || e.state === 'investigate')) continue;
        const d = Math.hypot(e.x - state.player.x, e.z - state.player.z);
        if (d > 24) continue;
        const ex = ox + (e.x / CELL) * scale;
        const ez = oy + (e.z / CELL) * scale;
        ctx.fillStyle = e.state === 'chase' || e.state === 'attack' ? 'rgba(226,72,52,0.95)' : 'rgba(210,130,70,0.8)';
        ctx.beginPath();
        ctx.arc(ex, ez, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Player arrow.
      const px = ox + (state.player.x / CELL) * scale;
      const py = oy + (state.player.z / CELL) * scale;
      const angle = state.playerAngle || 0;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.fillStyle = '#f0e8d2';
      ctx.shadowColor = 'rgba(255,245,215,0.8)';
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2.4);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.shadowBlur = 0;
    }

    // Compass.
    ctx.fillStyle = 'rgba(160,175,160,0.45)';
    ctx.font = 'bold 12px "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', W / 2, 11);
    ctx.strokeStyle = 'rgba(160,175,160,0.18)';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 8, 15);
    ctx.lineTo(W / 2 + 8, 15);
    ctx.stroke();
  }

  // -------------------------------------------------------------------------
  // Per-frame decay
  // -------------------------------------------------------------------------

  update(dt) {
    this.time += dt;
  }
}
