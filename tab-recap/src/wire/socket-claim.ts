import { Buffer } from 'node:buffer';
import { unlink } from 'node:fs/promises';
import { connect } from 'node:net';
import { SOCKET_PATH_MAX } from './paths.ts';

export { SOCKET_PATH_MAX };

export type Claim =
    | { readonly kind: 'free' }
    | { readonly kind: 'live' }
    | { readonly kind: 'too-long'; readonly bytes: number }
    | { readonly kind: 'unknown'; readonly detail: string };

const PROBE_MS = 250;

export async function claimSocket(path: string, options?: { readonly probeMs?: number }): Promise<Claim> {
    const bytes = Buffer.byteLength(path, 'utf8');
    if (bytes > SOCKET_PATH_MAX) return { kind: 'too-long', bytes };
    const probeMs = options?.probeMs ?? PROBE_MS;
    const failure = await new Promise<Error | null>((resolve) => {
        const socket = connect(path);
        const timer = setTimeout(() => {
            socket.destroy();
            resolve(new Error(`no answer within ${probeMs} ms`));
        }, probeMs);
        socket.once('connect', () => {
            clearTimeout(timer);
            socket.destroy();
            resolve(null);
        });
        socket.once('error', (error: Error) => {
            clearTimeout(timer);
            socket.destroy();
            resolve(error);
        });
    }).catch((error: Error) => error);
    if (failure === null) return { kind: 'live' };
    const code = 'code' in failure ? failure.code : undefined;
    if (code === 'ENOENT') return { kind: 'free' };
    if (code !== 'ECONNREFUSED') return { kind: 'unknown', detail: failure.message };
    return unlink(path).then(
        (): Claim => ({ kind: 'free' }),
        (error: Error): Claim => ('code' in error && error.code === 'ENOENT' ? { kind: 'free' } : { kind: 'unknown', detail: `stale file not removed: ${error.message}` }),
    );
}
