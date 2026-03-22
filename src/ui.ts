import { GameState, getPhotos, getSelectedPhoto, setSelectedPhotoIndex } from './game';
import { shareWithPhoto, downloadPhoto } from './share';

let uiRoot: HTMLElement;
let onStartCallback: (() => void) | null = null;
let onDropCallback: (() => void) | null = null;
let onCaptureCallback: (() => void) | null = null;

export function initUI(
  onStart: () => void,
  onDrop: () => void,
  onCapture: () => void,
  isAR: boolean,
) {
  uiRoot = document.getElementById('ui-root')!;
  onStartCallback = onStart;
  onDropCallback = onDrop;
  onCaptureCallback = onCapture;

  showTitleScreen(isAR);
}

function clearUI() {
  uiRoot.innerHTML = '';
}

function showTitleScreen(isAR: boolean) {
  clearUI();
  const div = document.createElement('div');
  div.className = 'title-screen';
  div.innerHTML = `
    <h1>月日貝積み</h1>
    <p class="subtitle">貝をひとつずつ積み上げよう</p>
    <span class="mode-badge">${isAR ? 'AR' : '3D'} モード</span>
    <button class="btn btn-primary" id="btn-start">はじめる</button>
  `;
  uiRoot.appendChild(div);

  div.querySelector('#btn-start')!.addEventListener('click', () => {
    onStartCallback?.();
  });
}

function showHUD(shellCount: number, photoCount: number) {
  clearUI();

  // Shell count
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <div class="shell-count" id="shell-count">${shellCount}</div>
    <div class="shell-label">まい</div>
  `;
  uiRoot.appendChild(hud);

  // Camera capture button
  const captureBtn = document.createElement('button');
  captureBtn.className = 'btn-capture';
  captureBtn.id = 'btn-capture';
  captureBtn.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
    ${photoCount > 0 ? `<span class="capture-badge">${photoCount}</span>` : ''}
  `;
  captureBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onCaptureCallback?.();
    captureBtn.classList.add('flash');
    setTimeout(() => captureBtn.classList.remove('flash'), 300);
    const badge = captureBtn.querySelector('.capture-badge');
    const newCount = photoCount + 1;
    if (badge) {
      badge.textContent = String(newCount);
    } else {
      const span = document.createElement('span');
      span.className = 'capture-badge';
      span.textContent = String(newCount);
      captureBtn.appendChild(span);
    }
  });
  uiRoot.appendChild(captureBtn);

  // Tap hint
  const hint = document.createElement('div');
  hint.className = 'tap-hint';
  hint.textContent = 'タップして落とす';
  uiRoot.appendChild(hint);

  // Tap/click to drop
  const canvas = document.getElementById('game-canvas')!;
  const dropHandler = (e: Event) => {
    const target = e.target as HTMLElement;
    if (target.closest('.btn-capture')) return;
    onDropCallback?.();
    canvas.removeEventListener('click', dropHandler);
    canvas.removeEventListener('touchend', dropHandler);
  };
  canvas.addEventListener('click', dropHandler);
  canvas.addEventListener('touchend', dropHandler);
}

function showGameOver(shellCount: number, isAR: boolean) {
  clearUI();
  const photos = getPhotos();
  const selectedPhoto = getSelectedPhoto();

  const div = document.createElement('div');
  div.className = 'gameover-screen';

  div.innerHTML = `
    <h2>くずれた！</h2>
    <p class="result-text">月日貝を<strong>${shellCount}</strong>個積みました</p>

    ${photos.length > 0 ? `
      <div class="photo-gallery">
        <p class="gallery-label">共有する画像を選んでください</p>
        <div class="photo-selected">
          <img id="selected-photo" src="${selectedPhoto?.dataUrl || ''}" alt="選択中の写真" />
          <span class="photo-count-badge">${selectedPhoto?.shellCount || 0}個の時</span>
        </div>
        <div class="photo-thumbnails" id="photo-thumbnails">
          ${photos.map((p, i) => `
            <div class="photo-thumb ${i === photos.length - 1 ? 'selected' : ''}" data-index="${i}">
              <img src="${p.dataUrl}" alt="${p.shellCount}個" />
              <span>${p.shellCount}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : `
      <p class="no-photo-hint">次回はカメラボタンで撮影してみよう</p>
    `}

    <div class="btn-group">
      <button class="btn btn-primary" id="btn-share">共有する</button>
      ${photos.length > 0 ? '<button class="btn btn-secondary" id="btn-download">画像保存</button>' : ''}
      <button class="btn btn-secondary" id="btn-retry">もう一度</button>
    </div>
  `;
  uiRoot.appendChild(div);

  const thumbnails = div.querySelector('#photo-thumbnails');
  if (thumbnails) {
    thumbnails.addEventListener('click', (e) => {
      const thumb = (e.target as HTMLElement).closest('.photo-thumb') as HTMLElement;
      if (!thumb) return;

      const index = parseInt(thumb.dataset.index!);
      setSelectedPhotoIndex(index);

      thumbnails.querySelectorAll('.photo-thumb').forEach(t => t.classList.remove('selected'));
      thumb.classList.add('selected');

      const photo = photos[index];
      const selectedImg = div.querySelector('#selected-photo') as HTMLImageElement;
      const badge = div.querySelector('.photo-count-badge')!;
      if (selectedImg) selectedImg.src = photo.dataUrl;
      badge.textContent = `${photo.shellCount}個の時`;
    });
  }

  div.querySelector('#btn-share')!.addEventListener('click', () => {
    shareWithPhoto(getSelectedPhoto());
  });
  div.querySelector('#btn-download')?.addEventListener('click', () => {
    downloadPhoto(getSelectedPhoto());
  });
  div.querySelector('#btn-retry')!.addEventListener('click', () => {
    onStartCallback?.();
  });
}

export function updateUI(state: GameState, shellCount: number, isAR: boolean) {
  switch (state) {
    case 'TITLE':
      showTitleScreen(isAR);
      break;
    case 'PLACING':
      showHUD(shellCount, getPhotos().length);
      break;
    case 'DROPPING':
    case 'SETTLING': {
      const countEl = document.getElementById('shell-count');
      if (countEl) countEl.textContent = String(shellCount);
      document.querySelector('.tap-hint')?.remove();
      break;
    }
    case 'GAME_OVER':
      showGameOver(shellCount, isAR);
      break;
  }
}

export function showCaptureFlash() {
  const flash = document.createElement('div');
  flash.className = 'screen-flash';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 400);
}
