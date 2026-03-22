import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getScene, getCamera, getRenderer } from './scene';

let controls: OrbitControls;
let videoElement: HTMLVideoElement | null = null;

export async function initDesktopSession() {
  const scene = getScene();
  const camera = getCamera();
  const renderer = getRenderer();

  // Start camera feed as background
  await startCameraBackground();

  // BBQ grill / konro
  const grillGroup = new THREE.Group();

  const grillSize = 0.25;
  const grillHeight = 0.08;
  const wallThickness = 0.012;

  // Outer body (dark metal box)
  const bodyGeom = new THREE.BoxGeometry(grillSize * 2 + wallThickness * 2, grillHeight, grillSize * 2 + wallThickness * 2);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.7,
    metalness: 0.6,
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = -grillHeight / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  grillGroup.add(body);

  // Inner cavity (slightly recessed, dark)
  const innerGeom = new THREE.BoxGeometry(grillSize * 2 - 0.01, grillHeight - 0.01, grillSize * 2 - 0.01);
  const innerMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.9,
    metalness: 0.2,
  });
  const inner = new THREE.Mesh(innerGeom, innerMat);
  inner.position.y = -grillHeight / 2 + 0.005;
  grillGroup.add(inner);

  // Grill grate (metal rods)
  const rodMat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.4,
    metalness: 0.8,
  });
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
  // Cross rods (perpendicular, same density as main rods)
  const crossCount = rodCount;
  const crossSpacing = (grillSize * 2 - 0.02) / (crossCount - 1);
  for (let i = 0; i < crossCount; i++) {
    const crossGeom = new THREE.CylinderGeometry(rodRadius, rodRadius, grillSize * 2 - 0.02, 6);
    crossGeom.rotateX(Math.PI / 2);
    const cross = new THREE.Mesh(crossGeom, rodMat);
    cross.position.set(-grillSize + 0.01 + i * crossSpacing, -0.001, 0);
    grillGroup.add(cross);
  }

  // Rim / lip (top edge)
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x444444,
    roughness: 0.5,
    metalness: 0.7,
  });
  const rimWidth = 0.015;
  const rimThick = 0.008;
  const fullW = grillSize * 2 + wallThickness * 2;
  // 4 rim pieces
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

  // Warm glow light inside konro
  const coalLight = new THREE.PointLight(0xff4400, 0.3, 0.4);
  coalLight.position.set(0, -0.03, 0);
  grillGroup.add(coalLight);

  // Small legs
  const legMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.5 });
  const legPositions = [
    [-grillSize - 0.005, -grillSize - 0.005],
    [ grillSize + 0.005, -grillSize - 0.005],
    [-grillSize - 0.005,  grillSize + 0.005],
    [ grillSize + 0.005,  grillSize + 0.005],
  ];
  for (const [lx, lz] of legPositions) {
    const legGeom = new THREE.CylinderGeometry(0.006, 0.006, 0.04, 8);
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(lx, -grillHeight - 0.02, lz);
    leg.castShadow = true;
    grillGroup.add(leg);
  }

  scene.add(grillGroup);

  // Orbit controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.1, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 0.2;
  controls.maxDistance = 1.5;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.update();
}

async function startCameraBackground() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });

    videoElement = document.createElement('video');
    videoElement.srcObject = stream;
    videoElement.setAttribute('playsinline', '');
    videoElement.setAttribute('autoplay', '');
    videoElement.muted = true;
    videoElement.id = 'camera-feed';
    videoElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      object-fit: cover;
      z-index: -1;
      transform: scaleX(-1);
    `;
    document.body.prepend(videoElement);
    await videoElement.play();
  } catch (err) {
    console.warn('Camera not available, using fallback background:', err);
    // If camera fails, set a gradient background on body
    document.body.style.background = 'linear-gradient(180deg, #87ceeb 0%, #e0c9a6 100%)';
  }
}

export function updateDesktopControls() {
  controls?.update();
}

export function captureDesktopScreenshot(canvas: HTMLCanvasElement): string {
  // Composite camera feed + 3D canvas into one image
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = canvas.width;
  compositeCanvas.height = canvas.height;
  const ctx = compositeCanvas.getContext('2d')!;

  // Draw camera feed first
  if (videoElement && videoElement.readyState >= 2) {
    ctx.save();
    // Mirror to match the CSS transform
    ctx.translate(compositeCanvas.width, 0);
    ctx.scale(-1, 1);
    // Cover the canvas area
    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    const canvasAspect = compositeCanvas.width / compositeCanvas.height;
    const videoAspect = vw / vh;
    let sx = 0, sy = 0, sw = vw, sh = vh;
    if (videoAspect > canvasAspect) {
      sw = vh * canvasAspect;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / canvasAspect;
      sy = (vh - sh) / 2;
    }
    ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, compositeCanvas.width, compositeCanvas.height);
    ctx.restore();
  }

  // Draw 3D canvas on top
  ctx.drawImage(canvas, 0, 0);

  return compositeCanvas.toDataURL('image/png');
}
