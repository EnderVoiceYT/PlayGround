import * as THREE from 'three';

// -----------------------------------------------------------------------------
// Deterministic procedural texture workshop. Everything in Blackmoor is drawn
// at runtime so the build stays self contained and loads instantly.
// -----------------------------------------------------------------------------

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

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function hex(h) {
  return h;
}

function rgb(h, a = 1) {
  const n = parseInt(h.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function noiseFill(ctx, size, rand, base, variance, alpha = 1) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * variance * 255;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

function softBlob(ctx, x, y, r, color, rand, stretch = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, stretch);
  ctx.translate(-x, -y);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function crack(ctx, x, y, len, rand, color = 'rgba(12,12,10,0.65)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7 + rand() * 1.3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rand() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (rand() - 0.5) * 0.8;
    x += Math.cos(a) * (2 + rand() * 7);
    y += Math.sin(a) * (2 + rand() * 7);
    ctx.lineTo(x, y);
    if (rand() < 0.12) {
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
}

function grunge(ctx, size, rand, amount = 18) {
  for (let i = 0; i < amount; i++) {
    const r = 8 + rand() * (size * 0.13);
    softBlob(ctx, rand() * size, rand() * size, r,
      rand() < 0.55 ? `rgba(20,18,12,${0.05 + rand() * 0.12})` : `rgba(110,100,78,${0.02 + rand() * 0.05})`,
      rand, 0.5 + rand() * 1.2);
  }
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = `rgba(200,190,160,${0.015 + rand() * 0.04})`;
    ctx.lineWidth = 0.5 + rand();
    ctx.beginPath();
    const x = rand() * size;
    const y = rand() * size;
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 30);
    ctx.stroke();
  }
}

function tilePattern(ctx, size, rand, palette, tile, groutColor, chip = true) {
  ctx.fillStyle = groutColor;
  ctx.fillRect(0, 0, size, size);
  const n = Math.ceil(size / tile);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const col = palette[Math.floor(rand() * palette.length)];
      const inset = 1.2 + rand() * 1.4;
      ctx.fillStyle = col;
      ctx.fillRect(x * tile + inset, y * tile + inset, tile - inset * 2, tile - inset * 2);
      // grout shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x * tile + inset, y * tile + tile - inset - 2, tile - inset * 2, 2);
      if (chip && rand() < 0.28) {
        ctx.fillStyle = 'rgba(30,28,22,0.35)';
        ctx.beginPath();
        const cx = x * tile + rand() * tile;
        const cy = y * tile + rand() * tile;
        ctx.arc(cx, cy, 1.5 + rand() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (rand() < 0.1) crack(ctx, x * tile + rand() * tile, y * tile + rand() * tile, 4, rand);
    }
  }
  grunge(ctx, size, rand, 12);
}

function concretePattern(ctx, size, rand, base, dark) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  noiseFill(ctx, size, rand, base, 0.055);
  for (let i = 0; i < 22; i++) {
    softBlob(ctx, rand() * size, rand() * size, 10 + rand() * 60, `rgba(15,14,12,${0.03 + rand() * 0.12})`, rand, 0.4 + rand());
  }
  for (let i = 0; i < 7; i++) crack(ctx, rand() * size, rand() * size, 10 + rand() * 20, rand);
  // formwork seams
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1.4;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (size / 4) * i + rand() * 6);
    ctx.lineTo(size, (size / 4) * i + rand() * 6);
    ctx.stroke();
  }
  // seepage streaks
  for (let i = 0; i < 9; i++) {
    const x = rand() * size;
    const y = rand() * size * 0.6;
    const g = ctx.createLinearGradient(x, y, x, y + 60 + rand() * 130);
    g.addColorStop(0, `rgba(20,18,12,${0.1 + rand() * 0.13})`);
    g.addColorStop(1, 'rgba(20,18,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 2 + rand() * 12, 130);
  }
  if (dark) grunge(ctx, size, rand, 10);
}

