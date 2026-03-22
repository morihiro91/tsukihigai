import * as THREE from 'three';
import { getScene } from './scene';

interface SmokeParticle {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  startScale: number;
  rotSpeed: number;
}

const particles: SmokeParticle[] = [];
let smokeGroup: THREE.Group;
let smokeTexture: THREE.Texture;
let spawnTimer = 0;

const SPAWN_INTERVAL = 0.08;
const MAX_PARTICLES = 50;
const GRILL_SIZE = 0.18;

/** Generate a soft, blobby smoke texture using Canvas2D */
function createSmokeTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Draw multiple overlapping soft circles for a cloud-like shape
  const cx = size / 2;
  const cy = size / 2;

  // Main blob
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  grad.addColorStop(0, 'rgba(220,220,220,0.6)');
  grad.addColorStop(0.4, 'rgba(200,200,200,0.3)');
  grad.addColorStop(0.7, 'rgba(180,180,180,0.1)');
  grad.addColorStop(1, 'rgba(160,160,160,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Add smaller bumps for fluffy edges
  const bumps = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < bumps; i++) {
    const angle = (i / bumps) * Math.PI * 2;
    const dist = size * 0.15 + Math.random() * size * 0.1;
    const bx = cx + Math.cos(angle) * dist;
    const by = cy + Math.sin(angle) * dist;
    const br = size * 0.15 + Math.random() * size * 0.1;

    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    bg.addColorStop(0, 'rgba(210,210,210,0.3)');
    bg.addColorStop(0.5, 'rgba(190,190,190,0.15)');
    bg.addColorStop(1, 'rgba(170,170,170,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function initSmoke() {
  smokeGroup = new THREE.Group();
  smokeGroup.name = 'smoke';
  getScene().add(smokeGroup);

  smokeTexture = createSmokeTexture();
}

function spawnParticle() {
  if (particles.length >= MAX_PARTICLES) return;

  const mat = new THREE.SpriteMaterial({
    map: smokeTexture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.NormalBlending,
    color: new THREE.Color().setHSL(0, 0, 0.75 + Math.random() * 0.2),
  });

  const sprite = new THREE.Sprite(mat);

  const x = (Math.random() - 0.5) * GRILL_SIZE * 2.0;
  const z = (Math.random() - 0.5) * GRILL_SIZE * 2.0;
  sprite.position.set(x, 0.01, z);

  const startScale = 0.015 + Math.random() * 0.02;
  sprite.scale.setScalar(startScale);

  smokeGroup.add(sprite);

  particles.push({
    sprite,
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 0.015,
      0.02 + Math.random() * 0.025,
      (Math.random() - 0.5) * 0.015,
    ),
    life: 0,
    maxLife: 2.5 + Math.random() * 2.0,
    startScale,
    rotSpeed: (Math.random() - 0.5) * 1.5,
  });
}

export function updateSmoke(dt: number) {
  if (!smokeGroup) return;

  spawnTimer += dt;
  while (spawnTimer >= SPAWN_INTERVAL) {
    spawnParticle();
    spawnTimer -= SPAWN_INTERVAL;
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;

    const t = p.life / p.maxLife;

    if (t >= 1) {
      smokeGroup.remove(p.sprite);
      (p.sprite.material as THREE.Material).dispose();
      particles.splice(i, 1);
      continue;
    }

    // Rise and drift
    p.sprite.position.x += p.velocity.x * dt;
    p.sprite.position.y += p.velocity.y * dt;
    p.sprite.position.z += p.velocity.z * dt;

    // Slow rise speed slightly, increase horizontal wander
    p.velocity.y *= 0.998;
    p.velocity.x += (Math.random() - 0.5) * 0.001;
    p.velocity.z += (Math.random() - 0.5) * 0.001;

    // Grow as it rises — puff up
    const scale = p.startScale * (1 + t * 4);
    p.sprite.scale.setScalar(scale);

    // Rotate sprite material
    (p.sprite.material as THREE.SpriteMaterial).rotation += p.rotSpeed * dt;

    // Opacity: fade in quickly, stay, fade out slowly
    let opacity: number;
    if (t < 0.1) {
      opacity = (t / 0.1) * 0.13;
    } else if (t < 0.5) {
      opacity = 0.13;
    } else {
      opacity = 0.13 * (1 - (t - 0.5) / 0.5);
    }
    (p.sprite.material as THREE.SpriteMaterial).opacity = opacity;
  }
}
