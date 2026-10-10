import type { CallKind } from '#src/ports/transcripts.ts';
import { callBuilders, type ToolCall } from './tool-calls.ts';
import type { Row } from './jsonl.ts';

const OPENCODE_TOOL_KINDS: Readonly<Record<string, CallKind>> = Object.fromEntries([
    ...['bash'].map((name) => [name, 'shell']),
    ...['read', 'grep', 'glob', 'list'].map((name) => [name, 'read']),
    ...['edit', 'write', 'patch', 'apply_patch'].map((name) => [name, 'edit']),
    ...['webfetch', 'websearch', 'codesearch'].map((name) => [name, 'web']),
    ...['task'].map((name) => [name, 'agent']),
]) as Readonly<Record<string, CallKind>>;

export const opencodeNamedCall = (name: string, input: Row): ToolCall => callBuilders[OPENCODE_TOOL_KINDS[name] ?? 'other'](name, input);
