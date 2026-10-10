import { fileURLToPath } from 'node:url';

export const COMMAND_LAUNCHER = fileURLToPath(new URL('../../bin/tab-recap.mjs', import.meta.url));
