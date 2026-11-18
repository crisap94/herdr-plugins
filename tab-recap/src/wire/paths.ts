import { join } from 'node:path';
import type { HookHarness } from '#src/wire/hooks/contract.ts';

export const SOCKET_PATH_MAX = 107;

export const viewSocketPath = (stateDir: string): string => join(stateDir, 'view', 'view.sock');

export const hooksSocketPath = (stateDir: string): string => join(stateDir, 'hooks', 'hooks.sock');

export const hookShimPath = (stateDir: string, harness: HookHarness): string => join(stateDir, `hook-${harness}.sh`);
