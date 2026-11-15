import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { GUI_DIR, world } from './herdr.ts';

interface Hold {
    readonly res: ServerResponse;
    readonly since: number;
}

export interface Call {
    readonly method: string;
    readonly path: string;
    readonly auth: string;
}

export interface Failure {
    readonly status: number;
    readonly error: string;
    readonly detail?: string;
}

export type Route = 'answer' | 'compact' | 'handoff';

const JSON_TYPE = { 'Content-Type': 'application/json' };
const DISCOVERY = `${GUI_DIR}/api.json`;
const WAIT = 5_000;

export async function until(done: () => boolean, label = 'condition'): Promise<void> {
    const started = process.hrtime.bigint();
    while (!done()) {
        if (Number(process.hrtime.bigint() - started) / 1e6 > WAIT) {
            throw new Error(`timed out waiting for ${label}`);
        }
        await new Promise<void>((resume) => { setTimeout(resume, 5); });
    }
}

export class FakeApi {
    readonly token = randomBytes(32).toString('hex');
    readonly calls: Call[] = [];
    readonly holds: Hold[] = [];
    seq = 0;
    startedAt = 1_700_000_000_000 + Math.floor(Math.random() * 1e9);
    epoch = this.startedAt;
    pid = process.pid;
    index: string | null = null;
    tabs = new Map<string, string>();
    resetNext = false;
    status = 200;
    eventsStatus = 200;
    slowDocs: { body: string; ms: number }[] = [];
    failing: Record<Route, Failure | null> = { answer: null, compact: null, handoff: null };
    answered: string[] = [];
    closeOnAnswer = true;
    dropAfterAnswer = false;
    dropNext = 0;
    dropPosts = false;
    unauthorizedNext = 0;
    answerDelay = 0;
    slowCompact: number[] = [];
    slowHandoff: number[] = [];
    compactText: ((pane: string, note: string) => string) | null = null;
    inflight = 0;
    peak = 0;
    private readonly events: { seq: number; topic: string; tab: string | null }[] = [];
    private readonly server: Server;

    private constructor() {
        this.server = createServer((req, res) => { this.handle(req, res); });
    }

    static async start(): Promise<FakeApi> {
        const api = new FakeApi();
        await new Promise<void>((ready) => { api.server.listen(0, '127.0.0.1', ready); });
        return api;
    }

    get port(): number {
        const address = this.server.address();
        return (address as AddressInfo).port;
    }

    advertise(token: string = this.token, claim: { pid?: number; startedAt?: number } = {}): void {
        world.files.set(DISCOVERY, JSON.stringify({ version: 1, port: this.port, token, pid: claim.pid ?? this.pid, startedAt: claim.startedAt ?? this.startedAt }));
    }

    publish(topic: string, tab: string | null = null): void {
        this.seq += 1;
        this.events.push({ seq: this.seq, topic, tab });
        this.release();
    }

    count(prefix: string): number {
        return this.calls.filter((call) => call.path.startsWith(prefix)).length;
    }

    async stop(): Promise<void> {
        this.server.closeAllConnections();
        await new Promise<void>((done) => { this.server.close(() => { done(); }); });
    }

    private release(): void {
        for (const hold of this.holds.splice(0)) {
            this.answer(hold.res, hold.since);
        }
    }

    private answer(res: ServerResponse, since: number): void {
        const fresh = this.events.filter((one) => one.seq > since);
        const stale = since > this.seq;
        const events = stale ? [] : fresh.map((one) => ({ seq: one.seq, topic: one.topic, tab: one.tab, at: 0 }));
        const reset = stale || this.resetNext;
        this.resetNext = false;
        res.writeHead(200, JSON_TYPE).end(JSON.stringify({ seq: this.seq, epoch: this.epoch, reset, events }));
    }

    private poll(res: ServerResponse, query: URLSearchParams): void {
        const since = Number(query.get('since'));
        const waiting = !this.resetNext && since <= this.seq && !this.events.some((one) => one.seq > since);
        if (!waiting) {
            this.answer(res, since);
            return;
        }
        this.holds.push({ res, since });
        res.on('close', () => { this.holds.splice(0, this.holds.length, ...this.holds.filter((one) => one.res !== res)); });
    }

    private tab(res: ServerResponse, name: string): void {
        const slow = this.slowDocs.shift();
        if (slow !== undefined) {
            setTimeout(() => { res.writeHead(200, JSON_TYPE).end(slow.body); }, slow.ms);
            return;
        }
        const body = this.tabs.get(decodeURIComponent(name)) ?? null;
        res.writeHead(body === null ? 404 : 200, JSON_TYPE).end(body ?? JSON.stringify({ error: 'unknown-tab' }));
    }

    private fail(res: ServerResponse, route: Route): boolean {
        const failure = this.failing[route];
        if (failure === null) {
            return false;
        }
        res.writeHead(failure.status, JSON_TYPE).end(JSON.stringify(failure.detail === undefined ? { error: failure.error } : { error: failure.error, detail: failure.detail }));
        return true;
    }

    private close(tab: string, id: string): void {
        const doc = JSON.parse(this.tabs.get(tab) ?? 'null') as { tasks?: { facts?: { id: string; state: string }[] }[] } | null;
        doc?.tasks?.forEach((task) => task.facts?.filter((one) => one.id === id).forEach((one) => { one.state = 'closed'; }));
        this.tabs.set(tab, JSON.stringify(doc));
        this.publish('tab', tab);
    }

