import { d as defineEventHandler, s as snapshot, u as useLedger } from '../../nitro/nitro.mjs';
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

const state_get = defineEventHandler(() => {
  return snapshot(useLedger());
});

export { state_get as default };
//# sourceMappingURL=state.get.mjs.map