function brickPattern(ctx, size, rand) {
  ctx.fillStyle = '#2b2823';
  ctx.fillRect(0, 0, size, size);
  const bw = 64, bh = 26;
  for (let row = 0; row < size / bh; row++) {
    const off = row % 2 ? -bw / 2 : 0;
    for (let col = -1; col < size / bw + 1; col++) {
      const shade = 44 + Math.floor(rand() * 34);
      ctx.fillStyle = `rgb(${shade + 18},${shade + 4},${shade - 6})`;
      ctx.fillRect(col * bw + off + 2, row * bh + 2, bw - 4, bh - 4);
      if (rand() < 0.3) {
        ctx.fillStyle = 'rgba(110,100,80,0.12)';
        ctx.fillRect(col * bw + off + 4, row * bh + 4, bw - 10, 3);
      }
    }
  }
  for (let i = 0; i < 28; i++) {
    softBlob(ctx, rand() * size, rand() * size, 5 + rand() * 35, `rgba(8,10,8,${0.08 + rand() * 0.2})`, rand, 0.6 + rand());
  }
  for (let i = 0; i < 5; i++) crack(ctx, rand() * size, rand() * size, 6, rand, 'rgba(5,5,4,0.7)');
  // wet sheen
  for (let i = 0; i < 4; i++) softBlob(ctx, rand() * size, rand() * size, 20 + rand() * 70, 'rgba(110,140,140,0.045)', rand, 0.5);
}

function brushedMetal(ctx, size, rand, base, rustAmount) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 2; i++) {
    const y = rand() * size;
    ctx.strokeStyle = `rgba(${rand() < 0.5 ? '255,255,255' : '0,0,0'},${0.012 + rand() * 0.035})`;
    ctx.lineWidth = 0.5 + rand();
    ctx.beginPath();
    ctx.moveTo(rand() * size, y);
    ctx.lineTo(rand() * size, y + (rand() - 0.5) * 2);
    ctx.stroke();
  }
  // panel seams + rivets
  ctx.strokeStyle = 'rgba(0,0,0,0.34)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath(); ctx.moveTo((size / 3) * i, 0); ctx.lineTo((size / 3) * i, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, (size / 3) * i); ctx.lineTo(size, (size / 3) * i); ctx.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const x = Math.floor(rand() * 6) * (size / 6) + 12;
    const y = Math.floor(rand() * 6) * (size / 6) + 12;
    ctx.fillStyle = 'rgba(160,160,150,0.30)';
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(x + 1, y + 1, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < rustAmount; i++) {
    const x = rand() * size, y = rand() * size, r = 6 + rand() * 45;
    softBlob(ctx, x, y, r, `rgba(${120 + rand() * 40},${52 + rand() * 30},${18 + rand() * 12},${0.1 + rand() * 0.25})`, rand, 0.6 + rand());
    if (rand() < 0.5) {
      const g = ctx.createLinearGradient(x, y, x, y + 90);
      g.addColorStop(0, 'rgba(105,54,20,0.24)');
      g.addColorStop(1, 'rgba(105,54,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, 2 + rand() * 7, 90);
    }
  }
  grunge(ctx, size, rand, 8);
}

function woodPattern(ctx, size, rand) {
  ctx.fillStyle = '#3c2a1b';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i++) {
    const y = rand() * size;
    ctx.strokeStyle = `rgba(${rand() < 0.5 ? '15,9,4' : '110,76,45'},${0.06 + rand() * 0.2})`;
    ctx.lineWidth = 0.6 + rand() * 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 16) {
      ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * (2 + rand() * 5));
    }
    ctx.stroke();
  }
  // veneer seams
  ctx.strokeStyle = 'rgba(8,5,2,0.65)';
  ctx.lineWidth = 2;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, (size / 4) * i); ctx.lineTo(size, (size / 4) * i); ctx.stroke();
  }
  for (let i = 0; i < 5; i++) {
    const x = rand() * size, y = rand() * size;
    ctx.strokeStyle = 'rgba(12,7,3,0.55)';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + k * 4, 2 + k * 1.6, 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  grunge(ctx, size, rand, 8);
}

function plasterPattern(ctx, size, rand, base) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  noiseFill(ctx, size, rand, base, 0.035);
  for (let i = 0; i < 18; i++) {
    softBlob(ctx, rand() * size, rand() * size, 10 + rand() * 55, `rgba(28,24,16,${0.035 + rand() * 0.11})`, rand, 0.5 + rand());
  }
  for (let i = 0; i < 6; i++) {
    const x = rand() * size, y = rand() * size;
    ctx.fillStyle = 'rgba(32,28,22,0.2)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) ctx.lineTo(x + (rand() - 0.5) * 40, y + 8 + rand() * 70);
    ctx.lineTo(x + 5, y);
    ctx.fill();
  }
  grunge(ctx, size, rand, 8);
}

