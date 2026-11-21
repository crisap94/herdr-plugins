import type { CodexToolUse } from '@stateforge-labs/harness-adapters/codex';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { toolBriefOf } from '../jsonl.ts';
import type { Row } from '../jsonl.ts';
import { shell, squashText } from '../tool-calls.ts';
import type { ToolCall } from '../tool-calls.ts';

export { codexCalls } from './legacy.ts';

const WEB_FALLBACK = 'web__run';

function callsOf(use: CodexToolUse, name: Text, input: Row): readonly ToolCall[] {
    switch (use.tool) {
        case 'shell':
            return [shell(use.command ?? '')];
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
