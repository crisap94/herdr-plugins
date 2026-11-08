import { launch } from '../src/host/launch.mjs';

await launch('command', new URL('./tab-recap-desktop.ts', import.meta.url).href);
