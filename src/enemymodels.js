import * as THREE from 'three';
import { makeMaterial, glowTexture } from './textures.js';

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function capsule(r, len, mat) {
  return mesh(new THREE.CapsuleGeometry(r, len, 5, 9), mat);
}

function box(w, h, d, mat) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat);
}

function addLimb(parent, side, matUpper, matLower, opts = {}) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * (opts.x || 0.28), opts.y || 0.6, opts.z || 0);
  parent.add(shoulder);
  const upper = capsule(opts.r || 0.065, opts.upperLen || 0.3, matUpper);
  upper.position.y = -(opts.upperLen || 0.3) / 2 - 0.03;
  shoulder.add(upper);
  const elbow = new THREE.Group();
  elbow.position.y = -(opts.upperLen || 0.3) - 0.04;
  shoulder.add(elbow);
  const lowerLen = opts.lowerLen || 0.32;
  const lower = capsule((opts.r || 0.065) * 0.85, lowerLen, matLower);
  lower.position.y = -lowerLen / 2 - 0.02;
  elbow.add(lower);
  const hand = new THREE.Group();
  hand.position.y = -lowerLen - 0.04;
  elbow.add(hand);
  return { shoulder, elbow, hand };
}

export function createHollow() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.x = 0.26;
  root.add(body);

  const skin = makeMaterial('skin', { roughness: 0.76, metalness: 0.02, color: 0xc0b8aa, repeat: [1, 1] });
  const skinDark = makeMaterial('skin', { roughness: 0.82, metalness: 0.02, color: 0x9a9387, repeat: [1, 1] });
  const wound = new THREE.MeshStandardMaterial({ color: 0x3a1412, roughness: 0.6 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x030202 });
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x120405, roughness: 0.4 });
  const claw = new THREE.MeshStandardMaterial({ color: 0x6e6656, roughness: 0.48, metalness: 0.15 });
  const tooth = new THREE.MeshStandardMaterial({ color: 0xc9c0a4, roughness: 0.55 });
  const mats = [skin, skinDark, wound];

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.9;
  body.add(pelvis);

  const abdomen = capsule(0.13, 0.4, skinDark);
  abdomen.position.y = 0.18;
  abdomen.scale.set(1, 1, 0.7);
  pelvis.add(abdomen);

  const chest = capsule(0.2, 0.36, skin);
  chest.position.y = 0.47;
  chest.scale.set(1.05, 1, 0.66);
  pelvis.add(chest);

  // exposed ribs
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.012, 5, 12, Math.PI), skinDark);
    rib.rotation.set(Math.PI / 2, 0, 0);
    rib.position.set(0, 0.52 - i * 0.07, 0.0);
    rib.scale.set(1.1 - i * 0.06, 1, 0.75);
    pelvis.add(rib);
  }

  // shoulder blades / spine
  for (let i = 0; i < 5; i++) {
    const spike = mesh(new THREE.ConeGeometry(0.035, 0.11 + i * 0.015, 5), skinDark);
    spike.position.set(0, 0.5 - i * 0.09, -0.13);
    spike.rotation.x = -0.7;
    pelvis.add(spike);
  }

  const neck = capsule(0.035, 0.12, skinDark);
  neck.position.set(0, 0.7, 0.06);
  pelvis.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.82, 0.09);
  pelvis.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.115, 14, 12), skin);
  skull.scale.set(0.88, 1.14, 1.02);
  head.add(skull);
  const jaw = mesh(new THREE.SphereGeometry(0.075, 10, 8), skinDark);
  jaw.scale.set(0.9, 0.85, 1.15);
  jaw.position.set(0, -0.075, 0.03);
  head.add(jaw);
  for (const s of [-1, 1]) {
    const socket = mesh(new THREE.SphereGeometry(0.025, 8, 8), eyeMat);
    socket.position.set(s * 0.045, 0.018, 0.1);
    head.add(socket);
  }
  const mouth = mesh(new THREE.BoxGeometry(0.075, 0.09, 0.02), mouthMat);
  mouth.position.set(0, -0.07, 0.115);
  head.add(mouth);
  for (let i = 0; i < 5; i++) {
    const t = mesh(new THREE.ConeGeometry(0.008, 0.028, 4), tooth);
    t.position.set(-0.03 + i * 0.015, -0.04, 0.124);
    t.rotation.x = Math.PI;
    head.add(t);
  }
  // milky dead eye sheen
  const eyeSheen = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xd8e0ce, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  eyeSheen.scale.set(0.32, 0.16, 1);
  eyeSheen.position.set(0, 0.02, 0.13);
  head.add(eyeSheen);

  const arms = [];
  for (const s of [-1, 1]) {
    const a = addLimb(pelvis, s, skin, skinDark, {
      x: 0.24, y: 0.55, z: 0.03, r: 0.052, upperLen: 0.4, lowerLen: 0.45,
    });
    a.shoulder.rotation.z = s * 0.18;
    for (let i = 0; i < 3; i++) {
      const c = mesh(new THREE.ConeGeometry(0.012, 0.13, 5), claw);
      c.position.set((i - 1) * 0.028, -0.07, 0.0);
      c.rotation.x = 0.45;
      c.rotation.z = (i - 1) * 0.16;
      a.hand.add(c);
    }
    arms.push(a);
  }

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.11, 0.84, 0);
    body.add(hip);
    const thigh = capsule(0.065, 0.36, skinDark);
    thigh.position.y = -0.2;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const shin = capsule(0.045, 0.4, skinDark);
    shin.position.y = -0.22;
    knee.add(shin);
    const foot = box(0.09, 0.06, 0.25, skinDark);
    foot.position.set(0, -0.46, 0.07);
    knee.add(foot);
    for (let i = 0; i < 2; i++) {
      const toe = mesh(new THREE.ConeGeometry(0.018, 0.1, 5), claw);
      toe.position.set((i - 0.5) * 0.04, -0.45, 0.21);
      toe.rotation.x = 0.5;
      knee.add(toe);
    }
    legs.push({ hip, knee, s });
  }

  // ragged hospital gown scraps
  const cloth = makeMaterial('fabric', { roughness: 0.98, metalness: 0, color: 0x7c8478, repeat: [2, 2] });
  for (let i = 0; i < 5; i++) {
    const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.16 + Math.random() * 0.1, 0.3 + Math.random() * 0.25), cloth);
    rag.position.set((Math.random() - 0.5) * 0.35, 0.3 + Math.random() * 0.35, -0.05 - Math.random() * 0.08);
    rag.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.3);
    rag.material = cloth;
    rag.castShadow = true;
    pelvis.add(rag);
  }
  const woundMesh = mesh(new THREE.SphereGeometry(0.06, 8, 6), wound);
  woundMesh.scale.set(1.4, 0.7, 0.3);
  woundMesh.position.set(0.16, 0.25, 0.12);
  pelvis.add(woundMesh);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData.eyeSheen = eyeSheen;

  return {
    group: root, body, pelvis, head, arms, legs, mats,
    height: 1.62, type: 'hollow', extra: { eyeSheen, cloth },
  };
}

