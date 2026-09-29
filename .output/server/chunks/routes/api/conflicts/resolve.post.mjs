import { d as defineEventHandler, r as readBody, g as getState, b as resolveConflict } from '../../../nitro/nitro.mjs';
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

const resolve_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  if ((body == null ? void 0 : body.resolution) !== "\u5141\u8BB8\u7EE7\u7EED" && (body == null ? void 0 : body.resolution) !== "\u9A73\u56DE") {
    return { ok: false, state: getState(), error: "resolution \u5FC5\u987B\u662F\u201C\u5141\u8BB8\u7EE7\u7EED\u201D\u6216\u201C\u9A73\u56DE\u201D" };
  }
  const result = resolveConflict(
    String(body == null ? void 0 : body.conflictId),
    body.resolution,
    String((body == null ? void 0 : body.actor) || "\u503C\u73ED\u8D1F\u8D23\u4EBA"),
    String((body == null ? void 0 : body.note) || "")
  );
  return { ok: result.ok, state: getState(), error: "error" in result ? result.error : void 0 };
});

export { resolve_post as default };
//# sourceMappingURL=resolve.post.mjs.map
