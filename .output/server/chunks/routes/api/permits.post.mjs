import { d as defineEventHandler, r as readBody, g as getState, f as createPermit } from '../../nitro/nitro.mjs';
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

const permits_post = defineEventHandler(async (event) => {
  var _a, _b, _c;
  const body = await readBody(event);
  if (!((_a = body == null ? void 0 : body.title) == null ? void 0 : _a.trim()) || !((_b = body == null ? void 0 : body.device) == null ? void 0 : _b.trim()) || !(body == null ? void 0 : body.startAt) || !(body == null ? void 0 : body.endAt)) {
    return { ok: false, state: getState(), error: "\u4F5C\u4E1A\u540D\u79F0\u3001\u8BBE\u5907\u7F16\u53F7\u548C\u8BA1\u5212\u65F6\u95F4\u7A97\u5FC5\u586B" };
  }
  const { conflicts } = createPermit({
    title: String(body.title),
    device: String(body.device),
    crew: String(body.crew || "\u672A\u5206\u914D\u73ED\u7EC4"),
    owner: String(body.owner || "\u5F53\u524D\u7528\u6237"),
    window: String(body.window),
    startAt: new Date(body.startAt).toISOString(),
    endAt: new Date(body.endAt).toISOString(),
    risk: (_c = body.risk) != null ? _c : "\u4E8C\u7EA7"
  });
  return { ok: true, state: getState(), conflict: conflicts[0] };
});

export { permits_post as default };
//# sourceMappingURL=permits.post.mjs.map
