import * as THREE from 'three';
import { getScene, getCamera, getRenderer } from './scene';

declare global {
  interface Window {
    XR8: any;
    XRExtras: any;
  }
}

let arActive = false;
let surfacePlaced = false;
let planeFound = false;
let anchorPosition = new THREE.Vector3();
let reticle: THREE.Mesh | null = null;
let onSurfaceTapCallback: ((x: number, y: number, z: number) => void) | null = null;
let onPlaneFoundCallback: (() => void) | null = null;

export function isARAvailable(): boolean {
  return typeof window.XR8 !== 'undefined';
}

export function onSurfaceTap(cb: (x: number, y: number, z: number) => void) {
  onSurfaceTapCallback = cb;
}

export function onPlaneFound(cb: () => void) {
  onPlaneFoundCallback = cb;
}

export function isSurfacePlaced(): boolean {
  return surfacePlaced;
}

export function isPlaneFound(): boolean {
  return planeFound;
}

export function getAnchorPosition(): THREE.Vector3 {
  return anchorPosition.clone();
}

function createReticle(): THREE.Mesh {
  const ring = new THREE.RingGeometry(0.06, 0.08, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x00ff88,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
  });
  const mesh = new THREE.Mesh(ring, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return mesh;
}

export function initARSession() {
  if (!isARAvailable()) return;

  const XR8 = window.XR8;
  const scene = getScene();
  const camera = getCamera();
  const renderer = getRenderer();

  scene.background = null;

  const canvas = renderer.domElement;

  // Reticle for plane visualization
  reticle = createReticle();
  scene.add(reticle);

  XR8.XrController.configure({
    disableWorldTracking: false,
    enableLighting: true,
    scale: 'responsive',
  });

  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(),
    XR8.Threejs.pipelineModule(),
    XR8.XrController.pipelineModule(),
    XR8.CanvasScreenshot.pipelineModule(),
    {
      name: 'tsukihigai-ar',
      listeners: [
        // Listen for plane detection events from XrController
        {
          event: 'reality.projectwaypoint',
          process: ({ detail }: any) => {
            // Ground plane waypoint detected — update reticle position
            if (!surfacePlaced && reticle && detail.position) {
              reticle.visible = true;
              reticle.position.set(
                detail.position.x,
                detail.position.y,
                detail.position.z,
              );
              if (!planeFound) {
                planeFound = true;
                onPlaneFoundCallback?.();
              }
            }
          },
        },
      ],
      onStart: () => {
        arActive = true;
        canvas.addEventListener('touchstart', handleARTouch);
        canvas.addEventListener('click', handleARClick);
      },
      onUpdate: ({ processCpuResult }: any) => {
        if (!processCpuResult) return;

        // --- Plane detection from reality data ---
        const { reality } = processCpuResult;
        if (reality) {
          // Detected planes (horizontal surfaces)
          if (reality.detectedPlanes && reality.detectedPlanes.length > 0) {
            if (!planeFound) {
              planeFound = true;
              onPlaneFoundCallback?.();
            }
          }

          // Update reticle from screen center hit test if not yet placed
          if (!surfacePlaced && reticle) {
            const hits = XR8.XrController.hitTest(0.5, 0.5, ['GROUND_PLANE', 'FEATURE_POINT']);
            if (hits.length > 0) {
              const hit = hits[0];
              reticle.visible = true;
              reticle.position.set(hit.position.x, hit.position.y, hit.position.z);
              if (!planeFound) {
                planeFound = true;
                onPlaneFoundCallback?.();
              }
            }
          }

          // Camera-based lighting estimation
          if (reality.lighting) {
            const dirLight = scene.getObjectByName('ar-dirlight') as THREE.DirectionalLight;
            if (dirLight) {
              dirLight.intensity = reality.lighting.exposure || 1.0;
              if (reality.lighting.temperature) {
                dirLight.color.setHSL(0, 0, reality.lighting.temperature / 6500);
              }
            }
          }
        }
      },
      onCanvasSizeChange: () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      },
    },
  ]);

  // AR directional light
  const arDirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  arDirLight.name = 'ar-dirlight';
  arDirLight.position.set(1, 2, 1);
  arDirLight.castShadow = true;
  arDirLight.shadow.mapSize.set(512, 512);
  scene.add(arDirLight);

  XR8.run({ canvas });
}

function performHitTest(screenX: number, screenY: number) {
  const XR8 = window.XR8;
  const x = screenX / window.innerWidth;
  const y = screenY / window.innerHeight;
  // Prioritize GROUND_PLANE (detected planes), then fall back to feature points
  const hits = XR8.XrController.hitTest(x, y, ['GROUND_PLANE', 'FEATURE_POINT']);
  return hits.length > 0 ? hits[0] : null;
}

function handleARTouch(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  handleARInput(touch.clientX, touch.clientY);
}

function handleARClick(e: MouseEvent) {
  handleARInput(e.clientX, e.clientY);
}

function handleARInput(screenX: number, screenY: number) {
  const target = document.elementFromPoint(screenX, screenY);
  if (target && target.closest('#ui-root')) return;

  // Require plane detection before placing
  if (!planeFound) return;

  const hit = performHitTest(screenX, screenY);
  if (!hit) return;

  const pos = hit.position;
  if (!surfacePlaced) {
    // Anchor the game surface on detected plane
    anchorPosition.set(pos.x, pos.y, pos.z);
    surfacePlaced = true;
    // Hide reticle after placement
    if (reticle) reticle.visible = false;
    onSurfaceTapCallback?.(pos.x, pos.y, pos.z);
  } else {
    onSurfaceTapCallback?.(pos.x, pos.y, pos.z);
  }
}

export async function captureARScreenshot(): Promise<string> {
  if (isARAvailable() && arActive) {
    try {
      const data = await window.XR8.CanvasScreenshot.takeScreenshot();
      return 'data:image/jpeg;base64,' + data;
    } catch {
      // fall through
    }
  }
  const renderer = getRenderer();
  return renderer.domElement.toDataURL('image/png');
}

export function isARActive(): boolean {
  return arActive;
}

export function resetARPlacement() {
  surfacePlaced = false;
  planeFound = false;
  anchorPosition.set(0, 0, 0);
  if (reticle) reticle.visible = false;
}

export function stopARSession() {
  if (isARAvailable() && arActive) {
    const canvas = getRenderer().domElement;
    canvas.removeEventListener('touchstart', handleARTouch);
    canvas.removeEventListener('click', handleARClick);
    window.XR8.stop();
    arActive = false;
  }
}
