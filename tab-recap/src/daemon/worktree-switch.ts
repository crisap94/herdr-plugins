import { parseWorktreeSwitch } from '#src/recap/domain/worktree.ts';
import type { WorktreeSwitch } from '#src/recap/domain/worktree.ts';
import { settingGetter } from './config.ts';

export const GIT_NOTE_SETTING = 'TAB_RECAP_GIT_NOTE';

export function worktreeSwitch(): WorktreeSwitch {
    const parsed = parseWorktreeSwitch(settingGetter()(GIT_NOTE_SETTING));
    return parsed.kind === 'ok' ? parsed.value : 'on';
}
