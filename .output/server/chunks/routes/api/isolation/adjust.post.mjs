import { d as defineEventHandler, r as readBody, c as adjustBoundary, g as getState } from '../../../nitro/nitro.mjs';
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

const adjust_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const result = adjustBoundary({
    pointId: String(body == null ? void 0 : body.pointId),
    device: (body == null ? void 0 : body.device) ? String(body.device) : void 0,
    label: (body == null ? void 0 : body.label) ? String(body.label) : void 0,
    actor: String((body == null ? void 0 : body.actor) || "\u503C\u73ED\u8D1F\u8D23\u4EBA")
  });
  return { ok: result.ok, state: getState(), error: "error" in result ? result.error : void 0 };
});

export { adjust_post as default };
//# sourceMappingURL=adjust.post.mjs.map
