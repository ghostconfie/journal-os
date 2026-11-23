// Photos are shrunk to fit inside one synced record (Firestore caps a record at 1MB).
// Videos are too big for that, so an uploaded video stays on the device it was added from (IndexedDB).

export const IMAGE_MAX_CHARS = 720_000;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
    img.src = url;
  });
}

/** Resize and compress a picture until it fits. Returns a data URL. */
export async function compressImage(file, maxChars = IMAGE_MAX_CHARS) {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const webp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
  const type = webp ? 'image/webp' : 'image/jpeg';
  let max = 1600, q = 0.82, out = '';
  for (let i = 0; i < 12; i++) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    out = canvas.toDataURL(type, q);
    if (out.length <= maxChars) return out;
    if (q > 0.55) q -= 0.1; else max = Math.round(max * 0.8);
  }
  return out;
}

const DB = 'journal-os-media', OS = 'videos';
function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveVideo(key, blob) {
  const d = await db();
  await new Promise((resolve, reject) => {
    const tx = d.transaction(OS, 'readwrite');
    tx.objectStore(OS).put(blob, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
export async function loadVideo(key) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const r = d.transaction(OS).objectStore(OS).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}
export async function deleteVideo(key) {
  try { const d = await db(); d.transaction(OS, 'readwrite').objectStore(OS).delete(key); } catch { /* ignore */ }
}

/** YouTube / Vimeo links become embeds; anything else is played directly. */
export function videoEmbed(url) {
  const u = String(url || '').trim();
  let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/))) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  if ((m = u.match(/vimeo\.com\/(\d+)/))) return { kind: 'iframe', src: `https://player.vimeo.com/video/${m[1]}` };
  return /^https?:\/\//.test(u) ? { kind: 'video', src: u } : null;
}
