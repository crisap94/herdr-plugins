import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseDirectory } from '#src/recap/domain/directory.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import type { PositiveCount } from '#src/recap/domain/count.ts';
import { parseSessionId } from '#src/recap/domain/ids.ts';
import type { SessionId } from '#src/recap/domain/ids.ts';
import type { HcTerminal } from '#src/recap/domain/hc-terminal.ts';

const CLAUDE_APP = 'claude-code';

export type SessionOfTerminal = (terminal: HcTerminal) => SessionId | null;

function claudeSessionFile(root: Directory, pid: PositiveCount): SessionId | null {
    try {
        const decoded: unknown = JSON.parse(readFileSync(join(root, 'sessions', `${pid}.json`), 'utf8'));
        const id: unknown = typeof decoded === 'object' && decoded !== null ? Reflect.get(decoded, 'sessionId') : undefined;
        const parsed = parseSessionId(id);
        return parsed.kind === 'ok' ? parsed.value : null;
    } catch {
        return null;
    }
}

export function defaultClaudeHome(): Directory | null {
    const parsed = parseDirectory(join(homedir(), '.claude'));
    return parsed.kind === 'ok' ? parsed.value : null;
}

export function claudeSessions(root: Directory | null): SessionOfTerminal {
    if (root === null) {
        return (): SessionId | null => null;
    }
    return (terminal: HcTerminal): SessionId | null => (terminal.app === CLAUDE_APP && terminal.pid !== null ? claudeSessionFile(root, terminal.pid) : null);
}
