import { d as defineEventHandler, r as readBody, a as dispatch, u as useLedger } from '../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';
import '@iconify/utils';
import 'consola';

const action_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  return dispatch(useLedger(), body);
});

export { action_post as default };
//# sourceMappingURL=action.post.mjs.map
