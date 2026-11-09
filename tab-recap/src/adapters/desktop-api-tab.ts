import { NO } from '#src/recap/domain/gui-tab-parts.ts';
import { parseTabId, type TabId } from '#src/recap/domain/ids.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { ApiCall, ApiContext, Handler } from './desktop-api-call.ts';
import { listed } from './desktop-api-known.ts';
import { sendFailure } from './desktop-api-reply.ts';

export function tabOf(raw: Text | undefined): TabId | null {
    try {
        const parsed = parseTabId(decodeURIComponent(raw ?? ''));
        return parsed.kind === 'ok' ? parsed.value : null;
    } catch {
        return null;
    }
}

export function withTab(act: (tab: TabId, call: ApiCall, context: ApiContext, params: readonly Text[]) => void | Promise<void>): Handler {
    return (call, context, params): void | Promise<void> => {
        const tab = tabOf(params[0]);
        if (tab === null || listed(context.dir, tab) === NO) {
            sendFailure(call.response, 404, 'unknown-tab');
            return;
        }
        return act(tab, call, context, params);
    };
}
