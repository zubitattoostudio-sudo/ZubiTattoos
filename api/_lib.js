import crypto from 'node:crypto';

/* ---------- Redis (Upstash REST) ---------- */
const RURL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const RTOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasRedis = () => !!(RURL && RTOK);
export async function r(...cmd) {
  if (!hasRedis()) throw new HttpError(503, 'no_redis');
  const res = await fetch(RURL, { method: 'POST', headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
export async function rp(cmds) {
  if (!cmds.length) return [];
  const res = await fetch(RURL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + RTOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  const j = await res.json();
  return j.map(x => x.result);
}
export async function getJ(key, def = null) { const v = await r('GET', key); return v ? JSON.parse(v) : def; }
export async function setJ(key, val) { return r('SET', key, JSON.stringify(val)); }

/* ---------- http helpers ---------- */
export class HttpError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
export function send(res, status, obj) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); }
export async function body(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8'); try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}
export function wrap(fn) {
  return async (req, res) => {
    try { await fn(req, res); }
    catch (e) { if (e instanceof HttpError) return send(res, e.status, { error: e.code }); console.error(e); send(res, 500, { error: 'server' }); }
  };
}
export function isAdmin(req) {
  const want = process.env.ADMIN_PASSWORD || ''; const got = String(req.headers['x-admin-key'] || '');
  if (!want) throw new HttpError(503, 'no_password');
  const a = Buffer.from(want), b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
/* ---------- data ---------- */
export const KEYS = { content: 'zubi:content', artists: 'zubi:artists', works: 'zubi:works', flash: 'zubi:flash' };
/* ---------- time (Europe/Warsaw) ---------- */
export function nowWarsaw() { // "YYYY-MM-DD HH:MM"
  return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Warsaw', hour12: false }).slice(0, 16);
}
