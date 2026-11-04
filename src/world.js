import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPropKit } from './props.js';
import {
  makeMaterial, bloodDecal, grimeDecal, glowTexture, dustTexture, buildEnvironmentTexture,
} from './textures.js';
import {
  CELL, GRID_W, GRID_H, ROOMS, CORRIDORS, CONNECTORS, DOOR_DEFS, PICKUP_DEFS,
  SAVE_STATIONS, VENTS, NOTES, CORRIDOR_LIGHTS, EMERGENCY_LIGHTS, DOOR_SIGNS,
  PLAYER_START, ELEVATOR_POS, GENERATOR_CONSOLE, ROOM_LIGHT_COLORS,
  ROOM_LIGHT_INTENSITY, cellCenter, gridIndex,
} from './leveldata.js';

const FLOOR_KIND = {
  hospital: 'hospitalFloor',
  lab: 'labFloor',
  industrial: 'metalFloor',
  tunnel: 'tunnelFloor',
  morgue: 'hospitalFloor',
  corridorH: 'concrete',
  corridorV: 'labFloor',
  corridorT: 'tunnelFloor',
};
const WALL_KIND = {
  hospital: 'wallHospital',
  lab: 'wallLab',
  industrial: 'wallIndustrial',
  tunnel: 'wallTunnel',
  morgue: 'wallHospital',
  corridorH: 'wallHospital',
  corridorV: 'wallLab',
  corridorT: 'wallTunnel',
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function makeShaftMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        float flicker = 0.92 + 0.08 * sin(uTime * 11.0 + vWorld.x);
        float top = smoothstep(0.0, 0.55, vUv.y);
        float bottom = smoothstep(0.0, 0.28, 1.0 - vUv.y);
        float a = uOpacity * top * bottom * flicker;
        gl_FragColor = vec4(uColor, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export class World {
  constructor(scene, renderer, audio) {
    this.scene = scene;
    this.renderer = renderer;
    this.audio = audio;
    this.kit = createPropKit();
    this.root = new THREE.Group();
    this.root.name = 'Blackmoor';
    scene.add(this.root);

    this.floor = new Uint8Array(GRID_W * GRID_H);
    this.zone = new Array(GRID_W * GRID_H).fill(null);
    this.room = new Array(GRID_W * GRID_H).fill(null);
    this.walkableProps = new Uint8Array(GRID_W * GRID_H);
    this.colliders = [];
    this.doors = [];
    this.interactables = [];
    this.pickups = [];
    this.notes = [];
    this.stations = [];
    this.vents = [];
    this.fixtures = [];
    this.lightPool = [];
    this.flarePool = [];
    this.flares = [];
    this.events = [];
    this.decals = [];
    this.ripples = [];
    this.steam = [];
    this.fogSprites = [];
    this.explored = new Set();
    this.flags = {
      card: false,
      valve: false,
      fuses: { ward: false, cold: false, pump: false },
      fusesInserted: false,
      powered: false,
      elevatorReady: false,
      notesRead: {},
    };
    this.powerTime = 0;
    this.time = 0;
    this.flashlight = { on: false, origin: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), range: 19, cos: Math.cos(0.35), battery: 1 };
    this.danger = 0;
    this.playerPos = new THREE.Vector3();
    this.firstPowerEvent = false;

    this.scene.environment = buildEnvironmentTexture(renderer);
    this.scene.environmentIntensity = 0.55;

    this.buildOccupancy();
    this.buildFloors();
    this.buildWalls();
    this.buildDoors();
    this.buildLights();
    this.buildProps();
    this.buildPickups();
    this.buildStations();
    this.buildVents();
    this.buildInteractables();
    this.buildAtmosphere();
    this.buildSignsAndGraffiti();
    this.buildLightPool();
    this.applyStaticDetails();
  }

  // --- Occupancy and architecture -------------------------------------------

  buildOccupancy() {
    const stamp = (rect, zone, roomId, overwrite = true) => {
      const [x1, y1, x2, y2] = rect;
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
          const i = gridIndex(x, y);
          if (!overwrite && this.floor[i]) continue;
          this.floor[i] = 1;
          this.zone[i] = zone;
          if (roomId) this.room[i] = roomId;
        }
      }
    };
    for (const [id, r] of Object.entries(ROOMS)) stamp(r.rect, r.zone, id);
    for (const c of CORRIDORS) stamp(c.rect, c.zone, null);
    for (const c of CONNECTORS) stamp(c.rect, c.zone, null, false);

    // Small exterior alcove behind security for atmosphere (unreachable).
    stamp([58, 6, 61, 11], 'industrial', null, true);

    this.roomRects = ROOMS;
    this.floorCells = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (this.floor[gridIndex(x, y)]) this.floorCells.push({ x, y });
      }
    }
  }

  isFloorCell(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
    return this.floor[gridIndex(x, y)] === 1;
  }

  zoneAtCell(x, y) {
    if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return null;
    return this.zone[gridIndex(x, y)];
  }

  addTileColor(geo, shade) {
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = shade * (0.96 + (i % 3) * 0.015);
      colors[i * 3 + 1] = shade;
      colors[i * 3 + 2] = shade * 0.97;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }

  buildFloors() {
    const groups = {};
    const rand = mulberry32(1337);
    for (const { x, y } of this.floorCells) {
      const zone = this.zoneAtCell(x, y) || 'hospital';
      if (!groups[zone]) groups[zone] = [];
      const geo = new THREE.PlaneGeometry(CELL, CELL);
      geo.rotateX(-Math.PI / 2);
      geo.translate((x + 0.5) * CELL, 0, (y + 0.5) * CELL);
      this.addTileColor(geo, 0.86 + rand() * 0.16);
      groups[zone].push(geo);
    }

    this.floorMaterials = {};
    for (const [zone, geos] of Object.entries(groups)) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const kind = FLOOR_KIND[zone] || 'concrete';
      const mat = makeMaterial(kind, {
        roughness: kind === 'labFloor' ? 0.32 : kind === 'metalFloor' ? 0.48 : 0.72,
        metalness: kind === 'metalFloor' ? 0.45 : kind === 'labFloor' ? 0.18 : 0.06,
        envMapIntensity: kind === 'labFloor' ? 1.0 : 0.65,
        vertexColors: true,
      });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = `floor-${zone}`;
      this.root.add(mesh);
      this.floorMaterials[zone] = mat;
    }
  }

  buildWalls() {
    const wallH = 2.9;
    const th = 0.34;
    const groups = {};
    const caps = {};
    const trims = {};
    const dirs = [
      { dx: 1, dz: 0 }, { dx: -1, dz: 0 }, { dx: 0, dz: 1 }, { dx: 0, dz: -1 },
    ];
    const rand = mulberry32(7788);
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        if (!this.isFloorCell(x, y)) continue;
        const cx = (x + 0.5) * CELL;
        const cz = (y + 0.5) * CELL;
        const zone = this.zoneAtCell(x, y) || 'hospital';
        const wk = WALL_KIND[zone] || 'wallHospital';
        for (const d of dirs) {
          if (this.isFloorCell(x + d.dx, y + d.dz)) continue;
          const alongX = d.dz !== 0;
          const geo = new THREE.BoxGeometry(alongX ? CELL : th, wallH, alongX ? th : CELL);
          geo.translate(cx + d.dx * CELL / 2, wallH / 2, cz + d.dz * CELL / 2);
          this.addTileColor(geo, 0.83 + rand() * 0.18);
          (groups[wk] ||= []).push(geo);

          const cap = new THREE.BoxGeometry(alongX ? CELL : th + 0.08, 0.075, alongX ? th + 0.08 : CELL);
          cap.translate(cx + d.dx * CELL / 2, wallH + 0.03, cz + d.dz * CELL / 2);
          (caps[wk] ||= []).push(cap);

          const trim = new THREE.BoxGeometry(alongX ? CELL : th + 0.07, 0.3, alongX ? th + 0.07 : CELL);
          trim.translate(cx + d.dx * CELL / 2, 0.16, cz + d.dz * CELL / 2);
          (trims[wk] ||= []).push(trim);
        }
      }
    }

    const capColors = { wallHospital: 0x242a25, wallLab: 0x222828, wallIndustrial: 0x2b2823, wallTunnel: 0x1c1c19 };
    for (const [wk, geos] of Object.entries(groups)) {
      const mat = makeMaterial(wk, {
        roughness: 0.82, metalness: wk === 'wallIndustrial' ? 0.32 : 0.05,
        envMapIntensity: 0.45, vertexColors: true,
      });
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
      geos.forEach((g) => g.dispose());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.wallMaterial = this.wallMaterial || {};
      this.wallMaterial[wk] = mat;

      const capMat = new THREE.MeshStandardMaterial({ color: capColors[wk] || 0x222222, roughness: 0.88, metalness: 0.08 });
      const capMesh = new THREE.Mesh(mergeGeometries(caps[wk], false), capMat);
      caps[wk].forEach((g) => g.dispose());
      capMesh.castShadow = false;
      capMesh.receiveShadow = true;
      this.root.add(capMesh);

      const trimMat = new THREE.MeshStandardMaterial({ color: 0x1a1c19, roughness: 0.92, metalness: 0.05 });
      const trimMesh = new THREE.Mesh(mergeGeometries(trims[wk], false), trimMat);
      trims[wk].forEach((g) => g.dispose());
      trimMesh.receiveShadow = true;
      this.root.add(trimMesh);
    }
  }

  // --- Doors -----------------------------------------------------------------

  buildDoors() {
    for (const def of DOOR_DEFS) {
      this.addDoor(def);
    }
  }

  addDoor(def) {
    const g = new THREE.Group();
    g.position.set(def.x, 0, def.z);
    g.rotation.y = def.orient === 'v' ? Math.PI / 2 : 0;
    this.root.add(g);

    const width = def.width;
    const h = 2.42;
    const frameMat = this.kit.M.steelDark;
    const panelMat = def.locked ? this.kit.M.rustDark : this.kit.M.steel;
    const post = new THREE.BoxGeometry(0.16, 2.72, 0.34);
    for (const s of [-1, 1]) {
      const m = new THREE.Mesh(post, frameMat);
      m.position.set(s * (width / 2 + 0.08), 1.36, 0);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    const header = new THREE.Mesh(new THREE.BoxGeometry(width + 0.32, 0.17, 0.34), frameMat);
    header.position.set(0, 2.66, 0);
    header.castShadow = true;
    g.add(header);

    const pivots = [];
    const panelW = width / 2 - 0.035;
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * width / 2, 0, 0);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, h, 0.09), panelMat);
      panel.position.set(-s * panelW / 2, h / 2, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      pivot.add(panel);

      // wired glass pane
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(panelW * 0.38, 0.42), this.kit.M.glassDark);
      glass.position.set(-s * panelW / 2, 1.72, 0.055);
      pivot.add(glass);
      const wireMat = new THREE.MeshBasicMaterial({ color: 0x1a1d1c, wireframe: true, transparent: true, opacity: 0.35 });
      const wire = new THREE.Mesh(new THREE.PlaneGeometry(panelW * 0.38, 0.42, 5, 3), wireMat);
      wire.position.copy(glass.position);
      wire.position.z += 0.002;
      pivot.add(wire);

      // kick plate + handle
      const kick = new THREE.Mesh(new THREE.BoxGeometry(panelW * 0.85, 0.24, 0.012), this.kit.M.steelDark);
      kick.position.set(-s * panelW / 2, 0.26, 0.052);
      pivot.add(kick);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 7), this.kit.M.steel);
      handle.rotation.z = Math.PI / 2;
      handle.position.set(-s * (panelW - 0.16), 1.02, 0.09);
      pivot.add(handle);
      g.add(pivot);
      pivots.push({ pivot, s });
    }

    // status lamp
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x120404, emissive: def.locked ? 0xff2b1c : 0x5dff9b,
      emissiveIntensity: 1.2, roughness: 0.4,
    });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.035), lampMat);
    lamp.position.set(width / 2 - 0.25, 2.53, 0.2);
    g.add(lamp);

    const navCells = [];
    const reach = width / 2 + CELL;
    for (let gy = 0; gy < GRID_H; gy++) {
      for (let gx = 0; gx < GRID_W; gx++) {
        if (!this.isFloorCell(gx, gy)) continue;
        const wx = (gx + 0.5) * CELL;
        const wz = (gy + 0.5) * CELL;
        if (def.orient === 'h') {
          if (Math.abs(wx - def.x) < reach && Math.abs(wz - def.z) < CELL * 0.75) navCells.push(gridIndex(gx, gy));
        } else {
          if (Math.abs(wz - def.z) < reach && Math.abs(wx - def.x) < CELL * 0.75) navCells.push(gridIndex(gx, gy));
        }
      }
    }

    const door = {
      ...def, group: g, pivots, lampMat, navCells,
      open: false, locked: !!def.locked, requires: def.locked || null,
      angle: 0, target: 0, lastOpen: false,
    };
    this.doors.push(door);
    this.interactables.push({
      kind: 'door', id: def.id, door, position: new THREE.Vector3(def.x, 0, def.z),
      radius: 3.1, active: true,
    });
    return door;
  }

  doorIsBlocking(door) {
    if (door.locked) return true;
    return Math.abs(door.angle) < 1.2;
  }

  setDoorOpen(door, open) {
    door.open = open;
    door.target = open ? 1.45 : 0;
  }

  unlockDoor(door) {
    door.locked = false;
    door.lampMat.emissive.setHex(0x5dff9b);
    door.lampMat.color.setHex(0x04120a);
    this.setDoorOpen(door, true);
    this.events.push({ type: 'unlock', door });
  }

  // --- Lighting ---------------------------------------------------------------

  makeFixture(opts) {
    const {
      x, z, y = 2.58, color = 0xd9e7dd, intensity = 24, distance = 18,
      powerRequired = true, orient = 'h', caged = false, emergency = false,
      flicker = Math.random() < 0.22, delay = Math.random() * 2.2, hasShaft = true,
    } = opts;
    const group = new THREE.Group();
    group.position.set(x * CELL, y, z * CELL);
    if (orient === 'v') group.rotation.y = Math.PI / 2;
    let tubeMat = null;
    let lampMat = null;
    if (emergency) {
      const e = this.kit.emergencyLight();
      lampMat = e.userData.lamp.material.clone();
      lampMat.emissiveIntensity = 0.8;
      e.userData.lamp.material = lampMat;
      group.add(e);
      group.rotation.y = opts.rot || 0;
      group.position.y = 2.25;
    } else {
      const fixture = this.kit.ceilingLight(caged ? 1.2 : 1.8, caged);
      tubeMat = fixture.userData.tubeMat;
      group.add(fixture);
    }
    this.root.add(group);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(emergency ? 1.2 : 3.4, emergency ? 1.2 : 1.5, 1);
    glow.position.set(0, -0.05, 0);
    group.add(glow);

    let shaft = null;
    if (hasShaft && !emergency) {
      const height = 2.45;
      const geo = new THREE.ConeGeometry(caged ? 1.4 : 2.25, height, 22, 1, true);
      const mat = makeShaftMaterial(color);
      shaft = new THREE.Mesh(geo, mat);
      shaft.position.y = -height / 2 - 0.05;
      shaft.renderOrder = 2;
      group.add(shaft);
    }

    const fx = {
      position: new THREE.Vector3(x * CELL, y - 0.2, z * CELL),
      color, intensity, distance, powerRequired, emergency,
      level: powerRequired ? 0 : 0.72, target: powerRequired ? 0 : 0.72,
      flicker, delay, phase: Math.random() * Math.PI * 2,
      tubeMat, lampMat, glow, shaft, group,
    };
    this.fixtures.push(fx);
    return fx;
  }

  buildLights() {
    const roomRandom = mulberry32(9001);
    for (const [id, room] of Object.entries(ROOMS)) {
      const zone = room.zone;
      const color = ROOM_LIGHT_COLORS[zone] || 0xd9e7dd;
      const intensity = ROOM_LIGHT_INTENSITY[zone] || 20;
      room.lights.forEach(([x, z], i) => {
        this.makeFixture({
          x, z, color, intensity,
          powerRequired: true,
          orient: i % 2 ? 'v' : 'h',
          caged: zone === 'industrial' || zone === 'tunnel',
          flicker: roomRandom() < 0.3,
          delay: roomRandom() * 2.0,
        });
      });
    }
    for (const l of CORRIDOR_LIGHTS) {
      this.makeFixture({
        x: l.x, z: l.z,
        color: ROOM_LIGHT_COLORS[l.zone] || 0xd9e7dd,
        intensity: ROOM_LIGHT_INTENSITY[l.zone] || 17,
        powerRequired: true,
        orient: l.orient,
        caged: l.zone === 'corridorT',
        flicker: l.zone === 'corridorT',
        delay: Math.random() * 2.4,
      });
    }
    for (const e of EMERGENCY_LIGHTS) {
      this.makeFixture({
        x: e.x, z: e.z, emergency: true, rot: e.rot,
        color: 0xff2e18, intensity: 3.6, distance: 9,
        powerRequired: false, hasShaft: false, flicker: true,
      });
    }
    // A weak utility light above the generator console so the puzzle is readable.
    this.makeFixture({
      x: GENERATOR_CONSOLE.x, z: GENERATOR_CONSOLE.y + 1.3,
      color: 0xffb45a, intensity: 8, distance: 9, powerRequired: false,
      emergency: false, caged: true, flicker: true, hasShaft: false,
    });
  }

  buildLightPool() {
    for (let i = 0; i < 8; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 18, 2);
      l.castShadow = false;
      this.scene.add(l);
      this.lightPool.push(l);
    }
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xff7a2e, 0, 14, 2);
      this.scene.add(l);
      this.flarePool.push(l);
    }
  }

  setPower(on, instant = false) {
    this.flags.powered = on;
    if (!on) {
      for (const f of this.fixtures) if (f.powerRequired) { f.level = 0; f.target = 0; }
      return;
    }
    this.powerTime = 0;
    let n = 0;
    for (const f of this.fixtures) {
      if (f.powerRequired) {
        f.target = 1;
        f.delay = instant ? 0 : 0.15 + n * 0.16 + Math.random() * 0.8;
        if (instant) f.level = 1;
        n++;
      }
    }
    if (instant) this.powerTime = 8;
    this.flags.elevatorReady = true;
    this.events.push({ type: 'power' });
  }

  // --- Props ------------------------------------------------------------------

  addCollider(cx, cz, w, d, opts = {}) {
    this.colliders.push({
      minX: cx - w / 2, maxX: cx + w / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      nav: opts.nav !== false,
    });
    if (opts.nav !== false) {
      const pad = 0.06;
      for (let gy = Math.floor((cz - d / 2) / CELL); gy <= Math.floor((cz + d / 2) / CELL); gy++) {
        for (let gx = Math.floor((cx - w / 2) / CELL); gx <= Math.floor((cx + w / 2) / CELL); gx++) {
          if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) continue;
          if (!this.isFloorCell(gx, gy)) continue;
          this.walkableProps[gridIndex(gx, gy)] = 1;
        }
      }
    }
  }

  place(asset, gx, gy, rot = 0, opts = {}) {
    const obj = asset.object || asset;
    const cx = (gx + 0.5) * CELL + (opts.ox || 0);
    const cz = (gy + 0.5) * CELL + (opts.oz || 0);
    obj.position.set(cx, opts.y || 0, cz);
    obj.rotation.y = rot;
    this.root.add(obj);
    if (asset.collider && !opts.noCollide) {
      const c = asset.collider;
      const cos = Math.abs(Math.cos(rot));
      const sin = Math.abs(Math.sin(rot));
      const w = c.w * cos + c.d * sin;
      const d = c.w * sin + c.d * cos;
      this.addCollider(cx + (opts.cx || 0), cz + (opts.cz || 0), w, d, { nav: opts.nav });
    }
    return obj;
  }

  placeAt(asset, x, z, rot = 0, opts = {}) {
    const obj = asset.object || asset;
    obj.position.set(x, opts.y || 0, z);
    obj.rotation.y = rot;
    this.root.add(obj);
    if (asset.collider && !opts.noCollide) {
      const c = asset.collider;
      const cos = Math.abs(Math.cos(rot));
      const sin = Math.abs(Math.sin(rot));
      this.addCollider(x, z, c.w * cos + c.d * sin, c.w * sin + c.d * cos, { nav: opts.nav });
    }
    return obj;
  }

  bloodAt(gx, gy, scale = 1, rot = 0) {
    const mat = new THREE.MeshBasicMaterial({
      map: bloodDecal(), color: 0x8c1518, transparent: true,
      opacity: 0.55 + Math.random() * 0.3, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.3 * scale, 1.7 * scale), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rot;
    m.position.set((gx + 0.5) * CELL, 0.016, (gy + 0.5) * CELL);
    m.renderOrder = 1;
    this.root.add(m);
    return m;
  }

  grimeAt(gx, gy, scale = 1.4, rot = 0, opacity = 0.3) {
    const mat = new THREE.MeshBasicMaterial({
      map: grimeDecal(), transparent: true, opacity, depthWrite: false,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4 * scale, 2.0 * scale), mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rot;
    m.position.set((gx + 0.5) * CELL, 0.012, (gy + 0.5) * CELL);
    m.renderOrder = 1;
    this.root.add(m);
    return m;
  }

  puddleAt(gx, gy, scale = 1.1, shape = 0) {
    const geo = new THREE.CircleGeometry(1, 22);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getY(i), p.getX(i));
      const r = 1 + Math.sin(a * 3 + shape) * 0.18 + Math.cos(a * 5) * 0.1;
      p.setXY(i, p.getX(i) * r, p.getY(i) * r);
    }
    geo.computeVertexNormals();
    const mat = this.kit.puddleMaterial();
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(scale, scale * (0.65 + Math.random() * 0.4), 1);
    m.position.set((gx + 0.5) * CELL + (Math.random() - 0.5) * 0.8, 0.014, (gy + 0.5) * CELL);
    m.receiveShadow = true;
    this.root.add(m);
    this.ripples.push({
      x: m.position.x, z: m.position.z, t: Math.random() * 4,
      mesh: this.makeRipple(m.position.x, m.position.z),
    });
    return m;
  }

  makeRipple(x, z) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xbcd8d5, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 24), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.025, z);
    mesh.renderOrder = 2;
    this.root.add(mesh);
    return mesh;
  }

  buildProps() {
    const k = this.kit;
    const R = mulberry32(4242);

    // ---------------- Main lobby ----------------
    this.place(k.receptionDesk(), 12, 6.5, 0);
    this.place(k.chair(), 9.2, 8.4, Math.PI + 0.2);
    this.place(k.chair(), 15.2, 8.4, Math.PI - 0.3);
    this.place(k.vending(), 17.0, 8.4, -Math.PI / 2);
    this.place(k.wheelchair(), 8.0, 9.2, 0.7);
    this.place(k.gurney(), 16.2, 11.1, 0.1);
    this.place(k.corpse(), 14.4, 11.2, 1.2);
    this.place(k.papers(6, 0.6), 13.8, 10.6, 0.2);
    this.place(k.bones(), 15.8, 10.0, 0);
    this.bloodAt(14.4, 11.1, 1.4, 0.4);
    this.bloodAt(13.2, 9.6, 0.8, 1.2);
    this.grimeAt(10, 10, 1.5, 0.7, 0.25);
    this.puddleAt(12.8, 11.4, 0.8, 1);
    // barricade by the sealed entrance
    this.place(k.crate(1.2), 6.8, 11.5, 0.1);
    this.place(k.crate(1.0), 8.3, 11.7, -0.2);
    this.place(k.barrel(true), 17.2, 6.1, 0);

    // ---------------- Reception ----------------
    this.place(k.desk(true), 24, 7.2, Math.PI);
    for (let i = 0; i < 4; i++) this.place(k.filingCabinet(), 21 + i * 1.8, 5.8, 0);
    this.place(k.chair(), 25.4, 8.5, 0.3);
    this.place(k.shelf(), 21.2, 9.8, Math.PI / 2);
    this.place(k.locker(), 27.4, 10.9, Math.PI);
    this.place(k.papers(9, 0.9), 23.2, 10.6, 0.6);
    this.place(k.corpse(), 27.0, 8.1, -0.4);
    this.bloodAt(26.9, 8.2, 1.1, 2.2);
    this.grimeAt(24, 10.4, 1.3, 0.3, 0.22);
    this.puddleAt(22.0, 11.4, 0.75, 3);

    // ---------------- Generator room ----------------
    this.place(k.generator(), 38.2, 7.4, 0);
    this.place(k.breakerConsole(3), GENERATOR_CONSOLE.x, GENERATOR_CONSOLE.y, Math.PI);
    this.place(k.barrel(true), 34.6, 10.8, 0);
    this.place(k.barrel(true), 35.7, 11.5, 0.5);
    this.place(k.toxicBarrel(), 42.2, 6.0, 0);
    this.place(k.crate(1.2), 40.8, 11.1, 0.4);
    this.place(k.crate(0.9), 41.9, 11.4, -0.2);
    this.place(k.shelf(), 34.5, 6.3, Math.PI / 2);
    const pipe1 = this.place(k.pipeRun(6.5, 0.1), 0, 0, 0, { y: 2.35, ox: (34.5 + 0.5) * CELL, oz: 5.42 * CELL });
    pipe1.rotation.y = 0;
    const pipe2 = this.place(k.pipeRun(7.5, 0.075), 0, 0, 0, { y: 2.05, ox: (34.5 + 0.5) * CELL, oz: 5.16 * CELL });
    pipe2.rotation.y = 0;
    this.grimeAt(38, 10.8, 1.6, 0.4, 0.3);
    this.puddleAt(37.0, 11.6, 1.0, 2);

    // ---------------- Security ----------------
    this.place(k.desk(true), 49.5, 7.2, Math.PI);
    this.place(k.desk(), 53.0, 9.8, Math.PI);
    this.place(k.chair(), 48.4, 8.6, 0.4);
    this.place(k.chair(), 52.0, 10.5, -0.2);
    this.place(k.locker(), 55.2, 6.2, -Math.PI / 2);
    this.place(k.locker(), 55.2, 8.0, -Math.PI / 2);
    this.place(k.filingCabinet(), 46.0, 5.8, 0);
    this.place(k.filingCabinet(), 47.7, 5.8, 0);
    this.place(k.papers(8, 0.8), 50.5, 9.8, 0.2);
    this.place(k.corpse(), 50.0, 11.1, 2.3);
    this.bloodAt(50.1, 11.0, 1.3, 0.3);
    // monitors
    const monMat = new THREE.MeshStandardMaterial({ color: 0x0d1715, emissive: 0x3f8a76, emissiveIntensity: 0.35, roughness: 0.4 });
    for (let i = 0; i < 3; i++) {
      k.boxAt(this.root, 0.64, 0.42, 0.08, monMat, (47.2 + i * 1.7) * CELL, 1.5, 7.1 * CELL, 0, 0.1, 0, false);
      k.boxAt(this.root, 0.55, 0.34, 0.01, monMat, (47.2 + i * 1.7) * CELL, 1.5, 7.15 * CELL, 0, 0.1, 0, false);
    }
    // cameras
    const cam1 = k.cameraBall(); cam1.position.set(45.4 * CELL, 2.55, 5.4 * CELL); cam1.rotation.y = Math.PI / 4; this.root.add(cam1);
    const cam2 = k.cameraBall(); cam2.position.set(55.6 * CELL, 2.55, 5.4 * CELL); cam2.rotation.y = -Math.PI / 4; this.root.add(cam2);

    // ---------------- Ward ----------------
    for (const x of [8, 11, 14]) {
      this.place(k.bed(), x, 20.2, 0);
      this.place(k.bed(), x, 25.0, 0);
    }
    for (const x of [9.5, 12.5, 15.5]) {
      this.place(k.ivStand(), x, 21.6, 0);
    }
    this.place(k.curtain(2.0), 9.4, 21.0, 0, { y: 0 });
    this.place(k.curtain(2.0), 12.4, 21.0, 0, { y: 0 });
    this.place(k.curtain(2.0), 15.4, 21.0, 0, { y: 0 });
    this.place(k.curtain(2.0), 9.4, 25.8, 0, { y: 0 });
    this.place(k.filingCabinet(), 16.6, 21.0, 0);
    this.place(k.wheelchair(), 7.3, 22.7, 1.2);
    this.place(k.gurney(), 15.8, 26.3, 0.2);
    this.place(k.corpse(), 10.0, 23.4, -0.8);
    this.place(k.papers(7, 0.7), 11.6, 23.5, 2.4);
    this.place(k.bones(), 12.4, 26.3, 0);
    this.bloodAt(10.0, 23.4, 1.5, 1.2);
    this.bloodAt(13.8, 22.3, 1.0, 0.2);
    this.bloodAt(16.4, 21.2, 0.8, 2.0);
    this.grimeAt(8.2, 25.6, 1.2, 0.8, 0.22);
    this.puddleAt(13.4, 24.0, 1.0, 0);
    // restraints on bed
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x322c22, roughness: 0.9 });
    for (const x of [8, 14]) {
      k.boxAt(this.root, 1.9, 0.035, 0.1, strapMat, x + 0.5 > 0 ? (x + 0.5) * CELL : 0, 1.0, 20.2 * CELL, 0, 0, 0, false);
    }

    // ---------------- Records ----------------
    this.place(k.shelf(), 21.2, 19.6, Math.PI);
    this.place(k.shelf(), 26.4, 19.6, Math.PI);
    this.place(k.shelf(), 21.2, 23.2, 0);
    this.place(k.filingCabinet(), 25.7, 22.9, 0);
    this.place(k.filingCabinet(), 27.2, 22.9, 0);
    this.place(k.desk(true), 24.0, 24.8, Math.PI);
    this.place(k.chair(), 23.2, 25.9, 0.2);
    this.place(k.corpse(), 26.9, 26.2, 0.7);
    this.place(k.papers(12, 1.1), 22.5, 26.3, 0.8);
    this.place(k.papers(8, 0.8), 24.3, 24.2, 1.4);
    this.place(k.wheelchair(), 20.3, 25.6, -0.5);
    this.bloodAt(26.6, 26.1, 0.9, 1.8);
    this.grimeAt(23, 25.3, 1.3, 0.2, 0.25);

    // ---------------- Cold storage ----------------
    this.place(k.morgueDrawers(3), 36.2, 18.7, 0);
    this.place(k.morgueDrawers(3), 40.4, 18.7, 0);
    this.place(k.morgueDrawers(3), 43.0, 21.0, Math.PI / 2);
    this.place(k.gurney(), 39.4, 22.5, 0.1);
    this.place(k.bodyBag(), 36.0, 23.4, 0.5);
    this.place(k.bodyBag(), 41.1, 25.3, 2.0);
    this.place(k.bodyBag(), 37.2, 26.1, 1.1);
    this.place(k.gurney(), 35.3, 25.4, Math.PI / 2);
    this.place(k.ivStand(), 42.0, 24.0, 0);
    this.place(k.corpse(), 42.3, 20.2, 2.8);
    this.bloodAt(42.1, 20.2, 1.2, 0.7);
    this.bloodAt(39.3, 22.4, 0.9, 2.5);
    this.puddleAt(37.2, 22.0, 1.2, 2);
    this.grimeAt(40, 24, 1.6, 1.1, 0.25);
    // cold vapour will be spawned as ambient steam below

    // ---------------- Observation ----------------
    this.place(k.desk(), 48.0, 20.4, Math.PI);
    this.place(k.chair(), 48.6, 21.6, 0.1);
    this.place(k.restraintChair(), 51.2, 23.2, Math.PI);
    this.place(k.gurney(), 53.2, 21.7, Math.PI / 2);
    this.place(k.shelf(), 45.9, 25.8, Math.PI / 2);
    this.place(k.filingCabinet(), 54.6, 18.8, 0);
    this.place(k.papers(6, 0.7), 49.2, 20.7, 0.3);
    this.place(k.corpse(), 46.8, 26.2, 0.9);
    this.bloodAt(46.9, 26.1, 0.9, 0.2);
    this.grimeAt(52.5, 24.5, 1.4, 0.5, 0.3);
    const camObs = k.cameraBall(); camObs.position.set(55.6 * CELL, 2.55, 18.3 * CELL); camObs.rotation.y = -Math.PI / 4; this.root.add(camObs);
    this.buildContainmentWindow();

    // ---------------- Boiler ----------------
    this.place(k.boilerTank(), 10.5, 37.2, 0);
    this.place(k.pumpUnit(), 15.4, 36.3, Math.PI / 2);
    this.place(k.pipeRun(7.0, 0.13), 0, 0, 0, { y: 2.2, ox: (7.4 + 0.5) * CELL, oz: 35.7 * CELL });
    this.place(k.pipeRun(4.5, 0.1), 0, 0, 0, { y: 1.7, ox: (7.4 + 0.5) * CELL, oz: 35.4 * CELL });
    this.place(k.pipeRun(4.0, 0.08), 0, 0, 0, { y: 2.4, ox: 8.0 * CELL, oz: 40.0 * CELL });
    this.place(k.barrel(true), 16.9, 34.5, 0);
    this.place(k.barrel(true), 16.0, 34.9, 0.4);
    this.place(k.crate(1.2), 7.0, 41.7, 0.1);
    this.place(k.crate(1.0), 8.3, 41.9, -0.3);
    this.place(k.shelf(), 17.5, 39.5, Math.PI / 2);
    this.place(k.corpse(), 13.2, 42.3, 1.8);
    this.bloodAt(13.1, 42.2, 1.2, 1.0);
    this.grimeAt(13, 39, 1.6, 0.4, 0.28);
    this.puddleAt(12.2, 40.6, 1.4, 1);
    this.puddleAt(14.0, 40.8, 0.7, 2);

    // ---------------- Pump station ----------------
    this.place(k.pumpUnit(), 22.5, 37.0, 0);
    this.place(k.pumpUnit(), 26.4, 39.5, Math.PI);
    this.place(k.pumpUnit(), 21.4, 40.6, Math.PI / 2);
    this.place(k.pipeRun(5.5, 0.15), 0, 0, Math.PI / 2, { y: 2.0, ox: 20.5 * CELL, oz: 37.0 * CELL });
    this.place(k.pipeRun(4.5, 0.1), 0, 0, 0, { y: 2.45, ox: 24.0 * CELL, oz: 34.7 * CELL });
    this.place(k.barrel(true), 27.4, 35.0, 0);
    this.place(k.crate(1.0), 20.6, 35.1, 0.3);
    this.place(k.crate(1.2), 24.0, 41.5, 0.0);
    this.place(k.corpse(), 25.9, 42.4, 1.1);
    this.place(k.bones(), 26.8, 41.0, 0);
    this.puddleAt(24.5, 39.2, 2.1, 0);
    this.puddleAt(22.0, 41.9, 1.3, 2);
    this.puddleAt(26.7, 36.6, 0.9, 4);
    this.bloodAt(26.0, 42.3, 1.0, 2.2);
    this.grimeAt(23, 40, 1.4, 0.8, 0.3);

    // ---------------- Morgue ----------------
    this.place(k.morgueDrawers(3), 35.6, 34.8, 0);
    this.place(k.morgueDrawers(3), 39.8, 34.8, 0);
    this.place(k.autopsyTable(), 37.2, 37.7, 0);
    this.place(k.autopsyTable(), 41.1, 39.6, Math.PI / 2);
    this.place(k.hangingBody(), 39.0, 36.0, 0.6);
    this.place(k.bodyBag(), 36.2, 41.1, 0.4);
    this.place(k.bodyBag(), 40.2, 42.3, 2.2);
    this.place(k.gurney(), 42.1, 36.6, Math.PI / 2);
    this.place(k.corpse(), 38.3, 39.6, 2.0);
    this.place(k.papers(5, 0.6), 38.8, 40.8, 0.6);
    this.bloodAt(37.2, 37.7, 1.5, 0.3);
    this.bloodAt(39.0, 36.2, 1.0, 1.6);
    this.bloodAt(40.9, 39.6, 1.4, 2.8);
    this.puddleAt(39.8, 41.0, 1.2, 1);
    this.grimeAt(37.5, 39, 1.6, 0.2, 0.3);

    // ---------------- Maintenance ----------------
    const elevator = this.placeAt(k.elevator(), 56.3 * CELL, ELEVATOR_POS.y * CELL, -Math.PI / 2, { noCollide: true });
    this.addCollider(56.3 * CELL, ELEVATOR_POS.y * CELL, 0.5, 3.2, { nav: false });
    this.elevator = elevator;
    this.place(k.crate(1.3), 46.6, 38.4, 0.2);
    this.place(k.crate(1.1), 47.8, 40.3, -0.1);
    this.place(k.crate(1.0), 46.9, 40.5, 0.4);
    this.place(k.barrel(true), 55.0, 34.9, 0);
    this.place(k.barrel(true), 54.0, 35.2, 0.3);
    this.place(k.toxicBarrel(), 52.4, 42.5, 0);
    this.place(k.shelf(), 45.6, 35.0, Math.PI / 2);
    this.place(k.gurney(), 49.9, 35.5, Math.PI / 2);
    this.place(k.corpse(), 50.9, 41.9, 0.4);
    this.bloodAt(50.9, 41.8, 1.1, 0.8);
    this.place(k.papers(6, 0.7), 49.2, 42.4, 1.1);
    this.grimeAt(52, 38, 1.6, 0.5, 0.26);
    this.puddleAt(51.0, 38.4, 1.2, 3);

    // ---------------- Corridors ----------------
    this.place(k.gurney(), 20.8, 14.7, 0.05);
    this.place(k.wheelchair(), 35.0, 15.2, -0.6);
    this.place(k.gurney(), 45.2, 15.3, Math.PI);
    this.place(k.crate(1.0), 57.0, 15.2, 0.2);
    this.place(k.gurney(), 31.0, 27.0, Math.PI / 2);
    this.place(k.barrel(true), 57.0, 30.8, 0);
    this.place(k.crate(1.0), 6.6, 31.4, 0.1);
    this.place(k.wheelchair(), 37.4, 31.0, 0.4);
    this.place(k.papers(9, 1.0), 29.5, 29.0, 0.7);
    this.place(k.bones(), 46.4, 29.2, 0);
    this.bloodAt(13.0, 15.0, 0.7, 0.2);
    this.bloodAt(18.5, 15.1, 0.5, 1.2);
    this.bloodAt(33.0, 15.0, 0.45, 0.6);
    this.bloodAt(36.0, 31.2, 0.6, 2.2);
    this.bloodAt(22.2, 31.3, 0.5, 0.4);
    this.grimeAt(24, 15.4, 1.5, 0.1, 0.22);
    this.grimeAt(39, 31.4, 1.5, 0.6, 0.24);
    this.puddleAt(30.5, 15.3, 0.8, 2);
    this.puddleAt(31.0, 31.1, 0.7, 4);

    // wall pipes
    for (const [x, z, len, rot] of [
      [16, 14.2, 5, 0], [30, 14.2, 4, 0], [43, 14.2, 5, 0],
      [10, 30.2, 5, 0], [26, 30.2, 5, 0], [42, 30.2, 5, 0],
    ]) {
      const p = k.pipeRun(len, 0.07);
      p.object.position.set(x * CELL, 2.5, z * CELL);
      p.object.rotation.y = rot;
      this.root.add(p.object);
    }
  }

  buildContainmentWindow() {
    const k = this.kit;
    const wallX = 57 * CELL - 0.2;
    const z = 22.6 * CELL;
    // A three.js canvas portrait of something waiting on the other side.
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#010202';
    ctx.fillRect(0, 0, 512, 256);
    const grd = ctx.createRadialGradient(300, 150, 8, 300, 150, 210);
    grd.addColorStop(0, 'rgba(128,148,132,0.24)');
    grd.addColorStop(0.5, 'rgba(53,70,64,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 512, 256);
    // silhouette
    ctx.fillStyle = 'rgba(4,7,7,0.92)';
    ctx.beginPath();
    ctx.ellipse(256, 84, 20, 27, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(234, 108);
    ctx.lineTo(278, 108);
    ctx.lineTo(292, 210);
    ctx.lineTo(252, 254);
    ctx.lineTo(223, 250);
    ctx.lineTo(219, 210);
    ctx.closePath();
    ctx.fill();
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(238 + (s > 0 ? 36 : 0), 116);
      ctx.lineTo(238 + (s > 0 ? 62 : -26), 200);
      ctx.lineTo(238 + (s > 0 ? 55 : -18), 207);
      ctx.lineTo(238 + (s > 0 ? 20 : 18), 133);
      ctx.fill();
    }
    // eyes
    ctx.fillStyle = 'rgba(214,229,213,0.65)';
    ctx.beginPath(); ctx.ellipse(249, 82, 2.4, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(263, 82, 2.4, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    // scratches
    for (let i = 0; i < 34; i++) {
      ctx.strokeStyle = `rgba(190,205,194,${0.04 + Math.random() * 0.16})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      const x = Math.random() * 512;
      ctx.moveTo(x, Math.random() * 256);
      ctx.lineTo(x + (Math.random() - 0.5) * 22, Math.random() * 256);
      ctx.stroke();
    }
    const backTex = new THREE.CanvasTexture(c);
    backTex.colorSpace = THREE.SRGBColorSpace;
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshBasicMaterial({
      map: backTex, color: 0xa8b8ae, transparent: true, opacity: 0.85,
    }));
    backdrop.position.set(wallX + 0.08, 1.6, z);
    backdrop.rotation.y = -Math.PI / 2;
    this.root.add(backdrop);

    const win = k.glassWindow(3.2, 1.6);
    win.object.position.set(wallX, 1.6, z);
    win.object.rotation.y = -Math.PI / 2;
    this.root.add(win.object);
    // glass frost
    const frost = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.5), new THREE.MeshBasicMaterial({
      map: grimeDecal(), color: 0xb8cbc5, transparent: true, opacity: 0.22, depthWrite: false,
    }));
    frost.position.set(wallX - 0.015, 1.6, z);
    frost.rotation.y = -Math.PI / 2;
    this.root.add(frost);

    const sign = k.sign('SUBJECT 0', 'DO NOT ILLUMINATE', 2.1, 0.62, { bg: '#1c1f1a' });
    sign.position.set(wallX - 0.06, 2.62, z);
    sign.rotation.y = -Math.PI / 2;
    this.root.add(sign);
  }

  // --- Pickups and interactables ---------------------------------------------

  makePickupMesh(item, key) {
    const g = new THREE.Group();
    const M = this.kit.M;
    let ringColor = 0x86d0c2;
    if (item === 'ammo') {
      this.kit.boxAt(g, 0.38, 0.22, 0.28, M.olive || M.steelDark, 0, 0.11, 0);
      for (let i = 0; i < 4; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8), M.gold);
        b.position.set(-0.12 + i * 0.08, 0.27, 0.02);
        g.add(b);
      }
    } else if (item === 'battery') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 12), M.plasticDark);
      body.position.y = 0.17;
      g.add(body);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.08, 12), M.emissiveGreen);
      band.position.y = 0.19;
      g.add(band);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8), M.gold);
      cap.position.y = 0.35;
      g.add(cap);
    } else if (item === 'medkit') {
      this.kit.boxAt(g, 0.42, 0.22, 0.3, M.porcelain, 0, 0.11, 0);
      this.kit.boxAt(g, 0.26, 0.04, 0.03, M.emissiveRed, 0, 0.245, 0.16, 0, 0, 0, false);
      this.kit.boxAt(g, 0.04, 0.22, 0.03, M.emissiveRed, 0, 0.245, 0.16, 0, 0, 0, false);
      ringColor = 0x9fd0a8;
    } else if (item === 'fuse') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.28, 14), M.ceramic);
      body.position.y = 0.17;
      g.add(body);
      for (const y of [0.06, 0.28]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 14), M.steel);
        cap.position.y = y;
        g.add(cap);
      }
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.06, 14), M.emissiveAmber);
      glow.position.y = 0.18;
      g.add(glow);
      ringColor = 0xffbd68;
    } else if (item === 'card') {
      this.kit.boxAt(g, 0.34, 0.02, 0.5, new THREE.MeshStandardMaterial({ color: 0x3c6b5b, roughness: 0.35, metalness: 0.3 }), 0, 0.03, 0);
      this.kit.boxAt(g, 0.24, 0.01, 0.17, new THREE.MeshStandardMaterial({ color: 0xc7d8c8, roughness: 0.5 }), 0, 0.045, -0.09, 0, 0, 0, false);
      this.kit.boxAt(g, 0.1, 0.015, 0.1, M.emissiveAmber, 0.08, 0.05, 0.12, 0, 0, 0, false);
      ringColor = 0xffbd68;
    } else if (item === 'valve') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 8, 20), M.rust);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.25;
      g.add(ring);
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.035, 0.04), M.rust);
        s.rotation.y = (i / 4) * Math.PI;
        s.position.y = 0.25;
        g.add(s);
      }
      ringColor = 0xffbd68;
    } else if (item === 'flare') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.34, 10), new THREE.MeshStandardMaterial({ color: 0x8f241a, roughness: 0.6 }));
      body.position.y = 0.17;
      g.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), M.steel);
      cap.position.y = 0.35;
      g.add(cap);
      ringColor = 0xff8c57;
    }
    if (ringColor === 0xffbd68) ringColor = key ? 0xffbd68 : 0x86d0c2;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: ringColor, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(1.1, 1.1, 1);
    glow.position.y = 0.24;
    g.add(glow);

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.31, 24), new THREE.MeshBasicMaterial({
      color: ringColor, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    g.add(ring);
    g.userData.glow = glow;
    g.userData.ring = ring;
    g.userData.baseY = 0;
    return g;
  }

  buildPickups() {
    for (const def of PICKUP_DEFS) {
      const x = (def.gx + 0.5) * CELL;
      const z = (def.gy + 0.5) * CELL;
      const isNote = !!def.note;
      const item = def.item || 'note';
      const key = !!def.key || isNote;
      const mesh = isNote ? this.makeNoteMesh() : this.makePickupMesh(item, key);
      mesh.position.set(x, def.height || 0.4, z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.root.add(mesh);
      const pickup = {
        id: def.id, item, count: def.count || 1, note: def.note || null, key,
        mesh, taken: false, baseY: def.height || 0.4, phase: Math.random() * Math.PI * 2,
        x, z, def,
      };
      this.pickups.push(pickup);
      if (isNote) this.notes.push(pickup);
      this.interactables.push({
        kind: isNote ? 'note' : 'pickup',
        id: def.id, pickup,
        position: new THREE.Vector3(x, 0, z),
        radius: 2.55, active: true,
      });
    }
  }

  makeNoteMesh() {
    const g = new THREE.Group();
    const mat = this.kit.M.paper;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.46), mat);
    p.rotation.x = -Math.PI / 2.2;
    p.rotation.z = 0.2;
    p.position.y = 0.02;
    p.castShadow = true;
    g.add(p);
    const second = p.clone();
    second.position.set(-0.28, 0.005, 0.18);
    second.rotation.z = -0.4;
    second.scale.set(0.8, 0.8, 1);
    g.add(second);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xe7d8b6, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(1.2, 1.2, 1);
    glow.position.y = 0.1;
    g.add(glow);
    return g;
  }

  buildStations() {
    for (const s of SAVE_STATIONS) {
      const asset = this.kit.saveTerminal();
      const obj = this.place(asset, s.gx, s.gy, s.rot);
      const station = {
        ...s, group: obj, charges: s.charges, screen: obj.userData.screen,
        position: new THREE.Vector3(obj.position.x, 0, obj.position.z),
      };
      this.stations.push(station);
      this.interactables.push({
        kind: 'save', id: s.id, station,
        position: station.position.clone(), radius: 2.7, active: true,
      });
    }
  }

  buildVents() {
    for (const v of VENTS) {
      const asset = this.kit.vent();
      const obj = this.place(asset, v.gx, v.gy, v.rot);
      const vent = { ...v, group: obj, position: new THREE.Vector3(obj.position.x, 0, obj.position.z), spawn: null };
      this.vents.push(vent);
    }
  }

  // --- Atmosphere -------------------------------------------------------------

  buildAtmosphere() {
    // Dust motes that wrap around the player.
    const count = 700;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 42;
      positions[i * 3 + 1] = Math.random() * 5.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 34;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: dustTexture(), color: 0xd8cdb2, size: 0.055, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.dust = new THREE.Points(geo, mat);
    this.dust.frustumCulled = false;
    this.root.add(this.dust);

    // Low drifting fog banks.
    for (let i = 0; i < 20; i++) {
      const cell = this.floorCells[Math.floor(Math.random() * this.floorCells.length)];
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0x617270, transparent: true, opacity: 0.05 + Math.random() * 0.035,
        depthWrite: false, blending: THREE.NormalBlending,
      }));
      spr.position.set((cell.x + 0.5) * CELL, 0.4 + Math.random() * 0.5, (cell.y + 0.5) * CELL);
      spr.scale.set(8 + Math.random() * 7, 4 + Math.random() * 3, 1);
      spr.renderOrder = 4;
      this.root.add(spr);
      this.fogSprites.push({ sprite: spr, baseX: spr.position.x, baseZ: spr.position.z, phase: Math.random() * 8 });
      this.fogSprites[this.fogSprites.length - 1].sprite.material.rotation = Math.random() * Math.PI;
    }

    // Steam / cold vapour emitters.
    const emitters = [
      { x: 10.5, z: 37.2, n: 16, color: 0x9da9a2, scale: 1.1 },
      { x: 14.5, z: 39.8, n: 10, color: 0x8a9892, scale: 0.9 },
      { x: 24.0, z: 39.0, n: 14, color: 0x8fa5a2, scale: 1.1 },
      { x: 38.2, z: 24.2, n: 10, color: 0xa8c6c6, scale: 0.8 },
      { x: 39.0, z: 36.2, n: 8, color: 0x9a9c92, scale: 0.7 },
    ];
    for (const e of emitters) {
      for (let i = 0; i < e.n; i++) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
          map: dustTexture(), color: e.color, transparent: true, opacity: 0.0,
          depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        const baseX = (e.x + 0.5) * CELL + (Math.random() - 0.5) * 1.6;
        const baseZ = (e.z + 0.5) * CELL + (Math.random() - 0.5) * 1.6;
        spr.position.set(baseX, Math.random() * 2.2, baseZ);
        spr.scale.setScalar((0.5 + Math.random() * 0.8) * e.scale);
        this.root.add(spr);
        this.steam.push({
          sprite: spr, baseX, baseZ, baseY: Math.random() * 0.4,
          speed: 0.15 + Math.random() * 0.25, phase: Math.random() * 6.28,
          maxY: 2.0 + Math.random() * 1.3, opacity: 0.03 + Math.random() * 0.055,
        });
      }
    }

    const rand = mulberry32(157);
    for (const cell of this.floorCells) {
      if (rand() < 0.14) this.grimeAt(cell.x + rand() - 0.5, cell.y + rand() - 0.5, 0.7 + rand(), rand() * 6, 0.08 + rand() * 0.18);
    }
  }

  buildSignsAndGraffiti() {
    const k = this.kit;
    const add = (mesh, x, y, z, rot) => {
      mesh.position.set(x, y, z);
      mesh.rotation.y = rot;
      this.root.add(mesh);
    };
    add(k.sign('ST. ALDRIC HOSPITAL', 'SUBLEVEL 3 · QUARANTINE WARD', 2.9, 1.0, { bg: '#1e241f', titleSize: 52, subSize: 22 }),
      12.0 * CELL, 1.95, 5.0 * CELL + 0.19, 0);
    add(k.sign('EMERGENCY POWER', 'GRID B · AUTHORIZED ONLY', 2.2, 0.8, { bg: '#201d16', titleSize: 48 }),
      38.0 * CELL, 1.95, 5.0 * CELL + 0.19, 0);
    add(k.sign('SECURITY', 'LEVEL 3 OPERATIONS', 1.8, 0.7, { bg: '#1b2120' }),
      50.0 * CELL, 1.9, 5.0 * CELL + 0.19, 0);
    add(k.sign('COLD STORAGE', 'PROTOCOL 9 · SEALED', 2.0, 0.75, { bg: '#1a2222', color: '#b8cbc4' }),
      38.0 * CELL, 1.95, 18.0 * CELL + 0.19, 0);
    add(k.sign('OBSERVATION', 'CONTAINMENT SUITE', 1.9, 0.7, { bg: '#1b2120' }),
      50.0 * CELL, 1.9, 18.0 * CELL + 0.19, 0);
    add(k.sign('PATHOLOGY', 'COLD ANNEX · MORGUE', 1.8, 0.65, { bg: '#1d211d' }),
      38.0 * CELL, 1.9, 34.0 * CELL + 0.19, 0);
    add(k.sign('SERVICE ELEVATOR', 'SURFACE ACCESS', 1.9, 0.7, { bg: '#211e17' }),
      49.0 * CELL, 1.9, 34.0 * CELL + 0.19, 0);
    add(k.sign('SUBLEVEL 3', 'NO UNAUTHORIZED ACCESS', 1.55, 0.55, { bg: '#1c201c', titleSize: 56 }),
      27.0 * CELL, 2.05, 14.0 * CELL + 0.19, 0);
    add(k.graffiti('THEY FEAR THE LIGHT', 'rgba(120,24,20,0.85)', 3.4, 1.2),
      36.0 * CELL, 1.62, 30.0 * CELL + 0.19, 0);
    add(k.graffiti('DON\'T LET IT HEAR YOU', 'rgba(92,84,40,0.7)', 3.0, 1.1),
      19.5 * CELL, 1.55, 32.0 * CELL + 0.19, 0);
    add(k.graffiti('ORPHEUS', 'rgba(118,26,22,0.8)', 2.4, 1.0),
      25.0 * CELL, 1.5, 27.0 * CELL + 0.19, 0);

    // blood handprints on ward walls
    for (const [x, z, rot] of [[18.0, 22.0, -Math.PI / 2], [6.0, 24.0, Math.PI / 2], [34.0, 24.0, Math.PI / 2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshBasicMaterial({
        map: bloodDecal(), color: 0x8a1618, transparent: true, opacity: 0.5, depthWrite: false,
      }));
      m.position.set(x * CELL + (rot > 0 ? 0.18 : -0.18), 1.35, z * CELL);
      m.rotation.y = rot;
      this.root.add(m);
    }

    for (const s of DOOR_SIGNS) {
      const sign = k.sign(s.text, '', 1.35, 0.42, { bg: '#1c211d', titleSize: 54, border: '#596155', grime: true });
      sign.position.set(s.x * CELL, 2.78, s.z * CELL);
      sign.rotation.y = s.rot;
      this.root.add(sign);
    }
  }

  // Extra hand-placed storytelling decals that sit on top of the base prop pass.
  applyStaticDetails() {
    const rand = mulberry32(20261);

    // Drag trails leading away from the ward and cold storage.
    const trails = [
      { x0: 11.5, y0: 22.5, x1: 19.0, y1: 15.2, n: 11, size: 0.42 },
      { x0: 39.0, y0: 22.0, x1: 38.6, y1: 15.3, n: 8, size: 0.36 },
      { x0: 50.4, y0: 11.0, x1: 57.0, y1: 15.2, n: 8, size: 0.34 },
      { x0: 26.0, y0: 42.0, x1: 18.0, y1: 31.2, n: 10, size: 0.4 },
    ];
    for (const t of trails) {
      for (let i = 0; i < t.n; i++) {
        const f = i / Math.max(1, t.n - 1);
        const x = t.x0 + (t.x1 - t.x0) * f + (rand() - 0.5) * 0.5;
        const y = t.y0 + (t.y1 - t.y0) * f + (rand() - 0.5) * 0.5;
        this.bloodAt(x, y, t.size * (0.75 + rand() * 0.6), rand() * Math.PI * 2);
      }
    }

    // Sparse standing water in the tunnel and industrial corridors.
    for (const [x, y, s, shape] of [
      [17.4, 31.2, 1.0, 1], [20.8, 31.5, 0.7, 3], [44.0, 31.1, 1.1, 0],
      [47.8, 30.8, 0.75, 2], [55.6, 15.4, 0.8, 4], [43.0, 14.9, 0.65, 1],
      [56.8, 38.2, 0.95, 3], [33.8, 24.8, 0.7, 0],
    ]) this.puddleAt(x, y, s, shape);

    // Grime blooms in room corners, kept subtle.
    const corners = [
      [7.2, 18.6], [16.8, 18.5], [7.2, 27.4], [16.8, 27.6],
      [34.4, 18.4], [43.4, 18.6], [34.4, 27.4], [44.4, 27.2],
      [45.3, 18.4], [55.2, 18.5], [45.3, 27.2], [55.0, 27.4],
      [6.5, 35.2], [17.2, 34.8], [6.5, 42.6], [17.2, 42.8],
      [20.5, 34.8], [27.2, 34.7], [20.5, 42.6], [27.2, 42.5],
      [34.4, 34.6], [43.2, 34.8], [34.4, 42.6], [43.2, 42.6],
      [45.2, 34.5], [55.4, 34.6], [45.2, 42.8], [55.2, 42.8],
    ];
    for (const [x, y] of corners) {
      this.grimeAt(x, y, 0.75 + rand() * 0.5, rand() * 6.28, 0.12 + rand() * 0.1);
    }

    // Faint scuff marks along the main north corridor.
    for (let i = 0; i < 14; i++) {
      const x = 6.5 + i * 3.6 + rand() * 1.4;
      this.grimeAt(x, 15.0 + rand() * 0.9, 0.34 + rand() * 0.2, rand() * 6.28, 0.07 + rand() * 0.05);
    }
  }

  buildInteractables() {
    this.interactables.push({
      kind: 'generator', id: 'generator',
      position: new THREE.Vector3((GENERATOR_CONSOLE.x + 0.5) * CELL, 0, (GENERATOR_CONSOLE.y + 0.5) * CELL),
      radius: 3.3, active: true,
    });
    this.interactables.push({
      kind: 'elevator', id: 'elevator',
      position: new THREE.Vector3(53.9 * CELL, 0, ELEVATOR_POS.y * CELL),
      radius: 3.4, active: true,
    });
    this.elevatorPanelPos = new THREE.Vector3(53.9 * CELL, 0, ELEVATOR_POS.y * CELL);
    this.updateElevatorIndicator();
  }

  updateElevatorIndicator() {
    if (!this.elevator) return;
    const ind = this.elevator.userData.indicator;
    ind.material.emissive.setHex(this.flags.elevatorReady ? 0x46ff8c : 0xff2d1c);
    ind.material.color.setHex(this.flags.elevatorReady ? 0x06220f : 0x200403);
  }

  // --- Interaction and state ---------------------------------------------------

  getInteractable(pos, maxRange = 3.0) {
    let best = null;
    let bestD = maxRange;
    for (const it of this.interactables) {
      if (!it.active) continue;
      if (it.kind === 'pickup' || it.kind === 'note') {
        if (it.pickup.taken) continue;
      }
      const dx = it.position.x - pos.x;
      const dz = it.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  takePickup(pickup) {
    if (!pickup || pickup.taken) return null;
    pickup.taken = true;
    pickup.mesh.visible = false;
    const it = this.interactables.find((i) => i.pickup === pickup);
    if (it) it.active = false;
    if (pickup.item === 'card') this.flags.card = true;
    if (pickup.item === 'valve') this.flags.valve = true;
    if (pickup.item === 'fuse') {
      if (pickup.id.includes('ward')) this.flags.fuses.ward = true;
      if (pickup.id.includes('cold')) this.flags.fuses.cold = true;
      if (pickup.id.includes('pump')) this.flags.fuses.pump = true;
    }
    if (pickup.note) this.flags.notesRead[pickup.note] = true;
    return pickup;
  }

  useStation(station) {
    if (!station || station.charges <= 0) return false;
    station.charges -= 1;
    return true;
  }

  activateGenerator() {
    if (this.flags.powered) return false;
    this.flags.fusesInserted = true;
    this.setPower(true);
    this.updateElevatorIndicator();
    this.events.push({ type: 'generatorStart' });
    return true;
  }

  unlockByRequirement(req) {
    for (const door of this.doors) {
      if (door.locked && door.requires === req) {
        door.locked = false;
        door.lampMat.emissive.setHex(0x5dff9b);
        door.lampMat.color.setHex(0x04120a);
      }
    }
  }

  // --- Collision and navigation ------------------------------------------------

  isNavBlocked(gx, gy) {
    if (!this.isFloorCell(gx, gy)) return true;
    const i = gridIndex(gx, gy);
    if (this.walkableProps[i]) return true;
    for (const d of this.doors) {
      if (d.locked && d.navCells.includes(i)) return true;
    }
    return false;
  }

  circleHitsAABB(x, z, r, minX, maxX, minZ, maxZ) {
    const cx = Math.max(minX, Math.min(x, maxX));
    const cz = Math.max(minZ, Math.min(z, maxZ));
    const dx = x - cx;
    const dz = z - cz;
    return dx * dx + dz * dz < r * r;
  }

  canOccupy(x, z, r = 0.38) {
    if (x < 1 || z < 1 || x > GRID_W * CELL - 1 || z > GRID_H * CELL - 1) return false;
    const steps = 8;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const sx = x + (i * r);
        const sz = z + (j * r);
        if (i * i + j * j > 1.15) continue;
        if (!this.isFloorCell(Math.floor(sx / CELL), Math.floor(sz / CELL))) return false;
      }
    }
    for (const c of this.colliders) {
      if (this.circleHitsAABB(x, z, r, c.minX, c.maxX, c.minZ, c.maxZ)) return false;
    }
    for (const d of this.doors) {
      if (!this.doorIsBlocking(d)) continue;
      const halfW = d.width / 2;
      if (d.orient === 'h') {
        if (this.circleHitsAABB(x, z, r, d.x - halfW, d.x + halfW, d.z - 0.16, d.z + 0.16)) return false;
      } else {
        if (this.circleHitsAABB(x, z, r, d.x - 0.16, d.x + 0.16, d.z - halfW, d.z + halfW)) return false;
      }
    }
    return true;
  }

  hasLineOfSight(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(dist / (CELL * 0.33)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x1 + dx * t;
      const z = z1 + dz * t;
      if (!this.isFloorCell(Math.floor(x / CELL), Math.floor(z / CELL))) return false;
    }
    // Closed or locked doors break line of sight as well as navigation.
    for (const d of this.doors) {
      if (!this.doorIsBlocking(d)) continue;
      const halfW = d.width / 2 + 0.12;
      if (d.orient === 'h') {
        if ((z1 - d.z) * (z2 - d.z) > 0) continue;
        if (Math.abs(z2 - z1) < 1e-5) continue;
        const t = (d.z - z1) / (z2 - z1);
        if (t < 0 || t > 1) continue;
        const x = x1 + dx * t;
        if (x >= d.x - halfW && x <= d.x + halfW) return false;
      } else {
        if ((x1 - d.x) * (x2 - d.x) > 0) continue;
        if (Math.abs(x2 - x1) < 1e-5) continue;
        const t = (d.x - x1) / (x2 - x1);
        if (t < 0 || t > 1) continue;
        const z = z1 + dz * t;
        if (z >= d.z - halfW && z <= d.z + halfW) return false;
      }
    }
    return true;
  }

  isInFlashlight(x, z) {
    const f = this.flashlight;
    if (!f.on) return 0;
    const dx = x - f.origin.x;
    const dz = z - f.origin.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) return 1;
    if (d > f.range) return 0;
    const dot = (dx * f.dir.x + dz * f.dir.z) / d;
    if (dot < f.cos) return 0;
    if (!this.hasLineOfSight(f.origin.x, f.origin.z, x, z)) return 0;
    return 1 - Math.max(0, d - 4) / f.range * 0.35;
  }

  lightLevelAt(x, z) {
    let level = 0.0;
    level = Math.max(level, this.isInFlashlight(x, z));
    for (const flare of this.flares) {
      if (flare.state !== 'burn') continue;
      const d = Math.hypot(x - flare.x, z - flare.z);
      if (d < 7.5) level = Math.max(level, 1 - d / 9);
    }
    for (const f of this.fixtures) {
      if (f.level < 0.1) continue;
      if (f.powerRequired && !this.flags.powered) continue;
      const d = Math.hypot(x - f.position.x, z - f.position.z);
      const radius = f.emergency ? 5.2 : 9.5;
      if (d > radius) continue;
      if (!this.hasLineOfSight(f.position.x, f.position.z, x, z)) continue;
      const strength = f.emergency ? 0.16 : 0.58;
      level = Math.max(level, strength * f.level * (1 - d / (radius + 2)));
    }
    return Math.min(1, level);
  }

  roomAt(x, z) {
    const gx = Math.floor(x / CELL);
    const gy = Math.floor(z / CELL);
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return null;
    const id = this.room[gridIndex(gx, gy)];
    if (id && ROOMS[id]) return { id, ...ROOMS[id] };
    const zone = this.zone[gridIndex(gx, gy)];
    if (!zone) return null;
    if (zone === 'corridorT') return { id: 'corridor-t', name: 'Lower Service Tunnels', sub: 'Sublevel 3 · Flood Control', zone };
    if (zone === 'corridorV') return { id: 'corridor-v', name: 'Central Spine', sub: 'Sublevel 3 · Research Access', zone };
    return { id: 'corridor-h', name: 'Quarantine Corridor', sub: 'Sublevel 3 · West Wing', zone };
  }

  updateExploration() {
    const gx = Math.floor(this.playerPos.x / CELL);
    const gy = Math.floor(this.playerPos.z / CELL);
    for (let y = gy - 1; y <= gy + 1; y++) {
      for (let x = gx - 1; x <= gx + 1; x++) {
        if (this.isFloorCell(x, y)) this.explored.add(gridIndex(x, y));
      }
    }
    const id = this.room[gridIndex(gx, gy)];
    if (id && !this.discoveredRooms) this.discoveredRooms = new Set();
    if (id && !this.discoveredRooms.has(id)) {
      this.discoveredRooms.add(id);
      const [x1, y1, x2, y2] = ROOMS[id].rect;
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) this.explored.add(gridIndex(x, y));
      }
    }
  }

  // --- Environment simulation ---------------------------------------------------

  throwFlare(start, target) {
    // Limit to two live flares.
    const active = this.flares.filter((f) => f.state !== 'dead');
    if (active.length >= 2) {
      const oldest = active[0];
      oldest.state = 'dead';
      oldest.timer = 0.4;
      if (oldest.light) oldest.light.intensity = 0;
    }
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.28, 10),
      new THREE.MeshStandardMaterial({ color: 0x9b2a1c, roughness: 0.6 }),
    );
    body.rotation.z = Math.PI / 2;
    group.add(body);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xff7c39, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(1.2, 1.2, 1);
    group.add(glow);
    group.position.set(start.x, 1.0, start.z);
    this.root.add(group);

    const light = this.flarePool.find((l) => !this.flares.some((f) => f.light === l && f.state !== 'dead')) || this.flarePool[0];
    light.color.setHex(0xff7a2e);
    light.distance = 15;
    light.intensity = 0;
    light.position.set(start.x, 0.5, start.z);
    const flare = {
      mesh: group, light, state: 'fly', t: 0, timer: 22,
      x: start.x, z: start.z, start: start.clone(), target: target.clone(),
      phase: Math.random() * 8,
    };
    this.flares.push(flare);
    this.events.push({ type: 'flareThrow', position: new THREE.Vector3(start.x, 0, start.z) });
    return flare;
  }

  updateFlares(dt, time) {
    for (const flare of this.flares) {
      if (flare.state === 'dead') {
        flare.timer -= dt;
        if (flare.timer <= 0) {
          flare.mesh.visible = false;
          if (flare.light) flare.light.intensity = 0;
          flare.state = 'gone';
        }
        continue;
      }
      if (flare.state === 'fly') {
        flare.t += dt;
        const p = Math.min(1, flare.t / 0.48);
        flare.x = flare.start.x + (flare.target.x - flare.start.x) * p;
        flare.z = flare.start.z + (flare.target.z - flare.start.z) * p;
        const y = 1.0 + Math.sin(p * Math.PI) * 1.4 - p * 0.9;
        flare.mesh.position.set(flare.x, Math.max(0.15, y), flare.z);
        flare.mesh.rotation.x += dt * 12;
        if (p >= 1) {
          flare.state = 'burn';
          flare.timer = 20;
          flare.events = false;
          this.events.push({ type: 'flareLand', position: new THREE.Vector3(flare.x, 0, flare.z) });
        }
      } else if (flare.state === 'burn') {
        flare.timer -= dt;
        if (flare.timer < 1.2) flare.state = 'dead';
        const flick = 0.68 + 0.32 * Math.abs(Math.sin(time * 17 + flare.phase)) * (0.7 + Math.sin(time * 5.3) * 0.3);
        flare.light.position.set(flare.x, 0.55, flare.z);
        flare.light.intensity = 26 * flick;
        flare.mesh.position.y = 0.16;
        flare.mesh.scale.setScalar(0.9 + flick * 0.2);
        const g = flare.mesh.children.find((c) => c.isSprite);
        if (g) g.material.opacity = 0.5 + flick * 0.45;
        if (Math.random() < dt * 24) {
          this.events.push({ type: 'flareCrackle', position: new THREE.Vector3(flare.x, 0, flare.z) });
        }
      }
    }
  }

  updateFixtures(dt, time) {
    if (this.flags.powered) this.powerTime += dt;
    let activeCount = 0;
    for (const f of this.fixtures) {
      if (f.powerRequired) {
        if (this.flags.powered && this.powerTime > f.delay) {
          f.level += (1 - f.level) * Math.min(1, dt * 1.8);
        } else if (!this.flags.powered) {
          f.level += (0 - f.level) * Math.min(1, dt * 3);
        }
      }
      let flick = 1;
      if (f.flicker) {
        const n = Math.sin(time * 13.7 + f.phase) * Math.sin(time * 7.1 + f.phase * 2.7);
        flick = 0.78 + 0.22 * Math.abs(n);
        if (Math.sin(time * 0.73 + f.phase) > 0.992) flick *= 0.25;
        if (f.emergency) flick *= 0.86 + 0.14 * Math.sin(time * 19 + f.phase);
      }
      const render = Math.max(0, f.level * flick);
      f.renderLevel = render;
      if (f.tubeMat) {
        f.tubeMat.emissiveIntensity = 0.06 + render * 2.3;
      }
      if (f.lampMat) {
        f.lampMat.emissiveIntensity = 0.25 + render * 2.8;
      }
      if (f.glow) f.glow.material.opacity = render * (f.emergency ? 0.65 : 0.24);
      if (f.shaft) f.shaft.material.uniforms.uOpacity.value = render * 0.115;
      if (f.shaft) f.shaft.material.uniforms.uTime.value = time;
      if (f.level > 0.02) activeCount++;
    }
    this.activeFixtureCount = activeCount;

    // Assign the fixed pool of real lights to the nearest active fixtures. This
    // keeps shader light counts stable while every fixture still looks alive.
    const candidates = [];
    for (const f of this.fixtures) {
      if (f.level < 0.015) continue;
      const d = f.position.distanceTo(this.playerPos);
      if (d > 30) continue;
      candidates.push({ f, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.lightPool.length; i++) {
      const light = this.lightPool[i];
      const c = candidates[i];
      if (!c) { light.intensity = 0; continue; }
      const f = c.f;
      light.position.copy(f.position);
      light.color.setHex(f.color);
      light.distance = f.distance;
      light.intensity = f.intensity * (f.renderLevel || 0);
    }
    for (const light of this.flarePool) {
      if (!this.flares.some((f) => f.light === light && f.state === 'burn')) light.intensity = 0;
    }
  }

  updateDoors(dt) {
    for (const d of this.doors) {
      const speed = 2.8;
      const diff = d.target - d.angle;
      if (Math.abs(diff) > 0.005) {
        d.angle += Math.sign(diff) * Math.min(Math.abs(diff), dt * speed);
      } else {
        d.angle = d.target;
      }
      for (const p of d.pivots) {
        p.pivot.rotation.y = -p.s * d.angle;
      }
      d.lampMat.emissiveIntensity = 0.75 + Math.sin(this.time * 3 + d.x) * 0.2;
    }
  }

  updateDust(dt, time) {
    if (!this.dust) return;
    const pos = this.dust.geometry.attributes.position;
    const arr = pos.array;
    const px = this.playerPos.x;
    const pz = this.playerPos.z;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += dt * 0.12 * Math.sin(i + time * 0.2);
      arr[i + 1] += dt * (0.035 + (i % 7) * 0.004) * Math.sin(time * 0.5 + i);
      arr[i + 2] += dt * 0.08 * Math.cos(i * 0.7 + time * 0.16);
      if (arr[i + 1] > 5.4) arr[i + 1] = 0.1;
      if (arr[i] - px > 24) arr[i] -= 48; else if (arr[i] - px < -24) arr[i] += 48;
      if (arr[i + 2] - pz > 22) arr[i + 2] -= 44; else if (arr[i + 2] - pz < -22) arr[i + 2] += 44;
    }
    pos.needsUpdate = true;
    this.dust.material.opacity = 0.34 + Math.sin(time * 0.3) * 0.06;
  }

  updateAmbient(dt, time) {
    for (const f of this.fogSprites) {
      const s = f.sprite;
      s.position.x = f.baseX + Math.sin(time * 0.09 + f.phase) * 2.4;
      s.position.z = f.baseZ + Math.cos(time * 0.07 + f.phase * 1.4) * 1.8;
      s.material.opacity = 0.035 + 0.02 * (0.5 + 0.5 * Math.sin(time * 0.17 + f.phase));
    }
    for (const s of this.steam) {
      s.sprite.position.y += dt * s.speed;
      s.sprite.position.x += Math.sin(time * 0.7 + s.phase) * dt * 0.12;
      s.sprite.position.z += Math.cos(time * 0.5 + s.phase) * dt * 0.1;
      if (s.sprite.position.y > s.maxY) {
        s.sprite.position.y = s.baseY + 0.1;
        s.sprite.position.x = s.baseX + (Math.random() - 0.5) * 1.6;
        s.sprite.position.z = s.baseZ + (Math.random() - 0.5) * 1.6;
      }
      const t = s.sprite.position.y / s.maxY;
      s.sprite.material.opacity = s.opacity * Math.sin(t * Math.PI) * 1.4;
    }
    for (const r of this.ripples) {
      r.t += dt;
      const cycle = (time * 0.55 + r.t * 0.15) % 4;
      const active = cycle < 1.0;
      const mesh = r.mesh;
      if (active) {
        mesh.visible = true;
        const p = cycle;
        mesh.scale.setScalar(0.3 + p * 3.2);
        mesh.material.opacity = (1 - p) * 0.35;
      } else {
        mesh.visible = false;
      }
    }
    this.ambientTimer = (this.ambientTimer ?? 4) - dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 7 + Math.random() * 12;
      const cell = this.floorCells[Math.floor(Math.random() * this.floorCells.length)];
      const close = Math.hypot((cell.x + 0.5) * CELL - this.playerPos.x, (cell.y + 0.5) * CELL - this.playerPos.z) < 22;
      if (close) {
        this.events.push({
          type: Math.random() < 0.55 ? 'drip' : 'creak',
          position: new THREE.Vector3((cell.x + 0.5) * CELL, 1.2, (cell.y + 0.5) * CELL),
        });
      }
    }
  }

  updatePickups(dt, time) {
    for (const p of this.pickups) {
      if (p.taken || !p.mesh.visible) continue;
      p.mesh.position.y = p.baseY + Math.sin(time * 2.1 + p.phase) * 0.035;
      const ring = p.mesh.userData.ring;
      if (ring && ring.material) ring.material.opacity = 0.34 + 0.28 * (0.5 + 0.5 * Math.sin(time * 3 + p.phase));
    }
    for (const s of this.stations) {
      if (s.screen) s.screen.emissiveIntensity = 0.65 + Math.sin(time * 2 + s.position.x) * 0.2;
    }
  }

  update(dt, time, playerPos) {
    this.time = time;
    if (playerPos) this.playerPos.copy(playerPos);
    this.updateExploration();
    this.updateDoors(dt);
    this.updateFixtures(dt, time);
    this.updateFlares(dt, time);
    this.updateDust(dt, time);
    this.updateAmbient(dt, time);
    this.updatePickups(dt, time);
  }

  // --- Save state ----------------------------------------------------------------

  applyState(state) {
    if (!state) return;
    const f = state.flags || {};
    this.flags.card = !!f.card;
    this.flags.valve = !!f.valve;
    this.flags.fuses = { ...this.flags.fuses, ...(f.fuses || {}) };
    this.flags.fusesInserted = !!f.fusesInserted;
    this.flags.powered = !!f.powered;
    this.flags.elevatorReady = !!f.elevatorReady || !!f.powered;
    this.flags.notesRead = { ...(f.notesRead || {}) };
    if (state.taken) {
      for (const p of this.pickups) {
        if (state.taken[p.id]) {
          p.taken = true;
          p.mesh.visible = false;
          const it = this.interactables.find((i) => i.pickup === p);
          if (it) it.active = false;
        }
      }
    }
    if (state.stations) {
      for (const s of this.stations) {
        if (typeof state.stations[s.id] === 'number') s.charges = state.stations[s.id];
      }
    }
    if (state.doors) {
      for (const d of this.doors) {
        const sd = state.doors[d.id];
        if (!sd) continue;
        d.locked = !!sd.locked;
        d.open = !!sd.open;
        d.target = d.open ? 1.45 : 0;
        d.angle = d.target;
        d.lampMat.emissive.setHex(d.locked ? 0xff2b1c : 0x5dff9b);
        d.lampMat.color.setHex(d.locked ? 0x120404 : 0x04120a);
      }
    }
    if (this.flags.powered) {
      this.setPower(true, true);
    }
    this.updateElevatorIndicator();
    if (this.discoveredRooms === undefined) this.discoveredRooms = new Set();
    if (state.explored) {
      for (const i of state.explored) this.explored.add(i);
    }
  }

  getSaveState() {
    return {
      flags: JSON.parse(JSON.stringify(this.flags)),
      taken: Object.fromEntries(this.pickups.filter((p) => p.taken).map((p) => [p.id, true])),
      stations: Object.fromEntries(this.stations.map((s) => [s.id, s.charges])),
      doors: Object.fromEntries(this.doors.map((d) => [d.id, { locked: d.locked, open: d.open }])),
      explored: [...this.explored],
    };
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
