import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import {
  CELL, PLAYER_START, NOTES, ROOMS, ELEVATOR_POS, GENERATOR_CONSOLE,
} from './leveldata.js';

const SAVE_KEY = 'blackmoor.save.v1';
const SETTINGS_KEY = 'blackmoor.settings.v1';
const AUTOLOAD_KEY = 'blackmoor.autoload.v1';
const MAX_MAG = 12;
const MAX_HEALTH = 100;
const MAX_BATTERY = 100;
const MAP_HZ = 8;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

function angleDamp(a, b, rate, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-rate * dt));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

class Game {
  constructor() {
    this.ui = new UI();
    this.settings = this.loadSettings();
    this.audio = new AudioEngine();
    this.mode = 'loading';
    this.time = 0;
    this.playTime = 0;
    this.runStarted = false;
    this.ready = false;

    this.keys = new Set();
    this.pointerNDC = new THREE.Vector2(0, 0);
    this.pointerActive = false;
    this.mouseX = window.innerWidth / 2;
    this.mouseY = window.innerHeight / 2;
    this.firingMouse = false;
    this.touchFiring = false;
    this.aim = new THREE.Vector3(0, 0, -1);
    this.lastAim = new THREE.Vector3(0, 0, -1);
    this.moveDir = new THREE.Vector3();
    this.interaction = null;
    this.interactionTimer = 0;
    this.objective = { title: '', sub: '', marker: null };
    this.objectiveText = '';
    this.objectiveTimer = 0;
    this.mapTimer = 0;
    this.hudTimer = 0;
    this.minimapTime = 0;
    this.visitedRooms = new Set();
    this.powerAnnounced = false;
    this.titleTime = 0;
    this.shake = 0;
    this.invuln = 0;
    this.deadTimer = 0;
    this.escapeTimer = 0;
    this.footstepTimer = 0;
    this.heartbeatTimer = 0;
    this.breathTimer = 0;
    this.dangerSmoothed = 0;
    this.noteReturn = 'play';
    this.inventoryReturn = 'play';
    this.soundCooldowns = {};
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.15);
    this.aimPoint = new THREE.Vector3();
    this.cameraLook = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.cameraDesired = new THREE.Vector3();
    this.clock = new THREE.Clock();

    this.resetRun();

    this.setupRenderer();
    this.setupScene();
    this.setupInput();
    this.bindUI();
    this.applySettings();

