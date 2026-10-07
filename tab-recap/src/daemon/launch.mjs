// The launcher herdr runs: checks the host in plain JavaScript, then loads the TypeScript entry (see src/host/launch.mjs).
import { launch } from '../host/launch.mjs';

await launch('daemon', new URL('./main.ts', import.meta.url).href);
