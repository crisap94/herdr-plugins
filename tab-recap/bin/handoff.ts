import { stateStore } from '#src/adapters/db/database.ts';
import { Pidfile } from '#src/adapters/pidfile.ts';
import { codeVersion } from '#src/adapters/plugin-version.ts';
import { messagesOf, stateDir } from '#src/daemon/config.ts';
import type { HandoffPrinter, PrintResult } from '#src/ports/handoff-print.ts';
import { requestNoteOf } from '#src/recap/application/compact-start.ts';
import { deliverHandoff, type DeliverDeps, type DeliverRequest } from '#src/recap/application/handoff-request.ts';
import { exitCodeOf, messageKeyOf, type HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { paneId, type PaneId } from '#src/recap/domain/ids.ts';

export type HandoffArguments =
    | { readonly mode: 'print'; readonly from: PaneId; readonly to: PaneId | null; readonly note: string | null }
    | ({ readonly mode: 'deliver' } & DeliverRequest);

export interface HandoffWiring {
    readonly printer: HandoffPrinter;
    readonly deliver: (request: DeliverRequest) => Promise<HandoffOutcome>;
}

export interface HandoffValues {
    readonly from?: readonly string[];
    readonly to?: readonly string[];
    readonly print?: boolean;
    readonly refresh?: boolean;
    readonly note?: string;
}

export interface HandoffProblem {
    readonly problem: string;
}

export interface HandoffReport {
    readonly exit: number;
    readonly out: string | null;
    readonly err: string | null;
}

const OK = 0;

export const notYetWired = async (): Promise<PrintResult> => {
    throw new Error('print needs the content builder');
};

function reportOf(outcome: HandoffOutcome): HandoffReport {
    const key = messageKeyOf(outcome);
    const text = key === null ? '' : messagesOf().cli.handoff[key];
    const exit = exitCodeOf(outcome);
    return exit === OK ? { exit, out: `tab-recap: ${text}`, err: null } : { exit, out: null, err: `tab-recap: ${exit} — ${text}` };
}

export async function handoffReport(args: HandoffArguments, wiring: HandoffWiring): Promise<HandoffReport> {
    if (args.mode === 'print') {
        const printed = await wiring.printer.renderForPrint({ from: args.from, to: args.to, note: args.note });
        return printed.kind === 'text' ? { exit: OK, out: printed.text, err: null } : reportOf(printed);
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

const problem = (text: string): HandoffProblem => ({ problem: text });

function paneOf(raw: string | undefined): PaneId | null {
    if (raw === undefined) {
        return null;
    }
    try {
        return paneId(raw);
    } catch {
        return null;
    }
}

function shapeProblem(values: HandoffValues, positionals: readonly string[]): string | null {
    if (positionals.length > 1) {
        return 'handoff takes no argument';
    }
    if ((values.from ?? []).length === 0) {
        return '--from is required';
    }
    if ((values.from ?? []).length > 1) {
        return '--from given more than once';
    }
    if ((values.to ?? []).length > 1) {
        return '--to given more than once';
    }
    return values.print === true && values.refresh === true ? '--refresh does not go with --print' : null;
}

function printOf(values: HandoffValues, from: PaneId, note: string | null): HandoffArguments | HandoffProblem {
    const raw = values.to?.[0];
    if (raw === undefined) {
        return { mode: 'print', from, to: null, note };
    }
    const to = paneOf(raw);
    return to === null ? problem('--to needs a pane id') : { mode: 'print', from, to, note };
}

function deliverOf(values: HandoffValues, from: PaneId, note: string | null): HandoffArguments | HandoffProblem {
    const raw = values.to?.[0];
    if (raw === undefined) {
        return problem('--to is required unless --print');
    }
    const to = paneOf(raw);
    return to === null ? problem('--to needs a pane id') : { mode: 'deliver', from, to, note, refresh: values.refresh === true };
}

export function handoffArgumentsOf(values: HandoffValues, positionals: readonly string[]): HandoffArguments | HandoffProblem {
    const shape = shapeProblem(values, positionals);
    if (shape !== null) {
        return problem(shape);
    }
    const from = paneOf(values.from?.[0]);
    if (from === null) {
        return problem('--from needs a pane id');
    }
    const note = values.note === undefined ? null : requestNoteOf(values.note);
    return values.print === true ? printOf(values, from, note) : deliverOf(values, from, note);
}

function deliverDeps(): DeliverDeps {
    const pidfile = new Pidfile(stateDir());
    return {
        pacing: { now: Date.now, sleep: (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }) },
        daemon: () => ({ pid: pidfile.alive(), version: pidfile.daemonVersion() }),
        cliVersion: codeVersion(),
        openStore: () => {
            const store = stateStore(stateDir());
            if (store.kind !== 'ready') {
                throw new Error(messagesOf().database.newer(store.backup));
            }
            return store;
        },
    };
}

export function productionWiring(): HandoffWiring {
    return {
        printer: { renderForPrint: notYetWired },
        deliver: (request) => deliverHandoff(request, deliverDeps()),
    };
}
