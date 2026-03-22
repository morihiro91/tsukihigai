import './style.css';
import { initScene, getRenderer, getScene, getCamera } from './scene';
import { initPhysics } from './physics';
import { initDesktopSession, updateDesktopControls, captureDesktopScreenshot } from './desktop-session';
import { isARAvailable, initARSession, captureARScreenshot } from './ar-session';
import {
  startGame,
  updateGame,
  dropShell,
  moveShellX,
  moveShellZ,
  onStateChange,
  addPhoto,
} from './game';
import { initUI, updateUI, showCaptureFlash } from './ui';
import { initAudio } from './audio';
import { initDebug, updateDebug } from './debug';

let arMode = false;

async function handleCapture() {
  let dataUrl: string;
  if (arMode) {
    // XR8 composites camera feed + 3D automatically
    dataUrl = await captureARScreenshot();
  } else {
    // Desktop: composite camera video + 3D canvas manually
    const canvas = getRenderer().domElement;
    dataUrl = captureDesktopScreenshot(canvas);
  }
  addPhoto(dataUrl);
  showCaptureFlash();
}

async function init() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const { renderer, scene, camera } = initScene(canvas);

  await initPhysics();
  initAudio();
  initDebug();

  arMode = isARAvailable();

  if (arMode) {
    initARSession();
  } else {
    await initDesktopSession();
  }

  initUI(
    () => startGame(),
    () => dropShell(),
    (x) => moveShellX(x),
    (z) => moveShellZ(z),
    () => handleCapture(),
    arMode,
  );

  onStateChange((state, shellCount) => {
    updateUI(state, shellCount, arMode);
  });

  let lastTime = performance.now();

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    updateGame(dt);
    updateDebug();

    if (!arMode) {
      updateDesktopControls();
    }

    renderer.render(scene, camera);
  }

  animate();
}

init();
