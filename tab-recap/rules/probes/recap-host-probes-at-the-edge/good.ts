import type { Host } from '#src/ports/host.ts';

export const pathOf = (host: Host): string => host.path;
