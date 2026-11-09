import { wrap, send, hasRedis, r, getJ, KEYS } from './_lib.js';
import { DEF } from './_defaults.js';

export async function seed() {
  if (!hasRedis()) return;
  await r('SET', KEYS.content, JSON.stringify(DEF.content), 'NX');
  await r('SET', KEYS.artists, JSON.stringify(DEF.artists), 'NX');
  await r('SET', KEYS.works, JSON.stringify(DEF.works), 'NX');
}

export default wrap(async (req, res) => {
  if (!hasRedis()) return send(res, 200, { ...DEF, flash: [], slots: [], bot: null, live: false });
  await seed();
  const [content, artists, works, flash] = await Promise.all([getJ(KEYS.content), getJ(KEYS.artists, []), getJ(KEYS.works, []), getJ(KEYS.flash, [])]);
  send(res, 200, { content, artists, works, flash: flash || [], slots: [], bot: null, live: true });
});
