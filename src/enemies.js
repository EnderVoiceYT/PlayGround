import * as THREE from 'three';
import { createHollow, createMoth, createGaunt } from './enemymodels.js';
import { CELL, GRID_W, GRID_H, gridIndex } from './leveldata.js';

const STATS = {
  hollow: {
    hp: 38, patrolSpeed: 1.45, chaseSpeed: 3.05, fleeSpeed: 3.5,
    sightDark: 7.5, sightLit: 15, attackRange: 1.35, damage: 9,
    windup: 0.42, cooldown: 1.5, radius: 0.36, hearing: 13, scale: 1,
  },
  moth: {
    hp: 28, patrolSpeed: 1.05, chaseSpeed: 1.85, fleeSpeed: 1.5,
    sightDark: 6.5, sightLit: 20, attackRange: 1.55, damage: 11,
    windup: 0.5, cooldown: 1.7, radius: 0.38, hearing: 15, scale: 1,
  },
  gaunt: {
    hp: 180, patrolSpeed: 1.1, chaseSpeed: 2.2, fleeSpeed: 1.1,
    sightDark: 18, sightLit: 22, attackRange: 2.0, damage: 27,
    windup: 0.66, cooldown: 2.3, radius: 0.56, hearing: 24, scale: 1,
  },
};