export function createMoth() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skin = makeMaterial('skin', { roughness: 0.8, metalness: 0.03, color: 0x8c8b7c, repeat: [1, 1] });
  const darkSkin = makeMaterial('skin', { roughness: 0.86, metalness: 0.02, color: 0x5f6157, repeat: [1, 1] });
  const coat = makeMaterial('fabric', { roughness: 0.97, metalness: 0, color: 0x232724, repeat: [2, 2] });
  const coatLight = makeMaterial('fabric', { roughness: 0.95, metalness: 0, color: 0x3b403a, repeat: [2, 2] });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xd8e8d6, emissive: 0xe4fff0, emissiveIntensity: 1.8, roughness: 0.2 });
  const antennaMat = new THREE.MeshStandardMaterial({ color: 0x4b4c44, roughness: 0.65 });
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x8d9184, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const mats = [skin, darkSkin, coat, coatLight, eyeMat, wingMat];

  const pelvis = new THREE.Group();
  pelvis.position.y = 1.05;
  body.add(pelvis);
  const abdomen = capsule(0.12, 0.46, darkSkin);
  abdomen.position.y = 0.18;
  abdomen.scale.set(0.9, 1, 0.7);
  pelvis.add(abdomen);
  const chest = capsule(0.17, 0.36, skin);
  chest.position.y = 0.56;
  chest.scale.set(0.95, 1, 0.62);
  pelvis.add(chest);

  // coat panels
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.95), coat);
    panel.position.set(s * 0.12, 0.08, -0.11);
    panel.rotation.y = s * 0.22;
    panel.rotation.x = 0.05;
    panel.castShadow = true;
    pelvis.add(panel);
  }
  const collar = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.3), coatLight);
  collar.position.set(0, 0.84, -0.04);
  collar.rotation.x = -0.3;
  pelvis.add(collar);
  for (let i = 0; i < 5; i++) {
    const tatter = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.3 + Math.random() * 0.2), coatLight);
    tatter.position.set((Math.random() - 0.5) * 0.36, -0.38 - Math.random() * 0.2, -0.06);
    tatter.rotation.z = (Math.random() - 0.5) * 0.2;
    pelvis.add(tatter);
  }

  const neck = capsule(0.035, 0.18, darkSkin);
  neck.position.set(0, 0.82, 0.03);
  pelvis.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 1.0, 0.03);
  pelvis.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.105, 14, 12), darkSkin);
  skull.scale.set(0.9, 1.2, 0.95);
  head.add(skull);
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.035, 10, 8), eyeMat);
    eye.scale.set(0.8, 1.4, 0.6);
    eye.position.set(s * 0.05, 0.018, 0.088);
    head.add(eye);
    const ant = mesh(new THREE.CylinderGeometry(0.006, 0.003, 0.44, 5), antennaMat);
    ant.position.set(s * 0.06, 0.23, 0.02);
    ant.rotation.z = s * 0.22;
    ant.rotation.x = -0.35;
    head.add(ant);
    const feather = mesh(new THREE.ConeGeometry(0.055, 0.3, 4), antennaMat);
    feather.position.set(s * 0.11, 0.48, -0.06);
    feather.rotation.z = s * 0.45;
    head.add(feather);
  }
  const proboscis = mesh(new THREE.CylinderGeometry(0.006, 0.002, 0.16, 4), antennaMat);
  proboscis.position.set(0, -0.09, 0.09);
  proboscis.rotation.x = -0.4;
  head.add(proboscis);

  // wings folded on back
  const wings = [];
  for (const s of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(0, 0.62, -0.16);
    pelvis.add(wing);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(s * 0.45, 0.3, s * 0.62, -0.12);
    shape.quadraticCurveTo(s * 0.42, -0.52, 0, -0.24);
    shape.lineTo(0, 0);
    const geo = new THREE.ShapeGeometry(shape, 12);
    const m = new THREE.Mesh(geo, wingMat);
    m.castShadow = true;
    wing.add(m);
    // veins
    for (let i = 0; i < 4; i++) {
      const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), antennaMat);
      vein.position.set(s * (0.1 + i * 0.04), -0.05, 0);
      vein.rotation.z = s * (0.2 + i * 0.22);
      wing.add(vein);
    }
    wings.push({ wing, s });
  }

  const arms = [];
  for (const s of [-1, 1]) {
    const a = addLimb(pelvis, s, skin, darkSkin, {
      x: 0.2, y: 0.6, z: 0, r: 0.045, upperLen: 0.42, lowerLen: 0.5,
    });
    for (let i = 0; i < 4; i++) {
      const finger = mesh(new THREE.CylinderGeometry(0.006, 0.003, 0.2 + i * 0.02, 4), darkSkin);
      finger.position.set((i - 1.5) * 0.02, -0.1, 0);
      finger.rotation.z = (i - 1.5) * 0.1;
      a.hand.add(finger);
    }
    arms.push(a);
  }

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.1, 0.95, 0);
    body.add(hip);
    const thigh = capsule(0.055, 0.4, darkSkin);
    thigh.position.y = -0.22;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.47;
    hip.add(knee);
    const shin = capsule(0.038, 0.44, darkSkin);
    shin.position.y = -0.24;
    knee.add(shin);
    const foot = box(0.07, 0.05, 0.2, darkSkin);
    foot.position.set(0, -0.5, 0.06);
    knee.add(foot);
    legs.push({ hip, knee, s });
  }

  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xd8fff0, transparent: true, opacity: 0.1,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  aura.scale.set(1.6, 2.2, 1);
  aura.position.y = 1.1;
  body.add(aura);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return {
    group: root, body, pelvis, head, arms, legs, wings, mats,
    height: 2.15, type: 'moth', extra: { aura, eyeMat, wings },
  };
}

