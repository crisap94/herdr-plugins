import { notReadyLine, openCliStore } from '#src/daemon/cli-store.ts';
import { loadSettings, messagesOf } from '#src/daemon/config.ts';
import { AUTOCOMPACT_USAGE, LISTED, listingOf, parseListingArgs, styleLine } from '#src/recap/application/autocompact-listing.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { instant } from '#src/recap/domain/time.ts';
import { textOf } from '#src/recap/domain/text.ts';

export function autocompactCommand(argv: readonly string[]): number {
    const parsed = parseListingArgs(argv.map(textOf));
    if (parsed.kind === 'usage') {
        console.error(`tab-recap: 2 — ${parsed.why}\n${AUTOCOMPACT_USAGE}`);
        return 2;
    }
    const store = openCliStore();
    if (store.kind !== 'ready') {
        console.error(`tab-recap: 1 — ${notReadyLine(store, messagesOf())}`);
        return 1;
    }
    try {
        const now = instant(Date.now());
        const since = instant(now - 86_400_000);
        const lines = listingOf(store.decisions.newest(must(parseCount(LISTED))), { since, costUsd: store.decisions.costSince(since) }, now, textOf(Intl.DateTimeFormat().resolvedOptions().timeZone), store.decisions.skips());
        const config = loadSettings();
        console.log([styleLine(config.autocompact, config.tuning, messagesOf().autocompactSettings), '', ...lines].join('\n'));
        return 0;
    } finally {
        store.close();
    }
}
