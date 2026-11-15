import { request, type IncomingHttpHeaders } from 'node:http';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { must } from '#src/protocol/result.ts';
import { DesktopApi } from '#src/adapters/desktop/api/server.ts';
import { DesktopBus } from '#src/adapters/desktop/bus.ts';
import { OpenLeases } from '#src/adapters/desktop/lease.ts';
import { parseDirectory, type Directory } from '#src/recap/domain/directory.ts';
import { instant } from '#src/recap/domain/time.ts';

export interface Reply {
    readonly status: number;
    readonly headers: IncomingHttpHeaders;
    readonly text: string;
}

export interface Rig {
    readonly dir: Directory;
    readonly bus: DesktopBus;
    readonly leases: OpenLeases;
    readonly api: DesktopApi;
    readonly asked: string[];
    readonly clock: { at: number };
    readonly port: number;
    readonly token: string;
}

export interface Options {
    readonly token?: string | null;
    readonly host?: string;
    readonly body?: string;
    readonly signal?: AbortSignal;
}

export async function startRig(): Promise<Rig> {
    const dir = must(parseDirectory(mkdtempSync(join(tmpdir(), 'desktop-api-'))));
    const clock = { at: 1000 };
    const now = (): ReturnType<typeof instant> => instant(clock.at);
    const bus = new DesktopBus(now);
    const leases = new OpenLeases(now);
    const asked: string[] = [];
    const api = new DesktopApi({ dir, bus, leases, requests: { request: (tab): void => { asked.push(tab); } }, now }, () => undefined);
    const started = await api.listen();
    if (started.kind === 'err') { throw new Error(started.error); }
    const found = JSON.parse(readFileSync(join(dir, 'api.json'), 'utf8'));
    return { dir, bus, leases, api, asked, clock, port: found.port, token: found.token };
}

export function call(rig: Rig, method: string, path: string, options: Options = {}): Promise<Reply> {
    return new Promise((resolve, reject) => {
        const token = options.token === undefined ? rig.token : options.token;
        const headers: Record<string, string> = { host: options.host ?? `127.0.0.1:${rig.port}` };
        if (token !== null) { headers['authorization'] = `Bearer ${token}`; }
        if (options.body !== undefined) { headers['content-length'] = String(Buffer.byteLength(options.body)); }
        const sent = request({ host: '127.0.0.1', port: rig.port, method, path, headers, agent: false, ...(options.signal === undefined ? {} : { signal: options.signal }) }, (response) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => chunks.push(chunk));
            response.on('end', () => { resolve({ status: response.statusCode ?? 0, headers: response.headers, text: Buffer.concat(chunks).toString('utf8') }); });
        });
        sent.on('error', reject);
        sent.end(options.body);
    });
}

export const json = (reply: Reply): unknown => JSON.parse(reply.text);

export function publishIndex(rig: Rig, tabs: readonly string[]): void {
    writeFileSync(join(rig.dir, 'index.json'), JSON.stringify({ version: 1, tabs: tabs.map((tab) => ({ tab })) }));
}
