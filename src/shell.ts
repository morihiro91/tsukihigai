import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  createKinematicBody,
  addCylinderCollider,
  addCylinderColliderWithRotation,
  removeCollider,
} from './physics';

interface ShellParams {
  radius: number;
  bulgeHeight: number;
  earSize: number;
  scale: number;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateParams(): ShellParams {
  const scale = randomInRange(0.6, 1.6);
  return {
    radius: 0.045 * scale,
    bulgeHeight: 0.008 * scale,
    earSize: 0.012 * scale,
    scale,
  };
}

function createValveGeometry(
  params: ShellParams,
  isTop: boolean,
): THREE.BufferGeometry {
  const { radius, bulgeHeight, earSize } = params;
  const radialSegments = 48;
  const concentricSegments = 20;
  const sign = isTop ? 1 : -1;

  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  vertices.push(0, sign * bulgeHeight, 0);
  uvs.push(0.5, 0.5);

  for (let ci = 1; ci <= concentricSegments; ci++) {
    const t = ci / concentricSegments;
    const r = radius * t;

    for (let ri = 0; ri < radialSegments; ri++) {
      const angle = (ri / radialSegments) * Math.PI * 2;
      const x = r * Math.cos(angle);
      const z = r * Math.sin(angle);
      const dome = bulgeHeight * Math.cos((t * Math.PI) / 2) ** 1.8;
      const growthLine = Math.sin(t * Math.PI * 30) * 0.0002 * t;
      const y = sign * (dome + growthLine);

      vertices.push(x, y, z);
      uvs.push(
        0.5 + (Math.cos(angle) * t) / 2,
        0.5 + (Math.sin(angle) * t) / 2,
      );
    }
  }

  const earBaseAngle = Math.PI / 2;
  for (const side of [-1, 1]) {
    const earAngle = earBaseAngle + side * 0.3;
    const ex = (radius + earSize) * Math.cos(earAngle);
    const ez = (radius + earSize) * Math.sin(earAngle);
    const ey = sign * bulgeHeight * 0.15;
    vertices.push(ex, ey, ez);
    uvs.push(0.5 + Math.cos(earAngle) * 0.55, 0.5 + Math.sin(earAngle) * 0.55);
  }
  const earLeftIdx = 1 + concentricSegments * radialSegments;
  const earRightIdx = earLeftIdx + 1;

  for (let ri = 0; ri < radialSegments; ri++) {
    const next = (ri + 1) % radialSegments;
    if (isTop) {
      indices.push(0, 1 + ri, 1 + next);
    } else {
      indices.push(0, 1 + next, 1 + ri);
    }
  }

  for (let ci = 1; ci < concentricSegments; ci++) {
    const ringStart = 1 + (ci - 1) * radialSegments;
    const nextRingStart = 1 + ci * radialSegments;
    for (let ri = 0; ri < radialSegments; ri++) {
      const next = (ri + 1) % radialSegments;
      const a = ringStart + ri;
      const b = ringStart + next;
      const c = nextRingStart + ri;
      const d = nextRingStart + next;
      if (isTop) {
        indices.push(a, c, b);
        indices.push(b, c, d);
      } else {
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }
  }

  const outerRingStart = 1 + (concentricSegments - 1) * radialSegments;
  for (let earIdx = 0; earIdx < 2; earIdx++) {
    const eIdx = earIdx === 0 ? earLeftIdx : earRightIdx;
    const side = earIdx === 0 ? -1 : 1;
    const targetAngle = earBaseAngle + side * 0.3;
    let closestRI = 0;
    let minDiff = Infinity;
    for (let ri = 0; ri < radialSegments; ri++) {
      const a = (ri / radialSegments) * Math.PI * 2;
      const diff = Math.abs(((a - targetAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff < minDiff) { minDiff = diff; closestRI = ri; }
    }
    const ri1 = closestRI;
    const ri2 = (closestRI + (side > 0 ? 1 : radialSegments - 1)) % radialSegments;
    if (isTop) {
      indices.push(outerRingStart + ri1, eIdx, outerRingStart + ri2);
    } else {
      indices.push(outerRingStart + ri1, outerRingStart + ri2, eIdx);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createValveMesh(
  params: ShellParams,
  isTop: boolean,
): THREE.Mesh {
  const geom = createValveGeometry(params, isTop);

  // Apply vertex colors
  const pos = geom.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);

  if (isTop) {
    // Top valve (opens upward) = yellowish white (right shell)
    const color = new THREE.Color(0xfff5e0);
    const colorEdge = new THREE.Color(0xf0dbb8);
    for (let i = 0; i < pos.count; i++) {
      const dist = Math.sqrt(pos.getX(i) ** 2 + pos.getZ(i) ** 2) / params.radius;
      const c = color.clone().lerp(colorEdge, dist * 0.5);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  } else {
    // Bottom valve (faces down / sits on grill) = deep crimson (left shell)
    const color = new THREE.Color(0x8b1a1a);
    const colorLight = new THREE.Color(0xc75050);
    for (let i = 0; i < pos.count; i++) {
      const dist = Math.sqrt(pos.getX(i) ** 2 + pos.getZ(i) ** 2) / params.radius;
      const c = colorLight.clone().lerp(color, dist * 0.8);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
  }

  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    clearcoat: 0.4,
    clearcoatRoughness: 0.15,
    roughness: 0.25,
    metalness: 0.05,
    sheen: 0.3,
    sheenRoughness: 0.3,
    sheenColor: new THREE.Color(0xffddcc),
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geom, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export interface Shell {
  mesh: THREE.Group;
  topValve: THREE.Mesh;
  bottomValve: THREE.Mesh;
  topPivot: THREE.Group;
  rigidBody: RAPIER.RigidBody;
  params: ShellParams;
  openAngle: number;
  targetAngle: number;
  settledTime: number;
  /** Per-shell random open parameters */
  willOpen: boolean;
  openDelay: number;
  openSpeed: number;
  maxOpenAngle: number;
  /** Current top-valve collider (recreated as shell opens) */
  topCollider: RAPIER.Collider | null;
  /** Angle at which the top collider was last built */
  colliderAngle: number;
}

export function createShell(): Shell {
  const params = generateParams();

  const topValve = createValveMesh(params, true);
  const bottomValve = createValveMesh(params, false);

  // Top valve pivots at the hinge (back edge, +Z direction)
  // Move top valve so hinge point is at origin of pivot group
  const hingeOffset = params.radius * 0.9;
  topValve.position.z = -hingeOffset;

  const topPivot = new THREE.Group();
  topPivot.position.z = hingeOffset; // Place pivot at hinge position
  topPivot.add(topValve);

  const mesh = new THREE.Group();
  mesh.add(bottomValve);
  mesh.add(topPivot);

  const rigidBody = createKinematicBody(0, 0, 0);
  addCylinderCollider(rigidBody, params.radius, params.bulgeHeight);

  return {
    mesh,
    topValve,
    bottomValve,
    topPivot,
    rigidBody,
    params,
    openAngle: 0,
    targetAngle: 0,
    settledTime: 0,
    willOpen: Math.random() > 0.25,
    openDelay: 0.5 + Math.random() * 8.0,
    openSpeed: 0.1 + Math.random() * 0.5,
    maxOpenAngle: (Math.PI * 0.08) + Math.random() * (Math.PI * 2 / 9 - Math.PI * 0.08),
    topCollider: null,
    colliderAngle: 0,
  };
}

/** Minimum angle change before rebuilding the top collider */
const COLLIDER_UPDATE_THRESHOLD = 0.03;

/**
 * Update the shell opening animation (visual only).
 * Call each frame AFTER stepPhysics for settled shells.
 */
export function updateShellOpen(shell: Shell, dt: number) {
  if (!shell.willOpen) return;

  shell.settledTime += dt;

  if (shell.settledTime > shell.openDelay) {
    shell.targetAngle = Math.min(
      shell.maxOpenAngle,
      (shell.settledTime - shell.openDelay) * shell.openSpeed,
    );
  }

  shell.openAngle += (shell.targetAngle - shell.openAngle) * 3.0 * dt;
  shell.topPivot.rotation.x = shell.openAngle;
}

/**
 * Sync the top-valve collider to match the current open angle.
 * Removes the old collider and creates a new one at the correct position/rotation.
 * Must be called BEFORE stepPhysics() to avoid Rapier borrow errors.
 */
export function syncTopCollider(shell: Shell) {
  if (shell.openAngle < 0.01) return;
  if (Math.abs(shell.openAngle - shell.colliderAngle) < COLLIDER_UPDATE_THRESHOLD) return;

  // Remove old top collider
  if (shell.topCollider) {
    removeCollider(shell.topCollider);
    shell.topCollider = null;
  }

  const angle = shell.openAngle;
  const hinge = shell.params.radius * 0.9;
  const r = shell.params.radius;
  const bh = shell.params.bulgeHeight;

  // Center of the rotated top valve disc
  const cy = Math.sin(angle) * hinge * 0.5;
  const cz = hinge - Math.cos(angle) * hinge * 0.5;

  // Quaternion for rotation around local X axis
  const halfA = angle / 2;

  shell.topCollider = addCylinderColliderWithRotation(
    shell.rigidBody,
    r,
    bh,
    { x: 0, y: cy + bh, z: cz },
    { x: Math.sin(halfA), y: 0, z: 0, w: Math.cos(halfA) },
  );

  shell.colliderAngle = angle;
}