class MinHeap {
  constructor() { this.a = []; }
  push(node) {
    const a = this.a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    if (!a.length) return null;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function cellOf(v) { return Math.floor(v / CELL); }

export class EnemyManager {
  constructor(scene, world, opts = {}) {
    this.scene = scene;
    this.world = world;
    this.onPlayerDamage = opts.onPlayerDamage || (() => {});
    this.drainBattery = opts.drainBattery || (() => {});
    this.onKill = opts.onKill || (() => {});
    this.enemies = [];
    this.events = [];
    this.time = 0;
    this.danger = 0;
    this.powerWave = -1;
    this.ventTimer = 0;
    this._pathG = new Float32Array(GRID_W * GRID_H);
    this._pathF = new Float32Array(GRID_W * GRID_H);
    this._came = new Int32Array(GRID_W * GRID_H);
    this._closed = new Uint8Array(GRID_W * GRID_H);
    this.spawnInitial();
  }

  emit(type, position, extra = {}) {
    this.events.push({ type, position: position.clone ? position.clone() : position, ...extra });
  }

  findNearestWalkable(gx, gy, maxR = 5) {
    if (!this.world.isNavBlocked(gx, gy)) return { x: gx, y: gy };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = gx + dx, y = gy + dy;
          if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) continue;
          if (!this.world.isNavBlocked(x, y)) return { x, y };
        }
      }
    }
    return null;
  }

  spawnCell(type, gx, gy, opts = {}) {
    const cell = this.findNearestWalkable(Math.round(gx), Math.round(gy));
    if (!cell) return null;
    const x = (cell.x + 0.5) * CELL;
    const z = (cell.y + 0.5) * CELL;
    return this.spawn(type, x, z, opts);
  }

  spawn(type, x, z, opts = {}) {
    if (this.enemies.filter((e) => !e.dead).length >= 15) return null;
    const model = type === 'hollow' ? createHollow() : type === 'moth' ? createMoth() : createGaunt();
    const group = model.group;
    group.position.set(x, opts.y || 0, z);
    group.rotation.y = opts.rotation ?? Math.random() * Math.PI * 2;
    this.scene.add(group);
    group.traverse((o) => { o.userData.enemy = null; });
    const enemy = new Enemy(this, type, model, group, x, z, opts);
    group.traverse((o) => { o.userData.enemy = enemy; });
    this.enemies.push(enemy);
    return enemy;
  }

  spawnInitial() {
    this.spawnCell('hollow', 14.5, 23.4, { state: 'patrol', room: 'ward' });
    this.spawnCell('hollow', 38.8, 24.3, { state: 'patrol', room: 'cold' });
    this.spawnCell('hollow', 24.6, 37.0, { state: 'patrol', room: 'pump' });
    this.spawnCell('hollow', 12.2, 39.4, { state: 'patrol', room: 'boiler' });
    this.spawnCell('moth', 24.2, 22.0, { state: 'patrol', room: 'records' });
    this.spawnCell('moth', 51.2, 23.5, { state: 'patrol', room: 'observation' });
    this.spawnCell('hollow', 34.8, 31.0, { state: 'patrol' });
    this.gaunt = this.spawnCell('gaunt', 39.4, 41.2, { state: 'dormant', dormant: true, room: 'morgue' });
  }

  onPower() {
    this.powerWave = 7;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.type === 'gaunt') { e.dormant = false; e.state = 'chase'; }
      else {
        e.lastKnown.copy(this.playerRef || e.home);
        e.state = e.type === 'moth' ? 'chase' : 'chase';
      }
    }
    this.emit('powerRoar', new THREE.Vector3(38 * CELL, 1.5, 10 * CELL));
  }

  alertNoise(position, radius, kind = 'noise') {
    for (const e of this.enemies) {
      if (e.dead || e.state === 'dormant' || e.state === 'emerge') continue;
      const d = Math.hypot(e.x - position.x, e.z - position.z);
      const hearing = STATS[e.type].hearing * (kind === 'gunshot' ? 2.3 : 1);
      if (d < Math.min(radius, hearing)) {
        if (e.state === 'chase' || e.state === 'attack') continue;
        e.investigatePos.copy(position);
        if (e.state === 'flee' && e.type === 'hollow') continue;
        e.state = d < 5 ? 'chase' : 'investigate';
        e.lookTimer = 0;
        e.repathTimer = 0;
        if (d < 6) e.lastKnown.copy(position);
      }
    }
  }

  wakeGaunt() {
    if (!this.gaunt || this.gaunt.dead) return;
    if (this.gaunt.dormant) {
      this.gaunt.dormant = false;
      this.gaunt.state = 'chase';
      this.gaunt.lastKnown.copy(this.playerRef || this.gaunt.home);
      this.emit('gauntWake', this.gaunt.group.position);
    }
  }

  update(dt, time, ctx) {
    this.time = time;
    this.playerRef = ctx.playerPos;
    let maxDanger = 0;
    for (const e of this.enemies) {
      e.update(dt, time, ctx);
      if (!e.dead) {
        const d = Math.hypot(e.x - ctx.playerPos.x, e.z - ctx.playerPos.z);
        const active = e.state === 'chase' || e.state === 'attack' || e.state === 'investigate';
        if (active && d < 20) maxDanger = Math.max(maxDanger, 1 - d / 22);
        if (e.state === 'chase' && d < 12) maxDanger = Math.max(maxDanger, 0.65);
      }
    }
    // Gentle separation so bodies do not stack.
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius + 0.15;
        if (d > 0.001 && d < min) {
          const push = (min - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          if (this.world.canOccupy(a.x - nx * push, a.z - nz * push, a.radius)) { a.x -= nx * push; a.z -= nz * push; }
          if (this.world.canOccupy(b.x + nx * push, b.z + nz * push, b.radius)) { b.x += nx * push; b.z += nz * push; }
          a.group.position.set(a.x, a.group.position.y, a.z);
          b.group.position.set(b.x, b.group.position.y, b.z);
        }
      }
    }
    this.danger = Math.max(this.danger * Math.exp(-dt * 1.5), maxDanger);

    // Vent ambush triggers.
    this.ventTimer -= dt;
    if (this.ventTimer <= 0) {
      this.ventTimer = 1.2;
      for (const vent of this.world.vents) {
        if (vent.used) continue;
        const d = Math.hypot(vent.position.x - ctx.playerPos.x, vent.position.z - ctx.playerPos.z);
        if (d < 4.8) {
          const light = this.world.lightLevelAt(vent.position.x, vent.position.z);
          if (light < 0.3 && !this.world.isInFlashlight(vent.position.x, vent.position.z)) {
            vent.used = true;
            const e = this.spawn('hollow', vent.position.x, vent.position.z, {
              state: 'emerge', emerge: 0, rotation: Math.atan2(ctx.playerPos.x - vent.position.x, ctx.playerPos.z - vent.position.z),
            });
            if (e) this.emit('ventBurst', vent.position);
            this.ventTimer = 5;
          }
        }
      }
    }

    // Post-power escalation.
    if (this.powerWave > 0) {
      this.powerWave -= dt;
      if (this.powerWave <= 0) {
        this.emit('finaleAlarm', ctx.playerPos);
        this.spawnCell('hollow', 18, 15, { state: 'chase' });
        this.spawnCell('hollow', 48, 31, { state: 'chase' });
        this.spawnCell('moth', 35, 31, { state: 'chase' });
        this.spawnCell('hollow', 47, 41, { state: 'chase' });
        this.powerWave = -1;
      }
    }

    // Gaunt wake conditions.
    if (this.gaunt && !this.gaunt.dead && this.gaunt.dormant) {
      const room = this.world.roomAt(ctx.playerPos.x, ctx.playerPos.z);
      const d = Math.hypot(this.gaunt.x - ctx.playerPos.x, this.gaunt.z - ctx.playerPos.z);
      if ((room && room.id === 'morgue') || d < 8) this.wakeGaunt();
    }
  }

  // --- Pathfinding -----------------------------------------------------------

  findPath(sx, sz, tx, tz) {
    const start = this.findNearestWalkable(cellOf(sx), cellOf(sz), 2);
    const goal = this.findNearestWalkable(cellOf(tx), cellOf(tz), 4);
    if (!start || !goal) return [];
    const startI = gridIndex(start.x, start.y);
    const goalI = gridIndex(goal.x, goal.y);
    if (startI === goalI) return [{ x: (goal.x + 0.5) * CELL, z: (goal.y + 0.5) * CELL }];
    const g = this._pathG;
    const f = this._pathF;
    const came = this._came;
    const closed = this._closed;
    g.fill(Infinity);
    f.fill(Infinity);
    came.fill(-1);
    closed.fill(0);
    const heap = new MinHeap();
    g[startI] = 0;
    const h = (x, y) => {
      const dx = Math.abs(x - goal.x), dy = Math.abs(y - goal.y);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    f[startI] = h(start.x, start.y);
    heap.push({ i: startI, x: start.x, y: start.y, f: f[startI] });
    const dirs = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];
    let found = false;
    let iterations = 0;
    while (heap.size && iterations++ < 4200) {
      const node = heap.pop();
      if (node.i === goalI) { found = true; break; }
      if (closed[node.i]) continue;
      closed[node.i] = 1;
      for (const [dx, dy, cost] of dirs) {
        const nx = node.x + dx, ny = node.y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        const ni = gridIndex(nx, ny);
        if (closed[ni] || this.world.isNavBlocked(nx, ny)) continue;
        if (dx && dy) {
          if (this.world.isNavBlocked(node.x + dx, node.y) || this.world.isNavBlocked(node.x, node.y + dy)) continue;
        }
        const tentative = g[node.i] + cost;
        if (tentative < g[ni]) {
          g[ni] = tentative;
          came[ni] = node.i;
          f[ni] = tentative + h(nx, ny);
          heap.push({ i: ni, x: nx, y: ny, f: f[ni] });
        }
      }
    }
    if (!found) return [];
    const cells = [];
    let cur = goalI;
    let guard = 0;
    while (cur !== -1 && guard++ < 500) {
      const x = cur % GRID_W;
      const y = Math.floor(cur / GRID_W);
      cells.push({ x: (x + 0.5) * CELL, z: (y + 0.5) * CELL });
      if (cur === startI) break;
      cur = came[cur];
    }
    cells.reverse();
    return cells.slice(1);
  }

  getEnemyMeshes() {
    return this.enemies.filter((e) => !e.dead && !e.hidden).map((e) => e.group);
  }
}

