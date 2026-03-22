import './style.css';
import { initScene, getRenderer, getScene, getCamera } from './scene';
import { initPhysics } from './physics';
import { initDesktopSession, updateDesktopControls, captureDesktopScreenshot } from './desktop-session';
import { isARAvailable, initARSession, captureARScreenshot, onSurfacePlaced } from './ar-session';
import {
  startGame,
  updateGame,
  dropShell,
  onStateChange,
  addPhoto,
  setGroundY,
} from './game';
import { initUI, updateUI, showCaptureFlash } from './ui';
import { initAudio } from './audio';
import { initDebug, updateDebug } from './debug';
import { initSmoke, updateSmoke } from './smoke';
import { createGrill } from './grill';

let arMode = false;

async function handleCapture() {
  let dataUrl: string;
  if (arMode) {
    dataUrl = await captureARScreenshot();
  } else {
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
  initSmoke();

  arMode = isARAvailable();

  if (arMode) {
    initARSession();
    // In AR mode, grill is placed when surface is tapped
    onSurfacePlaced((x, y, z) => {
      setGroundY(y);
    });
  } else {
    await initDesktopSession();
    // In desktop mode, create grill immediately at origin
    createGrill();
  }

  initUI(
    () => startGame(),
    () => dropShell(),
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

    updateSmoke(dt);
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
