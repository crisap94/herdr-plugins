import { must } from '#src/protocol/result.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import { HOOK_LIMITS, PRE_COMPACT_CLAUDE_PATH } from '#src/wire/hooks/contract.ts';

const quoted = (path: FsPath): Text => must(parseText(`'${path.replaceAll("'", "'\\''")}'`));

export function renderPreCompactScript(socketPath: FsPath): Text {
    const lines = [
        '#!/bin/sh',
        `body=$(curl --fail --silent --max-time ${HOOK_LIMITS.shimMs / 1000} --unix-socket ${quoted(socketPath)} -H 'Content-Type: application/json' --data-binary @- http://localhost${PRE_COMPACT_CLAUDE_PATH} 2>/dev/null) || exit 0`,
        `printf '%s' "$body"`,
        'exit 0',
        '',
    ];
    return must(parseText(lines.join('\n')));
}
