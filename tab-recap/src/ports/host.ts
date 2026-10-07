// What the plugin may ask about the machine it runs on. One adapter (src/host/node-host.mjs); application code takes
// these facts as values and never probes the operating system itself.
export type { Platform } from '#src/host/policy.mjs';
export type { Host } from '#src/host/node-host.mjs';
