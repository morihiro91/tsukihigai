import RAPIER from '@dimforge/rapier3d-compat';
import { createShell, Shell, updateShellOpen, syncTopCollider } from './shell';
import {
  removeRigidBody,
  registerPair,
  stepPhysics,
  syncMeshesToBodies,
  unregisterAllPairs,
  createDynamicBody,
  addCylinderCollider,
} from './physics';
import { getScene } from './scene';
import { playPlace, playCollapse } from './audio';
import { clearDebug, getDebugPrefillCount } from './debug';

export type GameState = 'TITLE' | 'PLACING' | 'DROPPING' | 'SETTLING' | 'GAME_OVER';

export interface CapturedPhoto {
  dataUrl: string;
  shellCount: number;
  timestamp: number;
}

interface GameData {
  state: GameState;
  shellCount: number;
  shells: Shell[];
  currentShell: Shell | null;
  settleTimer: number;
  stabilityTimer: number;
  photos: CapturedPhoto[];
  selectedPhotoIndex: number;
  highestY: number;
  groundY: number;
  onStateChange: ((state: GameState, shellCount: number) => void) | null;
}

const LANDING_GRACE_PERIOD = 0.5;
const STABILITY_CHECK_DURATION = 0.4;
const SETTLE_TIMEOUT = 5.0;
/** Shell fell this far below ground → completely off the konro */
const FALL_OFF_Y_MARGIN = 0.15;
const SETTLED_VELOCITY_THRESHOLD = 0.1;
const SPAWN_HEIGHT_OFFSET = 0.12;

const data: GameData = {
  state: 'TITLE',
  shellCount: 0,
  shells: [],
  currentShell: null,
  settleTimer: 0,
  stabilityTimer: 0,
  photos: [],
  selectedPhotoIndex: -1,
  highestY: 0,
  groundY: 0,
  onStateChange: null,
};

export function getGameState() { return data.state; }
export function getShellCount() { return data.shellCount; }
export function getPhotos() { return data.photos; }
export function getSelectedPhoto(): CapturedPhoto | null {
  if (data.selectedPhotoIndex >= 0 && data.selectedPhotoIndex < data.photos.length) {
    return data.photos[data.selectedPhotoIndex];
  }
  return data.photos.length > 0 ? data.photos[data.photos.length - 1] : null;
}
export function setSelectedPhotoIndex(index: number) {
  data.selectedPhotoIndex = index;
}

export function addPhoto(dataUrl: string) {
  data.photos.push({
    dataUrl,
    shellCount: data.shellCount,
    timestamp: Date.now(),
  });
  data.selectedPhotoIndex = data.photos.length - 1;
}

export function onStateChange(cb: (state: GameState, shellCount: number) => void) {
  data.onStateChange = cb;
}

function setState(state: GameState) {
  data.state = state;
  data.onStateChange?.(state, data.shellCount);
}

export function setGroundY(y: number) {
  data.groundY = y;
}

export function startGame() {
  const scene = getScene();
  for (const shell of data.shells) {
    scene.remove(shell.mesh);
    removeRigidBody(shell.rigidBody);
  }
  if (data.currentShell) {
    scene.remove(data.currentShell.mesh);
    removeRigidBody(data.currentShell.rigidBody);
  }
  unregisterAllPairs();
  clearDebug();

  data.shells = [];
  data.currentShell = null;
  data.shellCount = 0;
  data.settleTimer = 0;
  data.stabilityTimer = 0;
  data.photos = [];
  data.selectedPhotoIndex = -1;
  data.highestY = data.groundY;

  // Debug: auto-place N shells at start
  const prefill = getDebugPrefillCount();
  if (prefill > 0) {
    prefillShells(prefill);
  }

  spawnShell();
  setState('PLACING');
}

