import RAPIER from '@dimforge/rapier3d-compat';
import { createShell, Shell } from './shell';
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
import { clearDebug } from './debug';

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
const FALL_OFF_Y_MARGIN = 0.08;
/** Shell beyond this XZ distance from center → out of bounds */
const GROUND_BOUNDARY = 0.25;
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

  spawnShell();
  setState('PLACING');
}

function spawnShell() {
  const shell = createShell();
  const spawnY = data.highestY + SPAWN_HEIGHT_OFFSET;

  const randomAngle = Math.random() * Math.PI * 2;
  const q = new RAPIER.Quaternion(0, Math.sin(randomAngle / 2), 0, Math.cos(randomAngle / 2));

  shell.rigidBody.setTranslation(new RAPIER.Vector3(0, spawnY, 0), true);
  shell.rigidBody.setRotation(q, true);
  shell.mesh.position.set(0, spawnY, 0);
  shell.mesh.quaternion.set(q.x, q.y, q.z, q.w);

  getScene().add(shell.mesh);
  registerPair(shell.mesh, shell.rigidBody);

  data.currentShell = shell;
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

export function moveShellX(offsetX: number) {
  if (data.state !== 'PLACING' || !data.currentShell) return;
  const clampedX = Math.max(-0.1, Math.min(0.1, offsetX));
  const pos = data.currentShell.rigidBody.translation();
  data.currentShell.rigidBody.setNextKinematicTranslation(
    new RAPIER.Vector3(clampedX, pos.y, pos.z),
  );
}

export function moveShellZ(offsetZ: number) {
  if (data.state !== 'PLACING' || !data.currentShell) return;
  const clampedZ = Math.max(-0.1, Math.min(0.1, offsetZ));
  const pos = data.currentShell.rigidBody.translation();
  data.currentShell.rigidBody.setNextKinematicTranslation(
    new RAPIER.Vector3(pos.x, pos.y, clampedZ),
  );
}

function bodySpeed(body: RAPIER.RigidBody): number {
  const v = body.linvel();
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * Check if any shell has left the ground area.
 * - Fell below ground (Y too low)
 * - Rolled/slid off the edge (XZ out of bounds)
 */
function checkFallenOff(): boolean {
  const fallThreshold = data.groundY - FALL_OFF_Y_MARGIN;
  const allShells = data.currentShell
    ? [...data.shells, data.currentShell]
    : data.shells;

  for (const shell of allShells) {
    const pos = shell.rigidBody.translation();
    // Fell below ground
    if (pos.y < fallThreshold) return true;
    // Rolled off the edge (out of ground bounds)
    if (Math.abs(pos.x) > GROUND_BOUNDARY || Math.abs(pos.z) > GROUND_BOUNDARY) return true;
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

  stepPhysics();
  syncMeshesToBodies();

  // Hover animation while placing
  if (data.state === 'PLACING' && data.currentShell) {
    const t = performance.now() * 0.001;
    const baseY = data.highestY + SPAWN_HEIGHT_OFFSET;
    const pos = data.currentShell.rigidBody.translation();
    data.currentShell.rigidBody.setNextKinematicTranslation(
      new RAPIER.Vector3(pos.x, baseY + Math.sin(t * 2) * 0.005, pos.z),
    );
  }

  if (data.state === 'DROPPING' || data.state === 'SETTLING') {
    data.settleTimer += dt;

    if (data.state === 'DROPPING') {
      if (data.settleTimer > LANDING_GRACE_PERIOD) {
        data.stabilityTimer = 0;
        setState('SETTLING');
      }
      return;
    }

    if (checkFallenOff()) {
      playCollapse();
      setState('GAME_OVER');
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
