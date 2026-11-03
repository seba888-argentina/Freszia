import { put, head, BlobNotFoundError } from '@vercel/blob';
import { versions, pinOk } from './_lib.js';

/*
  Los datos viven en UN archivo fijo (db/current.json) que se pisa en cada guardado.
  Así leer no necesita list() (operación "avanzada", la que agotó el cupo del plan Hobby):
  - Leer:   head() (operación simple) + descarga solo si cambió la versión.
  - Guardar: 1 put() (avanzada) + 1 respaldo por día (db/respaldo-AAAA-MM-DD.json).
  La "versión" es la fecha de subida del archivo (uploadedAt).
*/
const CURRENT = 'db/current.json';
const OPTS = { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 };

async function headOrNull(pathname) {
  try { return await head(pathname); }
  catch (e) { if (e instanceof BlobNotFoundError) return null; throw e; }
}
const ver = h => new Date(h.uploadedAt).toISOString();

// Primera vez: copia la última versión del sistema anterior (db/<fecha>-xxxx.json) al archivo fijo.
async function migrarSiHaceFalta() {
  const h = await headOrNull(CURRENT);
  if (h) return h;
  const v = (await versions()).filter(b => b.pathname !== CURRENT && !b.pathname.startsWith('db/respaldo-'));
  const last = v[v.length - 1];
  if (!last) return null;
  const r = await fetch(last.url, { cache: 'no-store' });
  await put(CURRENT, await r.text(), OPTS);
  return await head(CURRENT);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const pinRequired = !!process.env.EDIT_PIN;
      const h = await migrarSiHaceFalta();
      if (!h) return res.status(200).json({ version: null, data: null, pinRequired });
      const version = ver(h);
      if (req.query.since && req.query.since === version)
        return res.status(200).json({ version, unchanged: true, pinRequired });
      const r = await fetch(h.url + '?v=' + encodeURIComponent(version));
      const data = await r.json();
      return res.status(200).json({ version, data, pinRequired });
    }
    if (req.method === 'PUT') {
      if (!pinOk(req)) return res.status(401).json({ error: 'PIN incorrecto' });
      const { data, baseVersion, force } = req.body || {};
      if (!data || !Array.isArray(data.insumos) || !Array.isArray(data.platos))
        return res.status(400).json({ error: 'Datos inválidos' });
      const h = await headOrNull(CURRENT);
      if (!force && h && baseVersion !== ver(h))
        return res.status(409).json({ error: 'conflict', version: ver(h) });
      const body = JSON.stringify(data);
      await put(CURRENT, body, OPTS);
      // respaldo diario (uno por día, como máximo)
      const dia = new Date().toISOString().slice(0, 10);
      const resp = 'db/respaldo-' + dia + '.json';
      if (!(await headOrNull(resp))) await put(resp, body, OPTS).catch(() => {});
      const nh = await head(CURRENT);
      return res.status(200).json({ version: ver(nh) });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
