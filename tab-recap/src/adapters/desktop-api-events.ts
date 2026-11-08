import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import { YES } from '#src/recap/domain/gui-tab-parts.ts';
import { parseNonEmptyText, parseText, type NonEmptyText, type Text } from '#src/recap/domain/text.ts';
import { duration, type Instant } from '#src/recap/domain/time.ts';
import { API_POLL_CAP_S, API_POLL_DEFAULT_S } from './desktop-constants.ts';
import type { BusRead } from './desktop-bus.ts';
import type { ApiCall, ApiContext } from './desktop-api-call.ts';
import { sendFailure, sendJson } from './desktop-api-reply.ts';

const SINCE: NonEmptyText = must(parseNonEmptyText('since'));
const WAIT: NonEmptyText = must(parseNonEmptyText('wait'));
const DIGITS = /^\d{1,15}$/u;

function digits(url: URL, name: NonEmptyText, fallback: Count): Count | null {
    const raw = url.searchParams.get(name);
    if (raw === null) { return fallback; }
    return DIGITS.test(raw) ? must(parseCount(Number(raw))) : null;
}

function wireOf(read: BusRead, epoch: Instant): Text {
    return must(parseText(JSON.stringify({ seq: read.seq, epoch, reset: read.reset === YES, events: read.events.map((event) => ({ seq: event.seq, topic: event.topic, tab: event.tab, at: event.at })) })));
}

export async function eventsHandler(call: ApiCall, context: ApiContext): Promise<void> {
    const since = digits(call.url, SINCE, must(parseCount(0)));
    const wait = digits(call.url, WAIT, API_POLL_DEFAULT_S);
    if (since === null || wait === null) {
        sendFailure(call.response, 400, 'bad-request', must(parseText('since and wait are whole numbers')));
        return;
    }
    const seconds = Math.min(wait, API_POLL_CAP_S);
    const read = await context.bus.wait(since, duration(seconds * 1000), call.gone);
    sendJson(call.response, 200, wireOf(read, call.startedAt));
}
