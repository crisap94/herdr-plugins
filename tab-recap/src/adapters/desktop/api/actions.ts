import { must } from '#src/protocol/result.ts';
import { saying, type Unknown } from '#src/ports/unknowable.ts';
import { MESSAGE_LIMIT, NOTE_LIMIT } from '#src/recap/application/compaction-message.ts';
import { parsePaneId, type PaneId } from '#src/recap/domain/ids.ts';
import { parseNonEmptyText, parseText, type NonEmptyText, type Text } from '#src/recap/domain/text.ts';
import type { ApiCall, ApiContext, Handler } from './call.ts';
import { API_FROM_PARAM, API_NOTE_PARAM, API_PANE_PARAM, API_TO_PARAM } from '../constants.ts';
import type { DesktopEngine } from '../engine.ts';
import { sendFailure, sendJson } from './reply.ts';
import { withTab } from './tab.ts';

const failed = (call: ApiCall, lost: Unknown): void => {
    sendFailure(call.response, 500, 'internal', must(parseText(saying(lost.why))));
};

function decoded(raw: Text | undefined): Text {
    try {
        return must(parseText(decodeURIComponent(raw ?? '')));
    } catch {
        return must(parseText(''));
    }
}

const paneOf = (call: ApiCall, name: NonEmptyText): PaneId | null => {
    const parsed = parsePaneId(call.url.searchParams.get(name));
    return parsed.kind === 'ok' ? parsed.value : null;
};

function enginePresent(call: ApiCall, context: ApiContext): DesktopEngine | null {
    if (context.engine === undefined) { sendFailure(call.response, 503, 'unavailable'); }
    return context.engine ?? null;
}

export const answerHandler: Handler = withTab((tab, call, context, params) => {
    const engine = enginePresent(call, context);
    const id = parseNonEmptyText(decoded(params[1]));
    if (engine === null) { return; }
    if (id.kind === 'err') { return sendFailure(call.response, 400, 'bad-request'); }
    const answered = engine.answer(tab, id.value);
    if (answered.kind === 'answered') { return sendJson(call.response, 200, must(parseText(JSON.stringify({ answered: true, id: answered.id })))); }
    if (answered.kind === 'unknown') { return failed(call, answered); }
    sendFailure(call.response, answered.reason === 'unknown-need' ? 404 : 409, answered.reason);
});

export const compactHandler: Handler = withTab((tab, call, context) => {
    const engine = enginePresent(call, context);
    const pane = paneOf(call, API_PANE_PARAM);
    if (engine === null) { return; }
    if (pane === null) { return sendFailure(call.response, 400, 'bad-request'); }
    const made = engine.compactMessage(tab, pane, must(parseText(call.url.searchParams.get(API_NOTE_PARAM) ?? '')));
    if (made.kind === 'refused') { return sendFailure(call.response, made.reason === 'unknown-pane' ? 404 : 400, made.reason); }
    sendJson(call.response, 200, must(parseText(JSON.stringify({ kind: 'guidance', model: false, text: made.text, limit: MESSAGE_LIMIT, noteLimit: NOTE_LIMIT }))));
});

export const handoffHandler: Handler = withTab(async (tab, call, context) => {
    const engine = enginePresent(call, context);
    const from = paneOf(call, API_FROM_PARAM);
    const targeted = call.url.searchParams.has(API_TO_PARAM);
    const to = targeted ? paneOf(call, API_TO_PARAM) : null;
    if (engine === null) { return; }
    if (from === null || (targeted && to === null)) { return sendFailure(call.response, 400, 'bad-request'); }
    const read = await engine.handoffMessage(tab, from, to);
    if (read.kind === 'text') { return sendJson(call.response, 200, must(parseText(JSON.stringify({ kind: 'handoff', text: read.text })))); }
    if (read.kind === 'unknown') { return failed(call, read); }
    if (read.kind === 'unknown-pane' || read.reason === 'source-unavailable') { return sendFailure(call.response, 404, 'unknown-pane'); }
    sendFailure(call.response, 409, 'handoff-refused', must(parseText(read.reason)));
});
