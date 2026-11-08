import { launch } from '../host/launch.mjs';

process.env['TAB_RECAP_FRONTEND'] = 'gui';

await launch('daemon', new URL('./main.ts', import.meta.url).href);
