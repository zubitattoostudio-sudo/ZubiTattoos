import { wrap, send, hasRedis, r, KEYS } from './_lib.js';
import { DEF } from './_defaults.js';

export async function seed() {
  if (!hasRedis()) return;
  await r('SET', KEYS.content, JSON.stringify(DEF.content), 'NX');
  await r('SET', KEYS.artists, JSON.stringify(DEF.artists), 'NX');
  await r('SET', KEYS.works, JSON.stringify(DEF.works), 'NX');
}

const J = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };

export default wrap(async (req, res) => {
  if (!hasRedis()) return send(res, 200, { ...DEF, flash: [], slots: [], bot: null, live: false });
  const ks = [KEYS.content, KEYS.artists, KEYS.works, KEYS.flash];
  /* one database read for the whole page */
  let v = await r('MGET', ...ks);
  if (!v || !v[0]) { await seed(); v = await r('MGET', ...ks); }
  const out = { content: J(v[0], DEF.content), artists: J(v[1], []), works: J(v[2], []), flash: J(v[3], []), slots: [], bot: null, live: true };
  /* visitors get a copy cached at the edge for a minute; the studio panel asks with ?fresh= and always reads the database */
  const fresh = /[?&]fresh=/.test(String(req.url || ''));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (fresh) res.setHeader('Cache-Control', 'no-store');
  else {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=60, stale-while-revalidate=600');
  }
  res.end(JSON.stringify(out));
});
