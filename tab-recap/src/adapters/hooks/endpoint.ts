import { chmod, mkdir, stat, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Pipeline, adapters } from '@stateforge-labs/harness-hooks';
import type { HandleOptions } from '@stateforge-labs/harness-hooks';
import { AdmissionMode, createHookHandler, serveBun } from '@stateforge-labs/harness-hooks/endpoint';
import { receiverLayer } from '#src/adapters/hooks/layer.ts';
import { parseLine, type Line } from '#src/daemon/slots.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { HOOK_EVENTS, HOOK_LIMITS, PRE_COMPACT_CLAUDE_PATH, type HookReceiver, type PreCompactAnswer, type PreCompactTrigger } from '#src/wire/hooks/contract.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { claimSocket } from '#src/wire/socket-claim.ts';

export interface HookEndpointOptions {
    readonly socketPath: FsPath;
    readonly receiver: HookReceiver & PreCompactReceiver;
    readonly log: (line: Line) => void;
}

export interface HookEndpoint {
    stop(): Promise<void>;
}

type ErrorReport = NonNullable<HandleOptions['onError']>;

const OWNER_ONLY_DIRECTORY = 0o700;

const errorReport = (write: (line: Line) => void): ErrorReport => (message) => write(parseLine(`hook endpoint: ${message}`));

type Handler = (request: Request) => Promise<Response>;

export interface PreCompactCall {
    readonly session: Text | null;
    readonly trigger: PreCompactTrigger | null;
}

export interface PreCompactReceiver {
    preCompact(call: PreCompactCall): PreCompactAnswer;
}

export const parsePreCompactCall = (raw: unknown): PreCompactCall => {
    const fields = typeof raw === 'object' && raw !== null ? raw : {};
    const session = 'session_id' in fields ? parseText(fields.session_id) : null;
    const trigger = 'trigger' in fields ? fields.trigger : null;
    return { session: session?.kind === 'ok' ? session.value : null, trigger: trigger === 'manual' || trigger === 'auto' ? trigger : null };
};

const EMPTY_REPLY = (): Response => new Response('', { status: 200 });

const answerResponse = (answer: PreCompactAnswer): Response =>
    answer.kind === 'hold' ? Response.json({ decision: 'block', reason: answer.reason }) : EMPTY_REPLY();

async function preCompactResponse(request: Request, receiver: PreCompactReceiver): Promise<Response> {
    try {
        const text = await request.text();
        if (new TextEncoder().encode(text).byteLength > HOOK_LIMITS.bodyBytes) {
            return EMPTY_REPLY();
        }
        const parsed: unknown = JSON.parse(text);
        return answerResponse(receiver.preCompact(parsePreCompactCall(parsed)));
    } catch {
        return EMPTY_REPLY();
    }
}

const routeHookRequests =
    (library: Handler, receiver: HookReceiver & PreCompactReceiver): Handler =>
    (request) => {
        const url = new URL(request.url);
        if (request.method === 'POST' && url.pathname === PRE_COMPACT_CLAUDE_PATH) {
            return preCompactResponse(request, receiver);
        }
        return library(request);
    };

export async function startHookEndpoint(options: HookEndpointOptions): Promise<HookEndpoint | null> {
    const { socketPath, receiver, log } = options;
    const directory = dirname(socketPath);
    await mkdir(directory, { recursive: true, mode: OWNER_ONLY_DIRECTORY });
    await chmod(directory, OWNER_ONLY_DIRECTORY);
    const claim = await claimSocket(socketPath);
    if (claim.kind === 'too-long') {
        log(parseLine(`hook endpoint not started: socket path too long (${claim.bytes} bytes)`));
        return null;
    }
    if (claim.kind === 'unknown') {
        log(parseLine(`hook endpoint not started: socket unavailable: ${claim.detail}`));
        return null;
    }
    if (claim.kind !== 'free') {
        log(parseLine(`hook endpoint not started: ${claim.kind}`));
        return null;
    }
    const library = createHookHandler({
        adapters: new Map(Array.from(adapters).filter(([name]) => Object.hasOwn(HOOK_EVENTS, name))),
        pipeline: new Pipeline({ timeoutMs: HOOK_LIMITS.layerMs }).use(receiverLayer(receiver)),
        admission: { mode: AdmissionMode.Loopback },
        maxBodyBytes: HOOK_LIMITS.bodyBytes,
        onError: errorReport(log),
    });
    const handler = routeHookRequests(library, receiver);
    const server = await serveBun({ handler, listen: { socketPath }, maxBodyBytes: HOOK_LIMITS.bodyBytes });
    await chmod(socketPath, 0o600);
    const { ino } = await stat(socketPath);
    return {
        stop: async (): Promise<void> => {
            await server.close();
            const left = await stat(socketPath).catch(() => null);
            if (left !== null && left.ino === ino) {
                await unlink(socketPath);
            }
        },
    };
}