export function createGaunt() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skin = makeMaterial('skin', { roughness: 0.78, metalness: 0.02, color: 0x9b9686, repeat: [1, 1] });
  const skinDark = makeMaterial('skin', { roughness: 0.84, metalness: 0.02, color: 0x726e60, repeat: [1, 1] });
  const flesh = new THREE.MeshStandardMaterial({ color: 0x5b2b26, roughness: 0.6 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xc3b894, roughness: 0.55 });
  const chain = new THREE.MeshStandardMaterial({ color: 0x4b4d4a, roughness: 0.42, metalness: 0.7 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xb11f17, emissive: 0xff271a, emissiveIntensity: 1.1, roughness: 0.3 });
  const mats = [skin, skinDark, flesh, bone, chain, eyeMat];

  const pelvis = new THREE.Group();
  pelvis.position.y = 1.05;
  body.add(pelvis);
  const belly = mesh(new THREE.SphereGeometry(0.46, 18, 14), skin);
  belly.scale.set(1.05, 1.05, 0.85);
  belly.position.y = 0.32;
  pelvis.add(belly);
  const chest = mesh(new THREE.SphereGeometry(0.4, 16, 12), skin);
  chest.scale.set(1.1, 0.85, 0.8);
  chest.position.y = 0.72;
  pelvis.add(chest);
  // ribs and staples
  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(0.38 - i * 0.02, 0.012, 4, 16, Math.PI), skinDark);
    rib.rotation.set(Math.PI / 2, 0, 0.02);
    rib.position.set(0, 0.48 - i * 0.09, 0.17);
    rib.scale.set(1, 1, 0.62);
    pelvis.add(rib);
  }
  for (let i = 0; i < 8; i++) {
    const staple = mesh(new THREE.BoxGeometry(0.03, 0.01, 0.06), bone);
    staple.position.set(-0.24 + i * 0.06, 0.25 + Math.sin(i) * 0.05, 0.37);
    pelvis.add(staple);
  }
  const wound = mesh(new THREE.SphereGeometry(0.16, 10, 8), flesh);
  wound.scale.set(1.5, 1.1, 0.25);
  wound.position.set(0.18, 0.48, 0.3);
  pelvis.add(wound);

  // chain necklace
  for (let i = 0; i < 12; i++) {
    const link = mesh(new THREE.TorusGeometry(0.045, 0.012, 4, 6), chain);
    const a = (i / 12) * Math.PI * 2;
    link.position.set(Math.cos(a) * 0.34, 0.92 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.16 + 0.05);
    link.rotation.set(Math.PI / 2, a, 0);
    pelvis.add(link);
  }

  const neck = capsule(0.11, 0.1, skinDark);
  neck.position.set(0, 1.1, 0.1);
  pelvis.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 1.2, 0.1);
  pelvis.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.16, 14, 12), skin);
  skull.scale.set(0.9, 0.85, 0.95);
  head.add(skull);
  const jaw = mesh(new THREE.BoxGeometry(0.2, 0.11, 0.16), skinDark);
  jaw.position.set(0, -0.11, 0.14);
  head.add(jaw);
  for (let i = 0; i < 6; i++) {
    const t = mesh(new THREE.ConeGeometry(0.014, 0.05, 4), bone);
    t.position.set(-0.07 + i * 0.028, -0.04, 0.148);
    t.rotation.x = Math.PI;
    head.add(t);
  }
  for (const s of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(0.02, 8, 8), eyeMat);
    eye.position.set(s * 0.055, 0.01, 0.145);
    head.add(eye);
  }
  // crude iron crown / bolts
  for (let i = 0; i < 4; i++) {
    const bolt = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12, 6), chain);
    bolt.position.set(-0.09 + i * 0.06, 0.15, 0);
    bolt.rotation.x = 0.2;
    head.add(bolt);
  }

  const arms = [];
  for (const s of [-1, 1]) {
    const a = addLimb(pelvis, s, skin, skinDark, {
      x: 0.5, y: 0.78, z: 0, r: 0.13, upperLen: 0.45, lowerLen: 0.5,
    });
    const fist = mesh(new THREE.SphereGeometry(0.19, 12, 10), skinDark);
    fist.scale.set(1, 1.1, 0.9);
    a.hand.add(fist);
    for (let i = 0; i < 3; i++) {
      const knuckle = mesh(new THREE.SphereGeometry(0.055, 8, 6), skin);
      knuckle.position.set((i - 1) * 0.1, -0.08, 0.11);
      a.hand.add(knuckle);
    }
    arms.push(a);
  }

  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.24, 0.92, 0);
    body.add(hip);
    const thigh = capsule(0.14, 0.36, skinDark);
    thigh.position.y = -0.24;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.5;
    hip.add(knee);
    const shin = capsule(0.11, 0.34, skinDark);
    shin.position.y = -0.22;
    knee.add(shin);
    const foot = box(0.22, 0.11, 0.34, skinDark);
    foot.position.set(0, -0.44, 0.09);
    knee.add(foot);
    legs.push({ hip, knee, s });
  }

  // back spikes
  for (let i = 0; i < 5; i++) {
    const sp = mesh(new THREE.ConeGeometry(0.06, 0.2, 5), bone);
    sp.position.set(0, 0.9 - i * 0.12, -0.34);
    sp.rotation.x = -0.6;
    pelvis.add(sp);
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return {
    group: root, body, pelvis, head, arms, legs, mats,
    height: 2.5, type: 'gaunt', extra: { eyeMat },
  };
}
