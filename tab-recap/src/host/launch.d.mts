import type { Host } from './node-host.d.mts';

export type LauncherKind = 'pane' | 'daemon' | 'command';
export function launch(kind: LauncherKind, entry: string, seams?: { readonly host?: Host; readonly argv?: readonly string[] }): Promise<void>;
