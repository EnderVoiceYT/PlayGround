import * as THREE from 'three';
import { makeMaterial, glowTexture } from './textures.js';

// -----------------------------------------------------------------------------
// Elias Voss — survivor, field investigator, reluctant gunman.
// The model is hand-built from primitives with articulated limbs, a working
// flashlight rig and a contact shadow so it reads cleanly from the eagle-eye
// camera.
// -----------------------------------------------------------------------------

function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Player {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'Elias';
    scene.add(this.group);

    const skin = makeMaterial('skin', { roughness: 0.78, metalness: 0.0, color: 0xc7ab90, repeat: [1, 1] });
    const skinDark = makeMaterial('skin', { roughness: 0.82, metalness: 0.0, color: 0x9e826b, repeat: [1, 1] });
    const jacket = makeMaterial('fabric', { roughness: 0.88, metalness: 0.02, color: 0x455046, repeat: [2, 2] });
    const jacketDark = makeMaterial('fabric', { roughness: 0.9, metalness: 0.02, color: 0x2f3933, repeat: [2, 2] });
    const pants = makeMaterial('fabric', { roughness: 0.92, metalness: 0.0, color: 0x353a3a, repeat: [2, 2] });
    const boots = new THREE.MeshStandardMaterial({ color: 0x1a1917, roughness: 0.72, metalness: 0.08 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 0.92 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x1c201c, roughness: 0.8, metalness: 0.1 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x6e7677, roughness: 0.32, metalness: 0.82 });
    const darkSteel = new THREE.MeshStandardMaterial({ color: 0x232829, roughness: 0.46, metalness: 0.72 });
    const lens = new THREE.MeshStandardMaterial({ color: 0xfff2ce, emissive: 0xfff0c2, emissiveIntensity: 2.4, roughness: 0.2 });
    const lensGlass = new THREE.MeshPhysicalMaterial({ color: 0xdfe9e0, roughness: 0.05, metalness: 0.05, transparent: true, opacity: 0.38 });

    this.materials = { jacket, jacketDark, pants, skin, skinDark, boots, hair, steel, darkSteel, lens };

    this.body = new THREE.Group();
    this.group.add(this.body);

    // Contact shadow.
    const shTex = glowTexture();
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({
      map: shTex, color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false,
    }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.012;
    this.shadow = sh;
    this.group.add(sh);

    // Legs.
    this.hips = new THREE.Group();
    this.hips.position.y = 0.96;
    this.body.add(this.hips);
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.135, 0, 0);
      this.hips.add(hip);
      const thigh = capsule(0.085, 0.34, pants);
      thigh.position.y = -0.22;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.43;
      hip.add(knee);
      const shin = capsule(0.07, 0.34, pants);
      shin.position.y = -0.21;
      knee.add(shin);
      const boot = box(0.16, 0.14, 0.29, boots);
      boot.position.set(0, -0.43, 0.06);
      knee.add(boot);
      // knee pad
      const pad = box(0.15, 0.11, 0.1, jacketDark);
      pad.position.set(0, -0.02, 0.06);
      knee.add(pad);
      this.legs.push({ hip, knee, s });
    }

    // Torso.
    const torso = new THREE.Group();
    torso.position.y = 0.05;
    this.hips.add(torso);
    this.torso = torso;
    const chest = capsule(0.25, 0.44, jacket);
    chest.position.y = 0.38;
    chest.scale.set(1.08, 1, 0.72);
    torso.add(chest);
    const vest = box(0.4, 0.42, 0.24, jacketDark);
    vest.position.set(0, 0.4, 0.13);
    torso.add(vest);
    // zipper and straps
    const zip = box(0.025, 0.42, 0.01, steel);
    zip.position.set(0, 0.42, 0.255);
    torso.add(zip);
    for (const s of [-1, 1]) {
      const belt = box(0.06, 0.45, 0.03, strap);
      belt.position.set(s * 0.19, 0.42, 0.22);
      belt.rotation.z = s * 0.12;
      torso.add(belt);
      const pouch = box(0.12, 0.15, 0.08, jacketDark);
      pouch.position.set(s * 0.25, 0.18, 0.06);
      torso.add(pouch);
    }
    // belt
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 16), strap);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.06;
    belt.scale.set(1.05, 0.8, 1);
    torso.add(belt);
    const buckle = box(0.07, 0.05, 0.03, steel);
    buckle.position.set(0, 0.06, 0.22);
    torso.add(buckle);
    // backpack
    const pack = box(0.38, 0.44, 0.2, jacketDark);
    pack.position.set(0, 0.42, -0.22);
    torso.add(pack);
    const packFlap = box(0.3, 0.17, 0.05, strap);
    packFlap.position.set(0, 0.54, -0.33);
    torso.add(packFlap);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 10), jacket);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(0, 0.67, -0.28);
    roll.castShadow = true;
    torso.add(roll);

    // Head.
    const neck = capsule(0.07, 0.05, skin);
    neck.position.y = 0.67;
    torso.add(neck);
    this.head = new THREE.Group();
    this.head.position.y = 0.83;
    torso.add(this.head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.155, 18, 14), skin);
    skull.scale.set(0.92, 1.05, 0.95);
    skull.castShadow = true;
    this.head.add(skull);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), skinDark);
    jaw.scale.set(0.92, 0.75, 0.9);
    jaw.position.set(0, -0.07, 0.055);
    this.head.add(jaw);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), skin);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, -0.01, 0.15);
    this.head.add(nose);
    // hair cap
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.162, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hair);
    hairCap.scale.set(0.96, 1.05, 1);
    hairCap.position.y = 0.02;
    this.head.add(hairCap);
    // ears
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), skinDark);
      ear.position.set(s * 0.14, -0.01, 0.0);
      ear.scale.set(0.6, 1, 0.7);
      this.head.add(ear);
    }
    // stubble/beard
    const beard = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), hair);
    beard.scale.set(1.02, 0.55, 0.8);
    beard.position.set(0, -0.105, 0.075);
    this.head.add(beard);
    // eyes
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), new THREE.MeshStandardMaterial({ color: 0x1b1c1a, roughness: 0.35 }));
      eye.position.set(s * 0.055, 0.015, 0.143);
      this.head.add(eye);
    }

    // Arms. Shoulders sit high on torso.
    this.arms = [];
    for (const s of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.3, 0.61, 0);
      torso.add(shoulder);
      const upper = capsule(0.075, 0.26, jacket);
      upper.position.y = -0.18;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.36;
      shoulder.add(elbow);
      const fore = capsule(0.065, 0.26, jacketDark);
      fore.position.y = -0.18;
      elbow.add(fore);
      const hand = new THREE.Group();
      hand.position.y = -0.36;
      elbow.add(hand);
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin);
      palm.scale.set(0.8, 1, 0.9);
      palm.castShadow = true;
      hand.add(palm);
      this.arms.push({ shoulder, elbow, hand, s });
    }

    // Flashlight in left hand (s = -1).
    const leftHand = this.arms[0].hand;
    const torch = new THREE.Group();
    torch.position.set(0, -0.07, 0.02);
    torch.rotation.x = Math.PI / 2;
    leftHand.add(torch);
    const torchBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.052, 0.26, 12), darkSteel);
    torchBody.position.y = 0.02;
    torchBody.castShadow = true;
    torch.add(torchBody);
    const torchHead = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.052, 0.1, 14), steel);
    torchHead.position.y = 0.18;
    torchHead.castShadow = true;
    torch.add(torchHead);
    const torchLens = new THREE.Mesh(new THREE.CircleGeometry(0.063, 16), lens);
    torchLens.rotation.x = -Math.PI / 2;
    torchLens.position.y = 0.235;
    torch.add(torchLens);
    this.torchLens = torchLens;
    const torchGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffe8ba, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    torchGlow.scale.set(0.55, 0.55, 1);
    torchGlow.position.y = 0.25;
    torch.add(torchGlow);
    this.torchGlow = torchGlow;

    // Sidearm in right hand.
    const rightHand = this.arms[1].hand;
    const gun = new THREE.Group();
    gun.position.set(0, -0.08, 0.06);
    gun.rotation.x = Math.PI / 2;
    rightHand.add(gun);
    const slide = box(0.055, 0.22, 0.055, darkSteel);
    slide.position.y = 0.09;
    gun.add(slide);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.12, 8), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.12, 0.16);
    gun.add(barrel);
    const grip = box(0.055, 0.11, 0.045, new THREE.MeshStandardMaterial({ color: 0x2b2925, roughness: 0.72 }));
    grip.position.set(0, -0.05, 0.05);
    grip.rotation.x = -0.22;
    gun.add(grip);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 8, Math.PI), steel);
    guard.rotation.x = Math.PI / 2;
    guard.position.set(0, -0.01, 0.07);
    gun.add(guard);
    this.gun = gun;

    // Muzzle flash light (short bursts).
    this.muzzleLight = new THREE.PointLight(0xffc27a, 0, 9, 2);
    this.muzzleLight.position.set(0, 1.15, 0.9);
    this.group.add(this.muzzleLight);

    // Flashlight rig.
    this.spot = new THREE.SpotLight(0xffe9c0, 260, 26, 0.52, 0.62, 1.7);
    this.spot.position.set(-0.18, 1.32, 0.32);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(2048, 2048);
    this.spot.shadow.bias = -0.0006;
    this.spot.shadow.normalBias = 0.025;
    this.spot.shadow.camera.near = 0.3;
    this.spot.shadow.camera.far = 30;
    this.spot.shadow.focus = 1;
    this.group.add(this.spot);
    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0, 1.0, 11);
    this.group.add(this.spotTarget);
    this.spot.target = this.spotTarget;

    // Fake volumetric shaft in front of the torch.
    const beamGeo = new THREE.CylinderGeometry(0.18, 3.6, 17, 24, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, 8.6);
    const beamMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0xffe8bd) },
        uOpacity: { value: 0.07 },
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.0); vWorld=wp.xyz; gl_Position=projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
        varying vec2 vUv; varying vec3 vWorld;
        void main(){
          float edge = smoothstep(0.0,0.22,vUv.x) * smoothstep(1.0,0.78,vUv.x);
          float fade = smoothstep(0.0,0.35,vUv.y) * smoothstep(1.0,0.55,vUv.y);
          float swirl = 0.86 + 0.14*sin(uTime*1.7 + vUv.y*18.0 + vWorld.x*2.0);
          gl_FragColor = vec4(uColor, uOpacity * edge * fade * swirl);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.position.set(0, 1.24, 0.3);
    this.group.add(this.beam);

    // Shared state.
    this.walkPhase = 0;
    this.bob = 0;
    this.dead = false;
    this.deadT = 0;
    this.flashlightOn = true;
    this.flashlightLevel = 1;
    this.hurt = 0;
    this.aim = new THREE.Vector2(0, -1);
    this.facing = 0;
  }

  setFlashlight(on, level = 1) {
    this.flashlightOn = on;
    this.flashlightLevel = level;
    this.spot.visible = on;
    this.beam.visible = on;
    this.torchGlow.visible = on;
    this.torchLens.material.emissiveIntensity = on ? 2.4 * level : 0.05;
    this.beam.material.uniforms.uOpacity.value = on ? 0.055 * level : 0;
  }

  muzzleFlash() {
    this.muzzleLight.intensity = 26;
  }

  update(dt, time, state = {}) {
    const moving = !!state.moving;
    const sprint = !!state.sprint;
    const speed = state.speed || 0;
    this.hurt = Math.max(0, this.hurt - dt * 2.4);

    if (state.dead && !this.dead) {
      this.dead = true;
      this.deadT = 0;
      this.spot.visible = false;
      this.beam.visible = false;
    }
    if (this.dead) {
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 1.1);
      this.body.rotation.z = t * Math.PI / 2;
      this.body.position.y = -t * 0.55;
      this.body.rotation.x = -t * 0.15;
      this.shadow.material.opacity = 0.42 * (1 - t * 0.5);
      this.muzzleLight.intensity *= 0.86;
      return;
    }

    this.walkPhase += dt * (moving ? (sprint ? 11 : 7.2) : 1.2);
    const pace = moving ? (sprint ? 1.35 : 1) : 0;
    const swing = Math.sin(this.walkPhase) * 0.55 * pace;
    const bobAmt = moving ? (sprint ? 0.055 : 0.035) : 0.012;
    this.bob = Math.sin(this.walkPhase * 2) * bobAmt;
    this.body.position.y = this.bob;
    this.body.rotation.x = moving ? (sprint ? 0.14 : 0.06) : 0;
    this.body.rotation.z = Math.sin(this.walkPhase) * 0.012 * pace;

    // Legs.
    for (const leg of this.legs) {
      const p = swing * leg.s;
      leg.hip.rotation.x = p;
      leg.knee.rotation.x = Math.max(0, -Math.sin(this.walkPhase + leg.s * Math.PI * 0.5) * 0.65 * pace);
      leg.hip.rotation.z = leg.s * 0.02;
    }

    // Arms: flashlight hand stays forward, gun hand tracks aim.
    const left = this.arms[0];
    const right = this.arms[1];
    const breathe = Math.sin(time * 1.7) * 0.02;
    left.shoulder.rotation.x = -1.28 + breathe + (moving ? Math.sin(this.walkPhase) * 0.035 : 0);
    left.shoulder.rotation.z = 0.12;
    left.elbow.rotation.x = 0.22;
    left.hand.rotation.x = 0.02;
    right.shoulder.rotation.x = -1.18 + breathe * 0.6;
    right.shoulder.rotation.z = -0.16;
    right.elbow.rotation.x = 0.28;
    right.hand.rotation.x = 0;

    // Head subtle look.
    this.head.rotation.y = Math.sin(time * 0.7) * 0.08;
    this.head.rotation.x = -0.05 + Math.sin(time * 0.9) * 0.02;

    // Torch lens pulse / battery flicker.
    const flick = 0.94 + Math.sin(time * 20) * 0.03 + Math.sin(time * 7.3) * 0.03;
    this.torchGlow.material.opacity = (this.flashlightOn ? 0.45 : 0) * this.flashlightLevel * flick;
    this.spot.intensity = (this.flashlightOn ? 280 : 0) * this.flashlightLevel * flick;
    this.beam.material.uniforms.uOpacity.value = (this.flashlightOn ? 0.055 : 0) * this.flashlightLevel * flick;
    this.beam.material.uniforms.uTime.value = time;
    this.muzzleLight.intensity *= 0.72;
    this.shadow.material.opacity = 0.38 + Math.sin(time * 2) * 0.02;
  }
}
