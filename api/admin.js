import { wrap, send, body, HttpError, isAdmin, hasRedis, r, getJ, setJ, KEYS } from './_lib.js';
import { seed } from './state.js';

const clean = (o) => JSON.parse(JSON.stringify(o || {}));
/* public Vercel Blob files only: the move tool never fetches anything else */
const BLOB = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/[^\s"'<>]+$/i;
const MEDIA = /^(image\/(jpeg|png|webp|gif|avif)|video\/(mp4|webm|quicktime))$/;
const MAX = 60 * 1024 * 1024;

async function blobPut(name, buf, type) {
  const put = globalThis.__zubiPut || (await import('@vercel/blob')).put;
  return put('zubi/' + name, buf, { access: 'public', contentType: type, addRandomSuffix: true });
}

export default wrap(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method');
  if (!isAdmin(req)) throw new HttpError(401, 'bad_password');
  const q = await body(req);
  if (q.op === 'login') return send(res, 200, { ok: true, redis: hasRedis(), botToken: false });
  /* reading another site and copying files does not need this site's database */
  if (q.op === 'readSite') {
    let u; try { u = new URL(String(q.from || '').trim()); } catch { throw new HttpError(400, 'bad_url'); }
    if (u.protocol !== 'https:') throw new HttpError(400, 'bad_url');
    const resp = await fetch(u.origin + '/api/state', { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) }).catch(() => null);
    if (!resp || !resp.ok) throw new HttpError(502, 'read_failed');
    const s = await resp.json().catch(() => null);
    if (!s || typeof s.content !== 'object' || !Array.isArray(s.artists)) throw new HttpError(502, 'read_failed');
    return send(res, 200, { v: 1, from: u.origin, content: s.content, artists: s.artists, works: s.works || [], flash: s.flash || [] });
  }
  if (q.op === 'copyMedia') {
    if (!process.env.BLOB_READ_WRITE_TOKEN && !globalThis.__zubiPut) throw new HttpError(503, 'no_blob');
    const url = String(q.url || '');
    if (!BLOB.test(url)) throw new HttpError(400, 'bad_url');
    /* a file already in this project's own store needs no copy (restoring this site's own backup) */
    const own = String((process.env.BLOB_READ_WRITE_TOKEN || '').split('_')[3] || '').toLowerCase();
    if (own && new URL(url).hostname.startsWith(own + '.')) return send(res, 200, { url, same: true });
    const resp = await fetch(url, { signal: AbortSignal.timeout(60000) }).catch(() => null);
    if (!resp || !resp.ok) throw new HttpError(502, 'fetch_failed');
    const type = String(resp.headers.get('content-type') || '').split(';')[0].trim();
    if (!MEDIA.test(type)) throw new HttpError(415, 'type');
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > MAX) throw new HttpError(413, 'too_big');
    const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file').replace(/-[A-Za-z0-9]{20,}(?=\.[a-z0-9]+$)/, '');
    const name = base.replace(/[^\w.-]+/g, '-').slice(0, 60) || 'file';
    const blob = await blobPut(name, buf, type);
    return send(res, 200, { url: blob.url });
  }
  if (!hasRedis()) throw new HttpError(503, 'no_redis');
  await seed();
  switch (q.op) {
    /* the panel still asks for this on login; bookings now live in Booksy */
    case 'list': return send(res, 200, { items: [], tg: {}, links: {}, bot: null, botToken: false });
    case 'content': await setJ(KEYS.content, clean(q.content)); return send(res, 200, { ok: true });
    case 'artist': case 'work': case 'flash': {
      const key = q.op === 'artist' ? KEYS.artists : q.op === 'flash' ? KEYS.flash : KEYS.works;
      const arr = (await getJ(key, [])) || []; const id = String(q.id || '').slice(0, 40);
      if (!/^[A-Za-z0-9]+$/.test(id)) throw new HttpError(400, 'bad_id');
      const data = { ...clean(q.data), id }; const i = arr.findIndex(x => x.id === id);
      if (i >= 0) arr[i] = data; else arr.push(data);
      await setJ(key, arr); return send(res, 200, { ok: true });
    }
    case 'artistDel': case 'workDel': case 'flashDel': {
      const key = q.op === 'artistDel' ? KEYS.artists : q.op === 'flashDel' ? KEYS.flash : KEYS.works;
      const arr = (await getJ(key, [])) || []; const gone = arr.find(x => x.id === q.id);
      await setJ(key, arr.filter(x => x.id !== q.id));
      if ((q.op === 'workDel' || q.op === 'flashDel') && gone && gone.media && /blob\.vercel-storage\.com/.test(gone.media.asset || '')) { try { const { del } = await import('@vercel/blob'); await del(gone.media.asset); } catch (e) { console.error(e); } }
      return send(res, 200, { ok: true });
    }
    /* replace everything at once: used by "restore from file" and "move from the old site" */
    case 'restore': {
      const d = clean(q.data);
      if (!d.content || typeof d.content !== 'object' || Array.isArray(d.content)) throw new HttpError(400, 'bad_backup');
      const arr = (v) => Array.isArray(v) ? v.filter(x => x && typeof x === 'object' && /^[A-Za-z0-9]{1,40}$/.test(String(x.id || ''))) : [];
      const artists = arr(d.artists), works = arr(d.works), flash = arr(d.flash);
      await setJ(KEYS.content, d.content); await setJ(KEYS.artists, artists); await setJ(KEYS.works, works); await setJ(KEYS.flash, flash);
      return send(res, 200, { ok: true, artists: artists.length, works: works.length, flash: flash.length });
    }
  }
  throw new HttpError(400, 'op');
});
