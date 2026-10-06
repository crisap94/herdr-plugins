// Imported first by an entry point: stops it, with a message, on a Node too old to run the plugin.
import { guardNode } from './node-check.mjs';

await guardNode('daemon');
/** what the entry point imports, so the import is used (and cannot be dropped) */
export const checked = true;
