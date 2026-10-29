import { list } from '@vercel/blob';
export const PREFIX = 'db/';
export async function versions() {
  const all = []; let cursor;
  do {
    const r = await list({ prefix: PREFIX, cursor, limit: 1000 });
    all.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  all.sort((a, b) => (a.pathname < b.pathname ? -1 : 1));
  return all;
}
export function pinOk(req) {
  const pin = process.env.EDIT_PIN;
  return !pin || req.headers['x-pin'] === pin;
}
