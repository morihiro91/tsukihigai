import { getShellCount, getSelectedPhoto, CapturedPhoto } from './game';

function getShareText(count?: number): string {
  const c = count ?? getShellCount();
  return `月日貝を${c}個積みました！ #月日貝チャレンジ`;
}

/**
 * Share via Web Share API (mobile native share sheet).
 * Includes image file if supported.
 */
export async function shareNative(photo: CapturedPhoto | null) {
  const count = photo?.shellCount ?? getShellCount();
  const text = getShareText(count);
  const imageUrl = photo?.dataUrl ?? getSelectedPhoto()?.dataUrl;

  if (!navigator.share) {
    // Fallback to X if Web Share API not available
    shareToX(photo);
    return;
  }

  const shareData: ShareData = { text };

  if (imageUrl) {
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], 'tsukihigai.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        shareData.files = [file];
      }
    } catch {
      // Ignore file sharing errors
    }
  }

  try {
    await navigator.share(shareData);
  } catch {
    // User cancelled
  }
}

/**
 * Share to X (Twitter) with image.
 * First downloads the image, then opens tweet compose with text.
 */
export function shareToX(photo: CapturedPhoto | null) {
  const count = photo?.shellCount ?? getShellCount();
  const text = getShareText(count);

  // Download image first so user can attach it
  const imageUrl = photo?.dataUrl ?? getSelectedPhoto()?.dataUrl;
  if (imageUrl) {
    downloadImage(imageUrl, `tsukihigai_${count}.png`);
  }

  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

/**
 * Share to LINE with text message.
 * LINE share doesn't support direct image upload, so download image separately.
 */
export function shareToLINE(photo: CapturedPhoto | null) {
  const count = photo?.shellCount ?? getShellCount();
  const text = getShareText(count);

  // Download image first
  const imageUrl = photo?.dataUrl ?? getSelectedPhoto()?.dataUrl;
  if (imageUrl) {
    downloadImage(imageUrl, `tsukihigai_${count}.png`);
  }

  const url = `https://social-plugins.line.me/lineit/share?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

/**
 * Share to Facebook.
 */
export function shareToFacebook(_photo: CapturedPhoto | null) {
  const count = _photo?.shellCount ?? getShellCount();
  const text = getShareText(count);

  // Download image first
  const imageUrl = _photo?.dataUrl ?? getSelectedPhoto()?.dataUrl;
  if (imageUrl) {
    downloadImage(imageUrl, `tsukihigai_${count}.png`);
  }

  // Facebook share dialog (quote is the text)
  const url = `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

function downloadImage(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function downloadPhoto(photo: CapturedPhoto | null) {
  const p = photo ?? getSelectedPhoto();
  if (!p) return;
  downloadImage(p.dataUrl, `tsukihigai_${p.shellCount}.png`);
}
