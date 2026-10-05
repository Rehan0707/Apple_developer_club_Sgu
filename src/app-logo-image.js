export async function prepareAppLogo(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP app logo.');
  if (file.size > 10 * 1024 * 1024) throw new Error('App logo must be 10 MB or smaller.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('This image could not be opened. Choose a valid app logo.'); }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  const scale = Math.min(1024 / bitmap.width, 1024 / bitmap.height);
  const width = bitmap.width * scale, height = bitmap.height * scale;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, (1024 - width) / 2, (1024 - height) / 2, width, height);
  bitmap.close();
  // Some browsers fall back to PNG when WebP encoding is unavailable.
  // Retry smaller square images when detail or alpha data exceeds the document budget.
  const encoded = document.createElement('canvas');
  for (const size of [1024, 768, 512, 384, 256, 128]) {
    encoded.width = encoded.height = size;
    const resized = encoded.getContext('2d');
    resized.imageSmoothingEnabled = true;
    resized.imageSmoothingQuality = 'high';
    resized.drawImage(canvas, 0, 0, size, size);
    for (const quality of [.9, .8, .65, .5, .35, .2]) {
      const imageUrl = encoded.toDataURL('image/webp', quality);
      if (/^data:image\/(webp|png|jpeg);base64,/.test(imageUrl) && imageUrl.length <= 650000) return imageUrl;
      // PNG is lossless: lowering the quality parameter cannot reduce its size.
      if (imageUrl.startsWith('data:image/png;')) break;
    }
  }
  throw new Error('This image could not be prepared for upload. Please choose another PNG, JPEG, or WebP file.');
}
