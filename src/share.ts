import { getShellCount, getSelectedPhoto, CapturedPhoto } from './game';

function getShareText(count?: number): string {
  const c = count ?? getShellCount();
  return `月日貝を${c}個積みました！ #月日貝チャレンジ`;
}

export async function shareWithPhoto(photo: CapturedPhoto | null) {
  const count = photo?.shellCount ?? getShellCount();
  const text = getShareText(count);
  const imageUrl = photo?.dataUrl ?? getSelectedPhoto()?.dataUrl;

  // Try Web Share API (mobile)
  if (navigator.share) {
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
      return;
    } catch {
      // Fall through to Twitter
    }
  }

  // Fallback: Twitter/X intent
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(twitterUrl, '_blank');
}

export function downloadPhoto(photo: CapturedPhoto | null) {
  const p = photo ?? getSelectedPhoto();
  if (!p) return;

  const a = document.createElement('a');
  a.href = p.dataUrl;
  a.download = `tsukihigai_${p.shellCount}.png`;
  a.click();
}