    this.ui.setTouchMode(this.settings.touch);
    this.ui.setVolume(this.settings.volume);
    this.ui.setMuted(this.settings.muted);

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
    requestAnimationFrame(() => this.boot());
  }

  // =========================================================================
  // Boot
  // =========================================================================

  async boot() {
    try {
      this.ui.setLoading(8, 'CALIBRATING LIGHT');
      await nextFrame();
      this.ui.setLoading(20, 'MAPPING SUBLEVEL 3');
      await nextFrame();

      this.world = new World(this.scene, this.renderer, this.audio);
      this.ui.setLoading(52, 'RAISING WALLS');
      await nextFrame();

      this.player = new Player(this.scene);
      this.player.spot.shadow.mapSize.set(1024, 1024);
      this.player.group.visible = false;
      this.playerPos = new THREE.Vector3(
        PLAYER_START.x * CELL,
        0,
        PLAYER_START.y * CELL,
      );
      this.player.group.position.copy(this.playerPos);
      this.world.playerPos.copy(this.playerPos);

      this.ui.setLoading(68, 'WAKING THE RESIDENTS');
      await nextFrame();

      this.enemies = new EnemyManager(this.scene, this.world, {
        onPlayerDamage: (amount, type, pos) => this.hurt(amount, type, pos),
        drainBattery: (amount) => this.drainBattery(amount),
        onKill: (enemy) => this.onKill(enemy),
      });

      this.ui.setLoading(86, 'CUTTING THE POWER');
      await nextFrame();

      this.setupAtmosphereLights();
      this.camera.position.copy(this.titleCameraPosition(0));
      this.cameraLook.copy(this.titleLookTarget());
      this.camera.lookAt(this.cameraLook);

      this.ui.setLoading(100, 'READY');
      await delay(260);
      this.ui.hideLoading();
      this.ready = true;
      this.clock.getDelta();

      if (new URLSearchParams(location.search).has('debug')) window.__blackmoor = this;

      const autoload = sessionStorage.getItem(AUTOLOAD_KEY) === '1';
      sessionStorage.removeItem(AUTOLOAD_KEY);
      const save = this.readSave();
      this.ui.setContinueAvailability(!!save, this.saveInfo(save));

      if (autoload && save) {
        this.ensureAudioOnGesture();
        this.loadFromData(save);
        this.startRun(true);
      } else {
        this.mode = 'title';
        this.titleTime = 0;
        this.ui.showTitle(!!save, this.saveInfo(save));
      }
    } catch (err) {
      console.error('[BLACKMOOR] boot failed', err);
      this.ui.setLoading(100, `FAILED TO OPEN SUBLEVEL 3 — ${err.message}`);
    }
  }

  setupRenderer() {
    const canvas = document.getElementById('scene');
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.26;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x030606, 1);

    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 250));
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030606);
    this.scene.fog = new THREE.FogExp2(0x05090a, 0.0175);
    this.camera = new THREE.PerspectiveCamera(
      40,
      window.innerWidth / window.innerHeight,
      0.4,
      180,
    );
    this.camera.position.set(30, 12, 28);
    this.camera.lookAt(26, 0, 22);
    this.scene.add(this.camera);
  }

  setupAtmosphereLights() {
    const hemi = new THREE.HemisphereLight(0x607b78, 0x0b100e, 0.38);
    hemi.name = 'ambient-hemi';
    this.scene.add(hemi);
    const ambient = new THREE.AmbientLight(0x26302e, 0.3);
    this.scene.add(ambient);
    const moon = new THREE.DirectionalLight(0x8ba6ad, 0.22);
    moon.position.set(-24, 38, 16);
    this.scene.add(moon);

    // A dying skylight over the lobby gives the title shot depth while keeping
    // the rest of the floor dependent on the flashlight.
    const lobbyLamp = new THREE.PointLight(0xffd4a0, 14, 13, 2);
    lobbyLamp.position.set(12 * CELL, 4.2, 9 * CELL);
    lobbyLamp.name = 'lobby-skylight';
    this.scene.add(lobbyLamp);
    this.lobbyLamp = lobbyLamp;
  }

  onResize() {
    if (!this.renderer || !this.camera) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // =========================================================================
  // Input
  // =========================================================================

  setupInput() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => {
      this.keys.clear();
      if (this.mode === 'playing' && this.ready) this.pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing' && this.ready) this.pause();
    });

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.updatePointer(e.clientX, e.clientY);
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.updatePointer(e.clientX, e.clientY);
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button !== 0) return;
      if (this.mode !== 'playing') return;
      e.preventDefault();
      this.firingMouse = true;
      this.tryShoot();
    });
    window.addEventListener('pointerup', () => { this.firingMouse = false; });
    window.addEventListener('pointercancel', () => { this.firingMouse = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Resume audio after a reload if the browser needs a fresh gesture.
    this.ensureAudioOnGesture();
  }

  ensureAudioOnGesture() {
    if (this.audio.ready) return;
    const resume = () => {
      this.audio.init();
      this.audio.setVolume(this.settings.volume);
      this.audio.setMuted(this.settings.muted);
      if (this.world?.flags.powered) this.audio.setPower(true);
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  updatePointer(x, y) {
    this.mouseX = x;
    this.mouseY = y;
    this.pointerNDC.set(
      (x / window.innerWidth) * 2 - 1,
      -(y / window.innerHeight) * 2 + 1,
    );
    this.pointerActive = true;
  }

  onKeyDown(e) {
    const code = e.code;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (code === 'Escape') {
      e.preventDefault();
      if (this.ui.el.screenHelp.classList.contains('active')) {
        this.ui.closeHelp();
        return;
      }
      if (this.mode === 'playing') this.pause();
      else if (this.mode === 'paused') this.resume();
      else if (this.mode === 'inventory') this.closeInventory();
      else if (this.mode === 'note') this.closeNote();
      return;
    }

    if (code === 'Tab' || code === 'KeyI') {
      if (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'inventory') {
        e.preventDefault();
        if (this.mode === 'inventory') this.closeInventory();
        else this.openInventory();
      }
      return;
    }

    if (this.mode !== 'playing') return;

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      e.preventDefault();
    }

    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(code)) {
      this.keys.add(code);
      return;
    }
    if (e.repeat) return;

    switch (code) {
      case 'KeyE': this.interact(); break;
      case 'KeyF': this.toggleFlashlight(); break;
      case 'KeyR': this.startReload(); break;
      case 'KeyG': this.throwFlare(); break;
      case 'KeyH': this.useMedkit(); break;
      case 'KeyB': this.useBattery(); break;
      case 'KeyM': this.toggleMute(); break;
      default: break;
    }
  }

  onKeyUp(e) {
    this.keys.delete(e.code);
  }

  bindUI() {
    this.ui.bind({
      begin: () => this.beginNewRun(),
      continue: () => this.continueRun(),
      help: () => { this.ui.showHelp(false); },
      helpClose: () => { this.ui.closeHelp(); },
      resume: () => this.resume(),
      pauseInventory: () => this.openInventory(),
      pauseHelp: () => { this.ui.showHelp(true); },
      restart: () => this.loadCheckpoint(),
      quit: () => { sessionStorage.removeItem(AUTOLOAD_KEY); location.reload(); },
      invClose: () => this.closeInventory(),
      noteClose: () => this.closeNote(),
      loadCheckpoint: () => this.loadCheckpoint(),
      newRun: () => this.beginAgain(),
      replay: () => this.beginAgain(true),
      victoryTitle: () => { localStorage.removeItem(SAVE_KEY); location.reload(); },
      volume: (v) => {
        this.settings.volume = v;
        this.audio.setVolume(v);
        this.saveSettings();
      },
      mute: () => this.toggleMute(),
      setting: (key, value) => this.changeSetting(key, value),
      quickItem: (kind) => {
        if (this.mode !== 'playing') return;
        if (kind === 'battery') this.useBattery();
        else if (kind === 'medkit') this.useMedkit();
        else if (kind === 'flare') this.throwFlare();
      },
      useItem: (kind) => this.useItemFromInventory(kind),
      openNote: (id) => this.openNoteFromInventory(id),
      touchAction: (action, down) => this.onTouchAction(action, down),
      stickMove: () => {},
      stickAim: () => {},
    });
  }

  onTouchAction(action, down) {
    if (action === 'fire') {
      this.touchFiring = down;
      if (down && this.mode === 'playing') this.tryShoot();
      return;
    }
    if (!down) return;
    if (this.mode !== 'playing') {
      if (action === 'pause') this.pause();
      return;
    }
    switch (action) {
      case 'interact': this.interact(); break;
      case 'reload': this.startReload(); break;
      case 'flare': this.throwFlare(); break;
      case 'flashlight': this.toggleFlashlight(); break;
      case 'inventory': this.openInventory(); break;
      case 'pause': this.pause(); break;
      default: break;
    }
  }

  // =========================================================================
  // Run lifecycle
  // =========================================================================

  resetRun() {
    this.health = MAX_HEALTH;
    this.stamina = 100;
    this.battery = MAX_BATTERY;
    this.mag = 8;
    this.reserve = 12;
    this.medkits = 1;
    this.batteries = 2;
    this.flares = 1;
    this.flashOn = true;
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.kills = 0;
    this.readNotes = {};
    this.staminaDelay = 0;
    this.invuln = 0;
    this.deadTimer = 0;
    this.escapeTimer = 0;
    this.footstepTimer = 0;
    this.heartbeatTimer = 0;
    this.breathTimer = 0;
    this.aim.set(0, 0, -1);
    this.lastAim.set(0, 0, -1);
    this.moveDir.set(0, 0, 0);
    this.visitedRooms = new Set();
    this.powerAnnounced = false;
    this.dead = false;
    this.firingMouse = false;
    this.touchFiring = false;
    this.healthLowWarned = false;
    this.batteryWarned = false;
    this.whiteStarted = false;
  }

  beginNewRun() {
    if (this.runStarted || this.mode !== 'title') {
      localStorage.removeItem(SAVE_KEY);
      sessionStorage.removeItem(AUTOLOAD_KEY);
      location.reload();
      return;
    }
    localStorage.removeItem(SAVE_KEY);
    this.audio.init();
    this.audio.setVolume(this.settings.volume);
    this.audio.setMuted(this.settings.muted);
    this.ui.setContinueAvailability(false);
    this.startRun(false);
  }

  continueRun() {
    const save = this.readSave();
    if (!save) {
      this.ui.message?.('No valid checkpoint was found.', 'warn');
      return;
    }
    this.audio.init();
    this.audio.setVolume(this.settings.volume);
    this.audio.setMuted(this.settings.muted);
    this.loadFromData(save);
    this.startRun(true);
  }

  startRun(fromSave) {
    this.runStarted = true;
    this.mode = 'playing';
    this.player.group.visible = true;
    this.player.group.position.copy(this.playerPos);
    this.player.group.rotation.y = Math.atan2(this.aim.x, this.aim.z);
    this.world.playerPos.copy(this.playerPos);
    this.audio.setPower(this.world.flags.powered);
    this.powerAnnounced = this.world.flags.powered;
    this.ui.showGame();
    this.ui.setCrosshair(this.mouseX, this.mouseY, !this.ui.touchMode);
    this.ui.resetFadeWhite();
    this.ui.fadeIn();
    this.ui.setTouchMode(this.settings.touch);

    const room = this.world.roomAt(this.playerPos.x, this.playerPos.z);
    this.ui.setRoom(room?.name || 'Sublevel 3', room?.sub || 'St. Aldric Hospital');
    this.ui.banner(
      fromSave ? 'RECORD RESTORED' : 'ST. ALDRIC HOSPITAL · SUBLEVEL 3',
      fromSave ? 'LAST CHECKPOINT' : 'THE LIGHTS ARE OUT',
      fromSave ? 'The dark has not moved.' : 'Find the security card. Restore the grid. Leave.',
      3600,
    );
    setTimeout(() => {
      if (this.mode !== 'playing') return;
      this.ui.message('WASD move · Mouse aim · LMB fire · E interact · F flashlight', 'info', 5200);
    }, 1400);
    this.updateObjective(true);
    this.clock.getDelta();
    this.keys.clear();
    document.activeElement?.blur?.();
  }

  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.keys.clear();
    this.firingMouse = false;
    this.touchFiring = false;
    this.ui.setCrosshair(0, 0, false);
    this.ui.setInteract('', 'E', false, false);
    this.ui.setThreat(0);
    this.ui.showPause(this.stats(), !!this.readSave());
  }

  resume() {
    if (this.mode !== 'paused') return;
    this.mode = 'playing';
    this.ui.showGame();
    this.clock.getDelta();
  }

  openInventory() {
    if (!['playing', 'paused', 'inventory'].includes(this.mode)) return;
    if (this.mode === 'inventory') { this.closeInventory(); return; }
    this.inventoryReturn = this.mode === 'paused' ? 'paused' : 'playing';
    this.mode = 'inventory';
    this.keys.clear();
    this.firingMouse = false;
    this.touchFiring = false;
    this.ui.setCrosshair(0, 0, false);
    this.ui.setInteract('', 'E', false, false);
    this.ui.setThreat(0);
    this.ui.showInventory(this.inventoryItems(), this.inventoryNotes(), this.objectiveDescription());
  }

  closeInventory() {
    if (this.mode !== 'inventory') return;
    if (this.inventoryReturn === 'paused') {
      this.mode = 'paused';
      this.ui.showPause(this.stats(), !!this.readSave());
    } else {
      this.mode = 'playing';
      this.ui.showGame();
      this.clock.getDelta();
    }
  }

  showNote(noteId, returnMode = 'play') {
    const note = NOTES[noteId];
    if (!note) return;
    this.noteReturn = returnMode;
    this.mode = 'note';
    this.keys.clear();
    this.firingMouse = false;
    this.touchFiring = false;
    this.readNotes[noteId] = true;
    if (this.world) this.world.flags.notesRead[noteId] = true;
    this.ui.setInteract('', 'E', false, false);
    this.ui.setCrosshair(0, 0, false);
    this.ui.setThreat(0);
    this.ui.showNote(note, `${Object.keys(this.readNotes).length} DOCUMENT${Object.keys(this.readNotes).length === 1 ? '' : 'S'} RECOVERED`);
    this.audio.pickup('note');
  }

  closeNote() {
    if (this.mode !== 'note') return;
    if (this.noteReturn === 'inventory') {
      this.mode = 'inventory';
      this.ui.showInventory(this.inventoryItems(), this.inventoryNotes(), this.objectiveDescription());
    } else {
      this.mode = 'playing';
      this.ui.showGame();
      this.clock.getDelta();
    }
  }

  openNoteFromInventory(id) {
    if (this.mode !== 'inventory') return;
    this.showNote(id, 'inventory');
  }

  stats() {
    const room = this.world?.roomAt(this.playerPos.x, this.playerPos.z);
    return {
      time: formatTime(this.playTime),
      kills: this.kills,
      fuses: this.fuseCount(),
      room: room?.name || 'Sublevel 3',
    };
  }

  eliminate() {
    this.dead = true;
    this.audio.death();
    this.mode = 'dying';
    this.deadTimer = 0;
    this.keys.clear();
    this.firingMouse = false;
    this.touchFiring = false;
    this.flashOn = false;
    if (this.world) this.world.flashlight.on = false;
    this.ui.setThreat(0);
    this.ui.setInteract('', 'E', false, false);
    this.ui.setCrosshair(0, 0, false);
  }

  completeEscape() {
    if (this.mode !== 'playing') return;
    this.mode = 'ending';
    this.escapeTimer = 0;
    this.keys.clear();
    this.firingMouse = false;
    this.touchFiring = false;
    this.audio.victory();
    this.audio.door(true);
    this.ui.setThreat(0);
    this.ui.setInteract('', 'E', false, false);
    this.ui.setCrosshair(0, 0, false);
    this.ui.banner('SERVICE ELEVATOR', 'DOORS OPENING', 'SURFACE ACCESS · NINE SECONDS', 3000);
    this.ui.message('The car shudders upward. Something below screams.', 'warn', 4000);
  }

  // =========================================================================
  // Save / load
  // =========================================================================

  loadSettings() {
    const detected = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      || (navigator.maxTouchPoints > 0 && window.innerWidth < 1000);
    const defaults = {
      volume: 0.8,
      muted: false,
      grain: true,
      shake: true,
      touch: detected,
    };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...defaults, ...JSON.parse(raw) };
    } catch {}
    return defaults;
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch {}
  }

  applySettings() {
    document.body.classList.toggle('no-grain', !this.settings.grain);
    this.ui.el.setGrain.checked = !!this.settings.grain;
    this.ui.el.setShake.checked = !!this.settings.shake;
    this.ui.el.setTouch.checked = !!this.settings.touch;
    this.ui.setVolume(this.settings.volume);
    this.ui.setMuted(!!this.settings.muted);
    this.audio.setVolume(this.settings.volume);
    this.audio.setMuted(!!this.settings.muted);
    if (this.world) this.ui.setTouchMode(this.settings.touch || this.detectTouch());
  }

  detectTouch() {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      || (navigator.maxTouchPoints > 0 && window.innerWidth < 1000);
  }

  changeSetting(key, value) {
    if (key === 'grain') {
      this.settings.grain = !!value;
      document.body.classList.toggle('no-grain', !value);
    } else if (key === 'shake') {
      this.settings.shake = !!value;
    } else if (key === 'touch') {
      this.settings.touch = !!value;
      this.ui.setTouchMode(!!value);
    }
    this.saveSettings();
  }

  toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.audio.setMuted(this.settings.muted);
    this.ui.setMuted(this.settings.muted);
    this.saveSettings();
  }

  readSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1 || !data.player || !data.world) return null;
      return data;
    } catch { return null; }
  }

  saveInfo(save) {
    if (!save) return '';
    const p = save.player || {};
    const room = p.room || 'SUBLEVEL 3';
    return `CHECKPOINT · ${formatTime(save.playTime || 0)} · ${room.toUpperCase()}`;
  }

  writeSave(station) {
    if (!this.world) return;
    const room = this.world.roomAt(this.playerPos.x, this.playerPos.z);
    const data = {
      version: 1,
      timestamp: Date.now(),
      playTime: this.playTime,
      kills: this.kills,
      notesRead: { ...this.readNotes },
      flags: { ...this.world.flags },
      world: this.world.getSaveState(),
      player: {
        x: this.playerPos.x,
        z: this.playerPos.z,
        room: room?.name || 'Sublevel 3',
        health: this.health,
        stamina: this.stamina,
        battery: this.battery,
        mag: this.mag,
        reserve: this.reserve,
        medkits: this.medkits,
        batteries: this.batteries,
        flares: this.flares,
        flashOn: this.flashOn,
        aimX: this.aim.x,
        aimZ: this.aim.z,
      },
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.ui.setContinueAvailability(true, this.saveInfo(data));
    } catch (err) {
      console.warn('[BLACKMOOR] save failed', err);
      this.ui.message('Recorder memory corrupted. Checkpoint not written.', 'danger', 4000);
    }
  }

  loadFromData(save) {
    if (!save) return;
    this.resetRun();
    this.playTime = Math.max(0, Number(save.playTime) || 0);
    this.kills = Math.max(0, Number(save.kills) || 0);
    this.readNotes = { ...(save.notesRead || {}) };

    const p = save.player;
    this.health = clamp(Number(p.health) || MAX_HEALTH, 1, MAX_HEALTH);
    this.stamina = clamp(Number(p.stamina) || 100, 0, 100);
    this.battery = clamp(Number(p.battery) ?? MAX_BATTERY, 0, MAX_BATTERY);
    this.mag = clamp(Number(p.mag) || 0, 0, MAX_MAG);
    this.reserve = Math.max(0, Number(p.reserve) || 0);
    this.medkits = Math.max(0, Number(p.medkits) || 0);
    this.batteries = Math.max(0, Number(p.batteries) || 0);
    this.flares = Math.max(0, Number(p.flares) || 0);
    this.flashOn = !!p.flashOn && this.battery > 0;

    let x = Number(p.x);
    let z = Number(p.z);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !this.world.canOccupy(x, z, 0.38)) {
      x = PLAYER_START.x * CELL;
      z = PLAYER_START.y * CELL;
    }
    this.playerPos.set(x, 0, z);
    this.aim.set(Number(p.aimX) || 0, 0, Number(p.aimZ) || -1).normalize();
    this.lastAim.copy(this.aim);

    if (save.world) this.world.applyState(save.world);
    this.world.events.length = 0;
    this.enemies.events.length = 0;
    this.world.playerPos.copy(this.playerPos);
    this.world.flags.notesRead = { ...this.world.flags.notesRead, ...this.readNotes };
    this.world.updateExploration();
    this.powerAnnounced = !!this.world.flags.powered;
    this.audio.setPower(!!this.world.flags.powered);
  }

  loadCheckpoint() {
    const save = this.readSave();
    if (!save) {
      this.ui.message('No checkpoint recorded.', 'warn');
      return;
    }
    sessionStorage.setItem(AUTOLOAD_KEY, '1');
    location.reload();
  }

  beginAgain(fromVictory = false) {
    localStorage.removeItem(SAVE_KEY);
    sessionStorage.removeItem(AUTOLOAD_KEY);
    location.reload();
  }

  // =========================================================================
  // Per-frame update
  // =========================================================================

  animate() {
    requestAnimationFrame(this.animate);
    const raw = this.clock.getDelta();
    const dt = Math.min(0.05, Math.max(0, raw));
    this.time += dt;

    if (this.ready) {
      this.update(dt);
      this.renderer.render(this.scene, this.camera);
    }
    this.ui.update(dt);
  }

  update(dt) {
    const playing = this.mode === 'playing';

    if (playing) {
      this.playTime += dt;
      this.updateAim(dt);
      this.updatePlayer(dt);
      this.updateBattery(dt);
      this.updateWeapon(dt);
      this.updateEnemies(dt);
      this.updateInteraction(dt);
      this.updateHeartbeat(dt);
      this.updateObjective(false);
      this.updateHud(dt);
    } else if (this.mode === 'dying') {
      this.deadTimer += dt;
      this.updateAim(dt, true);
      this.player.update(dt, this.time, { dead: true, moving: false, speed: 0 });
      this.player.group.position.copy(this.playerPos);
      if (this.deadTimer > 2.4) {
        this.mode = 'dead';
        this.ui.showDeath(this.stats(), !!this.readSave());
      }
    } else if (this.mode === 'ending') {
      this.escapeTimer += dt;
      this.player.update(dt, this.time, { moving: false, speed: 0 });
      if (this.escapeTimer > 1.1 && !this.whiteStarted) {
        this.whiteStarted = true;
        this.ui.fadeToWhite();
      }
      if (this.escapeTimer > 3.7) {
        this.mode = 'victory';
        localStorage.removeItem(SAVE_KEY);
        this.ui.setContinueAvailability(false);
        this.ui.showVictory({
          time: formatTime(this.playTime),
          kills: this.kills,
          fuses: 3,
          room: 'Surface',
        });
      }
    } else if (this.mode === 'title') {
      this.titleTime += dt;
      this.updateCamera(dt, true);
    } else if (this.mode === 'paused' || this.mode === 'inventory' || this.mode === 'note') {
      // Freeze the simulation but keep the player's idle breathing alive.
      if (this.player) this.player.update(dt, this.time, { moving: false, speed: 0 });
    }

    if (this.world && (playing || this.mode === 'dying' || this.mode === 'dead' || this.mode === 'ending' || this.mode === 'title' || this.mode === 'victory')) {
      this.world.update(dt, this.time, this.playerPos);
      this.collectWorldEvents();
    }

    if (this.ready && this.world) {
      this.flushEnemyEvents();
      this.updateAudio(dt);
      if (this.mode !== 'title') this.updateCamera(dt, false);
      this.updateShake(dt);
      if (playing) this.updateMinimap(dt);
      if (this.mode === 'dying') this.ui.setThreat(Math.max(0, 0.5 - this.deadTimer * 0.2));
    }
  }

  updateAim(dt, frozen = false) {
    let target = null;
    const touchAim = this.ui.touchMode ? this.ui.touch.aim : null;

    if (!frozen && touchAim && touchAim.active) {
      const mag = Math.hypot(touchAim.x, touchAim.y);
      if (mag > 0.12) target = new THREE.Vector3(touchAim.x, 0, -touchAim.y).normalize();
    } else if (!frozen && !this.ui.touchMode && this.pointerActive) {
      this.raycaster.setFromCamera(this.pointerNDC, this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.aimPoint);
      if (hit) {
        const dx = this.aimPoint.x - this.playerPos.x;
        const dz = this.aimPoint.z - this.playerPos.z;
        if (Math.hypot(dx, dz) > 0.7) target = new THREE.Vector3(dx, 0, dz).normalize();
      }
    }

    if (!target) {
      if (this.moveDir.lengthSq() > 0.03) target = new THREE.Vector3(this.moveDir.x, 0, this.moveDir.z).normalize();
      else target = this.aim.clone();
    }

    if (target) {
      this.aim.copy(target);
      this.lastAim.copy(target);
      const wanted = Math.atan2(this.aim.x, this.aim.z);
      this.player.group.rotation.y = angleDamp(this.player.group.rotation.y, wanted, 16, dt);
    }
    this.world.flashlight.on = this.flashOn && this.battery > 0 && !this.dead;
    this.world.flashlight.origin.copy(this.playerPos);
    this.world.flashlight.dir.set(this.aim.x, 0, this.aim.z);
    this.world.flashlight.battery = this.battery / 100;
  }

  updatePlayer(dt) {
    const forward = (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0)
      - (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
    const right = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);

    const stick = this.ui.touch.move;
    let mx = right;
    let mz = forward;
    if (this.ui.touchMode && stick.active) {
      mx += stick.x;
      mz += stick.y;
    }
    const moveLen = Math.hypot(mx, mz);
    if (moveLen > 1) { mx /= moveLen; mz /= moveLen; }

    this.moveDir.set(mx, 0, -mz);
    const moving = Math.hypot(mx, mz) > 0.06;

    const touchSprint = this.ui.touchMode && stick.active && Math.hypot(stick.x, stick.y) > 0.92;
    const wantSprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || touchSprint;
    let sprinting = moving && wantSprint && this.stamina > 2;
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - 24 * dt);
      this.staminaDelay = 0.9;
    } else {
      this.staminaDelay -= dt;
      if (this.staminaDelay <= 0) this.stamina = Math.min(100, this.stamina + 16 * dt);
    }

    const speed = sprinting ? 5.15 : (moving ? 3.1 : 0);
    if (moving) {
      const dx = this.moveDir.x * speed * dt;
      const dz = this.moveDir.z * speed * dt;
      const px = this.playerPos.x;
      const pz = this.playerPos.z;

      if (this.world.canOccupy(px + dx, pz, 0.38)) this.playerPos.x = px + dx;
      if (this.world.canOccupy(this.playerPos.x, pz + dz, 0.38)) this.playerPos.z = pz + dz;

      // If the player is walking into a door, open it before it becomes a wall.
      for (const door of this.world.doors) {
        if (door.locked || door.open) continue;
        const dd = Math.hypot(door.x - this.playerPos.x, door.z - this.playerPos.z);
        if (dd < 3.2) {
          this.world.setDoorOpen(door, true);
          this.audio.door(true, new THREE.Vector3(door.x, 0, door.z));
        }
      }
    }

    this.player.group.position.copy(this.playerPos);
    const speedForAnim = sprinting ? 5 : (moving ? 3 : 0);
    this.player.update(dt, this.time, {
      moving,
      sprint: sprinting,
      speed: speedForAnim,
      dead: false,
    });

    // Flashlight level: strong until the cell begins to fail.
    if (this.flashOn && this.battery > 0) {
      let level = 0.62 + (this.battery / 100) * 0.38;
      if (this.battery < 18) {
        const f = Math.sin(this.time * 27) * Math.sin(this.time * 6.3 + 1.7);
        if (f > 0.45) level *= 0.36;
      }
      this.player.setFlashlight(true, level);
    } else {
      this.player.setFlashlight(false, 0);
    }

    // Footsteps and the noise they make.
    if (moving) {
      this.footstepTimer -= dt;
      if (this.footstepTimer <= 0) {
        this.footstepTimer = sprinting ? 0.35 : 0.52;
        this.audio.footstep(this.groundSurface(), sprinting);
        if (sprinting) this.enemies.alertNoise(this.playerPos, 8.5, 'step');
        else this.enemies.alertNoise(this.playerPos, 2.4, 'step');
      }
    } else {
      this.footstepTimer = Math.min(this.footstepTimer, 0.14);
    }

    // Room discovery and flavour text.
    const room = this.world.roomAt(this.playerPos.x, this.playerPos.z);
    if (room) {
      this.ui.setRoom(room.name, room.sub);
      const key = room.id;
      if (!this.visitedRooms.has(key)) {
        this.visitedRooms.add(key);
        if (key !== 'lobby') {
          this.ui.message(`${room.name.toUpperCase()} — ${room.blurb || room.sub}`, 'info', 4600);
        }
      }
    }
  }

  groundSurface() {
    const zone = this.world.zoneAtCell(
      Math.floor(this.playerPos.x / CELL),
      Math.floor(this.playerPos.z / CELL),
    );
    if (zone === 'tunnel') return 'water';
    if (zone === 'industrial') return 'metal';
    return 'tile';
  }

  updateBattery(dt) {
    if (this.flashOn && this.battery > 0) {
      this.battery = Math.max(0, this.battery - dt * 0.5);
      if (this.battery < 15 && !this.batteryWarned) {
        this.batteryWarned = true;
        this.ui.message('Flashlight cell failing. Install a fresh battery [B].', 'warn', 5000);
        this.audio.emptyBattery();
      }
      if (this.battery <= 0) {
        this.flashOn = false;
        this.ui.message('The flashlight dies.', 'danger', 3500);
        this.audio.emptyBattery();
      }
    }
  }

  drainBattery(amount) {
    if (!this.flashOn) return;
    this.battery = Math.max(0, this.battery - amount);
    if (this.battery <= 0) {
      this.flashOn = false;
      this.audio.emptyBattery();
      this.ui.message('A moth drinks the beam. The flashlight is dead.', 'danger', 3800);
    }
  }

  updateWeapon(dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        const need = MAX_MAG - this.mag;
        const load = Math.min(need, this.reserve);
        this.mag += load;
        this.reserve -= load;
        this.audio.reload();
      }
    }
    if ((this.firingMouse || this.touchFiring) && this.fireCooldown <= 0) this.tryShoot();
  }

  updateEnemies(dt) {
    if (!this.enemies) return;
    const ctx = {
      playerPos: this.playerPos,
      flashlightOn: this.flashOn && this.battery > 0,
      time: this.time,
    };
    this.enemies.update(dt, this.time, ctx);
    this.dangerSmoothed = damp(this.dangerSmoothed, this.enemies.danger, 3, dt);
    this.ui.setThreat(this.dangerSmoothed);
    this.audio.setTension(this.dangerSmoothed);
  }

  updateInteraction(dt) {
    this.interactionTimer -= dt;
    if (this.interactionTimer > 0) return;
    this.interactionTimer = 0.09;

    // Unlocked doors open before you reach them.
    for (const door of this.world.doors) {
      if (door.locked || door.open) continue;
      if (Math.hypot(door.x - this.playerPos.x, door.z - this.playerPos.z) < 2.55) {
        this.world.setDoorOpen(door, true);
        this.audio.door(true, new THREE.Vector3(door.x, 0, door.z));
      }
    }

    const it = this.world.getInteractable(this.playerPos, 3.15);
    this.interaction = it;
    if (!it) {
      this.ui.setInteract('', 'E', false, false);
      return;
    }
    const info = this.interactionInfo(it);
    this.ui.setInteract(info.label, 'E', info.locked, true);
  }

  interactionInfo(it) {
    switch (it.kind) {
      case 'door': {
        const d = it.door;
        if (d.locked) {
          const label = d.lockLabel || (d.requires === 'card' ? 'Security Card' : 'Valve Wheel');
          const held = d.requires === 'card' ? this.world.flags.card : this.world.flags.valve;
          return { label: held ? `Unlock ${d.label} door` : `${label} required`, locked: !held };
        }
        return { label: d.open ? `Close ${d.label} door` : `Open ${d.label} door`, locked: false };
      }
      case 'pickup': {
        const item = it.pickup.item;
        const names = {
          ammo: '9mm rounds', battery: 'battery cell', medkit: 'medkit',
          flare: 'flare', fuse: 'ceramic fuse', card: 'security card', valve: 'valve wheel',
        };
        return { label: `Take ${names[item] || item}`, locked: false };
      }
      case 'note':
        return { label: 'Read recovered document', locked: false };
      case 'save':
        return { label: it.station.charges > 0 ? `Record checkpoint (${it.station.charges} charges)` : 'Recorder exhausted', locked: it.station.charges <= 0 };
      case 'generator': {
        if (this.world.flags.powered) return { label: 'Generator online', locked: false };
        const n = this.fuseCount();
        return { label: n >= 3 ? 'Seat fuses · start generator' : `Fuse housing (${n}/3 seated)`, locked: n < 3 };
      }
      case 'elevator':
        return {
          label: this.world.flags.elevatorReady ? 'Escape · service elevator' : 'Elevator panel · no power',
          locked: !this.world.flags.elevatorReady,
        };
      default:
        return { label: 'Interact', locked: false };
    }
  }

  interact() {
    if (this.mode !== 'playing') return;
    const it = this.interaction || this.world.getInteractable(this.playerPos, 3.15);
    if (!it) return;
    this.audio.ui();
    switch (it.kind) {
      case 'door': this.interactDoor(it.door); break;
      case 'pickup': this.takePickup(it.pickup); break;
      case 'note': this.takeNote(it.pickup); break;
      case 'save': this.useRecorder(it.station); break;
      case 'generator': this.useGenerator(); break;
      case 'elevator': this.useElevator(); break;
      default: break;
    }
    this.interactionTimer = 0;
    this.updateInteraction(0.2);
  }

  interactDoor(door) {
    if (door.locked) {
      const req = door.requires;
      const held = req === 'card' ? this.world.flags.card : this.world.flags.valve;
      if (held) {
        this.world.unlockDoor(door);
        this.audio.door(true, new THREE.Vector3(door.x, 0, door.z));
        this.ui.message(`${door.lockLabel || 'Lock'} accepted. ${door.label} door unlocked.`, 'good', 3200);
      } else {
        this.audio.locked();
        this.ui.message(`${door.lockLabel || (req === 'card' ? 'Security Card' : 'Valve Wheel')} required.`, 'warn', 3000);
      }
      return;
    }
    const open = !door.open;
    this.world.setDoorOpen(door, open);
    this.audio.door(open, new THREE.Vector3(door.x, 0, door.z));
  }

  takePickup(pickup) {
    if (!pickup || pickup.taken) return;
    this.world.takePickup(pickup);
    const item = pickup.item;
    const count = pickup.count || 1;
    if (item === 'ammo') {
      this.reserve += count;
      this.audio.pickup('ammo');
      this.ui.message(`+${count} 9mm rounds`, 'good', 2200);
    } else if (item === 'battery') {
      this.batteries += count;
      this.audio.pickup('battery');
      this.ui.message(`+${count} battery cell${count > 1 ? 's' : ''}`, 'good', 2200);
    } else if (item === 'medkit') {
      this.medkits += count;
      this.audio.pickup('supply');
      this.ui.message(`+${count} medkit${count > 1 ? 's' : ''}`, 'good', 2200);
    } else if (item === 'flare') {
      this.flares += count;
      this.audio.pickup('supply');
      this.ui.message(`+${count} flare${count > 1 ? 's' : ''}`, 'good', 2200);
    } else if (item === 'fuse') {
      const n = this.fuseCount();
      this.audio.pickup('key');
      this.ui.banner('RECOVERED · CERAMIC FUSE', `${n} OF 3`, 'THE GENERATOR HOUSING NEEDS ALL THREE', 3800);
      this.ui.message('Ceramic fuse secured.', 'good', 2500);
    } else if (item === 'card') {
      this.world.unlockByRequirement('card');
      this.audio.pickup('key');
      this.ui.banner('KEY ITEM · SECURITY CARD', 'CLEARANCE FOUR', 'COLD STORAGE DOORS UNSEALED', 4200);
    } else if (item === 'valve') {
      this.world.unlockByRequirement('valve');
      this.audio.pickup('key');
      this.ui.banner('KEY ITEM · VALVE WHEEL', 'PUMP GATE ACTUATOR', 'THE LOWER TUNNELS ARE OPEN', 4200);
    }
    this.updateObjective(true);
  }

  takeNote(pickup) {
    if (!pickup || pickup.taken) return;
    this.world.takePickup(pickup);
    const id = pickup.note;
    this.readNotes[id] = true;
    this.world.flags.notesRead[id] = true;
    this.showNote(id, 'play');
  }

  useRecorder(station) {
    if (!station) return;
    if (station.charges <= 0) {
      this.audio.locked();
      this.ui.message('The recorder has no charges left.', 'warn', 3000);
      return;
    }
    this.world.useStation(station);
    this.audio.save();
    this.writeSave(station);
    this.ui.banner('RECORDER ACTIVE', 'CHECKPOINT WRITTEN', `${station.charges} CHARGE${station.charges === 1 ? '' : 'S'} REMAINING`, 3600);
    this.ui.message(station.charges > 0 ? 'Checkpoint recorded.' : 'The recorder is spent.', 'good', 3000);
    this.updateObjective(true);
  }

  useGenerator() {
    if (this.world.flags.powered) {
      this.ui.message('The generator is already online.', 'info', 2200);
      return;
    }
    const n = this.fuseCount();
    if (n < 3) {
      this.audio.locked();
      this.ui.message(`The housing will not accept a partial load. ${n}/3 fuses seated.`, 'warn', 3800);
      return;
    }
    this.world.activateGenerator();
    this.onPowerRestored();
  }

  onPowerRestored() {
    if (this.powerAnnounced) return;
    this.powerAnnounced = true;
    this.audio.power();
    this.audio.setPower(true);
    this.enemies.onPower();
    this.shake = Math.max(this.shake, 1.3);
    this.ui.banner('GRID B · ONLINE', 'THE BUILDING WAKES', 'EMERGENCY LIGHTS RESTORED · ELEVATOR RELEASED', 4800);
    this.ui.message('Every light on sublevel three comes on at once. Reach Maintenance.', 'good', 6000);
    this.updateObjective(true);
  }

  useElevator() {
    if (!this.world.flags.elevatorReady) {
      this.audio.locked();
      this.ui.message('The call panel is dark. The elevator has no power.', 'warn', 3600);
      return;
    }
    this.completeEscape();
  }

  fuseCount() {
    if (!this.world) return 0;
    const f = this.world.flags.fuses;
    return (f.ward ? 1 : 0) + (f.cold ? 1 : 0) + (f.pump ? 1 : 0);
  }

  tryShoot() {
    if (this.mode !== 'playing' || this.reloading || this.fireCooldown > 0) return;
    if (this.mag <= 0) {
      this.audio.dryFire();
      this.ui.message(this.reserve > 0 ? 'Empty. Reload [R].' : 'No rounds left.', 'warn', 1500);
      this.fireCooldown = 0.35;
      if (this.reserve > 0) this.startReload();
      return;
    }

    this.mag -= 1;
    this.fireCooldown = 0.2;
    this.player.muzzleFlash();
    this.audio.shot();
    this.shake = Math.max(this.shake, 0.34);
    this.enemies.alertNoise(this.playerPos, 27, 'gunshot');
    this.updateAim(0);

    const assist = this.ui.touchMode ? 0.22 : 0.015;
    const target = this.pickShotTarget(assist);
    if (target) {
      target.enemy.hit(28, this.playerPos);
      this.ui.crosshairHit();
      const gx = target.enemy.x / CELL - 0.5;
      const gy = target.enemy.z / CELL - 0.5;
      if (!target.enemy.dead) this.world.bloodAt(gx, gy, 0.35, Math.random() * 6);
    }
  }

  pickShotTarget(angleTolerance = 0.02) {
    if (!this.enemies) return null;
    let best = null;
    let bestScore = Infinity;
    for (const e of this.enemies.enemies) {
      if (!e || e.dead || e.hidden) continue;
      const dx = e.x - this.playerPos.x;
      const dz = e.z - this.playerPos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4 || dist > 26) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const dot = clamp(nx * this.aim.x + nz * this.aim.z, -1, 1);
      const angle = Math.acos(dot);
      const tolerance = angleTolerance + Math.atan2(e.radius + 0.28, dist);
      if (angle > tolerance) continue;
      if (!this.world.hasLineOfSight(this.playerPos.x, this.playerPos.z, e.x, e.z)) continue;
      const score = angle + dist * 0.0008;
      if (score < bestScore) {
        bestScore = score;
        best = { enemy: e, dist, angle };
      }
    }
    return best;
  }

  startReload() {
    if (this.mode !== 'playing' || this.reloading) return;
    if (this.mag >= MAX_MAG) return;
    if (this.reserve <= 0) {
      this.audio.dryFire();
      this.ui.message('No spare rounds.', 'warn', 1800);
      return;
    }
    this.reloading = true;
    this.reloadTimer = 1.45;
    this.audio.reload();
  }

  toggleFlashlight() {
    if (this.mode !== 'playing') return;
    if (this.battery <= 0) {
      this.audio.emptyBattery();
      this.ui.message('The cell is dead. Install a battery [B].', 'warn', 2500);
      return;
    }
    this.flashOn = !this.flashOn;
    this.audio.flashlight();
  }

  useBattery() {
    if (this.mode !== 'playing' && this.mode !== 'inventory') return;
    if (this.batteries <= 0) {
      this.audio.locked();
      this.ui.message('No spare battery cells.', 'warn', 2200);
      return;
    }
    if (this.battery >= 99) {
      this.ui.message('The flashlight cell is already full.', 'info', 1800);
      return;
    }
    this.batteries -= 1;
    this.battery = Math.min(100, this.battery + 58);
    this.flashOn = true;
    this.batteryWarned = false;
    this.audio.battery();
    this.ui.message('Fresh cell installed.', 'good', 2000);
    if (this.mode === 'inventory') this.refreshInventory();
  }

  useMedkit() {
    if (this.mode !== 'playing' && this.mode !== 'inventory') return;
    if (this.medkits <= 0) {
      this.audio.locked();
      this.ui.message('No medkits remaining.', 'warn', 2200);
      return;
    }
    if (this.health >= MAX_HEALTH) {
      this.ui.message('You are not bleeding. Yet.', 'info', 1800);
      return;
    }
    this.medkits -= 1;
    this.health = Math.min(MAX_HEALTH, this.health + 46);
    this.audio.heal();
    this.ui.message('Bandaged. The shaking stops, for now.', 'good', 2400);
    if (this.mode === 'inventory') this.refreshInventory();
  }

  throwFlare() {
    if (this.mode !== 'playing' && this.mode !== 'inventory') return;
    if (this.flares <= 0) {
      this.audio.locked();
      this.ui.message('No flares left.', 'warn', 1800);
      return;
    }
    this.flares -= 1;
    const target = new THREE.Vector3(
      this.playerPos.x + this.aim.x * 8.5,
      0,
      this.playerPos.z + this.aim.z * 8.5,
    );
    this.world.throwFlare(
      new THREE.Vector3(this.playerPos.x, 1.1, this.playerPos.z),
      target,
    );
    this.audio.flareThrow();
    this.ui.message('Flare out. The dark pulls back.', 'good', 1800);
    if (this.mode === 'inventory') this.refreshInventory();
  }

  useItemFromInventory(kind) {
    if (kind === 'battery') this.useBattery();
    else if (kind === 'medkit') this.useMedkit();
    else if (kind === 'flare') this.throwFlare();
  }

  refreshInventory() {
    if (this.mode !== 'inventory') return;
    this.ui.showInventory(this.inventoryItems(), this.inventoryNotes(), this.objectiveDescription());
  }

  inventoryItems() {
    const n = this.fuseCount();
    return [
      { id: 'ammo', icon: '▮▮', name: '9MM ROUNDS', count: this.reserve, desc: 'Spare service-pistol ammunition. Brass, tarnished, still true.' },
      { id: 'battery', icon: '▰', name: 'BATTERY CELLS', count: this.batteries, desc: 'Lithium cells for the hand torch. Each restores roughly half a charge.', usable: true },
      { id: 'medkit', icon: '✚', name: 'MEDKITS', count: this.medkits, desc: 'Gauze, antiseptic, morphine. Restores 46 health.', usable: true, med: true },
      { id: 'flare', icon: '✦', name: 'ROAD FLARES', count: this.flares, desc: 'Burns for twenty seconds. Hollows will not cross the light.', usable: true },
      { id: 'fuse', icon: '◉', name: 'CERAMIC FUSES', count: `${n}/3`, desc: 'Three-part emergency load. The generator housing will not accept a partial set.', key: true, always: true },
      { id: 'card', icon: '▤', name: 'SECURITY CARD', count: this.world?.flags.card ? 1 : 0, desc: 'Clearance FOUR. Dr. Aris Vale. Opens Cold Storage.', key: true },
      { id: 'valve', icon: '✥', name: 'VALVE WHEEL', count: this.world?.flags.valve ? 1 : 0, desc: 'Heavy brass actuator for the pump gate. Fits the Boiler Room housing.', key: true },
    ];
  }

  inventoryNotes() {
    return Object.keys(NOTES)
      .filter((id) => this.readNotes[id] || this.world?.flags.notesRead?.[id])
      .map((id) => ({
        id,
        title: NOTES[id].title,
        meta: NOTES[id].meta,
        read: true,
      }));
  }

  updateObjective(force = false) {
    if (!this.world) return;
    this.objectiveTimer -= 1 / 60;
    this.objectiveTimer = Math.min(this.objectiveTimer, 0.22);
    if (!force && this.objectiveTimer > 0) return;
    this.objectiveTimer = 0.22;

    const f = this.world.flags;
    const fuses = f.fuses;
    const n = this.fuseCount();
    let title = '';
    let sub = '';
    let marker = null;

    const pickupMarker = (id) => {
      const p = this.world.pickups.find((x) => x.id === id && !x.taken);
      return p ? { x: p.x, z: p.z } : null;
    };

    if (!f.card) {
      title = 'Recover the security card';
      sub = 'Reception · Intake & Records';
      marker = pickupMarker('card-reception');
    } else if (!f.valve && !fuses.pump) {
      title = 'Find the valve wheel';
      sub = 'Boiler Room · Thermal Plant';
      marker = pickupMarker('valve-boiler');
    } else if (n < 3) {
      const remaining = [];
      if (!fuses.ward) remaining.push({ id: 'fuse-ward', name: 'Ward 03' });
      if (!fuses.cold) remaining.push({ id: 'fuse-cold', name: 'Cold Storage' });
      if (!fuses.pump) remaining.push({ id: 'fuse-pump', name: 'Pump Station' });
      let nearest = remaining[0];
      let nd = Infinity;
      for (const r of remaining) {
        const pos = pickupMarker(r.id);
        if (!pos) continue;
        const d = Math.hypot(pos.x - this.playerPos.x, pos.z - this.playerPos.z);
        if (d < nd) { nd = d; nearest = r; }
      }
      title = `Recover ceramic fuses (${n}/3)`;
      sub = remaining.map((r) => r.name).join(' · ');
      marker = nearest ? pickupMarker(nearest.id) : null;
    } else if (!f.powered) {
      title = 'Restore the generator';
      sub = 'Generator Room · Grid B';
      marker = { x: (GENERATOR_CONSOLE.x + 0.5) * CELL, z: (GENERATOR_CONSOLE.y + 0.5) * CELL };
    } else {
      title = 'Reach the service elevator';
      sub = 'Maintenance · Surface Access';
      marker = { x: 53.9 * CELL, z: ELEVATOR_POS.y * CELL };
    }

    this.objective = { title, sub, marker };
    this.objectiveText = `${title}. ${sub}.`;
    let distance = null;
    if (marker) distance = Math.hypot(marker.x - this.playerPos.x, marker.z - this.playerPos.z);

    this.ui.setObjective(title, sub, distance, fuses, f.fusesInserted || f.powered);
  }

  objectiveDescription() {
    if (!this.objective) return '';
    const n = this.fuseCount();
    return `${this.objective.title}. ${this.objective.sub}. Fuses: ${n}/3.`;
  }

  updateHud(dt) {
    this.hudTimer -= dt;
    if (this.hudTimer > 0) return;
    this.hudTimer = 0.05;
    const flashOn = this.flashOn && this.battery > 0;
    this.ui.setVitals({
      health: this.health,
      stamina: this.stamina,
      battery: this.battery,
      flashOn,
      ammo: this.mag,
      reserve: this.reserve,
      medkits: this.medkits,
      batteries: this.batteries,
      flares: this.flares,
      reloading: this.reloading,
    });

    // Crosshair follows the projected aim point.
    if (!this.ui.touchMode) {
      const p = new THREE.Vector3(
        this.playerPos.x + this.aim.x * 7.5,
        1.2,
        this.playerPos.z + this.aim.z * 7.5,
      );
      p.project(this.camera);
      const sx = (p.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-p.y * 0.5 + 0.5) * window.innerHeight;
      const hot = !!this.pickShotTarget(0);
      this.ui.setCrosshair(sx, sy, p.z < 1, hot);
    } else {
      const p = new THREE.Vector3(
        this.playerPos.x + this.aim.x * 7.5,
        1.2,
        this.playerPos.z + this.aim.z * 7.5,
      );
      p.project(this.camera);
      const sx = (p.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-p.y * 0.5 + 0.5) * window.innerHeight;
      this.ui.setCrosshair(sx, sy, true, !!this.pickShotTarget(0.16));
    }
  }

  updateMinimap(dt) {
    this.mapTimer -= dt;
    if (this.mapTimer > 0) return;
    this.mapTimer = 1 / MAP_HZ;
    this.minimapTime += 1 / MAP_HZ;
    this.ui.drawMinimap({
      world: this.world,
      player: { x: this.playerPos.x, z: this.playerPos.z },
      playerAngle: Math.atan2(this.aim.x, -this.aim.z),
      objective: this.objective.marker,
      enemies: this.enemies ? this.enemies.enemies : [],
      time: this.minimapTime,
    });
  }

  updateHeartbeat(dt) {
    const fear = clamp(this.dangerSmoothed, 0, 1);
    const hurt = clamp(1 - this.health / MAX_HEALTH, 0, 1);
    const intensity = Math.max(fear * 0.95, hurt * 0.9);
    if (intensity > 0.16) {
      this.heartbeatTimer -= dt;
      if (this.heartbeatTimer <= 0) {
        this.heartbeatTimer = 1.15 - intensity * 0.55;
        this.audio.heartbeat(intensity);
      }
    } else {
      this.heartbeatTimer = Math.max(this.heartbeatTimer, 0.5);
    }
    if (hurt > 0.62 || this.stamina < 22) {
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.breathTimer = 1.9 - hurt * 0.7;
        this.audio.breath(Math.max(hurt, 1 - this.stamina / 100));
      }
    }
  }

  updateAudio(dt) {
    if (!this.audio.ready) return;
    this.audio.setListener(this.playerPos, { x: this.aim.x, z: this.aim.z });
    if (this.mode === 'playing' || this.mode === 'dying' || this.mode === 'title') {
      this.audio.update(dt);
    }
  }

  updateCamera(dt, title) {
    if (this.mode === 'title') {
      const targetPos = this.titleCameraPosition(this.titleTime);
      const targetLook = this.titleLookTarget();
      this.camera.position.lerp(targetPos, 1 - Math.exp(-2.2 * dt));
      this.cameraLook.lerp(targetLook, 1 - Math.exp(-2.6 * dt));
      this.camera.lookAt(this.cameraLook);
      return;
    }
    if (!this.player) return;

    const dead = this.mode === 'dying' || this.mode === 'dead';
    const offset = dead ? new THREE.Vector3(0, 12.5, 9.5) : new THREE.Vector3(0, 20.5, 14.5);
    const lookAhead = dead ? 0.2 : 1.7;
    this.cameraTarget.set(
      this.playerPos.x + this.aim.x * lookAhead,
      1.05,
      this.playerPos.z + this.aim.z * lookAhead,
    );
    this.cameraDesired.copy(this.cameraTarget).add(offset);

    const camRate = this.mode === 'dying' ? 1.8 : 4.5;
    this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-camRate * dt));
    this.cameraLook.lerp(this.cameraTarget, 1 - Math.exp(-5 * dt));
    this.camera.lookAt(this.cameraLook);
  }

  updateShake(dt) {
    if (!this.settings.shake) {
      this.shake = 0;
      return;
    }
    this.shake = Math.max(0, this.shake - dt * 3.6);
    if (this.shake > 0.002) {
      const a = this.shake * 0.09;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a * 0.65;
      this.camera.position.z += (Math.random() - 0.5) * a;
    }
  }

  titleCameraPosition(t) {
    const cx = 12 * CELL;
    const cz = 9.6 * CELL;
    const a = 0.72 + t * 0.045;
    return new THREE.Vector3(
      cx + Math.sin(a) * 9.5,
      7.1 + Math.sin(t * 0.21) * 0.35,
      cz + Math.cos(a) * 9.5,
    );
  }

  titleLookTarget() {
    return new THREE.Vector3(12 * CELL, 1.35, 9.5 * CELL);
  }

  // =========================================================================
  // Events / damage / audio
  // =========================================================================

  hurt(amount, type, pos) {
    if (this.mode !== 'playing') return;
    if (this.invuln > 0) return;
    this.invuln = 0.58;
    this.health = Math.max(0, this.health - amount);
    this.shake = Math.max(this.shake, 0.85 + amount * 0.015);
    this.ui.damageFlash(clamp(amount / 26, 0.35, 1));
    const spatial = pos ? new THREE.Vector3(pos.x, 0, pos.z) : this.playerPos;
    this.audio.enemyStrike(spatial);
    if (this.health <= 0) {
      this.eliminate();
      return;
    }
    if (type === 'gaunt') this.ui.message('The Gaunt connects. Ribs give.', 'danger', 2600);
    else if (type === 'moth') this.ui.message('Moth teeth rake your shoulder.', 'danger', 2200);
    else this.ui.message('Claws find you in the dark.', 'danger', 2200);
  }

  onKill(enemy) {
    this.kills += 1;
    if (enemy.type === 'gaunt') {
      this.ui.banner('SUBJECT NEUTRALIZED', 'THE GAUNT FALLS', 'IT TAKES A LONG TIME TO STOP MOVING', 3600);
    }
  }

  collectWorldEvents() {
    if (!this.world) return;
    const events = this.world.events.splice(0);
    for (const ev of events) {
      switch (ev.type) {
        case 'power':
          if (!this.powerAnnounced) this.onPowerRestored();
          break;
        case 'generatorStart':
          break;
        case 'unlock':
          this.audio.door(true, ev.door ? new THREE.Vector3(ev.door.x, 0, ev.door.z) : null);
          break;
        case 'flareThrow':
          this.audio.flareThrow(ev.position);
          break;
        case 'flareLand':
          this.audio.flareLand(ev.position);
          break;
        case 'flareCrackle':
          this.audio.flareCrackle(ev.position);
          break;
        case 'drip':
          this.audio.drip(ev.position, 0.32);
          break;
        case 'creak':
          this.audio.creak(ev.position, 0.3);
          break;
        default: break;
      }
    }
  }

  flushEnemyEvents() {
    if (!this.enemies) return;
    const events = this.enemies.events.splice(0);
    let played = 0;
    for (const ev of events) {
      if (played++ > 14) break;
      const pos = ev.position;
      switch (ev.type) {
        case 'hollowScreech': this.eventSound('screech', 0.14, () => this.audio.hollowScreech(pos)); break;
        case 'hollowHiss': this.eventSound('hiss', 0.2, () => this.audio.hollowScreech(pos)); break;
        case 'hollowGrowl': this.eventSound('growl', 0.18, () => this.audio.hollowGrowl(pos)); break;
        case 'hollowHurt': this.eventSound('hHurt', 0.08, () => this.audio.hollowHurt(pos)); break;
        case 'mothWhisper': this.eventSound('moth', 0.2, () => this.audio.mothWhisper(pos)); break;
        case 'mothHurt': this.eventSound('mHurt', 0.08, () => this.audio.mothHurt(pos)); break;
        case 'gauntRoar': this.eventSound('gaunt', 0.25, () => this.audio.gauntRoar(pos)); break;
        case 'gauntBreath': this.eventSound('gauntB', 0.3, () => this.audio.gauntBreath(pos)); break;
        case 'gauntHurt': this.eventSound('gHurt', 0.1, () => this.audio.gauntHurt(pos)); break;
        case 'gauntSwing': this.eventSound('gSwing', 0.08, () => this.audio.gauntSwing(pos)); break;
        case 'enemySwing': this.eventSound('swing', 0.08, () => this.audio.enemySwing(pos)); break;
        case 'enemyStrike': break;
        case 'enemyDeath': this.audio.enemyDeath(pos, ev.enemyType || 'hollow'); break;
        case 'ventBurst': this.audio.ventBurst(pos); break;
        case 'doorBurst': this.eventSound('doorBurst', 0.12, () => this.audio.doorBurst(pos)); break;
        case 'gauntWake': this.audio.gauntRoar(pos); this.shake = Math.max(this.shake, 0.8); break;
        case 'powerRoar': this.audio.gauntRoar(pos); break;
        case 'finaleAlarm': this.audio.finalAlarm(); break;
        default: break;
      }
    }
  }

  eventSound(key, cooldown, fn) {
    const until = this.soundCooldowns[key] || 0;
    if (this.time < until) return;
    this.soundCooldowns[key] = this.time + cooldown;
    fn();
  }
}

// Boot the game once the document is ready.
function bootGame() {
  try {
    window.__BLACKMOOR__ = new Game();
  } catch (err) {
    console.error('[BLACKMOOR] failed to construct game', err);
    const status = document.getElementById('loading-status');
    if (status) status.textContent = `FAILED TO START — ${err.message}`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootGame, { once: true });
} else {
  bootGame();
}
