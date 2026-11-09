import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Directory } from '#src/recap/domain/directory.ts';
import { must } from '#src/protocol/result.ts';
import { guiFileName } from '#src/recap/domain/gui-tab.ts';
import { NO } from '#src/recap/domain/gui-tab-parts.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { parseText, type NonEmptyText, type Text } from '#src/recap/domain/text.ts';
import { API_FILE, API_NO_INDEX, API_VERSION, INDEX_FILE } from './desktop-constants.ts';
import type { ApiContext, ApiCall, Handler } from './desktop-api-call.ts';
import { sendEmpty, sendFailure, sendJson } from './desktop-api-reply.ts';
import { eventsHandler } from './desktop-api-events.ts';
import { answerHandler, compactHandler, handoffHandler } from './desktop-api-actions.ts';
import { tabOf, withTab } from './desktop-api-tab.ts';

interface Route {
    readonly pattern: RegExp;
    readonly handlers: Readonly<Record<string, Handler | undefined>>;
}

function fileText(dir: Directory, name: NonEmptyText): Text | null {
    try {
        return must(parseText(readFileSync(join(dir, name), 'utf8')));
    } catch {
        return null;
    }
}

function tabFile(tab: TabId | null): NonEmptyText | null {
    const name = tab === null ? null : guiFileName(tab);
    return name === null || name === INDEX_FILE || name === API_FILE ? null : name;
}

const health: Handler = (call, context) => {
    sendJson(call.response, 200, must(parseText(JSON.stringify({ ok: true, version: API_VERSION, pid: process.pid, startedAt: call.startedAt, seq: context.bus.current() }))));
};

const index: Handler = (call, context) => {
    sendJson(call.response, 200, fileText(context.dir, INDEX_FILE) ?? API_NO_INDEX);
};

const document: Handler = (call, context, params) => {
    const name = tabFile(tabOf(params[0]));
    const text = name === null ? null : fileText(context.dir, name);
    if (text === null) {
        sendFailure(call.response, 404, 'unknown-tab');
        return;
    }
    sendJson(call.response, 200, text);
};

const refresh = withTab((tab, call, context) => {
    context.requests.request(tab);
    sendJson(call.response, 202, must(parseText('{"queued":true}')));
});

const lend = withTab((tab, call, context) => {
    if (context.leases.renew(tab) === NO) {
        sendFailure(call.response, 429, 'too-many-leases');
        return;
    }
    sendEmpty(call.response, 204);
});

const release = withTab((tab, call, context) => {
    context.leases.drop(tab);
    sendEmpty(call.response, 204);
});

const ROUTES: readonly Route[] = [
    { pattern: /^\/v1\/health$/u, handlers: { GET: health } },
    { pattern: /^\/v1\/index$/u, handlers: { GET: index } },
    { pattern: /^\/v1\/events$/u, handlers: { GET: eventsHandler } },
    { pattern: /^\/v1\/tabs\/([^/]+)$/u, handlers: { GET: document } },
    { pattern: /^\/v1\/tabs\/([^/]+)\/refresh$/u, handlers: { POST: refresh } },
    { pattern: /^\/v1\/tabs\/([^/]+)\/open$/u, handlers: { PUT: lend, DELETE: release } },
    { pattern: /^\/v1\/tabs\/([^/]+)\/needs\/([^/]+)\/answer$/u, handlers: { POST: answerHandler } },
    { pattern: /^\/v1\/tabs\/([^/]+)\/compact-message$/u, handlers: { GET: compactHandler } },
    { pattern: /^\/v1\/tabs\/([^/]+)\/handoff-message$/u, handlers: { GET: handoffHandler } },
];

export async function dispatch(call: ApiCall, context: ApiContext): Promise<void> {
    for (const route of ROUTES) {
        const found = route.pattern.exec(call.url.pathname);
        if (found === null) { continue; }
        const handler = route.handlers[call.request.method ?? ''];
        if (handler === undefined) {
            sendFailure(call.response, 405, 'method-not-allowed');
            return;
        }
        await handler(call, context, found.slice(1).map((each) => must(parseText(each))));
        return;
    }
    sendFailure(call.response, 404, 'not-found');
}