    private answerNeed(res: ServerResponse, tab: string, id: string): void {
        if (this.fail(res, 'answer')) {
            return;
        }
        setTimeout(() => {
            this.answered.push(`${tab}:${id}`);
            if (this.closeOnAnswer) {
                this.close(tab, id);
            }
            if (this.dropAfterAnswer) {
                res.socket?.destroy();
                return;
            }
            res.writeHead(200, JSON_TYPE).end(JSON.stringify({ answered: true, id }));
        }, this.answerDelay);
    }

    private messageBody(route: Route, query: URLSearchParams): Record<string, unknown> {
        const pane = query.get('pane') ?? query.get('from') ?? '';
        if (route !== 'compact') {
            return { kind: 'handoff', text: `Handoff from ${pane} to ${query.get('to') ?? ''}` };
        }
        const note = query.get('note') ?? '';
        return { kind: 'guidance', text: this.compactText?.(pane, note) ?? `Guidance for ${pane}: ${note}`, limit: 3000, noteLimit: 280, model: false };
    }

    private message(res: ServerResponse, route: Route, query: URLSearchParams): void {
        if (this.fail(res, route)) {
            return;
        }
        const body = this.messageBody(route, query);
        const delay = route === 'compact' ? this.slowCompact.shift() : this.slowHandoff.shift();
        this.inflight += 1;
        this.peak = Math.max(this.peak, this.inflight);
        setTimeout(() => {
            this.inflight -= 1;
            res.writeHead(200, JSON_TYPE).end(JSON.stringify(body));
        }, delay ?? 0);
    }

    private plain(res: ServerResponse, path: string): boolean {
        if (path === '/v1/health') {
            res.writeHead(200, JSON_TYPE).end(JSON.stringify({ ok: true, version: 1, pid: this.pid, startedAt: this.startedAt, seq: this.seq }));
            return true;
        }
        if (path === '/v1/index') {
            res.writeHead(200, JSON_TYPE).end(this.index ?? world.files.get(`${GUI_DIR}/index.json`) ?? '{}');
            return true;
        }
        return false;
    }

    private stream(res: ServerResponse, query: URLSearchParams): void {
        if (this.eventsStatus !== 200) {
            res.writeHead(this.eventsStatus, JSON_TYPE).end('{"error":"broken"}');
            return;
        }
        this.poll(res, query);
    }

    private route(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams): void {
        const tab = /^\/v1\/tabs\/([^/]+)$/.exec(path)?.[1];
        if (this.plain(res, path) || this.guided(req, res, path, query)) {
            return;
        }
        if (tab !== undefined) {
            this.tab(res, tab);
        } else if (path === '/v1/events') {
            this.stream(res, query);
        } else {
            this.mutate(req, res);
        }
    }

    private guided(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams): boolean {
        const answer = /^\/v1\/tabs\/([^/]+)\/needs\/([^/]+)\/answer$/.exec(path);
        const message = /^\/v1\/tabs\/([^/]+)\/(compact|handoff)-message$/.exec(path);
        if (answer && req.method === 'POST') {
            this.answerNeed(res, decodeURIComponent(answer[1] ?? ''), decodeURIComponent(answer[2] ?? ''));
        } else if (message && req.method === 'GET') {
            this.message(res, message[2] === 'compact' ? 'compact' : 'handoff', query);
        } else {
            return false;
        }
        return true;
    }

    private mutate(req: IncomingMessage, res: ServerResponse): void {
        if (req.method === 'POST') {
            res.writeHead(202, JSON_TYPE).end('{"queued":true}');
        } else if (req.method === 'PUT' || req.method === 'DELETE') {
            res.writeHead(204).end();
        } else {
            res.writeHead(404, JSON_TYPE).end('{"error":"not-found"}');
        }
    }

    private denied(res: ServerResponse, auth: string): boolean {
        if (auth !== `Bearer ${this.token}`) {
            res.writeHead(401, JSON_TYPE).end('{"error":"unauthorized"}');
        } else if (this.status !== 200) {
            res.writeHead(this.status, JSON_TYPE).end('{"error":"broken"}');
        } else if (this.unauthorizedNext > 0) {
            this.unauthorizedNext -= 1;
            res.writeHead(401, JSON_TYPE).end('{"error":"unauthorized"}');
        } else {
            return false;
        }
        return true;
    }

    private dropped(req: IncomingMessage, res: ServerResponse): boolean {
        if (this.dropPosts && req.method === 'POST') {
            res.socket?.destroy();
            return true;
        }
        if (this.dropNext > 0) {
            this.dropNext -= 1;
            res.socket?.destroy();
            return true;
        }
        return false;
    }

    private handle(req: IncomingMessage, res: ServerResponse): void {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const auth = req.headers.authorization ?? '';
        this.calls.push({ method: req.method ?? '', path: `${url.pathname}${url.search}`, auth });
        req.resume();
        if (url.pathname !== '/v1/health' && (this.denied(res, auth) || this.dropped(req, res))) {
            return;
        }
        this.route(req, res, url.pathname, url.searchParams);
    }
}
