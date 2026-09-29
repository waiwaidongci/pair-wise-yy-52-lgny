import { d as defineEventHandler, r as readBody, h as advancePermit, g as getState } from '../../../nitro/nitro.mjs';
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

const advance_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const result = advancePermit(
    String(body == null ? void 0 : body.id),
    String((body == null ? void 0 : body.actor) || "\u5F53\u524D\u7528\u6237"),
    (body == null ? void 0 : body.clientRequestId) ? String(body.clientRequestId) : void 0
  );
  return {
    ok: result.ok,
    state: getState(),
    duplicated: "duplicated" in result ? result.duplicated : void 0,
    error: "error" in result ? result.error : void 0
  };
});

export { advance_post as default };
//# sourceMappingURL=advance.post.mjs.map
