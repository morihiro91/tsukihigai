import { GameState, getPhotos, getSelectedPhoto, setSelectedPhotoIndex } from './game';
import { shareNative, shareToX, shareToLINE, shareToFacebook, downloadPhoto } from './share';

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

    <div class="share-buttons">
      <button class="btn-sns btn-x" id="btn-x" title="X (Twitter)">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
      </button>
      <button class="btn-sns btn-line" id="btn-line" title="LINE">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 5.82 2 10.5c0 3.69 3.03 6.84 7.27 7.87.28.06.66.19.76.43.09.22.06.56.03.78l-.12.74c-.04.22-.17.87.76.47.93-.4 5.02-2.96 6.85-5.07C19.47 13.56 22 11.73 22 10.5 22 5.82 17.52 2 12 2z"/></svg>
      </button>
      <button class="btn-sns btn-fb" id="btn-fb" title="Facebook">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      </button>
      <button class="btn-sns btn-share-native" id="btn-share-native" title="その他">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
      </button>
    </div>
    <div class="btn-group">
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

  div.querySelector('#btn-x')!.addEventListener('click', () => {
    shareToX(getSelectedPhoto());
  });
  div.querySelector('#btn-line')!.addEventListener('click', () => {
    shareToLINE(getSelectedPhoto());
  });
  div.querySelector('#btn-fb')!.addEventListener('click', () => {
    shareToFacebook(getSelectedPhoto());
  });
  div.querySelector('#btn-share-native')!.addEventListener('click', () => {
    shareNative(getSelectedPhoto());
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