/** Instantly stack N shells for debugging */
function prefillShells(count: number) {
  for (let i = 0; i < count; i++) {
    const shell = createShell();
    const y = data.highestY + shell.params.bulgeHeight * 2 + 0.002;

    const angle = Math.random() * Math.PI * 2;
    const q = new RAPIER.Quaternion(0, Math.sin(angle / 2), 0, Math.cos(angle / 2));
    const offsetX = (Math.random() - 0.5) * 0.02;
    const offsetZ = (Math.random() - 0.5) * 0.02;

    // Switch to dynamic immediately
    removeRigidBody(shell.rigidBody);
    const dynBody = createDynamicBody(offsetX, y, offsetZ);
    dynBody.setRotation(q, true);
    addCylinderCollider(dynBody, shell.params.radius, shell.params.bulgeHeight);
    shell.rigidBody = dynBody;

    shell.mesh.position.set(offsetX, y, offsetZ);
    shell.mesh.quaternion.set(q.x, q.y, q.z, q.w);

    getScene().add(shell.mesh);
    registerPair(shell.mesh, shell.rigidBody);

    data.shells.push(shell);
    data.shellCount++;
    data.highestY = y;
  }

  // Let physics settle the prefilled shells
  for (let i = 0; i < 300; i++) {
    stepPhysics();
  }
  syncMeshesToBodies();

  // Update highestY from actual positions
  data.highestY = data.groundY;
  for (const shell of data.shells) {
    const sy = shell.rigidBody.translation().y;
    if (sy > data.highestY) data.highestY = sy;
  }
}

function spawnShell() {
  const shell = createShell();
  const spawnY = data.highestY + SPAWN_HEIGHT_OFFSET;

  const randomAngle = Math.random() * Math.PI * 2;
  const q = new RAPIER.Quaternion(0, Math.sin(randomAngle / 2), 0, Math.cos(randomAngle / 2));

  const startX = (Math.random() - 0.5) * 0.14;
  const startZ = (Math.random() - 0.5) * 0.14;
  shell.rigidBody.setTranslation(new RAPIER.Vector3(startX, spawnY, startZ), true);
  shell.rigidBody.setRotation(q, true);
  shell.mesh.position.set(startX, spawnY, startZ);
  shell.mesh.quaternion.set(q.x, q.y, q.z, q.w);

  getScene().add(shell.mesh);
  registerPair(shell.mesh, shell.rigidBody);

  data.currentShell = shell;
  resetWander();
}

export function dropShell() {
  if (data.state !== 'PLACING' || !data.currentShell) return;

  const shell = data.currentShell;
  const pos = shell.rigidBody.translation();
  const rot = shell.rigidBody.rotation();

  // Replace kinematic body with dynamic body
  removeRigidBody(shell.rigidBody);
  // Remove the pair for the old body
  unregisterAllPairs();

  const dynBody = createDynamicBody(pos.x, pos.y, pos.z);
  dynBody.setRotation(rot, true);
  addCylinderCollider(dynBody, shell.params.radius, shell.params.bulgeHeight);
  shell.rigidBody = dynBody;

  // Re-register all pairs
  for (const s of data.shells) {
    registerPair(s.mesh, s.rigidBody);
  }
  registerPair(shell.mesh, shell.rigidBody);

  data.settleTimer = 0;
  data.stabilityTimer = 0;
  setState('DROPPING');
}

/** Random wandering state — multiple overlapping waves for unpredictable motion */
const wander = {
  // Primary wave
  angleX1: 0, angleZ1: 0,
  speedX1: 0, speedZ1: 0,
  // Secondary wave (different frequency for irregularity)
  angleX2: 0, angleZ2: 0,
  speedX2: 0, speedZ2: 0,
  // Slow drift
  angleX3: 0, angleZ3: 0,
  speedX3: 0, speedZ3: 0,
  range: 0.15,
};

/** Randomize wander parameters for a new shell */
function resetWander() {
  wander.angleX1 = Math.random() * Math.PI * 2;
  wander.angleZ1 = Math.random() * Math.PI * 2;
  wander.speedX1 = 0.8 + Math.random() * 0.8;
  wander.speedZ1 = 0.9 + Math.random() * 0.7;
  wander.angleX2 = Math.random() * Math.PI * 2;
  wander.angleZ2 = Math.random() * Math.PI * 2;
  wander.speedX2 = 1.8 + Math.random() * 1.5;
  wander.speedZ2 = 2.0 + Math.random() * 1.3;
  wander.angleX3 = Math.random() * Math.PI * 2;
  wander.angleZ3 = Math.random() * Math.PI * 2;
  wander.speedX3 = 0.2 + Math.random() * 0.3;
  wander.speedZ3 = 0.15 + Math.random() * 0.25;
}


