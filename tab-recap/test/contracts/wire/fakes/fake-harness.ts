import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import type { HookAnswer, HookCall, HookHarness } from '#src/wire/hooks/contract.ts';

export type HookEffect = 'as-status' | 'direct' | 'session-started' | 'compacted' | 'marker';

export interface HookCaseLane {
    readonly status: 'working' | 'blocked' | 'idle' | 'done' | 'unknown';
    readonly statusEndedMsAgo: number | null;
}

export interface HookCase {
    readonly name: string;
    readonly harness: HookHarness;
    readonly event: string;
    readonly followed: boolean;
    readonly lane: HookCaseLane | null;
    readonly request: Readonly<Record<string, unknown>>;
    readonly call: HookCall | null;
    readonly effects: readonly HookEffect[];
    readonly answer: HookAnswer;
    readonly reply: Readonly<Record<string, unknown>>;
}

export interface StubBoard {
    followed(harness: HookHarness, session: string): { readonly lane: HookCaseLane | null } | null;
}

export const HOOK_FIXTURES: URL = new URL('../fixtures/hooks/', import.meta.url);

export function hookFixture(name: string): string {
    return readFileSync(new URL(name, HOOK_FIXTURES), 'utf8');
}

export function readHookCases(): readonly HookCase[] {
    return hookFixture('cases-claude.ndjson')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line): HookCase => JSON.parse(line));
}

export function stubBoard(cases: readonly HookCase[]): StubBoard {
    return {
        followed(harness, session) {
            const found = cases.find((c) => c.followed && c.harness === harness && c.request['session_id'] === session);
            return found === undefined ? null : { lane: found.lane };
        },
    };
}

export function postHook(socketPath: string, harness: HookHarness, body: unknown): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        const req = request(
            { socketPath, method: 'POST', path: `/hook/${harness}`, headers: { host: 'localhost', 'content-type': 'application/json' } },
            (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
                res.on('error', reject);
            },
        );
        req.on('error', reject);
        req.end(JSON.stringify(body));
    });
}

export function runShim(shimPath: string, event: string, body: unknown): Promise<{ stdout: string; code: number }> {
    return new Promise((resolve, reject) => {
        const child = spawn('sh', [shimPath, event], { stdio: ['pipe', 'pipe', 'ignore'] });
        const chunks: Buffer[] = [];
        child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        child.on('error', reject);
        child.on('close', (code) => resolve({ stdout: Buffer.concat(chunks).toString('utf8'), code: code ?? -1 }));
        child.stdin.end(JSON.stringify(body));
    });
}
