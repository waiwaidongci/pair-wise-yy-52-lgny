import { d as defineEventHandler, r as readBody, i as reReviewPermit, g as getState } from '../../../nitro/nitro.mjs';
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

const rereview_post = defineEventHandler(async (event) => {
  const body = await readBody(event);
  const result = reReviewPermit(String(body == null ? void 0 : body.permitId), String((body == null ? void 0 : body.actor) || "\u503C\u73ED\u8D1F\u8D23\u4EBA"), String((body == null ? void 0 : body.note) || ""));
  return { ok: result.ok, state: getState(), error: "error" in result ? result.error : void 0 };
});

export { rereview_post as default };
//# sourceMappingURL=rereview.post.mjs.map