class Enemy {
  constructor(manager, type, model, group, x, z, opts = {}) {
    this.manager = manager;
    this.world = manager.world;
    this.type = type;
    this.stats = STATS[type];
    this.model = model;
    this.group = group;
    this.x = x;
    this.z = z;
    this.home = new THREE.Vector3(x, 0, z);
    this.room = opts.room || null;
    this.radius = this.stats.radius;
    this.health = this.stats.hp;
    this.maxHealth = this.stats.hp;
    this.dead = false;
    this.hidden = false;
    this.deathTimer = 0;
    this.state = opts.state || 'patrol';
    this.dormant = !!opts.dormant;
    this.emerge = opts.emerge ?? null;
    this.emergeTime = 0;
    this.rotation = group.rotation.y;
    this.walkPhase = Math.random() * 8;
    this.path = [];
    this.pathIndex = 0;
    this.destination = null;
    this.repathTimer = Math.random() * 0.5;
    this.losTimer = 0;
    this.lostTimer = 0;
    this.lookTimer = 0;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.attackHit = false;
    this.hitFlash = 0;
    this.light = 0;
    this.screechTimer = 0;
    this.ambientTimer = 2 + Math.random() * 5;
    this.lastKnown = new THREE.Vector3(x, 0, z);
    this.investigatePos = new THREE.Vector3(x, 0, z);
    this.fleePos = null;
    this.drainTimer = 0;
    this.stepTimer = 0;
    this.attackAnim = 0;

    if (this.state === 'emerge') {
      group.position.y = -1.1;
    }
    // Cache base emissive values for hit flashes.
    for (const m of this.model.mats) {
      if (!m.userData) m.userData = {};
      m.userData.baseEmissive = m.emissive.getHex();
      m.userData.baseEmissiveIntensity = m.emissiveIntensity;
    }
    this.scale = 0.97 + Math.random() * 0.08;
    this.model.body.scale.setScalar(this.scale);
  }

