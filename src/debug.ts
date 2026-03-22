import * as THREE from 'three';
import { getScene } from './scene';
import { getWorld } from './physics';
import { getGameState } from './game';

let enabled = false;
let prefillCount = 0;
let debugMesh: THREE.LineSegments | null = null;
let hudEl: HTMLDivElement | null = null;

export function isDebugEnabled(): boolean {
  return enabled;
}

/** Number of shells to auto-place at game start (from ?debug=N) */
export function getDebugPrefillCount(): number {
  return prefillCount;
}

export function initDebug() {
  const params = new URLSearchParams(window.location.search);
  enabled = params.has('debug');
  if (!enabled) return;

  const val = params.get('debug');
  prefillCount = val ? parseInt(val, 10) || 0 : 0;

  hudEl = document.createElement('div');
  hudEl.id = 'debug-hud';
  hudEl.style.cssText = `
    position: fixed;
    top: 5rem;
    left: 0.5rem;
    background: rgba(0,0,0,0.7);
    color: #0f0;
    font-family: monospace;
    font-size: 11px;
    padding: 6px 10px;
    border-radius: 4px;
    z-index: 100;
    pointer-events: none;
    white-space: pre;
    line-height: 1.5;
  `;
  document.body.appendChild(hudEl);

  console.log('[DEBUG] Rapier physics debug mode enabled');
}

export function updateDebug() {
  if (!enabled) return;

  const world = getWorld();
  const scene = getScene();

  // Use Rapier's built-in debug renderer
  const buffers = world.debugRender();
  const vertices = buffers.vertices;
  const colors = buffers.colors;

  // Remove old debug mesh
  if (debugMesh) {
    scene.remove(debugMesh);
    debugMesh.geometry.dispose();
    (debugMesh.material as THREE.Material).dispose();
  }

  // Create new debug lines from Rapier's output
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    depthTest: false,
    transparent: true,
    opacity: 0.8,
  });

  debugMesh = new THREE.LineSegments(geometry, material);
  debugMesh.name = 'rapier-debug';
  scene.add(debugMesh);

  // Update HUD
  if (hudEl) {
    const state = getGameState();
    const numBodies = world.bodies.len();
    const numColliders = world.colliders.len();

    let bodyInfo: string[] = [];
    world.bodies.forEach((body) => {
      if (body.isDynamic()) {
        const pos = body.translation();
        const vel = body.linvel();
        const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
        bodyInfo.push(
          `dyn pos:(${pos.x.toFixed(3)},${pos.y.toFixed(3)},${pos.z.toFixed(3)}) vel:${speed.toFixed(3)}`
        );
      }
    });

    hudEl.textContent = [
      `state: ${state}`,
      `bodies: ${numBodies} colliders: ${numColliders}`,
      ...bodyInfo,
    ].join('\n');
  }
}

export function clearDebug() {
  if (!enabled) return;
  if (debugMesh) {
    getScene().remove(debugMesh);
    debugMesh.geometry.dispose();
    (debugMesh.material as THREE.Material).dispose();
    debugMesh = null;
  }
}
