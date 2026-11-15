import { claudeHome, claudeSessionIdOfPid } from '@stateforge-labs/harness-adapters/claude';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { parseSessionId } from '#src/recap/domain/ids.ts';
import type { SessionId } from '#src/recap/domain/ids.ts';
import type { HcTerminal, PositiveCount } from './sdk-core.ts';

const CLAUDE_APP = 'claude-code';

export type SessionOfTerminal = (terminal: HcTerminal) => SessionId | null;

function claudeSessionFile(root: Directory, pid: PositiveCount): SessionId | null {
    const parsed = parseSessionId(claudeSessionIdOfPid(pid, root));
    return parsed.kind === 'ok' ? parsed.value : null;
}

export function defaultClaudeHome(): Directory | null {
    const parsed = parseDirectory(claudeHome());
    return parsed.kind === 'ok' ? parsed.value : null;
}

export function claudeSessions(root: Directory | null): SessionOfTerminal {
    if (root === null) {
        return (): SessionId | null => null;
    }
    return (terminal: HcTerminal): SessionId | null => (terminal.app === CLAUDE_APP && terminal.pid !== null ? claudeSessionFile(root, terminal.pid) : null);
}
