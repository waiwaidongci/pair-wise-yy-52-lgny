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

const operations_get = defineEventHandler(() => {
  const state = snapshot(useLedger());
  return {
    site: state.site.name,
    generatedAt: state.serverTime,
    onlineDevices: state.site.onlineDevices,
    totalDevices: state.site.totalDevices,
    windSpeed: state.site.windSpeed,
    revision: state.revision
  };
});

export { operations_get as default };
//# sourceMappingURL=operations.get.mjs.map
