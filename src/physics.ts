import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

let world: RAPIER.World;
let initialized = false;

export interface PhysicsPair {
  mesh: THREE.Object3D;
  rigidBody: RAPIER.RigidBody;
}

const pairs: PhysicsPair[] = [];

export async function initPhysics() {
  await RAPIER.init();
  initialized = true;

  world = new RAPIER.World(new RAPIER.Vector3(0, -9.82, 0));
  world.timestep = 1 / 120;

  // Ground collider (fixed)
  const groundDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0, 0);
  const groundBody = world.createRigidBody(groundDesc);
  const groundColliderDesc = RAPIER.ColliderDesc.cuboid(5, 0.01, 5)
    .setFriction(0.6)
    .setRestitution(0.02);
  world.createCollider(groundColliderDesc, groundBody);

  return world;
}

export function isPhysicsReady() { return initialized; }
export function getWorld() { return world; }

export function createStaticBody(x: number, y: number, z: number): RAPIER.RigidBody {
  const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
  return world.createRigidBody(desc);
}

export function createDynamicBody(x: number, y: number, z: number): RAPIER.RigidBody {
  const desc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(x, y, z)
    .setLinearDamping(0.4)
    .setAngularDamping(0.5)
    .setCcdEnabled(true); // Continuous collision detection for thin shells
  return world.createRigidBody(desc);
}

export function createKinematicBody(x: number, y: number, z: number): RAPIER.RigidBody {
  const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(x, y, z);
  return world.createRigidBody(desc);
}

export function addCylinderCollider(
  body: RAPIER.RigidBody,
  radius: number,
  halfHeight: number,
): RAPIER.Collider {
  const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius)
    .setFriction(0.5)
    .setRestitution(0.01)
    .setDensity(800);
  return world.createCollider(desc, body);
}

export function removeRigidBody(body: RAPIER.RigidBody) {
  world.removeRigidBody(body);
}

export function registerPair(mesh: THREE.Object3D, rigidBody: RAPIER.RigidBody) {
  pairs.push({ mesh, rigidBody });
}

export function unregisterAllPairs() {
  pairs.length = 0;
}

export function stepPhysics() {
  world.step();
}

export function syncMeshesToBodies() {
  for (const { mesh, rigidBody } of pairs) {
    const pos = rigidBody.translation();
    const rot = rigidBody.rotation();
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
  }
}
