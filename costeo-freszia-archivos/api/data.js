import { put, del } from '@vercel/blob';
import { versions, pinOk, PREFIX } from './_lib.js';

const KEEP = 60; // versiones guardadas como respaldo

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const v = await versions();
      const last = v[v.length - 1];
      const pinRequired = !!process.env.EDIT_PIN;
      if (!last) return res.status(200).json({ version: null, data: null, pinRequired });
      if (req.query.since && req.query.since === last.pathname)
        return res.status(200).json({ version: last.pathname, unchanged: true, pinRequired });
      const r = await fetch(last.url, { cache: 'no-store' });
      const data = await r.json();
      return res.status(200).json({ version: last.pathname, data, pinRequired });
    }
    if (req.method === 'PUT') {
      if (!pinOk(req)) return res.status(401).json({ error: 'PIN incorrecto' });
      const { data, baseVersion, force } = req.body || {};
      if (!data || !Array.isArray(data.insumos) || !Array.isArray(data.platos))
        return res.status(400).json({ error: 'Datos inválidos' });
      const v = await versions();
      const last = v[v.length - 1];
      if (!force && last && baseVersion !== last.pathname)
        return res.status(409).json({ error: 'conflict', version: last.pathname });
      const name = PREFIX + String(Date.now()).padStart(15, '0') + '-' + Math.random().toString(36).slice(2, 8) + '.json';
      await put(name, JSON.stringify(data), {
        access: 'public', contentType: 'application/json',
        addRandomSuffix: false, cacheControlMaxAge: 31536000,
      });
      const old = v.slice(0, Math.max(0, v.length + 1 - KEEP)).map(b => b.url);
      if (old.length) await del(old).catch(() => {});
      return res.status(200).json({ version: name });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