function tileWallPattern(ctx, size, rand) {
  const palette = ['#5e6659', '#68705f', '#596052', '#717766'];
  ctx.fillStyle = '#242822';
  ctx.fillRect(0, 0, size, size);
  const tw = 64, th = 42;
  for (let row = 0; row < size / th; row++) {
    for (let col = 0; col < size / tw; col++) {
      const c = palette[Math.floor(rand() * palette.length)];
      ctx.fillStyle = c;
      ctx.fillRect(col * tw + 2, row * th + 2, tw - 4, th - 4);
      ctx.fillStyle = 'rgba(255,255,240,0.04)';
      ctx.fillRect(col * tw + 3, row * th + 3, tw - 6, 2);
    }
  }
  for (let i = 0; i < 20; i++) {
    const x = rand() * size, y = rand() * size;
    const g = ctx.createLinearGradient(x, y, x, y + 120);
    g.addColorStop(0, 'rgba(28,24,16,0.24)');
    g.addColorStop(1, 'rgba(28,24,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 3 + rand() * 20, 120);
  }
  grunge(ctx, size, rand, 14);
}

function makeColorBump(kind) {
  const size = 512;
  const rand = mulberry32(kind.split('').reduce((a, c) => a + c.charCodeAt(0) * 31, 7));
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const b = canvas(size);
  const bctx = b.getContext('2d');

  switch (kind) {
    case 'hospitalFloor':
      tilePattern(ctx, size, rand, ['#6f7568', '#787d6e', '#666d60', '#838678', '#6a7163'], 64, '#252923');
      break;
    case 'labFloor':
      ctx.fillStyle = '#232c2d';
      ctx.fillRect(0, 0, size, size);
      noiseFill(ctx, size, rand, '#232c2d', 0.04);
      for (let i = 0; i < 1400; i++) {
        ctx.fillStyle = `rgba(${100 + rand() * 60},${105 + rand() * 60},${100 + rand() * 50},${0.05 + rand() * 0.18})`;
        ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 2.4, 1 + rand() * 2.4);
      }
      ctx.strokeStyle = 'rgba(4,8,8,0.7)';
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, size - 2, size - 2);
      ctx.beginPath(); ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size); ctx.stroke();
      for (let i = 0; i < 10; i++) softBlob(ctx, rand() * size, rand() * size, 15 + rand() * 60, 'rgba(90,130,120,0.04)', rand, 0.7);
      grunge(ctx, size, rand, 16);
      break;
    case 'concrete':
      concretePattern(ctx, size, rand, '#464742', true);
      break;
    case 'tunnelFloor':
      concretePattern(ctx, size, rand, '#34393a', true);
      for (let i = 0; i < 30; i++) softBlob(ctx, rand() * size, rand() * size, 6 + rand() * 36, 'rgba(8,14,15,0.25)', rand, 0.5 + rand());
      break;
    case 'metalFloor':
      brushedMetal(ctx, size, rand, '#33383a', 34);
      break;
    case 'brick':
      brickPattern(ctx, size, rand);
      break;
    case 'wallHospital':
      tileWallPattern(ctx, size, rand);
      break;
    case 'wallLab':
      plasterPattern(ctx, size, rand, '#4c504c');
      ctx.strokeStyle = 'rgba(10,12,10,0.3)';
      ctx.lineWidth = 2;
      for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo((size / 3) * i, 0); ctx.lineTo((size / 3) * i, size); ctx.stroke(); }
      break;
    case 'wallIndustrial':
      brushedMetal(ctx, size, rand, '#4a4640', 55);
      break;
    case 'wallTunnel':
      brickPattern(ctx, size, rand);
      break;
    case 'wood':
      woodPattern(ctx, size, rand);
      break;
    case 'metalRust':
      brushedMetal(ctx, size, rand, '#4b4741', 80);
      break;
    case 'metalClean':
      brushedMetal(ctx, size, rand, '#646b6e', 10);
      break;
    case 'fabric':
      ctx.fillStyle = '#4d4a3f';
      ctx.fillRect(0, 0, size, size);
      noiseFill(ctx, size, rand, '#4d4a3f', 0.09);
      for (let i = 0; i < 300; i++) {
        ctx.strokeStyle = `rgba(${rand() < 0.5 ? '20,18,14' : '120,114,96'},0.12)`;
        ctx.beginPath();
        const x = rand() * size, y = rand() * size;
        ctx.moveTo(x, y); ctx.lineTo(x + 3 + rand() * 8, y + 3 + rand() * 8); ctx.stroke();
      }
      break;
    case 'paper':
      ctx.fillStyle = '#b9b09a';
      ctx.fillRect(0, 0, size, size);
      noiseFill(ctx, size, rand, '#b9b09a', 0.04);
      for (let i = 0; i < 8; i++) softBlob(ctx, rand() * size, rand() * size, 20 + rand() * 50, 'rgba(120,104,70,0.07)', rand, 0.8);
      break;
    case 'skin':
      ctx.fillStyle = '#9b8774';
      ctx.fillRect(0, 0, size, size);
      noiseFill(ctx, size, rand, '#9b8774', 0.06);
      for (let i = 0; i < 60; i++) softBlob(ctx, rand() * size, rand() * size, 4 + rand() * 22, 'rgba(90,54,46,0.06)', rand, 0.8);
      break;
    default:
      ctx.fillStyle = '#555';
      ctx.fillRect(0, 0, size, size);
  }

  // Bump map derived from luminance + extra fine noise.
  const img = ctx.getImageData(0, 0, size, size);
  const bimg = bctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    let v = (img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11);
    v = 128 + (v - 110) * 3.2 + (rand() - 0.5) * 18;
    bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = Math.max(0, Math.min(255, v));
    bimg.data[i + 3] = 255;
  }
  bctx.putImageData(bimg, 0, 0);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(b);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

