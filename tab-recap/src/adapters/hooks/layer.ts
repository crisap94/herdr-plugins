import type { HarnessId, HookContext, Middleware, NeutralKind, NeutralReply } from '@stateforge-labs/harness-hooks';
import type { HookAnswer, HookCall, HookHarness, HookKind, HookReceiver, HookSource } from '#src/wire/hooks/contract.ts';

const HARNESSES: readonly HookHarness[] = ['claude', 'codex'];

const KINDS: readonly HookKind[] = ['stop', 'session-start', 'pre-compact'];

const SOURCES: readonly HookSource[] = ['startup', 'resume', 'clear', 'compact', 'fork'];

const harnessOf = (id: HarnessId): HookHarness | null => HARNESSES.find((harness) => harness === id) ?? null;

const kindOf = (kind: NeutralKind): HookKind => KINDS.find((known) => known === kind) ?? 'other';

function callOf(context: HookContext): HookCall | null {
    const harness = harnessOf(context.event.harness);
    if (harness === null) {
        return null;
    }
    const source = context.raw['source'];
    const cwd = context.raw['cwd'];
    const found = SOURCES.find((known) => known === source) ?? null;
    return {
        harness,
        kind: kindOf(context.event.kind),
        native: context.event.native,
        session: context.event.session,
        source: found === 'fork' ? 'startup' : found,
        cwd: typeof cwd === 'string' ? cwd : null,
    };
}

function replyOf(answer: HookAnswer): NeutralReply {
    return answer.kind === 'context' ? { context: answer.text } : {};
}

export function receiverLayer(receiver: HookReceiver): Middleware {
    return (context): NeutralReply => {
        const call = callOf(context);
        return call === null ? {} : replyOf(receiver.handle(call));
    };
}
