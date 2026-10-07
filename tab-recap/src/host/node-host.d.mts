import type { Platform } from './policy.d.mts';

export interface Host {
    readonly nodeVersion: string;
    readonly execPath: string;
    readonly platform: Platform;
    readonly path: string;
}
export function platformOf(raw: string): Platform;
export function nodeHost(running?: { readonly version: string; readonly execPath: string; readonly platform: string; readonly env: Readonly<Record<string, string | undefined>> }): Host;
