import { parseCodexToolCall } from '@stateforge-labs/harness-adapters/codex';
import type { CodexToolUse } from '@stateforge-labs/harness-adapters/codex';
import { toolBrief } from '../jsonl.ts';
import type { Row } from '../jsonl.ts';
import { shell, squash } from '../tool-calls.ts';
import type { ToolCall } from '../tool-calls.ts';

const WEB_FALLBACK = 'web__run';

function callsOf(use: CodexToolUse, name: string, input: Row): readonly ToolCall[] {
    switch (use.tool) {
        case 'shell':
            return [shell(use.command ?? '')];
        case 'apply_patch': {
            const files = use.files ?? [];
            return files.length > 0 ? files.map((file): ToolCall => ({ kind: 'edit', text: file })) : [{ kind: 'edit', text: '' }];
        }
        case 'web':
            return [{ kind: 'web', text: squash(use.query ?? WEB_FALLBACK) }];
        default:
            return [{ kind: 'other', text: toolBrief(name, input) }];
    }
}

export function codexCalls(name: string, raw: unknown, input: Row): readonly ToolCall[] {
    return parseCodexToolCall(name, raw).flatMap((use) => callsOf(use, name, input));
}