function bodySpeed(body: RAPIER.RigidBody): number {
  const v = body.linvel();
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Check if any shell has completely fallen off the konro.
 * Only triggers when the shell drops well below the grill surface.
 */
function checkFallenOff(): boolean {
  const fallThreshold = data.groundY - FALL_OFF_Y_MARGIN;
  const allShells = data.currentShell
    ? [...data.shells, data.currentShell]
    : data.shells;

  for (const shell of allShells) {
    if (shell.rigidBody.translation().y < fallThreshold) return true;
  }
  return false;
}

function isStable(): boolean {
  const allShells = data.currentShell
    ? [...data.shells, data.currentShell]
    : data.shells;

  for (const shell of allShells) {
    if (bodySpeed(shell.rigidBody) > SETTLED_VELOCITY_THRESHOLD) return false;
  }
  return true;
}

export function updateGame(dt: number) {
  if (data.state === 'TITLE' || data.state === 'GAME_OVER') return;

  // 1. Update kinematic positions BEFORE physics step
  if (data.state === 'PLACING' && data.currentShell) {
    // Wander
    wander.angleX1 += wander.speedX1 * dt;
    wander.angleZ1 += wander.speedZ1 * dt;
    wander.angleX2 += wander.speedX2 * dt;
    wander.angleZ2 += wander.speedZ2 * dt;
    wander.angleX3 += wander.speedX3 * dt;
    wander.angleZ3 += wander.speedZ3 * dt;

    const wx = (
      Math.sin(wander.angleX1) * 0.55 +
      Math.sin(wander.angleX2) * 0.25 +
      Math.sin(wander.angleX3) * 0.20
    ) * wander.range;
    const wz = (
      Math.sin(wander.angleZ1) * 0.55 +
      Math.sin(wander.angleZ2) * 0.25 +
      Math.sin(wander.angleZ3) * 0.20
    ) * wander.range;

    // Hover Y
    const t = performance.now() * 0.001;
    const baseY = data.highestY + SPAWN_HEIGHT_OFFSET;
    const hy = baseY + Math.sin(t * 2) * 0.005;

    data.currentShell.rigidBody.setNextKinematicTranslation(
      new RAPIER.Vector3(wx, hy, wz),
    );
  }

  // 2. Sync top-valve colliders to match open angle (before physics step)
  for (const shell of data.shells) {
    syncTopCollider(shell);
  }

  // 3. Physics step
  stepPhysics();
  syncMeshesToBodies();

  // 3. Update shell opening AFTER physics step (collider updates)
  for (const shell of data.shells) {
    updateShellOpen(shell, dt);
  }

  if (data.state === 'DROPPING' || data.state === 'SETTLING') {
    data.settleTimer += dt;

    // Always check if any shell fell off the konro
    if (checkFallenOff()) {
      playCollapse();
      setState('GAME_OVER');
      return;
    }

    if (data.state === 'DROPPING') {
      if (data.settleTimer > LANDING_GRACE_PERIOD) {
        data.stabilityTimer = 0;
        setState('SETTLING');
      }
      return;
    }

    if (data.settleTimer > SETTLE_TIMEOUT) {
      acceptShell();
      return;
    }

    if (isStable()) {
      data.stabilityTimer += dt;
      if (data.stabilityTimer > STABILITY_CHECK_DURATION) {
        acceptShell();
      }
    } else {
      data.stabilityTimer = 0;
    }
  }
}

function acceptShell() {
  if (!data.currentShell) return;

  data.shells.push(data.currentShell);
  data.shellCount++;

  const shellY = data.currentShell.rigidBody.translation().y;
  if (shellY > data.highestY) {
    data.highestY = shellY;
  }

  playPlace();

  data.currentShell = null;
  spawnShell();
  setState('PLACING');
}
