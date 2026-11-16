import { must } from '#src/protocol/result.ts';
import { parseCount, type Count } from '#src/recap/domain/count.ts';
import type { Intent } from '#src/wire/view/keys.ts';

export type Local = Extract<Intent, { readonly kind: 'scroll' | 'page' | 'jump' }>;

export interface Position {
    readonly scroll: Count;
    readonly rows: Count;
}

const MIN_PAGE = 1;
const PAGE_OVERLAP = 2;
const ZERO: Count = must(parseCount(0));
const LAST: Count = must(parseCount(Number.MAX_SAFE_INTEGER));

export const isLocal = (intent: Intent): intent is Local => intent.kind === 'scroll' || intent.kind === 'page' || intent.kind === 'jump';

export const scrolled = (position: Position, intent: Local): Count => {
    const from = Number(position.scroll);
    if (intent.kind === 'scroll') {
        return must(parseCount(Math.max(0, Math.min(from + intent.lines, Number.MAX_SAFE_INTEGER))));
    }
    if (intent.kind === 'page') {
        const page = Math.max(MIN_PAGE, Number(position.rows) - PAGE_OVERLAP);
        return must(parseCount(Math.max(0, Math.min(from + intent.pages * page, Number.MAX_SAFE_INTEGER))));
    }
    return intent.to === 'top' ? ZERO : LAST;
};
