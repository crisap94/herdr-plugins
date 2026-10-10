import { launch } from '../host/launch.mjs';

await launch('pane', new URL('./main.ts', import.meta.url).href);
