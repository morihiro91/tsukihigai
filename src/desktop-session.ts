import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { getScene, getCamera, getRenderer } from './scene';

let controls: OrbitControls;
let videoElement: HTMLVideoElement | null = null;
let useDeviceOrientation = false;
let orientationAlpha = 0;
let orientationBeta = 0;
let orientationGamma = 0;

export async function initDesktopSession() {
  const camera = getCamera();
  const renderer = getRenderer();

  await startCameraBackground();

  // Try device orientation for mobile (AR-like camera control)
  if (window.DeviceOrientationEvent) {
    try {
      // iOS 13+ requires permission
      const doe = DeviceOrientationEvent as any;
      if (typeof doe.requestPermission === 'function') {
        const permission = await doe.requestPermission();
        if (permission === 'granted') {
          enableDeviceOrientation();
        } else {
          setupOrbitControls(camera, renderer);
        }
      } else {
        // Android or older iOS — just listen
        enableDeviceOrientation();
      }
    } catch {
      setupOrbitControls(camera, renderer);
    }
  } else {
    setupOrbitControls(camera, renderer);
  }
}

function enableDeviceOrientation() {
  useDeviceOrientation = true;
  window.addEventListener('deviceorientation', (e) => {
    orientationAlpha = e.alpha ?? 0;
    orientationBeta = e.beta ?? 0;
    orientationGamma = e.gamma ?? 0;
  });
}

function setupOrbitControls(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer) {
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
    `;
    document.body.prepend(videoElement);
    await videoElement.play();
  } catch (err) {
    console.warn('Camera not available, using fallback background:', err);
    document.body.style.background = 'linear-gradient(180deg, #87ceeb 0%, #e0c9a6 100%)';
  }
}

export function updateDesktopControls() {
  if (useDeviceOrientation) {
    updateDeviceOrientationCamera();
  } else {
    controls?.update();
  }
}

function updateDeviceOrientationCamera() {
  const camera = getCamera();
  // Convert device orientation to camera rotation
  // beta: front-back tilt (-180..180), gamma: left-right tilt (-90..90)
  const beta = THREE.MathUtils.degToRad(orientationBeta);
  const gamma = THREE.MathUtils.degToRad(orientationGamma);

  // Camera orbits around origin based on device tilt
  const distance = 0.5;
  // beta ~90 = phone upright looking forward, beta ~45 = tilted looking down
  const phi = Math.max(0.3, Math.min(Math.PI / 2 - 0.05, Math.PI / 2 - (beta - Math.PI / 4)));
  const theta = -gamma * 1.5;

  camera.position.set(
    distance * Math.sin(phi) * Math.sin(theta),
    distance * Math.cos(phi) + 0.1,
    distance * Math.sin(phi) * Math.cos(theta),
  );
  camera.lookAt(0, 0.05, 0);
}

export function captureDesktopScreenshot(canvas: HTMLCanvasElement): string {
  const compositeCanvas = document.createElement('canvas');
  compositeCanvas.width = canvas.width;
  compositeCanvas.height = canvas.height;
  const ctx = compositeCanvas.getContext('2d')!;

  if (videoElement && videoElement.readyState >= 2) {
    ctx.save();
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

  ctx.drawImage(canvas, 0, 0);
  return compositeCanvas.toDataURL('image/png');
}