  emit(type, extra = {}) {
    this.manager.emit(type, this.group.position, { enemyType: this.type, ...extra });
  }

  get speed() {
    if (this.state === 'flee') return this.stats.fleeSpeed;
    if (this.state === 'chase' || this.state === 'attack') {
      let s = this.stats.chaseSpeed;
      if (this.type === 'moth' && this.light > 0.25) s *= 1.28;
      if (this.type === 'gaunt' && this.health < this.maxHealth * 0.35) s *= 1.25;
      return s;
    }
    return this.stats.patrolSpeed;
  }

  canSeePlayer(playerPos, light) {
    const dx = playerPos.x - this.x;
    const dz = playerPos.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 30) return false;
    let sight = this.stats.sightDark;
    if (this.type === 'hollow') sight = light > 0.25 ? this.stats.sightLit : this.stats.sightDark;
    if (this.type === 'moth') sight = light > 0.2 ? this.stats.sightLit : this.stats.sightDark;
    if (this.type === 'gaunt') sight = 20;
    if (dist > sight) return false;
    return this.world.hasLineOfSight(this.x, this.z, playerPos.x, playerPos.z);
  }

  choosePatrolTarget() {
    if (this.room) {
      const room = this.world.roomRects[this.room];
      if (room) {
        for (let tries = 0; tries < 16; tries++) {
          const gx = room.rect[0] + Math.floor(Math.random() * (room.rect[2] - room.rect[0] + 1));
          const gy = room.rect[1] + Math.floor(Math.random() * (room.rect[3] - room.rect[1] + 1));
          if (!this.world.isNavBlocked(gx, gy)) return { x: (gx + 0.5) * CELL, z: (gy + 0.5) * CELL };
        }
      }
    }
    for (let tries = 0; tries < 20; tries++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 9;
      const gx = cellOf(this.x + Math.cos(a) * r);
      const gy = cellOf(this.z + Math.sin(a) * r);
      if (!this.world.isNavBlocked(gx, gy)) return { x: (gx + 0.5) * CELL, z: (gy + 0.5) * CELL };
    }
    return null;
  }

  chooseFleeTarget(playerPos) {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 9;
      const gx = cellOf(this.x + Math.cos(a) * r);
      const gy = cellOf(this.z + Math.sin(a) * r);
      if (this.world.isNavBlocked(gx, gy)) continue;
      const wx = (gx + 0.5) * CELL;
      const wz = (gy + 0.5) * CELL;
      const light = this.world.lightLevelAt(wx, wz);
      const distPlayer = Math.hypot(wx - playerPos.x, wz - playerPos.z);
      const score = -light * 8 + distPlayer * 0.35 - Math.hypot(wx - this.x, wz - this.z) * 0.08;
      if (score > bestScore) { bestScore = score; best = { x: wx, z: wz }; }
    }
    return best;
  }

  setDestination(x, z, force = false) {
    this.destination = { x, z };
    if (force) this.repathTimer = 0;
  }

  updatePath(target, dt) {
    if (!this.destination || this.repathTimer <= 0) {
      if (target) {
        this.destination = { x: target.x, z: target.z };
        this.path = this.manager.findPath(this.x, this.z, target.x, target.z);
        this.pathIndex = 0;
      }
      this.repathTimer = this.state === 'chase' ? 0.55 : 1.3;
    } else {
      this.repathTimer -= dt;
    }
    // Skip waypoints that are already close.
    while (this.pathIndex < this.path.length) {
      const p = this.path[this.pathIndex];
      if (Math.hypot(p.x - this.x, p.z - this.z) < 0.55) this.pathIndex++;
      else break;
    }
  }

  openDoorsNear() {
    for (const door of this.world.doors) {
      if (door.locked || door.open) continue;
      const d = Math.hypot(door.x - this.x, door.z - this.z);
      if (d < 2.4) {
        this.world.setDoorOpen(door, true);
        this.emit('doorBurst');
      }
    }
  }

  moveAlong(dt) {
    let target = this.destination;
    if (!target) return 0;
    let tx = target.x, tz = target.z;
    if (this.pathIndex < this.path.length) {
      tx = this.path[this.pathIndex].x;
      tz = this.path[this.pathIndex].z;
    }
    let dx = tx - this.x;
    let dz = tz - this.z;
    let dist = Math.hypot(dx, dz);
    if (dist < 0.001) return 0;
    const speed = this.speed;
    const step = Math.min(dist, speed * dt);
    dx /= dist;
    dz /= dist;
    const nx = this.x + dx * step;
    const nz = this.z + dz * step;
    let moved = 0;
    if (this.world.canOccupy(nx, nz, this.radius)) {
      this.x = nx; this.z = nz; moved = step;
    } else if (this.world.canOccupy(nx, this.z, this.radius)) {
      this.x = nx; moved = step * 0.8;
    } else if (this.world.canOccupy(this.x, nz, this.radius)) {
      this.z = nz; moved = step * 0.8;
    } else {
      this.repathTimer = 0;
    }
    if (moved > 0) {
      const wanted = Math.atan2(dx, dz);
      this.rotation = angleLerp(this.rotation, wanted, Math.min(1, dt * 7));
      this.group.rotation.y = this.rotation;
      this.openDoorsNear();
    }
    return moved;
  }

  faceTarget(playerPos, dt) {
    const dx = playerPos.x - this.x;
    const dz = playerPos.z - this.z;
    if (dx * dx + dz * dz > 0.01) {
      this.rotation = angleLerp(this.rotation, Math.atan2(dx, dz), Math.min(1, dt * 9));
      this.group.rotation.y = this.rotation;
    }
  }

  update(dt, time, ctx) {
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4.5);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.ambientTimer -= dt;
    this.screechTimer -= dt;

    if (this.dead) {
      this.updateDeath(dt);
      return;
    }
    if (this.hidden) return;
    if (this.state === 'emerge') {
      this.emergeTime += dt;
      const t = Math.min(1, this.emergeTime / 1.15);
      this.group.position.y = -1.1 + t * 1.1;
      this.group.position.x = this.x + Math.sin(time * 30) * 0.01;
      this.state = t >= 1 ? 'chase' : 'emerge';
      if (t >= 1) this.emit('hollowScreech');
      this.updateVisual(dt, time, 0.2);
      return;
    }
    if (this.dormant) {
      this.updateVisual(dt, time, 0);
      return;
    }

    const player = ctx.playerPos;
    const dx = player.x - this.x;
    const dz = player.z - this.z;
    const dist = Math.hypot(dx, dz);
    this.light = this.world.lightLevelAt(this.x, this.z);
    let directLight = this.world.isInFlashlight(this.x, this.z);
    for (const flare of this.world.flares) {
      if (flare.state !== 'burn') continue;
      if (Math.hypot(this.x - flare.x, this.z - flare.z) < 7) directLight = Math.max(directLight, 0.95);
    }
    const seen = this.canSeePlayer(player, this.light);

    if (this.type === 'hollow') {
      if (directLight > 0.32) {
        this.health -= dt * 10.5;
        if (this.screechTimer <= 0) {
          this.screechTimer = 1.4;
          this.emit('hollowScreech');
        }
        if (this.health <= 0) { this.die('light'); return; }
      }
      if (directLight > 0.25 || (this.light > 0.42 && this.world.flags.powered)) {
        if (this.state !== 'flee' && this.state !== 'attack') {
          this.state = 'flee';
          this.fleePos = this.chooseFleeTarget(player);
          this.setDestination(this.fleePos.x, this.fleePos.z, true);
          this.emit('hollowHiss');
        }
        if (this.state === 'flee') {
          if (!this.fleePos || this.repathTimer <= 0) {
            this.fleePos = this.chooseFleeTarget(player) || { x: this.home.x, z: this.home.z };
            this.setDestination(this.fleePos.x, this.fleePos.z, true);
          }
          this.updatePath(this.fleePos, dt);
          this.moveAlong(dt);
          if (directLight < 0.1 && dist > 7) this.state = 'patrol';
          this.updateVisual(dt, time, this.speed);
          return;
        }
      }
    }

    if (this.type === 'moth') {
      // Moths drink light. A lit moth is fast and relentless.
      if (this.light > 0.22 || directLight > 0.2) {
        this.lastKnown.copy(player);
        if (this.state !== 'attack') {
          this.state = 'chase';
          this.lostTimer = 0;
        }
        if (dist < 2.4 && ctx.flashlightOn) {
          this.drainTimer -= dt;
          if (this.drainTimer <= 0) {
            this.drainTimer = 0.25;
            this.manager.drainBattery(1.4);
          }
        }
      }
    }

    // State machine.
    if (this.state === 'attack') {
      this.attackTimer -= dt;
      this.attackAnim = Math.min(1, this.attackAnim + dt * 6);
      this.faceTarget(player, dt);
      if (this.attackTimer <= 0 && !this.attackHit) {
        this.attackHit = true;
        if (dist < this.stats.attackRange * 1.5) {
          this.manager.onPlayerDamage(this.stats.damage, this.type, new THREE.Vector3(this.x, 0, this.z));
          this.emit('enemyStrike');
        }
        this.attackCooldown = this.stats.cooldown;
        this.state = 'chase';
        this.attackAnim = 0;
      }
      this.updateVisual(dt, time, 0);
      return;
    }

    if (this.state === 'stunned') {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) this.state = 'chase';
      this.updateVisual(dt, time, 0);
      return;
    }

    if (this.state === 'flee') {
      if (this.type !== 'hollow') this.state = 'patrol';
      if (!this.fleePos) {
        this.fleePos = this.chooseFleeTarget(player);
        if (this.fleePos) this.setDestination(this.fleePos.x, this.fleePos.z, true);
      }
      if (this.fleePos) {
        this.updatePath(this.fleePos, dt);
        this.moveAlong(dt);
        if (Math.hypot(this.fleePos.x - this.x, this.fleePos.z - this.z) < 0.8) this.state = 'patrol';
      }
      this.updateVisual(dt, time, this.speed);
      return;
    }

    if (this.state === 'investigate') {
      const d = Math.hypot(this.investigatePos.x - this.x, this.investigatePos.z - this.z);
      if (d < 1.0) {
        this.lookTimer += dt;
        this.rotation += dt * 0.9;
        this.group.rotation.y = this.rotation;
        if (this.lookTimer > 2.2) { this.state = 'patrol'; this.destination = null; this.path = []; }
      } else {
        this.setDestination(this.investigatePos.x, this.investigatePos.z);
        this.updatePath(this.investigatePos, dt);
        this.moveAlong(dt);
      }
      this.updateVisual(dt, time, this.speed);
      if (this.ambientTimer <= 0) {
        this.ambientTimer = 4 + Math.random() * 5;
        this.emit(this.type === 'moth' ? 'mothWhisper' : 'hollowGrowl');
      }
      return;
    }

    if (this.state === 'chase') {
      if (seen) {
        this.lastKnown.copy(player);
        this.lostTimer = 0;
      } else {
        this.lostTimer += dt;
      }
      if (dist < this.stats.attackRange && this.attackCooldown <= 0 && this.world.hasLineOfSight(this.x, this.z, player.x, player.z)) {
        this.state = 'attack';
        this.attackTimer = this.stats.windup;
        this.attackHit = false;
        this.attackAnim = 0;
        this.emit(this.type === 'gaunt' ? 'gauntSwing' : 'enemySwing');
        this.updateVisual(dt, time, 0);
        return;
      }
      if (this.lostTimer > (this.type === 'moth' ? 2.6 : 5.2)) {
        this.state = 'investigate';
        this.investigatePos.copy(this.lastKnown);
        this.lookTimer = 0;
        this.destination = null;
      } else {
        const target = seen ? player : this.lastKnown;
        this.setDestination(target.x, target.z);
        this.updatePath(target, dt);
        const moved = this.moveAlong(dt);
        if (moved < 0.001) {
          this.repathTimer = 0;
        }
        if (dist < 5) this.faceTarget(player, dt);
      }
      this.updateVisual(dt, time, this.speed);
      if (this.ambientTimer <= 0) {
        this.ambientTimer = this.type === 'gaunt' ? 1.1 : 2.2 + Math.random() * 2.2;
        this.emit(this.type === 'gaunt' ? 'gauntRoar' : this.type === 'moth' ? 'mothWhisper' : 'hollowGrowl');
      }
      return;
    }

    // Detect transitions.
    if (seen) {
      this.state = 'chase';
      this.lastKnown.copy(player);
      this.lostTimer = 0;
      this.emit(this.type === 'gaunt' ? 'gauntRoar' : this.type === 'moth' ? 'mothWhisper' : 'hollowScreech');
      this.updateVisual(dt, time, 0);
      return;
    }

    if (this.state === 'idle' || this.state === 'patrol') {
      if (this.state === 'idle') {
        this.lookTimer -= dt;
        if (this.lookTimer <= 0) {
          this.state = 'patrol';
          this.destination = this.choosePatrolTarget();
          this.repathTimer = 0;
        }
      } else {
        if (!this.destination) {
          this.destination = this.choosePatrolTarget();
          this.repathTimer = 0;
        }
        if (this.destination) {
          const d = Math.hypot(this.destination.x - this.x, this.destination.z - this.z);
          if (d < 0.9) {
            this.state = 'idle';
            this.lookTimer = 1.5 + Math.random() * 3.5;
            this.destination = null;
            this.path = [];
          } else {
            this.updatePath(this.destination, dt);
            this.moveAlong(dt);
          }
        }
      }
      this.updateVisual(dt, time, this.speed);
      if (this.ambientTimer <= 0 && Math.random() < 0.6) {
        this.ambientTimer = 5 + Math.random() * 7;
        this.emit(this.type === 'moth' ? 'mothWhisper' : this.type === 'gaunt' ? 'gauntBreath' : 'hollowGrowl');
      }
    }
  }

  updateVisual(dt, time, speed) {
    const model = this.model;
    const moving = speed > 0.12;
    this.walkPhase += dt * (moving ? (this.type === 'hollow' ? 11 : this.type === 'gaunt' ? 4.2 : 6) : 1.4);
    const phase = this.walkPhase;
    const pace = moving ? 1 : 0;

    // Apply hit flash.
    for (const m of model.mats) {
      const base = m.userData?.baseEmissive ?? 0;
      const baseI = m.userData?.baseEmissiveIntensity ?? 1;
      if (this.hitFlash > 0.01 && m !== model.extra?.eyeMat) {
        m.emissive.setHex(0x9a1410);
        m.emissiveIntensity = this.hitFlash * 1.8;
      } else {
        m.emissive.setHex(base);
        m.emissiveIntensity = baseI;
      }
    }

    // Base position is handled by the manager; animation uses local offsets.
    const isAttacking = this.state === 'attack';
    const lunge = isAttacking ? Math.sin(Math.min(1, this.attackAnim) * Math.PI) : 0;

    model.body.position.z = lunge * 0.25;
    model.body.position.y = 0;

    if (this.type === 'hollow') {
      const crouch = this.state === 'chase' || this.state === 'flee' ? 0.62 : 0.24;
      model.body.rotation.x = THREE.MathUtils.lerp(model.body.rotation.x, crouch, Math.min(1, dt * 5));
      const armBase = this.state === 'chase' || this.state === 'flee' ? -1.15 : -0.3;
      const legSwing = Math.sin(phase) * 0.75 * pace;
      for (const leg of model.legs) {
        leg.hip.rotation.x = legSwing * leg.s;
        leg.knee.rotation.x = Math.max(0, -Math.sin(phase + leg.s * 1.5) * 0.9 * pace);
      }
      for (const arm of model.arms) {
        arm.shoulder.rotation.x = armBase + Math.sin(phase + (arm.s > 0 ? 0 : Math.PI)) * 0.55 * pace - lunge * 0.9;
        arm.shoulder.rotation.z = arm.s * 0.14;
        arm.elbow.rotation.x = 0.5 + Math.cos(phase) * 0.25 * pace;
      }
      model.head.rotation.z = Math.sin(time * 3.1) * 0.08;
      model.head.rotation.y = Math.sin(time * 1.2) * 0.2;
      model.body.position.y = Math.abs(Math.sin(phase * 2)) * 0.045 * pace;
      if (model.extra.eyeSheen) model.extra.eyeSheen.material.opacity = 0.12 + (this.light > 0.2 ? 0.22 : 0) + this.hitFlash * 0.3;
    } else if (this.type === 'moth') {
      const hover = 0.04 + Math.sin(time * 1.8) * 0.035;
      model.body.position.y = hover;
      model.body.rotation.x = THREE.MathUtils.lerp(model.body.rotation.x, this.state === 'chase' ? 0.18 : 0.04, Math.min(1, dt * 3));
      const flap = this.light > 0.2 ? Math.sin(time * (5 + this.light * 6)) * (0.5 + this.light * 0.35) : Math.sin(time * 1.6) * 0.12;
      model.wings.forEach((w) => {
        w.wing.rotation.y = w.s * (0.2 + flap);
        w.wing.rotation.z = Math.sin(time * 2 + w.s) * 0.05;
      });
      for (const arm of model.arms) {
        arm.shoulder.rotation.x = -0.35 + Math.sin(time * 1.4 + arm.s) * 0.1 - lunge * 1.1;
        arm.shoulder.rotation.z = arm.s * 0.2;
        arm.elbow.rotation.x = 0.35;
      }
      for (const leg of model.legs) {
        leg.hip.rotation.x = Math.sin(phase + (leg.s > 0 ? 0 : Math.PI)) * 0.22 * pace;
        leg.knee.rotation.x = 0.1;
      }
      model.head.rotation.z = Math.sin(time * 0.9) * 0.06;
      if (model.extra.eyeMat) {
        const glow = this.light > 0.2 ? 2.5 + Math.sin(time * 12) * 0.5 : 0.9;
        model.extra.eyeMat.emissiveIntensity = glow + this.hitFlash * 2;
      }
      if (model.extra.aura) model.extra.aura.material.opacity = 0.04 + this.light * 0.18;
    } else if (this.type === 'gaunt') {
      model.body.rotation.x = THREE.MathUtils.lerp(model.body.rotation.x, this.state === 'chase' || this.state === 'attack' ? 0.2 : 0.05, Math.min(1, dt * 3));
      const stomp = Math.sin(phase);
      for (const leg of model.legs) {
        leg.hip.rotation.x = stomp * 0.42 * leg.s * pace;
        leg.knee.rotation.x = Math.max(0, -Math.sin(phase + leg.s) * 0.42 * pace);
      }
      for (const arm of model.arms) {
        arm.shoulder.rotation.x = -0.15 + Math.sin(phase + arm.s) * 0.35 * pace - lunge * 1.9;
        arm.shoulder.rotation.z = arm.s * 0.14;
        arm.elbow.rotation.x = 0.35 + lunge * 0.4;
      }
      model.body.position.y = Math.abs(Math.sin(phase * 2)) * 0.025 * pace;
      model.head.rotation.y = Math.sin(time * 0.6) * 0.12;
    }

    this.group.position.x = this.x;
    this.group.position.z = this.z;
    if (this.state !== 'emerge') this.group.position.y = 0;
  }

  die(cause = 'bullet') {
    if (this.dead) return;
    this.dead = true;
    this.state = 'dead';
    this.deathTimer = 0;
    this.emit('enemyDeath', { cause });
    this.manager.onKill(this);
    const gx = this.x / CELL - 0.5;
    const gy = this.z / CELL - 0.5;
    this.world.bloodAt(gx, gy, 0.9 + Math.random() * 0.5, Math.random() * 6);
  }

  updateDeath(dt) {
    this.deathTimer += dt;
    const t = Math.min(1, this.deathTimer / 0.95);
    this.model.body.rotation.z = t * (Math.PI / 2) * (this.type === 'gaunt' ? 1 : 0.9);
    this.model.body.position.y = -t * 0.55;
    this.group.position.y = -t * 0.28;
    if (this.deathTimer > 2.5) {
      for (const m of this.model.mats) {
        m.transparent = true;
        m.opacity = Math.max(0, 1 - (this.deathTimer - 2.5) / 2);
      }
    }
    if (this.deathTimer > 5) {
      this.group.visible = false;
      this.hidden = true;
    }
  }

  hit(damage, source) {
    if (this.dead) return;
    this.health -= damage;
    this.hitFlash = 1;
    this.emit(this.type === 'hollow' ? 'hollowHurt' : this.type === 'moth' ? 'mothHurt' : 'gauntHurt');
    if (this.health <= 0) {
      this.die('bullet');
      return;
    }
    if (this.type === 'gaunt') {
      this.state = 'chase';
      this.lastKnown.copy(source);
      this.lostTimer = 0;
    } else if (this.type === 'hollow' && this.world.isInFlashlight(this.x, this.z) > 0.3) {
      this.state = 'flee';
      this.fleePos = this.chooseFleeTarget(source);
      if (this.fleePos) this.setDestination(this.fleePos.x, this.fleePos.z, true);
    } else {
      this.state = 'chase';
      this.lastKnown.copy(source);
      this.lostTimer = 0;
      this.repathTimer = 0;
    }
    if (this.type === 'moth') {
      this.manager.alertNoise(this.group.position, 8, 'hit');
    }
  }
}
