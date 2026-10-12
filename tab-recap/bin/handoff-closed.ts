import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import { paneId, tabId, type PaneId, type TabId } from '#src/recap/domain/ids.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';

export interface HandoffValues {
    readonly from?: readonly string[];
    readonly to?: readonly string[];
    readonly print?: boolean;
    readonly refresh?: boolean;
    readonly note?: string;
    readonly 'from-closed'?: readonly string[];
    readonly tab?: readonly string[];
    readonly 'closed-at'?: readonly string[];
    readonly 'list-closed'?: boolean;
}

export interface HandoffProblem {
    readonly problem: string;
}

export interface ListingArguments {
    readonly mode: 'list';
    readonly tab: TabId;
}

const LATEST_DATE_MS = 8_640_000_000_000_000;

export const problem = (text: string): HandoffProblem => ({ problem: text });

export function paneOf(raw: string | undefined): PaneId | null {
    if (raw === undefined) {
        return null;
    }
    try {
        return paneId(raw);
    } catch {
        return null;
    }
}

function closedAtOf(raw: string): Instant | null {
    if (!/^\d+$/.test(raw)) {
        return null;
    }
    const ms = Number(raw);
    return Number.isSafeInteger(ms) && ms <= LATEST_DATE_MS ? instant(ms) : null;
}

const CLOSED_OPTIONS = ['from-closed', 'tab', 'closed-at'] as const;

const hasAnyClosedOption = (values: HandoffValues): boolean => CLOSED_OPTIONS.some((key) => values[key] !== undefined);

const hasEveryClosedOption = (values: HandoffValues): boolean => CLOSED_OPTIONS.every((key) => values[key] !== undefined);

const repeatsClosedOption = (values: HandoffValues): boolean => CLOSED_OPTIONS.some((key) => (values[key] ?? []).length > 1);

function identityOf(rawPane: string | undefined, rawTab: string | undefined, rawAt: string | undefined): ClosedLaneIdentity | HandoffProblem {
    const pane = paneOf(rawPane);
    if (rawTab === undefined || pane === null) {
        return problem('--from-closed needs a pane id and --tab a tab id');
    }
    const closedAt = rawAt === undefined ? null : closedAtOf(rawAt);
    return closedAt === null ? problem('--closed-at needs a non-negative integer') : { tab: tabId(rawTab), pane, closedAt };
}

export function closedOf(values: HandoffValues): ClosedLaneIdentity | HandoffProblem | null {
    if (!hasAnyClosedOption(values)) {
        return null;
    }
    if (!hasEveryClosedOption(values)) {
        return problem('--from-closed, --tab and --closed-at go together');
    }
    if (repeatsClosedOption(values)) {
        return problem('a closed-source option is given more than once');
    }
    const [rawPane] = values['from-closed'] ?? [];
    const [rawTab] = values.tab ?? [];
    const [rawAt] = values['closed-at'] ?? [];
    return identityOf(rawPane, rawTab, rawAt);
}

export function sourceProblem(froms: readonly string[], closed: ClosedLaneIdentity | null): string | null {
    if (closed === null && froms.length === 0) {
        return '--from is required';
    }
    if (froms.length > 1) {
        return '--from given more than once';
    }
    return closed !== null && froms.length > 0 ? '--from and --from-closed are exclusive' : null;
}

export function targetProblem(values: HandoffValues, closed: ClosedLaneIdentity | null): string | null {
    if ((values.to ?? []).length > 1) {
        return '--to given more than once';
    }
    if (closed !== null && values.refresh === true) {
        return '--from-closed does not go with --refresh';
    }
    return values.print === true && values.refresh === true ? '--refresh does not go with --print' : null;
}

export function listingOf(values: HandoffValues, positionals: readonly string[]): ListingArguments | HandoffProblem {
    if (positionals.length > 1) {
        return problem('handoff takes no argument');
    }
    const tabs = values.tab ?? [];
    const [tab] = tabs;
    if (tabs.length !== 1 || tab === undefined) {
        return problem(tabs.length === 0 ? '--list-closed needs --tab' : '--tab given more than once');
    }
    const clashes = [values.from, values['from-closed'], values.to, values.print, values.note, values.refresh, values['closed-at']].some((value) => value !== undefined);
    return clashes ? problem('--list-closed takes only --tab') : { mode: 'list', tab: tabId(tab) };
}
