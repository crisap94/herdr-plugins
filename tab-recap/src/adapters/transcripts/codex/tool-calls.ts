import type { CodexToolUse } from '@stateforge-labs/harness-adapters/codex';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, textOf, type Text } from '@stateforge-labs/session-ledger';
import { toolBriefOf } from '../jsonl.ts';
import type { Row } from '../jsonl.ts';
import { shellCall, squashText } from '../tool-calls.ts';
import type { ToolCall } from '../tool-calls.ts';

const WEB_FALLBACK = 'web__run';

function callsOf(use: CodexToolUse, name: Text, input: Row): readonly ToolCall[] {
    switch (use.tool) {
        case 'shell':
            return [shellCall(textOf(use.command ?? ''), null)];
        case 'apply_patch': {
            const files = use.files ?? [];
            return files.length > 0 ? files.map((file): ToolCall => ({ kind: 'edit', text: must(parseText(file)) })) : [{ kind: 'edit', text: must(parseText('')) }];
        }
        case 'web':
            return [{ kind: 'web', text: squashText(must(parseText(use.query ?? WEB_FALLBACK))) }];
        default:
            return [{ kind: 'other', text: toolBriefOf(name, input) }];
    }
}

export function codexCallsOf(name: Text, uses: readonly CodexToolUse[], input: Row): readonly ToolCall[] {
    return uses.flatMap((use) => callsOf(use, name, input));
}
