// The command launcher the column starts for `s` (settings) and, from the modal, `c` (compact): two levels up from
// src/column/, so it never depends on where the plugin is installed.
import { fileURLToPath } from 'node:url';

export const COMMAND_LAUNCHER = fileURLToPath(new URL('../../bin/tab-recap.mjs', import.meta.url));
