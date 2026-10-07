// The launcher herdr runs: checks the host in plain JavaScript, then loads the TypeScript entry (see src/host/launch.mjs).
import { launch } from '../src/host/launch.mjs';

await launch('command', new URL('./tab-recap.ts', import.meta.url).href);
