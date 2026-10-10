import { launch } from '../host/launch.mjs';

await launch('daemon', new URL('./main.ts', import.meta.url).href);
