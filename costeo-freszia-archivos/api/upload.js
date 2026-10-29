import { put } from '@vercel/blob';
import { pinOk } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  if (!pinOk(req)) return res.status(401).json({ error: 'PIN incorrecto' });
  try {
    const { dataUrl } = req.body || {};
    const m = /^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl || '');
    if (!m) return res.status(400).json({ error: 'Imagen inválida' });
    const buf = Buffer.from(m[3], 'base64');
    if (buf.length > 3.5 * 1024 * 1024) return res.status(413).json({ error: 'Imagen muy grande' });
    const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
    const b = await put('fotos/foto.' + ext, buf, {
      access: 'public', contentType: m[1], addRandomSuffix: true, cacheControlMaxAge: 31536000,
    });
    return res.status(200).json({ url: b.url });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
