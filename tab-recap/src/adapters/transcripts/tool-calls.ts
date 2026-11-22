import { toolClass, toolTarget, ToolClass } from '@stateforge-labs/harness-adapters';
import type { CallKind, Entry } from '#src/ports/transcripts.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { parseFilledText, toolBriefOf } from './jsonl.ts';
import type { Row } from './jsonl.ts';

export interface ToolCall {
    readonly kind: CallKind;
    readonly text: Text;
    readonly what?: Text;
}

export type HarnessKind = Parameters<typeof toolClass>[0];
type AtKey = 'command' | 'description' | 'url' | 'query' | 'prompt';

const COMMAND_CHARS = must(parseCount(64));
const WHAT_CHARS = must(parseCount(120));
const LOOKS = new Set(['cat', 'sed', 'grep', 'rg', 'ls', 'head', 'tail', 'find', 'wc']);
const LOCAL_CLASSES: Readonly<Partial<Record<HarnessKind, Readonly<Record<string, ToolClass>>>>> = {
    opencode: { task: ToolClass.Agent },
};

const EMPTY = must(parseText(''));
const textAt = (input: Row, key: AtKey): Text | null => {
    const value = parseFilledText(input[key]);
    return value.kind === 'ok' ? value.value : null;
};

export function squashText(value: Text, max: Count = COMMAND_CHARS): Text {
    const line = value.split(/\s+/).join(' ').trim();
    return must(parseText(line.length > max ? `${line.slice(0, max - 1)}…` : line));
}

export function isPlainReadText(command: Text): Presence {
    const first = command.trim().split(/\s+/)[0] ?? '';
    return LOOKS.has(first) && !/>|\btee\b|\bsed\b[^|;&]*\s-[a-zA-Z]*i/.test(command) ? 'present' : 'absent';
}

export function shellCall(command: Text, what: Text | null): ToolCall {
    const kind: CallKind = isPlainReadText(command) === 'present' ? 'read' : 'shell';
    return what === null
        ? { kind, text: squashText(command, COMMAND_CHARS) }
        : { kind, text: EMPTY, what: squashText(what, WHAT_CHARS) };
}

const commandOf = (input: Row): ToolCall => shellCall(textAt(input, 'command') ?? EMPTY, textAt(input, 'description'));
const webOf = (input: Row): Text => squashText(textAt(input, 'url') ?? textAt(input, 'query') ?? EMPTY);
const agentOf = (name: Text, input: Row): Text => squashText(textAt(input, 'description') ?? textAt(input, 'prompt') ?? name);

export function namedCallOf(harness: HarnessKind, name: Text, input: Row): ToolCall {
    const target = must(parseText(toolTarget(harness, name, input) ?? ''));
    switch (LOCAL_CLASSES[harness]?.[name] ?? toolClass(harness, name)) {
        case ToolClass.Shell:
            return commandOf(input);
        case ToolClass.Read:
            return { kind: 'read', text: target };
        case ToolClass.Edit:
            return { kind: 'edit', text: target };
        case ToolClass.Web:
            return { kind: 'web', text: webOf(input) };
        case ToolClass.Agent:
            return { kind: 'agent', text: agentOf(name, input) };
        default:
            return { kind: 'other', text: toolBriefOf(name, input) };
    }
}

export function toolEntryOf(call: ToolCall, at: Instant | null): Entry {
    return {
        role: 'tool', text: call.text, kind: call.kind,
        ...(call.what === undefined ? {} : { what: call.what }),
        ...(at === null ? {} : { at }),
    };
}
