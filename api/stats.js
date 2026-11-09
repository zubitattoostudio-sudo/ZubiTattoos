// Anonymous, cookieless site statistics and click heatmap.
// POST (beacon, no auth): aggregated counters only, no IP, no IDs, nothing per person.
// POST with x-admin-key: read one month for the studio panel.
import { wrap, send, HttpError, isAdmin, hasRedis, r, rp, nowWarsaw } from './_lib.js';

const SECTIONS = ['nav', 'hero', 'work', 'prices', 'artists', 'faq', 'visit', 'bar'];
const AREAS = [...SECTIONS, 'menu', 'sheet'];
const DEV = ['m', 't', 'd'];
const LANGS = ['pl', 'uk', 'en', 'ru'];
const REFS = ['instagram', 'telegram', 'google', 'facebook', 'tiktok', 'booksy', 'maps', 'direct', 'other'];
const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|vercel|monitor|curl|python|node-fetch|axios/i;
const P = 'zs:';
const keyOk = s => /^[a-z0-9:#._/-]{1,48}$/i.test(s);
const int = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };

async function readBody(req) {
  let b = req.body;
  if (b && typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return {}; } }
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8')); } catch { return {}; } }
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > 16384) throw new HttpError(413, 'too_big'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

function ingest(q) {
  const [day, ] = nowWarsaw().split(' '); const m = day.slice(0, 7), dd = day.slice(8, 10);
  const dev = DEV.includes(q.d) ? q.d : null; if (!dev) return [];
  const cmds = []; const inc = (k, f, n = 1) => cmds.push(['HINCRBY', P + m + ':' + k, f, n]);
  if (q.pv) {
    inc('v', 'all'); inc('v', 'd:' + dev); inc('v', 'day:' + dd);
    if (LANGS.includes(q.l)) inc('v', 'l:' + q.l);
    inc('v', 'r:' + (REFS.includes(q.r) ? q.r : 'other'));
  }
  const t = int(q.t, 1, 1800); if (t) inc('v', 'tsum', t);
  (Array.isArray(q.s) ? q.s : []).slice(0, SECTIONS.length).forEach(s => { if (SECTIONS.includes(s)) inc('sec', dev + ':' + s); });
  (Array.isArray(q.c) ? q.c : []).slice(0, 40).forEach(c => {
    if (!Array.isArray(c)) return; const [s, gx, gy, el] = c;
    if (SECTIONS.includes(s) && gx !== null && int(gx, 0, 47) !== null && int(gy, 0, 99) !== null) inc('hm:' + dev + ':' + s, int(gx, 0, 47) + '.' + int(gy, 0, 99));
    if (typeof el === 'string' && keyOk(el) && AREAS.includes(s)) inc('el', s + '/' + el);
  });
  (Array.isArray(q.rg) ? q.rg : []).slice(0, 5).forEach(el => { if (typeof el === 'string' && keyOk(el)) inc('rage', el); });
  return cmds;
}

const toObj = a => { const o = {}; if (Array.isArray(a)) for (let i = 0; i < a.length; i += 2) o[a[i]] = Number(a[i + 1]); else if (a && typeof a === 'object') for (const k in a) o[k] = Number(a[k]); return o; };


/* Each visit is queued as one list entry (one database command) instead of 20-40 counter updates.
   The queue is folded into the monthly counters when the panel reads stats, or when it gets long. */
const Q = P + 'q', FOLD_AT = 1500;
async function fold() {
  const tmp = Q + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 7);
  try { await r('RENAME', Q, tmp); } catch { return; } // nothing queued
  const items = (await r('LRANGE', tmp, 0, -1)) || []; const agg = new Map();
  for (const it of items) {
    let list; try { list = JSON.parse(it); } catch { continue; }
    if (!Array.isArray(list)) continue;
    for (const c of list) { if (!Array.isArray(c) || c.length !== 3) continue; const id = c[0] + '\u0000' + c[1]; agg.set(id, (agg.get(id) || 0) + (Number(c[2]) || 0)); }
  }
  const cmds = [...agg].map(([id, n]) => { const [k, f] = id.split('\u0000'); return ['HINCRBY', k, f, n]; });
  for (let i = 0; i < cmds.length; i += 400) await rp(cmds.slice(i, i + 400));
  await r('DEL', tmp);
}

async function month(m) {
  const base = ['v', 'sec', 'el', 'rage'];
  const hm = []; DEV.forEach(d => SECTIONS.forEach(s => hm.push([d, s])));
  const res = await rp([...base.map(k => ['HGETALL', P + m + ':' + k]), ...hm.map(([d, s]) => ['HGETALL', P + m + ':hm:' + d + ':' + s])]);
  const out = { month: m }; base.forEach((k, i) => { out[k] = toObj(res[i]); });
  out.hm = {}; hm.forEach(([d, s], i) => { const o = toObj(res[base.length + i]); if (Object.keys(o).length) (out.hm[d] = out.hm[d] || {})[s] = o; });
  return out;
}

export default wrap(async (req, res) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method');
  if (req.headers['x-admin-key'] !== undefined) {
    if (!isAdmin(req)) throw new HttpError(401, 'bad_password');
    if (!hasRedis()) throw new HttpError(503, 'no_redis');
    const q = await readBody(req); const now = nowWarsaw().slice(0, 7);
    const m = /^\d{4}-\d{2}$/.test(String(q.month || '')) ? q.month : now;
    try { await fold(); } catch (e) { console.error('fold', e.message); }
    return send(res, 200, { ...(await month(m)), now });
  }
  // public beacon: never fail loudly, never store anything that identifies a person
  res.statusCode = 204;
  try {
    if (!hasRedis() || BOTS.test(String(req.headers['user-agent'] || ''))) return res.end();
    const cmds = ingest(await readBody(req)).slice(0, 120);
    if (cmds.length) { const n = await r('RPUSH', Q, JSON.stringify(cmds.map(c => [c[1], c[2], c[3]]))); if (n >= FOLD_AT) await fold(); }
  } catch (e) { console.error('stats', e.message); }
  res.end();
});
