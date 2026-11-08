import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { err, must, ok, type Result } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { parseNonEmptyText, parseText, type NonEmptyText, type Text } from '#src/recap/domain/text.ts';
import { NO, YES, type Flag } from '#src/recap/domain/gui-tab-parts.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { API_BODY_CAP, API_HEALTH_PATH, API_HOST, API_LOCALHOST, API_TOKEN_BYTES } from './desktop-constants.ts';
import type { ApiContext } from './desktop-api-call.ts';
import { removeDiscovery, writeDiscovery } from './desktop-api-discovery.ts';
import { sendFailure } from './desktop-api-reply.ts';
import { dispatch } from './desktop-api-routes.ts';

const hash = (text: Text): Text => must(parseText(createHash('sha256').update(text).digest('hex')));

const same = (given: Text, expected: Text): Flag => (timingSafeEqual(Buffer.from(hash(given)), Buffer.from(hash(expected))) ? YES : NO);

async function withinCap(request: IncomingMessage): Promise<Flag> {
    if (Number(request.headers['content-length'] ?? 0) > API_BODY_CAP) { return NO; }
    let size = 0;
    try {
        for await (const chunk of request) {
            const piece: unknown = chunk;
            size += Buffer.isBuffer(piece) ? piece.length : 0;
            if (size > API_BODY_CAP) { return NO; }
        }
    } catch {
        return NO;
    }
    return YES;
}

export class DesktopApi {
    private readonly context: ApiContext;
    private readonly log: (line: NonEmptyText) => void;
    private readonly token: NonEmptyText = must(parseNonEmptyText(randomBytes(API_TOKEN_BYTES).toString('hex')));
    private readonly server: Server;
    private port: Count = must(parseCount(0));
    private started: Instant = instant(0);
    private closed: Flag = NO;

    constructor(context: ApiContext, log: (line: NonEmptyText) => void) {
        this.context = context;
        this.log = log;
        this.server = createServer((request: IncomingMessage, response: ServerResponse): void => { void this.serve(request, response); });
    }

    listen(): Promise<Result<Count, Text>> {
        return new Promise((resolve) => {
            this.server.once('error', (error) => { resolve(err(must(parseText(error.message)))); });
            this.server.listen(0, API_HOST, () => {
                const address = this.server.address();
                this.port = must(parseCount(typeof address === 'object' && address !== null ? address.port : 0));
                if (this.closed === YES) {
                    this.shutServer();
                    resolve(err(must(parseText('closed before it was listening'))));
                    return;
                }
                this.started = instant(Date.now());
                try {
                    writeDiscovery(this.context.dir, { port: this.port, token: this.token, startedAt: this.started });
                } catch (failure) {
                    this.closed = YES;
                    this.shutServer();
                    resolve(err(must(parseText(failure instanceof Error ? failure.message : 'api.json not written'))));
                    return;
                }
                resolve(ok(this.port));
            });
        });
    }

    close(): void {
        if (this.closed === YES) { return; }
        this.closed = YES;
        this.context.bus.close();
        removeDiscovery(this.context.dir, this.token);
        this.shutServer();
    }

    private shutServer(): void {
        if (this.server.listening) { this.server.close(); }
        this.server.closeIdleConnections();
        setImmediate(() => { this.server.closeAllConnections(); });
    }

    private bearer(request: IncomingMessage): Flag {
        return same(must(parseText(request.headers.authorization ?? '')), must(parseText(`Bearer ${this.token}`)));
    }

    private isHealth(request: IncomingMessage): Flag {
        return request.method === 'GET' && (request.url ?? '').split('?')[0] === API_HEALTH_PATH ? YES : NO;
    }

    private hostOk(request: IncomingMessage): Flag {
        const host = request.headers.host ?? '';
        return host === `${API_HOST}:${this.port}` || host === `${API_LOCALHOST}:${this.port}` ? YES : NO;
    }

    private admit(request: IncomingMessage, response: ServerResponse): Flag {
        if (this.isHealth(request) === NO && this.bearer(request) === NO) {
            sendFailure(response, 401, 'unauthorized');
            return NO;
        }
        if (this.hostOk(request) === NO) {
            sendFailure(response, 403, 'bad-host');
            return NO;
        }
        return YES;
    }

    private async serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
        try {
            if (this.admit(request, response) === NO) { return; }
            if (await withinCap(request) === NO) { return sendFailure(response, 413, 'payload-too-large'); }
            const gone = new AbortController();
            response.on('close', () => { gone.abort(); });
            const url = URL.canParse(request.url ?? '/', `http://${API_HOST}:${this.port}`) ? new URL(request.url ?? '/', `http://${API_HOST}:${this.port}`) : null;
            if (url === null) { return sendFailure(response, 400, 'bad-request'); }
            await dispatch({ request, response, url, gone: gone.signal, startedAt: this.started }, this.context);
        } catch (error) {
            this.log(must(parseNonEmptyText(`api: ${error instanceof Error ? error.message : String(error)}`)));
            sendFailure(response, 500, 'internal');
        }
    }
}