const cache = new Map();
export function surface(kind) {
  if (!cache.has(kind)) cache.set(kind, makeColorBump(kind));
  return cache.get(kind);
}

export function makeMaterial(kind, opts = {}) {
  const t = surface(kind);
  const rep = opts.repeat || [1, 1];
  const map = t.map.clone();
  const bump = t.bump.clone();
  map.needsUpdate = true;
  bump.needsUpdate = true;
  map.repeat.set(rep[0], rep[1]);
  bump.repeat.set(rep[0], rep[1]);
  map.anisotropy = opts.anisotropy || 4;
  const mat = new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: opts.bumpScale ?? 0.045,
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0.04,
    color: opts.color || 0xffffff,
    envMapIntensity: opts.envMapIntensity ?? 0.55,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
  });
  if (opts.emissive) {
    mat.emissive = new THREE.Color(opts.emissive);
    mat.emissiveIntensity = opts.emissiveIntensity ?? 0.6;
  }
  if (opts.vertexColors) mat.vertexColors = true;
  return mat;
}

function decodeDecal(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function bloodDecal() {
  if (cache.has('__blood')) return cache.get('__blood');
  const size = 256;
  const rand = mulberry32(9911);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * (size * 0.28);
    softBlob(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 6 + rand() * 38, `rgba(${52 + rand() * 35},${5 + rand() * 8},${6 + rand() * 8},${0.55 + rand() * 0.4})`, rand, 0.5 + rand());
  }
  for (let i = 0; i < 34; i++) {
    const a = rand() * Math.PI * 2;
    const d = size * 0.15 + rand() * size * 0.3;
    ctx.fillStyle = `rgba(${45 + rand() * 30},4,6,${0.4 + rand() * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + rand() * 5, 2 + rand() * 9, a, 0, Math.PI * 2);
    ctx.fill();
  }
  const tx = decodeDecal(new THREE.CanvasTexture(c));
  cache.set('__blood', tx);
  return tx;
}

export function grimeDecal() {
  if (cache.has('__grime')) return cache.get('__grime');
  const size = 256;
  const rand = mulberry32(3321);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  for (let i = 0; i < 28; i++) {
    softBlob(ctx, rand() * size, rand() * size, 10 + rand() * 52, `rgba(${10 + rand() * 20},${10 + rand() * 18},${8 + rand() * 15},${0.15 + rand() * 0.25})`, rand, 0.4 + rand());
  }
  const tx = decodeDecal(new THREE.CanvasTexture(c));
  cache.set('__grime', tx);
  return tx;
}

export function glowTexture() {
  if (cache.has('__glow')) return cache.get('__glow');
  const size = 128;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tx = new THREE.CanvasTexture(c);
  cache.set('__glow', tx);
  return tx;
}

export function dustTexture() {
  if (cache.has('__dust')) return cache.get('__dust');
  const size = 64;
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,250,230,0.95)');
  g.addColorStop(0.4, 'rgba(230,220,190,0.35)');
  g.addColorStop(1, 'rgba(200,190,160,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tx = new THREE.CanvasTexture(c);
  cache.set('__dust', tx);
  return tx;
}

export function buildEnvironmentTexture(renderer) {
  const w = 1024, h = 512;
  const c = canvas(w);
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0b0f12');
  g.addColorStop(0.45, '#1e2325');
  g.addColorStop(0.55, '#121719');
  g.addColorStop(1, '#050606');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rand = mulberry32(552);
  for (let i = 0; i < 14; i++) {
    softBlob(ctx, rand() * w, h * (0.35 + rand() * 0.3), 20 + rand() * 90,
      rand() < 0.5 ? 'rgba(190,140,80,0.1)' : 'rgba(90,140,140,0.08)', rand, 0.4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

export function makeNoiseTexture(size = 128, alpha = 0.5, seed = 8) {
  const rand = mulberry32(seed);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(rand() * 255 * alpha);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
