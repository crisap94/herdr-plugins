import { join } from 'node:path';
import { stateDirectory } from '#src/daemon/config.ts';

const given = process.env['TAB_RECAP_STATE'];
export const DESKTOP_STATE: string = given !== undefined && given !== '' ? given : join(stateDirectory(), 'desktop');
process.env['TAB_RECAP_STATE'] = DESKTOP_STATE;
