import { databasePath } from '#src/adapters/db/database.ts';
import { openCliStore } from '#src/daemon/cli-store.ts';
import { openPrintStore } from '#src/adapters/db/print-store.ts';
import { GitLaneRepo } from '#src/adapters/git-lane-repo.ts';
import { GitWorksiteReader } from '#src/adapters/git-worksite.ts';
import { HerdrFleet } from '#src/adapters/herdr-fleet.ts';
import { SystemClock } from '#src/adapters/system-clock.ts';
import { modalTranscriptRegistry } from '#src/adapters/transcript-registry.ts';
import { Pidfile } from '#src/adapters/pidfile.ts';
import { codeVersion } from '#src/adapters/plugin-version.ts';
import { loadConfig, messagesOf, stateDir } from '#src/daemon/config.ts';
import type { HandoffPrinter } from '#src/ports/handoff-print.ts';
import { requestNoteOf } from '#src/recap/application/compact-start.ts';
import { EditCounts } from '#src/recap/application/edit-counts.ts';
import { PrintedHandoffs } from '#src/recap/application/handoff-print.ts';
import { deliverHandoff, type DeliverDeps, type DeliverRequest } from '#src/recap/application/handoff-request.ts';
import { listClosedLanes, type ClosedListing } from '#src/recap/application/handoff-listing.ts';
import { serializeClosedListing } from '#src/recap/render/closed-listing.ts';
import type { ClosedLaneIdentity } from '#src/recap/domain/closures.ts';
import { exitCodeOf, messageKeyOf, type HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { closedOf, listingOf, paneOf, problem, sourceProblem, targetProblem } from './handoff-closed.ts';
import type { HandoffProblem, HandoffValues, ListingArguments } from './handoff-closed.ts';

export type { HandoffProblem, HandoffValues } from './handoff-closed.ts';

export type HandoffArguments =
    | { readonly mode: 'print'; readonly from: PaneId; readonly to: PaneId | null; readonly note: string | null; readonly closed: ClosedLaneIdentity | null }
    | ({ readonly mode: 'deliver' } & DeliverRequest)
    | ListingArguments;

export interface HandoffWiring {
    readonly printer: HandoffPrinter;
    readonly deliver: (request: DeliverRequest) => Promise<HandoffOutcome>;
    readonly list: (tab: TabId) => ClosedListing;
}

export interface HandoffReport {
    readonly exit: number;
    readonly out: string | null;
    readonly err: string | null;
}

const OK = 0;

function reportOf(outcome: HandoffOutcome): HandoffReport {
    const key = messageKeyOf(outcome);
    const text = key === null ? '' : messagesOf().cli.handoff[key];
    const exit = exitCodeOf(outcome);
    return exit === OK ? { exit, out: `tab-recap: ${text}`, err: null } : { exit, out: null, err: `tab-recap: ${exit} — ${text}` };
}

function listingReportOf(listing: ClosedListing): HandoffReport {
    if (listing.kind === 'unreadable') {
        return reportOf({ kind: 'failed', reason: 'source-unreadable' });
    }
    const text = serializeClosedListing(listing.records);
    return { exit: OK, out: text === '' ? null : text, err: null };
}

export async function handoffReport(args: HandoffArguments, wiring: HandoffWiring): Promise<HandoffReport> {
    if (args.mode === 'list') {
        return listingReportOf(wiring.list(args.tab));
    }
    if (args.mode === 'print') {
        const printed = await wiring.printer.renderForPrint({ from: args.from, to: args.to, note: args.note, closed: args.closed });
        return printed.kind === 'text' ? { exit: OK, out: printed.text, err: printed.info === null ? null : `tab-recap: ${printed.info}` } : reportOf(printed);
    }
    return reportOf(await wiring.deliver(args));
}

export async function handoffCommand(args: HandoffArguments, wiring: HandoffWiring): Promise<number> {
    const report = await handoffReport(args, wiring);
    if (report.out !== null) {
        console.log(report.out);
    }
    if (report.err !== null) {
        console.error(report.err);
    }
    return report.exit;
}

function shapeProblem(values: HandoffValues, positionals: readonly string[], closed: ClosedLaneIdentity | null): string | null {
    if (positionals.length > 1) {
        return 'handoff takes no argument';
    }
    return sourceProblem(values.from ?? [], closed) ?? targetProblem(values, closed);
}

function printOf(values: HandoffValues, from: PaneId, note: string | null, closed: ClosedLaneIdentity | null): HandoffArguments | HandoffProblem {
    const raw = values.to?.[0];
    if (raw === undefined) {
        return { mode: 'print', from, to: null, note, closed };
    }
    const to = paneOf(raw);
    return to === null ? problem('--to needs a pane id') : { mode: 'print', from, to, note, closed };
}

function deliverOf(values: HandoffValues, from: PaneId, note: string | null, closed: ClosedLaneIdentity | null): HandoffArguments | HandoffProblem {
    const raw = values.to?.[0];
    if (raw === undefined) {
        return problem('--to is required unless --print');
    }
    const to = paneOf(raw);
    return to === null ? problem('--to needs a pane id') : { mode: 'deliver', from, to, note, refresh: values.refresh === true, closed };
}

export function handoffArgumentsOf(values: HandoffValues, positionals: readonly string[]): HandoffArguments | HandoffProblem {
    if (values['list-closed'] === true) {
        return listingOf(values, positionals);
    }
    const selector = closedOf(values);
    if (selector !== null && 'problem' in selector) {
        return selector;
    }
    const shape = shapeProblem(values, positionals, selector);
    if (shape !== null) {
        return problem(shape);
    }
    const from = selector === null ? paneOf(values.from?.[0]) : selector.pane;
    if (from === null) {
        return problem('--from needs a pane id');
    }
    const note = values.note === undefined ? null : requestNoteOf(values.note);
    return values.print === true ? printOf(values, from, note, selector) : deliverOf(values, from, note, selector);
}

function deliverDeps(): DeliverDeps {
    const pidfile = new Pidfile(stateDir());
    return {
        pacing: { now: Date.now, sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }) },
        daemon: () => ({ pid: pidfile.alive(), version: pidfile.daemonVersion() }),
        cliVersion: codeVersion(),
        openStore: () => {
            const store = openCliStore();
            if (store.kind !== 'ready') {
                throw new Error(messagesOf().database.newer(store.backup));
            }
            return store;
        },
    };
}

function printerOf(): HandoffPrinter {
    const transcripts = modalTranscriptRegistry();
    const fleet = new HerdrFleet(stateDir());
    return new PrintedHandoffs({
        openStore: () => openPrintStore(databasePath(stateDir()), loadConfig().closedLaneDays),
        transcripts,
        worksite: { reader: new GitWorksiteReader(), repo: new GitLaneRepo(new SystemClock()), edits: new EditCounts(transcripts) },
        tokens: fleet,
        target: { status: (pane) => fleet.agents().status(pane) },
        closedDays: loadConfig().closedLaneDays,
        now: () => Date.now(),
    });
}

function listerOf(): (tab: TabId) => ClosedListing {
    return (tab) => {
        const store = openPrintStore(databasePath(stateDir()), loadConfig().closedLaneDays);
        try {
            return listClosedLanes(store.closures, tab, instant(Date.now()));
        } finally {
            store.close();
        }
    };
}

export function productionWiring(): HandoffWiring {
    return {
        printer: printerOf(),
        deliver: (request) => deliverHandoff(request, deliverDeps()),
        list: listerOf(),
    };
}
