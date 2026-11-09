import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Requests } from '#src/ports/requests.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { DesktopBus } from '../bus.ts';
import type { DesktopEngine } from '../engine.ts';
import type { OpenLeases } from '../lease.ts';

export interface ApiContext {
    readonly dir: Directory;
    readonly bus: DesktopBus;
    readonly leases: OpenLeases;
    readonly requests: Pick<Requests, 'request'>;
    readonly now: () => Instant;
    readonly engine?: DesktopEngine;
}

export interface ApiCall {
    readonly request: IncomingMessage;
    readonly response: ServerResponse;
    readonly url: URL;
    readonly gone: AbortSignal;
    readonly startedAt: Instant;
}

export type Handler = (call: ApiCall, context: ApiContext, params: readonly Text[]) => void | Promise<void>;
