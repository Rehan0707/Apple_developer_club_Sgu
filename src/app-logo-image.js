export async function prepareAppLogo(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP app logo.');
  if (file.size > 10 * 1024 * 1024) throw new Error('App logo must be 10 MB or smaller.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('This image could not be opened. Choose a valid app logo.'); }
  if (bitmap.width !== 1024 || bitmap.height !== 1024) {
    const size = `${bitmap.width}×${bitmap.height}`;
    bitmap.close();
    throw new Error(`App logos must be exactly 1024×1024 pixels. This image is ${size}.`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1024;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  bitmap.close();
  for (const quality of [.9, .8, .7, .55, .4, .25]) {
    const imageUrl = canvas.toDataURL('image/webp', quality);
    if (imageUrl.startsWith('data:image/webp;') && imageUrl.length <= 650000) return imageUrl;
  }
  throw new Error('This logo is too complex to save. Try a simpler PNG, JPEG, or WebP image.');
}
