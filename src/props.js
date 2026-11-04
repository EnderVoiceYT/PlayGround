import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeMaterial, bloodDecal, glowTexture } from './textures.js';

// -----------------------------------------------------------------------------
// Prop atelier. Industrial furniture, medical hardware and small storytelling
// details assembled from primitives with procedural materials.
// -----------------------------------------------------------------------------

export function createPropKit() {
  const M = {
    steel: makeMaterial('metalClean', { roughness: 0.36, metalness: 0.72, color: 0xb6bcbc, repeat: [1, 1] }),
    steelDark: makeMaterial('metalClean', { roughness: 0.5, metalness: 0.62, color: 0x6b7375, repeat: [1, 1] }),
    rust: makeMaterial('metalRust', { roughness: 0.72, metalness: 0.42, repeat: [1, 1] }),
    rustDark: makeMaterial('metalRust', { roughness: 0.8, metalness: 0.35, color: 0x8a7a6a, repeat: [1, 1] }),
    wood: makeMaterial('wood', { roughness: 0.68, metalness: 0.02, color: 0xb69b7a, repeat: [1, 1] }),
    woodDark: makeMaterial('wood', { roughness: 0.76, metalness: 0.02, color: 0x927b61, repeat: [1, 1] }),
    fabric: makeMaterial('fabric', { roughness: 0.95, metalness: 0, color: 0xcfcec0, repeat: [2, 2] }),
    fabricGreen: makeMaterial('fabric', { roughness: 0.95, metalness: 0, color: 0x7d8f80, repeat: [2, 2] }),
    fabricDark: makeMaterial('fabric', { roughness: 0.98, metalness: 0, color: 0x2f3434, repeat: [2, 2] }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141617, roughness: 0.92, metalness: 0.05 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x9aa09c, roughness: 0.55, metalness: 0.05 }),
    plasticDark: new THREE.MeshStandardMaterial({ color: 0x232829, roughness: 0.5, metalness: 0.12 }),
    porcelain: new THREE.MeshStandardMaterial({ color: 0xc7cbc2, roughness: 0.28, metalness: 0.02 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x93b0ad, roughness: 0.08, metalness: 0, transmission: 0.55,
      transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false,
    }),
    glassDark: new THREE.MeshPhysicalMaterial({
      color: 0x1c2a2b, roughness: 0.14, metalness: 0.15,
      transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    }),
    blood: new THREE.MeshStandardMaterial({ color: 0x250406, roughness: 0.35, metalness: 0.05 }),
    emissiveGreen: new THREE.MeshStandardMaterial({ color: 0x1a2b22, emissive: 0x61ffa0, emissiveIntensity: 0.9, roughness: 0.5 }),
    emissiveAmber: new THREE.MeshStandardMaterial({ color: 0x2a2113, emissive: 0xffa53a, emissiveIntensity: 1.5, roughness: 0.5 }),
    emissiveRed: new THREE.MeshStandardMaterial({ color: 0x2a0d0c, emissive: 0xff2c1e, emissiveIntensity: 1.3, roughness: 0.5 }),
    emissiveCold: new THREE.MeshStandardMaterial({ color: 0x1a2324, emissive: 0xbfe6df, emissiveIntensity: 0.8, roughness: 0.4 }),
    paper: makeMaterial('paper', { roughness: 0.9, metalness: 0, color: 0xc4baa4, repeat: [1, 1] }),
    gold: new THREE.MeshStandardMaterial({ color: 0xa88b52, roughness: 0.34, metalness: 0.8 }),
    ceramic: new THREE.MeshStandardMaterial({ color: 0xd4c7a8, roughness: 0.38, metalness: 0.02 }),
  };

  const circle = new THREE.CylinderGeometry(1, 1, 1, 12);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 16, 12);

  function mesh(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, cast = true, receive = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  }

  function boxAt(parent, w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, cast = true, receive = true) {
    const m = mesh(box, mat, x, y, z, rx, ry, rz, cast, receive);
    m.scale.set(w, h, d);
    parent.add(m);
    return m;
  }

  function cylAt(parent, r1, r2, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, cast = true) {
    const g = new THREE.CylinderGeometry(r1, r2, h, 14);
    const m = mesh(g, mat, x, y, z, rx, ry, rz, cast);
    parent.add(m);
    return m;
  }

  function toggleCollider(w, d) {
    return { w, d };
  }

  // --- Hospital furniture -----------------------------------------------------

  function bed() {
    const g = new THREE.Group();
    boxAt(g, 2.05, 0.16, 1.08, M.steelDark, 0, 0.58, 0);
    boxAt(g, 1.92, 0.22, 0.98, M.fabric, 0, 0.78, 0);
    boxAt(g, 0.55, 0.14, 0.72, M.fabric, -0.55, 0.95, 0);
    boxAt(g, 1.92, 0.1, 0.98, M.fabricGreen, 0, 0.69, 0);
    // frame posts
    for (const sx of [-0.95, 0.95]) {
      for (const sz of [-0.5, 0.5]) {
        cylAt(g, 0.035, 0.035, 0.6, M.steel, sx, 0.3, sz);
      }
    }
    // head and foot board
    for (const sx of [-1.02, 1.02]) {
      boxAt(g, 0.06, 0.9, 1.12, M.steelDark, sx, 0.95, 0);
      boxAt(g, 0.05, 0.38, 0.04, M.steel, sx, 1.18, -0.52);
      boxAt(g, 0.05, 0.38, 0.04, M.steel, sx, 1.18, 0.52);
    }
    // side rail
    for (const sz of [-0.58, 0.58]) {
      boxAt(g, 1.3, 0.05, 0.04, M.steel, 0.2, 1.02, sz);
      boxAt(g, 0.05, 0.34, 0.05, M.steel, -0.35, 0.88, sz);
      boxAt(g, 0.05, 0.34, 0.05, M.steel, 0.75, 0.88, sz);
      for (let i = 0; i < 4; i++) boxAt(g, 0.025, 0.2, 0.03, M.steel, -0.25 + i * 0.3, 0.9, sz);
    }
    // wheels
    for (const sx of [-0.95, 0.95]) for (const sz of [-0.5, 0.5]) {
      const w = cylAt(g, 0.08, 0.08, 0.06, M.rubber, sx, 0.08, sz, Math.PI / 2, 0, 0, false);
      w.rotation.x = Math.PI / 2;
    }
    return { object: g, collider: { w: 2.1, d: 1.15 } };
  }

  function gurney() {
    const g = new THREE.Group();
    boxAt(g, 1.9, 0.08, 0.72, M.steelDark, 0, 0.78, 0);
    boxAt(g, 1.78, 0.12, 0.66, M.fabric, 0, 0.88, 0);
    boxAt(g, 1.7, 0.03, 0.6, M.fabricGreen, 0, 0.945, 0);
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.3, 0.3]) {
      cylAt(g, 0.025, 0.025, 0.72, M.steel, sx, 0.38, sz);
      const w = cylAt(g, 0.07, 0.07, 0.05, M.rubber, sx, 0.07, sz, Math.PI / 2, 0, 0, false);
      w.rotation.x = Math.PI / 2;
    }
    boxAt(g, 0.9, 0.04, 0.04, M.steel, 0, 0.88, -0.4);
    boxAt(g, 0.04, 0.3, 0.04, M.steel, -0.45, 0.74, -0.4);
    boxAt(g, 0.04, 0.3, 0.04, M.steel, 0.45, 0.74, -0.4);
    return { object: g, collider: { w: 1.95, d: 0.8 } };
  }

  function ivStand() {
    const g = new THREE.Group();
    cylAt(g, 0.03, 0.03, 1.9, M.steel, 0, 0.95, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      boxAt(g, 0.42, 0.035, 0.04, M.steel, Math.cos(a) * 0.21, 0.07, Math.sin(a) * 0.21, 0, -a, 0);
      cylAt(g, 0.035, 0.035, 0.06, M.rubber, Math.cos(a) * 0.4, 0.04, Math.sin(a) * 0.4);
    }
    boxAt(g, 0.36, 0.03, 0.03, M.steel, 0.16, 1.78, 0);
    boxAt(g, 0.27, 0.36, 0.08, M.fabricGreen, 0.33, 1.58, 0);
    boxAt(g, 0.25, 0.28, 0.07, M.plastic, 0.33, 1.18, 0);
    return { object: g, collider: { w: 0.55, d: 0.55 } };
  }

  function desk(long = false) {
    const g = new THREE.Group();
    const w = long ? 2.9 : 1.7;
    boxAt(g, w, 0.08, 0.82, M.wood, 0, 0.78, 0);
    boxAt(g, w - 0.12, 0.04, 0.76, M.woodDark, 0, 0.72, 0);
    for (const sx of [-w / 2 + 0.08, w / 2 - 0.08]) {
      boxAt(g, 0.07, 0.72, 0.72, M.woodDark, sx, 0.36, 0);
    }
    boxAt(g, w - 0.2, 0.5, 0.05, M.woodDark, 0, 0.4, -0.36);
    // drawers
    const drawers = long ? 3 : 2;
    for (let i = 0; i < drawers; i++) {
      boxAt(g, 0.42, 0.13, 0.04, M.wood, 0.55, 0.55 - i * 0.19, 0.43);
      boxAt(g, 0.12, 0.02, 0.03, M.steelDark, 0.55, 0.55 - i * 0.19, 0.46);
    }
    return { object: g, collider: { w: w + 0.1, d: 0.9 } };
  }

  function receptionDesk() {
    const g = new THREE.Group();
    boxAt(g, 5.6, 0.1, 1.15, M.wood, 0, 0.92, 0);
    boxAt(g, 5.4, 0.86, 1.05, M.woodDark, 0, 0.47, 0);
    boxAt(g, 5.6, 0.12, 0.1, M.wood, 0, 0.98, 0.56);
    for (let i = 0; i < 5; i++) {
      boxAt(g, 0.8, 0.32, 0.04, M.wood, -2.1 + i * 1.05, 0.52, 0.53);
      boxAt(g, 0.18, 0.025, 0.03, M.steelDark, -2.1 + i * 1.05, 0.56, 0.56);
    }
    // monitor
    cylAt(g, 0.04, 0.04, 0.28, M.plasticDark, -1.4, 1.12, 0);
    boxAt(g, 0.55, 0.38, 0.06, M.plasticDark, -1.4, 1.33, 0, 0, 0, 0);
    boxAt(g, 0.5, 0.32, 0.01, M.emissiveGreen, -1.4, 1.33, 0.04, 0, 0, 0, false);
    // papers
    for (let i = 0; i < 3; i++) {
      boxAt(g, 0.32, 0.008, 0.44, M.paper, 0.4 + i * 0.1, 0.99, 0.05, 0, i * 0.3, 0, false);
    }
    return { object: g, collider: { w: 5.7, d: 1.25 } };
  }

  function chair() {
    const g = new THREE.Group();
    boxAt(g, 0.5, 0.07, 0.5, M.plastic, 0, 0.48, 0);
    boxAt(g, 0.48, 0.55, 0.06, M.plastic, 0, 0.78, -0.24);
    cylAt(g, 0.035, 0.035, 0.45, M.steelDark, 0, 0.25, 0);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      boxAt(g, 0.05, 0.035, 0.3, M.steelDark, Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15, 0, -a + Math.PI / 2, 0);
    }
    return { object: g, collider: { w: 0.55, d: 0.55 } };
  }

  function locker() {
    const g = new THREE.Group();
    boxAt(g, 0.92, 1.95, 0.55, M.steelDark, 0, 0.98, 0);
    boxAt(g, 0.87, 0.05, 0.56, M.steel, 0, 1.96, 0);
    for (const sx of [-0.225, 0.225]) {
      boxAt(g, 0.42, 1.82, 0.03, M.rustDark, sx, 0.98, 0.285);
      for (let i = 0; i < 4; i++) boxAt(g, 0.22, 0.025, 0.02, M.steelDark, sx, 1.55 - i * 0.1, 0.305);
      boxAt(g, 0.03, 0.14, 0.03, M.steel, sx + (sx < 0 ? 0.13 : -0.13), 0.98, 0.32);
    }
    return { object: g, collider: { w: 0.95, d: 0.6 } };
  }

  function filingCabinet() {
    const g = new THREE.Group();
    boxAt(g, 0.8, 1.42, 0.62, M.steelDark, 0, 0.71, 0);
    for (let i = 0; i < 4; i++) {
      boxAt(g, 0.72, 0.3, 0.03, M.rust, 0, 0.19 + i * 0.33, 0.315);
      boxAt(g, 0.18, 0.025, 0.03, M.steel, 0, 0.19 + i * 0.33, 0.34);
    }
    return { object: g, collider: { w: 0.85, d: 0.65 } };
  }

  function shelf() {
    const g = new THREE.Group();
    for (const sx of [-0.85, 0.85]) for (const sz of [-0.32, 0.32]) {
      boxAt(g, 0.06, 2.05, 0.06, M.steelDark, sx, 1.03, sz);
    }
    for (let i = 0; i < 4; i++) {
      boxAt(g, 1.78, 0.045, 0.68, M.rust, 0, 0.18 + i * 0.58, 0);
      for (let k = 0; k < 3; k++) {
        if ((i + k) % 2 === 0) {
          boxAt(g, 0.32, 0.24, 0.42, M.paper, -0.55 + k * 0.55, 0.32 + i * 0.58, 0.02, 0, k * 0.2, 0);
        }
      }
    }
    return { object: g, collider: { w: 1.8, d: 0.72 } };
  }

  function vending() {
    const g = new THREE.Group();
    boxAt(g, 1.1, 1.95, 0.85, M.steelDark, 0, 0.98, 0);
    boxAt(g, 0.98, 1.55, 0.03, M.glassDark, 0, 1.05, 0.44);
    const rows = 4, cols = 4;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const col = [0x8a2f25, 0x6a6a3a, 0x354b62, 0x7a5b3a][(r + c) % 4];
      const pack = new THREE.MeshStandardMaterial({ color: col, roughness: 0.5 });
      boxAt(g, 0.15, 0.19, 0.07, pack, -0.36 + c * 0.24, 1.65 - r * 0.33, 0.47, 0, 0, 0, false);
    }
    boxAt(g, 0.32, 0.48, 0.04, M.plasticDark, 0.34, 0.65, 0.45);
    for (let i = 0; i < 5; i++) boxAt(g, 0.05, 0.035, 0.03, M.emissiveAmber, 0.36, 0.78 - i * 0.055, 0.47, 0, 0, 0, false);
    boxAt(g, 0.96, 0.04, 0.05, M.emissiveGreen, 0, 1.85, 0.44, 0, 0, 0, false);
    return { object: g, collider: { w: 1.15, d: 0.9 } };
  }

  function wheelchair() {
    const g = new THREE.Group();
    boxAt(g, 0.5, 0.07, 0.48, M.fabricDark, 0, 0.62, 0);
    boxAt(g, 0.48, 0.5, 0.06, M.fabricDark, 0, 0.88, -0.24);
    boxAt(g, 0.06, 0.55, 0.5, M.steelDark, 0, 0.62, -0.02);
    for (const sx of [-0.32, 0.32]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 8, 24), M.rubber);
      wheel.position.set(sx, 0.29, 0);
      wheel.rotation.y = Math.PI / 2;
      wheel.castShadow = true;
      g.add(wheel);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const spoke = mesh(box, M.steel, sx, 0.29 + Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0, 0, a, false);
        spoke.scale.set(0.02, 0.24, 0.02);
        g.add(spoke);
      }
      cylAt(g, 0.06, 0.06, 0.04, M.rubber, sx * 1.25, 0.07, 0.35, 0, 0, Math.PI / 2);
    }
    boxAt(g, 0.06, 0.55, 0.06, M.steel, -0.3, 0.65, 0.26);
    boxAt(g, 0.06, 0.55, 0.06, M.steel, -0.3, 0.65, -0.26);
    return { object: g, collider: { w: 0.75, d: 0.7 } };
  }

  function curtain(length = 1.8) {
    const g = new THREE.Group();
    cylAt(g, 0.025, 0.025, length + 0.3, M.steel, 0, 2.25, 0, 0, 0, Math.PI / 2);
    const geo = new THREE.PlaneGeometry(length, 1.9, 8, 6);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, Math.sin(pos.getX(i) * 5) * 0.08);
    }
    geo.computeVertexNormals();
    const c = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x7e8a7a, roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.82,
    }));
    c.position.set(0, 1.28, 0);
    c.castShadow = true;
    g.add(c);
    return { object: g, collider: null };
  }

  // --- Industrial -------------------------------------------------------------

  function barrel(rusty = false) {
    const g = new THREE.Group();
    const mat = rusty ? M.rust : M.steelDark;
    const body = cylAt(g, 0.34, 0.34, 0.92, mat, 0, 0.46, 0);
    body.material = mat;
    cylAt(g, 0.355, 0.355, 0.05, M.steel, 0, 0.24, 0);
    cylAt(g, 0.355, 0.355, 0.05, M.steel, 0, 0.68, 0);
    cylAt(g, 0.36, 0.36, 0.03, M.steel, 0, 0.92, 0);
    return { object: g, collider: { w: 0.72, d: 0.72 } };
  }

  function toxicBarrel() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x6c6a28, roughness: 0.72, metalness: 0.35 });
    cylAt(g, 0.35, 0.35, 0.95, mat, 0, 0.48, 0);
    cylAt(g, 0.36, 0.36, 0.05, M.rust, 0, 0.2, 0);
    cylAt(g, 0.36, 0.36, 0.05, M.rust, 0, 0.74, 0);
    boxAt(g, 0.22, 0.22, 0.02, M.emissiveAmber, 0, 0.5, 0.355, 0, 0, 0, false);
    return { object: g, collider: { w: 0.75, d: 0.75 } };
  }

  function crate(size = 1) {
    const g = new THREE.Group();
    const s = 0.85 * size;
    boxAt(g, s, s * 0.78, s, M.woodDark, 0, s * 0.39, 0);
    for (const y of [0.08, s * 0.7]) {
      boxAt(g, s + 0.04, 0.08, s + 0.04, M.wood, 0, y, 0);
    }
    boxAt(g, 0.08, s * 0.72, s + 0.05, M.wood, -s / 2, s * 0.39, 0);
    boxAt(g, 0.08, s * 0.72, s + 0.05, M.wood, s / 2, s * 0.39, 0);
    return { object: g, collider: { w: s + 0.1, d: s + 0.1 } };
  }

  function pipeRun(length = 6, radius = 0.09) {
    const g = new THREE.Group();
    const p = cylAt(g, radius, radius, length, M.rust, 0, 0, 0, 0, 0, Math.PI / 2);
    p.castShadow = false;
    for (let i = 1; i < Math.floor(length / 1.8); i++) {
      const clamp = cylAt(g, radius * 1.35, radius * 1.35, 0.08, M.steelDark, -length / 2 + i * 1.8, 0, 0, 0, 0, Math.PI / 2, false);
      clamp.castShadow = false;
    }
    return { object: g, collider: null };
  }

  function generator() {
    const g = new THREE.Group();
    // concrete plinth
    boxAt(g, 3.2, 0.18, 1.8, M.steelDark, 0, 0.09, 0);
    // main block
    boxAt(g, 2.6, 1.2, 1.35, M.rustDark, 0, 0.8, 0);
    // turbine cylinder
    const turbine = cylAt(g, 0.55, 0.55, 2.3, M.steelDark, 0, 1.18, 0, 0, 0, Math.PI / 2);
    turbine.material = M.steelDark;
    for (const x of [-0.9, 0, 0.9]) cylAt(g, 0.63, 0.63, 0.09, M.steel, x, 1.18, 0, 0, 0, Math.PI / 2);
    // pipes
    cylAt(g, 0.13, 0.13, 2.0, M.rust, 0, 1.9, -0.45, 0, 0, Math.PI / 2);
    cylAt(g, 0.1, 0.1, 1.3, M.rust, 1.25, 1.6, 0, 0, 0, Math.PI / 2);
    // vents / grille
    for (let i = 0; i < 5; i++) boxAt(g, 1.4, 0.05, 0.02, M.steel, 0, 0.5 + i * 0.12, 0.69, 0, 0, 0, false);
    // warning stripe
    boxAt(g, 2.4, 0.16, 0.02, M.emissiveAmber, 0, 0.3, 0.69, 0, 0, 0, false);
    // gauges
    cylAt(g, 0.16, 0.16, 0.06, M.steel, -1.0, 1.4, 0.7, Math.PI / 2, 0, 0, false);
    cylAt(g, 0.1, 0.1, 0.07, M.emissiveAmber, -1.0, 1.4, 0.72, Math.PI / 2, 0, 0, false);
    return { object: g, collider: { w: 3.3, d: 1.9 } };
  }

  function breakerConsole(fuseCount = 3) {
    const g = new THREE.Group();
    boxAt(g, 1.5, 1.15, 0.55, M.steelDark, 0, 0.58, 0);
    boxAt(g, 1.4, 0.6, 0.06, M.rust, 0, 0.72, 0.3, -0.12, 0, 0);
    for (let i = 0; i < fuseCount; i++) {
      const x = (i - (fuseCount - 1) / 2) * 0.38;
      boxAt(g, 0.19, 0.27, 0.05, M.plasticDark, x, 0.72, 0.34, -0.12, 0, 0, false);
      boxAt(g, 0.13, 0.18, 0.02, i === 0 ? M.emissiveRed : M.emissiveGreen, x, 0.72, 0.37, -0.12, 0, 0, false);
    }
    boxAt(g, 0.24, 0.09, 0.03, M.emissiveAmber, 0, 1.02, 0.32, -0.12, 0, 0, false);
    // heavy cable
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.55, 0.25, 0.1), new THREE.Vector3(0.9, 0.04, 0.6),
      new THREE.Vector3(1.5, 0.04, 0.8), new THREE.Vector3(2.0, 0.05, 0.6),
    ]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.045, 6, false), M.rubber);
    tube.castShadow = true;
    g.add(tube);
    return { object: g, collider: { w: 1.55, d: 0.65 } };
  }

  function saveTerminal() {
    const g = new THREE.Group();
    boxAt(g, 0.62, 1.5, 0.38, M.steelDark, 0, 0.75, 0);
    boxAt(g, 0.7, 0.12, 0.45, M.steel, 0, 1.52, 0);
    boxAt(g, 0.52, 0.36, 0.04, M.plasticDark, 0, 1.2, 0.2, -0.08, 0, 0);
    const screenMat = M.emissiveGreen.clone();
    boxAt(g, 0.46, 0.29, 0.01, screenMat, 0, 1.2, 0.225, -0.08, 0, 0, false);
    for (let i = 0; i < 3; i++) boxAt(g, 0.05, 0.03, 0.025, screenMat, -0.08 + i * 0.08, 0.86, 0.205, 0, 0, 0, false);
    boxAt(g, 0.38, 0.04, 0.03, M.steel, 0, 1.42, 0.2);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0x65ffa0, transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(1.3, 1.3, 1);
    glow.position.set(0, 1.2, 0.35);
    g.add(glow);
    g.userData.screen = screenMat;
    g.userData.glow = glow;
    return { object: g, collider: { w: 0.7, d: 0.45 } };
  }

  function elevator() {
    const g = new THREE.Group();
    // frame
    boxAt(g, 3.1, 2.75, 0.28, M.steelDark, 0, 1.38, 0);
    boxAt(g, 2.55, 2.45, 0.06, M.steel, 0, 1.28, 0.18);
    // doors
    const left = new THREE.Group();
    const right = new THREE.Group();
    boxAt(left, 1.22, 2.36, 0.1, M.steel, 0.61, 1.22, 0);
    boxAt(right, 1.22, 2.36, 0.1, M.steel, -0.61, 1.22, 0);
    left.position.set(-1.2, 0, 0.23);
    right.position.set(1.2, 0, 0.23);
    g.add(left, right);
    // hazard stripes
    for (let i = 0; i < 5; i++) {
      boxAt(g, 0.36, 0.1, 0.03, M.emissiveAmber, -1.0 + i * 0.5, 0.08, 0.16, 0, 0, 0, false);
    }
    // call panel
    boxAt(g, 0.22, 0.4, 0.08, M.plasticDark, 1.62, 1.25, 0.2);
    boxAt(g, 0.1, 0.06, 0.03, M.emissiveRed, 1.62, 1.36, 0.25, 0, 0, 0, false);
    const ind = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.emissiveRed.clone());
    ind.position.set(0, 2.58, 0.2);
    g.add(ind);
    g.userData.indicator = ind;
    g.userData.doors = [left, right];
    return { object: g, collider: { w: 3.15, d: 0.45 } };
  }

  function boilerTank() {
    const g = new THREE.Group();
    const body = cylAt(g, 0.95, 0.95, 2.7, M.rust, 0, 1.15, 0, 0, 0, Math.PI / 2);
    body.material = M.rust;
    for (const x of [-1.1, 1.1]) cylAt(g, 1.02, 1.02, 0.13, M.steelDark, x, 1.15, 0, 0, 0, Math.PI / 2);
    cylAt(g, 0.14, 0.14, 1.4, M.rust, 0, 2.05, 0);
    cylAt(g, 0.1, 0.1, 1.2, M.rust, 1.2, 1.15, 0.8, 0, 0, Math.PI / 2);
    // gauge
    cylAt(g, 0.22, 0.22, 0.07, M.steel, -0.7, 1.7, 0.92, Math.PI / 2, 0, 0, false);
    cylAt(g, 0.15, 0.15, 0.075, M.ceramic, -0.7, 1.7, 0.94, Math.PI / 2, 0, 0, false);
    for (let i = 0; i < 3; i++) boxAt(g, 1.8, 0.05, 0.02, M.steel, 0, 0.6 + i * 0.34, 0.94, 0, 0, 0, false);
    return { object: g, collider: { w: 2.8, d: 1.8 } };
  }

  function pumpUnit() {
    const g = new THREE.Group();
    boxAt(g, 1.15, 0.35, 1.15, M.steelDark, 0, 0.18, 0);
    cylAt(g, 0.44, 0.44, 0.7, M.rust, 0, 0.7, 0);
    cylAt(g, 0.35, 0.35, 0.24, M.steel, 0, 1.13, 0);
    cylAt(g, 0.13, 0.13, 1.2, M.steelDark, 0, 1.35, 0);
    boxAt(g, 0.3, 0.22, 0.3, M.plasticDark, 0, 1.6, 0);
    cylAt(g, 0.09, 0.09, 1.2, M.rust, 0.55, 0.55, 0.55, 0, 0, Math.PI / 2);
    // valve wheel
    const wheel = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.035, 8, 20), M.rust);
    wheel.add(ring);
    for (let i = 0; i < 4; i++) {
      const s = mesh(box, M.rust, 0, 0, 0, 0, 0, (i / 4) * Math.PI, false);
      s.scale.set(0.46, 0.035, 0.035);
      wheel.add(s);
    }
    wheel.position.set(0.0, 0.72, 0.58);
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
    return { object: g, collider: { w: 1.25, d: 1.25 } };
  }

  function autopsyTable() {
    const g = new THREE.Group();
    boxAt(g, 1.95, 0.12, 0.82, M.steel, 0, 0.82, 0);
    boxAt(g, 1.8, 0.06, 0.7, M.steelDark, 0, 0.73, 0);
    for (const sx of [-0.75, 0.75]) for (const sz of [-0.28, 0.28]) {
      cylAt(g, 0.045, 0.045, 0.75, M.steelDark, sx, 0.38, sz);
    }
    // drainage grooves
    for (let i = 0; i < 3; i++) boxAt(g, 1.6, 0.012, 0.03, M.steelDark, 0, 0.888, -0.2 + i * 0.2, 0, 0, 0, false);
    boxAt(g, 0.16, 0.035, 0.16, M.steelDark, 0.8, 0.9, 0.2, 0, 0, 0, false);
    return { object: g, collider: { w: 2.0, d: 0.9 } };
  }

  function morgueDrawers(width = 3) {
    const g = new THREE.Group();
    const w = width * 0.92;
    boxAt(g, w, 2.1, 0.7, M.steelDark, 0, 1.05, 0);
    for (let i = 0; i < width; i++) {
      for (let row = 0; row < 3; row++) {
        boxAt(g, 0.82, 0.56, 0.04, M.steel, -w / 2 + 0.46 + i * 0.92, 0.4 + row * 0.65, 0.37);
        boxAt(g, 0.22, 0.04, 0.04, M.steelDark, -w / 2 + 0.46 + i * 0.92, 0.4 + row * 0.65, 0.41);
        boxAt(g, 0.1, 0.08, 0.02, M.paper, -w / 2 + 0.7 + i * 0.92, 0.62 + row * 0.65, 0.4, 0, 0, 0, false);
      }
    }
    return { object: g, collider: { w: w + 0.1, d: 0.8 } };
  }

  function bodyBag() {
    const g = new THREE.Group();
    const geo = new THREE.CapsuleGeometry(0.34, 1.1, 6, 12);
    const m = new THREE.Mesh(geo, M.fabricDark);
    m.rotation.z = Math.PI / 2;
    m.scale.set(1, 1, 0.52);
    m.position.y = 0.22;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    boxAt(g, 1.45, 0.02, 0.03, M.steelDark, 0, 0.42, 0, 0, 0, 0, false);
    boxAt(g, 0.08, 0.07, 0.33, M.steelDark, 0.7, 0.24, 0);
    return { object: g, collider: { w: 1.8, d: 0.8 } };
  }

  function corpse() {
    const g = new THREE.Group();
    const skin = makeMaterial('skin', { roughness: 0.82, metalness: 0, color: 0xb39d8b, repeat: [1, 1] });
    const skinDark = makeMaterial('skin', { roughness: 0.85, metalness: 0, color: 0x8d7a6a, repeat: [1, 1] });
    // torso
    const torso = mesh(new THREE.CapsuleGeometry(0.27, 0.6, 5, 10), M.fabricDark, 0, 0.17, 0, 0, 0, Math.PI / 2);
    torso.rotation.z = Math.PI / 2;
    torso.scale.set(1, 1, 0.7);
    g.add(torso);
    const head = mesh(sphere, skin, 0.62, 0.19, 0, 0, 0, 0);
    head.scale.set(0.19, 0.16, 0.2);
    g.add(head);
    // limbs sprawled
    for (const s of [-1, 1]) {
      const arm = mesh(new THREE.CapsuleGeometry(0.07, 0.5, 4, 8), skinDark, -0.1, 0.14, s * 0.36, 0, 0.5 * s, 0);
      arm.rotation.z = Math.PI / 2;
      arm.rotation.y = 0.6 * s;
      g.add(arm);
      const leg = mesh(new THREE.CapsuleGeometry(0.09, 0.65, 4, 8), M.fabricDark, -0.15, 0.12, s * 0.22, 0, 0.2 * s, 0);
      leg.rotation.z = Math.PI / 2;
      g.add(leg);
    }
    return { object: g, collider: null };
  }

  function hangingBody() {
    const g = new THREE.Group();
    const skin = makeMaterial('skin', { roughness: 0.8, metalness: 0, color: 0x9a8777, repeat: [1, 1] });
    // chain
    for (let i = 0; i < 12; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.015, 4, 8), M.steelDark);
      link.position.y = 2.9 - i * 0.12;
      link.rotation.y = i % 2 ? Math.PI / 2 : 0;
      g.add(link);
    }
    const torso = mesh(new THREE.CapsuleGeometry(0.28, 0.72, 5, 10), skin, 0, 1.4, 0, 0, 0, 0);
    torso.scale.set(1, 1, 0.6);
    g.add(torso);
    const head = mesh(sphere, skin, 0, 2.0, 0);
    head.scale.set(0.2, 0.25, 0.2);
    head.rotation.z = 0.25;
    g.add(head);
    for (const s of [-1, 1]) {
      const arm = mesh(new THREE.CapsuleGeometry(0.07, 0.8, 4, 8), skin, s * 0.33, 1.35, 0, 0, 0, s * 0.18);
      g.add(arm);
      const leg = mesh(new THREE.CapsuleGeometry(0.1, 0.85, 4, 8), skin, s * 0.14, 0.55, 0, 0, 0, 0.04 * s);
      g.add(leg);
    }
    // tattered cloth
    boxAt(g, 0.6, 0.6, 0.02, M.fabricDark, 0, 1.0, 0.16, 0.1, 0, 0, false);
    return { object: g, collider: null };
  }

  function ceilingLight(length = 1.8, caged = false) {
    const g = new THREE.Group();
    boxAt(g, length + 0.2, 0.1, 0.32, M.steelDark, 0, 0, 0);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0xbfc8c2, emissive: 0xd8efe6, emissiveIntensity: 0.1, roughness: 0.3,
    });
    boxAt(g, length, 0.06, 0.16, tubeMat, 0, -0.07, 0, 0, 0, 0, false);
    if (caged) {
      for (let i = 0; i < 5; i++) boxAt(g, 0.02, 0.32, 0.34, M.steelDark, -length / 2 + 0.2 + i * (length - 0.4) / 4, -0.02, 0, 0, 0, 0, false);
    }
    g.userData.tubeMat = tubeMat;
    return g;
  }

  function emergencyLight() {
    const g = new THREE.Group();
    boxAt(g, 0.42, 0.26, 0.18, M.plasticDark, 0, 0, 0);
    const lamp = boxAt(g, 0.3, 0.16, 0.04, M.emissiveRed, 0, 0, 0.11, 0, 0, 0, false);
    g.userData.lamp = lamp;
    return g;
  }

  function vent() {
    const g = new THREE.Group();
    boxAt(g, 0.95, 0.04, 0.75, M.steelDark, 0, 0.025, 0);
    // dark recess
    boxAt(g, 0.75, 0.02, 0.55, new THREE.MeshBasicMaterial({ color: 0x010202 }), 0, 0.05, 0, 0, 0, 0, false);
    for (let i = 0; i < 6; i++) {
      boxAt(g, 0.66, 0.02, 0.055, M.rust, 0, 0.065, -0.24 + i * 0.095, 0, 0, 0, false);
    }
    for (const sx of [-0.36, 0.36]) boxAt(g, 0.03, 0.03, 0.55, M.steel, sx, 0.07, 0, 0, 0, 0, false);
    return { object: g, collider: null };
  }

  function puddleMaterial() {
    return new THREE.MeshPhysicalMaterial({
      color: 0x0e1415, roughness: 0.07, metalness: 0.15, transparent: true, opacity: 0.62,
      clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 2.2, depthWrite: false,
    });
  }

  function glassWindow(w = 3, h = 1.4) {
    const g = new THREE.Group();
    boxAt(g, w + 0.2, 0.12, 0.16, M.steelDark, 0, h / 2, 0);
    boxAt(g, w + 0.2, 0.12, 0.16, M.steelDark, 0, -h / 2, 0);
    boxAt(g, 0.1, h + 0.2, 0.16, M.steelDark, -w / 2, 0, 0);
    boxAt(g, 0.1, h + 0.2, 0.16, M.steelDark, w / 2, 0, 0);
    const pane = mesh(new THREE.PlaneGeometry(w, h), M.glass, 0, 0, 0, 0, 0, 0, false, false);
    g.add(pane);
    // frost/grime
    const frost = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: bloodDecal(), color: 0x9fb2ae, transparent: true, opacity: 0.12, depthWrite: false,
    }));
    frost.position.z = 0.005;
    g.add(frost);
    return { object: g, collider: null };
  }

  function signTexture(title, sub = '', opts = {}) {
    const w = opts.w || 512, h = opts.h || 256;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = opts.bg || '#1b211e';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = opts.border || '#6b7469';
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.fillStyle = opts.color || '#c7c9b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${opts.titleSize || 64}px "Arial Narrow", Impact, sans-serif`;
    ctx.fillText(title, w / 2, h * (sub ? 0.42 : 0.5));
    if (sub) {
      ctx.fillStyle = opts.subColor || '#8f9384';
      ctx.font = `${opts.subSize || 26}px "Courier New", monospace`;
      ctx.fillText(sub, w / 2, h * 0.68);
    }
    if (opts.grime !== false) {
      const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
      for (let i = 0; i < 15; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.05 + rand() * 0.2})`;
        ctx.beginPath();
        ctx.arc(rand() * w, rand() * h, 5 + rand() * 30, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function sign(title, sub, width = 1.8, height = 0.9, opts = {}) {
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(title, sub, opts), transparent: true, side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  }

  function graffiti(text, color = 'rgba(128,26,22,0.85)', width = 2.8, height = 1.1) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 256);
    ctx.fillStyle = color;
    ctx.font = '900 92px "Arial Narrow", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.rotate(-0.05);
    ctx.fillText(text, 256, 128);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 256, Math.random() * 12, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide,
    }));
    return m;
  }

  function papers(count = 6, radius = 0.7) {
    const g = new THREE.Group();
    const rand = (() => { let s = 4; return () => (s = (s * 48271) % 2147483647) / 2147483647; })();
    for (let i = 0; i < count; i++) {
      const p = boxAt(g, 0.23 + rand() * 0.12, 0.006, 0.3 + rand() * 0.12, M.paper,
        (rand() - 0.5) * radius * 2, 0.012 + i * 0.003, (rand() - 0.5) * radius * 2,
        0, rand() * Math.PI, 0, false);
      p.receiveShadow = true;
    }
    return { object: g, collider: null };
  }

  function bones() {
    const g = new THREE.Group();
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xb9ae8f, roughness: 0.7, metalness: 0 });
    for (let i = 0; i < 5; i++) {
      const b = mesh(new THREE.CapsuleGeometry(0.035, 0.28, 4, 6), boneMat,
        (Math.random() - 0.5) * 0.8, 0.05, (Math.random() - 0.5) * 0.8, 0, Math.random() * 3, Math.PI / 2);
      g.add(b);
    }
    const skull = mesh(new THREE.SphereGeometry(0.12, 10, 8), boneMat, 0.1, 0.12, 0.1);
    skull.scale.set(0.85, 1, 1.1);
    g.add(skull);
    return { object: g, collider: null };
  }

  function rubble() {
    const g = new THREE.Group();
    const mat = makeMaterial('concrete', { roughness: 0.94, metalness: 0, color: 0x76736a, repeat: [1, 1] });
    for (let i = 0; i < 12; i++) {
      const s = 0.08 + Math.random() * 0.22;
      const m = mesh(new THREE.DodecahedronGeometry(s, 0), mat,
        (Math.random() - 0.5) * 1.8, s * 0.6, (Math.random() - 0.5) * 1.8,
        Math.random() * 3, Math.random() * 3, Math.random() * 3);
      g.add(m);
    }
    return { object: g, collider: null };
  }

  function restraintChair() {
    const g = new THREE.Group();
    boxAt(g, 0.7, 0.1, 0.66, M.steelDark, 0, 0.55, 0);
    boxAt(g, 0.66, 1.05, 0.08, M.steelDark, 0, 1.1, -0.32, -0.08, 0, 0);
    for (const sx of [-0.4, 0.4]) {
      boxAt(g, 0.08, 0.7, 0.08, M.steel, sx, 0.32, 0.27);
      boxAt(g, 0.08, 0.7, 0.08, M.steel, sx, 0.32, -0.27);
      boxAt(g, 0.045, 0.03, 0.7, M.steel, sx, 0.66, 0);
      boxAt(g, 0.045, 0.03, 0.55, M.steel, sx, 1.0, -0.3);
    }
    return { object: g, collider: { w: 0.85, d: 0.8 } };
  }

  function cameraBall() {
    const g = new THREE.Group();
    const ball = mesh(new THREE.SphereGeometry(0.16, 12, 10), M.steelDark, 0, 0, 0);
    g.add(ball);
    const lens = cylAt(g, 0.055, 0.07, 0.1, M.glassDark, 0, 0, 0.16, Math.PI / 2, 0, 0, false);
    lens.material = M.glassDark;
    const led = mesh(new THREE.SphereGeometry(0.02, 6, 6), M.emissiveRed, 0.1, 0.1, 0.08, 0, 0, 0, false);
    g.add(led);
    return g;
  }

  return {
    M, mesh, boxAt, cylAt, bed, gurney, ivStand, desk, receptionDesk, chair, locker,
    filingCabinet, shelf, vending, wheelchair, curtain, barrel, toxicBarrel, crate,
    pipeRun, generator, breakerConsole, saveTerminal, elevator, boilerTank, pumpUnit,
    autopsyTable, morgueDrawers, bodyBag, corpse, hangingBody, ceilingLight,
    emergencyLight, vent, puddleMaterial, glassWindow, signTexture, sign, graffiti,
    papers, bones, rubble, restraintChair, cameraBall,
  };
}
