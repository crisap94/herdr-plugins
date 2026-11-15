import type { ServerResponse } from 'node:http';
import type { Text } from '#src/recap/domain/text.ts';

export type ApiStatus = 200 | 202 | 204 | 400 | 401 | 403 | 404 | 405 | 409 | 413 | 429 | 500 | 503;

export type ApiFailure = 'unauthorized' | 'bad-host' | 'not-found' | 'method-not-allowed' | 'payload-too-large' | 'unknown-tab' | 'too-many-leases' | 'bad-request' | 'internal' | 'unknown-need' | 'not-a-need' | 'not-open' | 'note-too-long' | 'unknown-pane' | 'handoff-refused' | 'unavailable';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export function sendJson(response: ServerResponse, status: ApiStatus, body: Text): void {
    if (response.headersSent || response.destroyed) { return; }
    response.writeHead(status, { ...HEADERS, 'content-length': Buffer.byteLength(body) });
    response.end(body);
}

export function sendEmpty(response: ServerResponse, status: ApiStatus): void {
    if (response.headersSent || response.destroyed) { return; }
    response.writeHead(status, { 'cache-control': 'no-store' });
    response.end();
}

export function sendFailure(response: ServerResponse, status: ApiStatus, error: ApiFailure, detail: Text | null = null): void {
    const body = JSON.stringify(detail === null ? { error } : { error, detail });
    if (response.headersSent || response.destroyed) { return; }
    const close = status === 413 ? { connection: 'close' } : {};
    response.writeHead(status, { ...HEADERS, ...close, 'content-length': Buffer.byteLength(body) });
    response.end(body);
}
