import { join } from 'node:path';

export const SOCKET_PATH_MAX = 107;

export const viewSocketPath = (stateDir: string): string => join(stateDir, 'view.sock');

export const hooksSocketPath = (stateDir: string): string => join(stateDir, 'hooks.sock');

export const hookShimPath = (stateDir: string): string => join(stateDir, 'hook.sh');
