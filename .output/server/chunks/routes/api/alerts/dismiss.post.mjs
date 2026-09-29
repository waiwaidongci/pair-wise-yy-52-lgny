import { d as defineEventHandler, r as readBody, a as dismissAlert, g as getState } from '../../../nitro/nitro.mjs';
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

const dismiss_post = defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}));
  dismissAlert(String((body == null ? void 0 : body.actor) || "\u503C\u73ED\u8D1F\u8D23\u4EBA"));
  return { ok: true, state: getState() };
});

export { dismiss_post as default };
//# sourceMappingURL=dismiss.post.mjs.map
