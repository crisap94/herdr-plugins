import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RequestPort } from '#src/ports/requests.ts';
import type { Directory } from '@stateforge-labs/session-ledger';
import type { Instant } from '@stateforge-labs/session-ledger';
import type { Text } from '@stateforge-labs/session-ledger';
import type { DesktopBus } from '../bus.ts';
import type { DesktopEngine } from '../engine.ts';
import type { OpenLeases } from '../lease.ts';

export interface ApiContext {
    readonly dir: Directory;
    readonly bus: DesktopBus;
    readonly leases: OpenLeases;
    readonly requests: Pick<RequestPort, 'request'>;
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
