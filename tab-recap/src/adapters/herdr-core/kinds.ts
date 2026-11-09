import { parseAgentKind } from '#src/recap/domain/ids.ts';
import type { AgentKind } from '#src/recap/domain/ids.ts';
import type { NonEmptyText } from '#src/recap/domain/text.ts';

const KIND_OF_APP: ReadonlyMap<string, string> = new Map([['claude-code', 'claude'], ['codex', 'codex'], ['opencode', 'opencode'], ['hermes', 'hermes']]);

export function agentOfApp(app: NonEmptyText): AgentKind | null {
    const parsed = parseAgentKind(KIND_OF_APP.get(app) ?? app);
    return parsed.kind === 'ok' ? parsed.value : null;
}
