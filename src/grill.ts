import * as THREE from 'three';
import { getScene } from './scene';

let grillGroup: THREE.Group | null = null;

export function getGrillGroup(): THREE.Group | null {
  return grillGroup;
}

export function createGrill(): THREE.Group {
  grillGroup = new THREE.Group();

  const grillSize = 0.18;
  const grillHeight = 0.08;
  const wallThickness = 0.012;

  // Outer body
  const bodyGeom = new THREE.BoxGeometry(grillSize * 2 + wallThickness * 2, grillHeight, grillSize * 2 + wallThickness * 2);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7, metalness: 0.6 });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = -grillHeight / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  grillGroup.add(body);

  // Inner cavity
  const innerGeom = new THREE.BoxGeometry(grillSize * 2 - 0.01, grillHeight - 0.01, grillSize * 2 - 0.01);
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, metalness: 0.2 });
  const inner = new THREE.Mesh(innerGeom, innerMat);
  inner.position.y = -grillHeight / 2 + 0.005;
  grillGroup.add(inner);

  // Grill grate
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.4, metalness: 0.8 });
  const rodCount = 28;
  const rodSpacing = (grillSize * 2 - 0.02) / (rodCount - 1);
  const rodRadius = 0.0018;
  for (let i = 0; i < rodCount; i++) {
    const rodGeom = new THREE.CylinderGeometry(rodRadius, rodRadius, grillSize * 2 - 0.02, 6);
    rodGeom.rotateZ(Math.PI / 2);
    const rod = new THREE.Mesh(rodGeom, rodMat);
    rod.position.set(0, 0.001, -grillSize + 0.01 + i * rodSpacing);
    rod.castShadow = true;
    grillGroup.add(rod);
  }
  const crossCount = rodCount;
  const crossSpacing = (grillSize * 2 - 0.02) / (crossCount - 1);
  for (let i = 0; i < crossCount; i++) {
    const crossGeom = new THREE.CylinderGeometry(rodRadius, rodRadius, grillSize * 2 - 0.02, 6);
    crossGeom.rotateX(Math.PI / 2);
    const cross = new THREE.Mesh(crossGeom, rodMat);
    cross.position.set(-grillSize + 0.01 + i * crossSpacing, -0.001, 0);
    grillGroup.add(cross);
  }

  // Rim
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 0.7 });
  const rimWidth = 0.015;
  const rimThick = 0.008;
  const fullW = grillSize * 2 + wallThickness * 2;
  for (const [sx, sz, rw, rd] of [
    [0, -grillSize - wallThickness, fullW, rimWidth],
    [0,  grillSize + wallThickness, fullW, rimWidth],
    [-grillSize - wallThickness, 0, rimWidth, fullW - rimWidth * 2],
    [ grillSize + wallThickness, 0, rimWidth, fullW - rimWidth * 2],
  ] as [number, number, number, number][]) {
    const rimGeom = new THREE.BoxGeometry(rw, rimThick, rd);
    const rim = new THREE.Mesh(rimGeom, rimMat);
    rim.position.set(sx, rimThick / 2, sz);
    grillGroup.add(rim);
  }

  // Glow light
  const coalLight = new THREE.PointLight(0xff4400, 0.3, 0.4);
  coalLight.position.set(0, -0.03, 0);
  grillGroup.add(coalLight);

  // Legs
  const legMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.5 });
  for (const [lx, lz] of [
    [-grillSize - 0.005, -grillSize - 0.005],
    [ grillSize + 0.005, -grillSize - 0.005],
    [-grillSize - 0.005,  grillSize + 0.005],
    [ grillSize + 0.005,  grillSize + 0.005],
  ]) {
    const legGeom = new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8);
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(lx, -grillHeight - 0.02, lz);
    leg.castShadow = true;
    grillGroup.add(leg);
  }

  getScene().add(grillGroup);
  return grillGroup;
}

/** Place the grill at a specific world position (for AR placement) */
export function placeGrill(x: number, y: number, z: number) {
  if (grillGroup) {
    grillGroup.position.set(x, y, z);
  }
}
