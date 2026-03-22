import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  createKinematicBody,
  addCylinderCollider,
} from './physics';

interface ShellParams {
  /** Shell radius (half of shell length) in meters. Real: ~60mm */
  radius: number;
  /** Maximum height of the shell bulge. Real shells are shallow */
  bulgeHeight: number;
  /** Small ear-like projection size */
  earSize: number;
  /** Subtle size variation per shell */
  scale: number;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateParams(): ShellParams {
  const scale = randomInRange(0.9, 1.1);
  return {
    radius: 0.045 * scale,
    bulgeHeight: 0.008 * scale,
    earSize: 0.012 * scale,
    scale,
  };
}

/**
 * Creates a single valve (half shell) of a Tsukihigai.
 * Nearly circular disc with a gentle dome-like bulge peaking at the umbo (hinge).
 * Surface is smooth with only faint concentric growth lines.
 */
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

  // Center vertex (umbo / hinge point — the peak)
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

  // Ear projections
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

  // Triangles: center to first ring
  for (let ri = 0; ri < radialSegments; ri++) {
    const next = (ri + 1) % radialSegments;
    if (isTop) {
      indices.push(0, 1 + ri, 1 + next);
    } else {
      indices.push(0, 1 + next, 1 + ri);
    }
  }

  // Triangles: ring to ring
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

  // Ear triangles
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

function createShellGeometry(params: ShellParams): THREE.BufferGeometry {
  const topGeom = createValveGeometry(params, true);
  const bottomGeom = createValveGeometry(params, false);

  const merged = new THREE.BufferGeometry();
  const topPos = topGeom.getAttribute('position');
  const botPos = bottomGeom.getAttribute('position');
  const topIdx = topGeom.getIndex()!;
  const botIdx = bottomGeom.getIndex()!;

  const totalVerts = topPos.count + botPos.count;
  const positions = new Float32Array(totalVerts * 3);
  const colors = new Float32Array(totalVerts * 3);

  // Top valve (left shell = deep crimson)
  const topColor = new THREE.Color(0x8b1a1a);
  const topColorLight = new THREE.Color(0xc75050);
  for (let i = 0; i < topPos.count; i++) {
    positions[i * 3] = topPos.getX(i);
    positions[i * 3 + 1] = topPos.getY(i);
    positions[i * 3 + 2] = topPos.getZ(i);

    const dist = Math.sqrt(topPos.getX(i) ** 2 + topPos.getZ(i) ** 2) / params.radius;
    const c = topColorLight.clone().lerp(topColor, dist * 0.8);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  // Bottom valve (right shell = yellowish white)
  const botColor = new THREE.Color(0xfff5e0);
  const botColorEdge = new THREE.Color(0xf0dbb8);
  const offset = topPos.count;
  for (let i = 0; i < botPos.count; i++) {
    positions[(offset + i) * 3] = botPos.getX(i);
    positions[(offset + i) * 3 + 1] = botPos.getY(i);
    positions[(offset + i) * 3 + 2] = botPos.getZ(i);

    const dist = Math.sqrt(botPos.getX(i) ** 2 + botPos.getZ(i) ** 2) / params.radius;
    const c = botColor.clone().lerp(botColorEdge, dist * 0.5);
    colors[(offset + i) * 3] = c.r;
    colors[(offset + i) * 3 + 1] = c.g;
    colors[(offset + i) * 3 + 2] = c.b;
  }

  const topIndices = Array.from(topIdx.array);
  const botIndices = Array.from(botIdx.array).map(i => i + offset);
  const allIndices = [...topIndices, ...botIndices];

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(allIndices);
  merged.computeVertexNormals();

  topGeom.dispose();
  bottomGeom.dispose();

  return merged;
}

function createShellMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
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
}

export interface Shell {
  mesh: THREE.Mesh;
  rigidBody: RAPIER.RigidBody;
  params: ShellParams;
}

export function createShell(): Shell {
  const params = generateParams();
  const geometry = createShellGeometry(params);
  const material = createShellMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // Create as kinematic initially; switched to dynamic on drop
  const rigidBody = createKinematicBody(0, 0, 0);
  addCylinderCollider(rigidBody, params.radius, params.bulgeHeight);

  return { mesh, rigidBody, params };
}
