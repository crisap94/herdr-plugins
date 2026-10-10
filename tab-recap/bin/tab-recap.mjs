import { launch } from '../src/host/launch.mjs';

await launch('command', new URL('./tab-recap.ts', import.meta.url).href);
