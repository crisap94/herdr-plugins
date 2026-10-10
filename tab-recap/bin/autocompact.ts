import { stateStore } from '#src/adapters/db/database.ts';
import { loadConfig, messagesOf, stateDir } from '#src/daemon/config.ts';
import { AUTOCOMPACT_USAGE, LISTED, listing, parseListing, styleLine } from '#src/recap/application/autocompact-listing.ts';

export function autocompactCommand(argv: readonly string[]): number {
    const parsed = parseListing(argv);
    if (parsed.kind === 'usage') {
        console.error(`tab-recap: 2 — ${parsed.why}\n${AUTOCOMPACT_USAGE}`);
        return 2;
    }
    const store = stateStore(stateDir());
    if (store.kind !== 'ready') {
        console.error(`tab-recap: 1 — ${messagesOf().database.newer(store.backup)}`);
        return 1;
    }
    try {
        const now = Date.now();
        const lines = listing(store.autocompact.newest(LISTED), { since: now - 86_400_000, costUsd: store.autocompact.costSince(now - 86_400_000) }, now, Intl.DateTimeFormat().resolvedOptions().timeZone, store.autocompact.skips());
        const config = loadConfig();
        console.log([styleLine(config.autocompact, config.tuning, messagesOf().autocompactSettings), '', ...lines].join('\n'));
        return 0;
    } finally {
        store.close();
    }
}
