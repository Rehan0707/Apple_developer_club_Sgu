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
  for (const quality of [.9, .8, .7, .55, .4, .25]) {
    const imageUrl = canvas.toDataURL('image/webp', quality);
    if (imageUrl.startsWith('data:image/webp;') && imageUrl.length <= 650000) return imageUrl;
  }
  throw new Error('This logo is too complex to save. Try a simpler PNG, JPEG, or WebP image.');
}
