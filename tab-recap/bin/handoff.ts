import { stateStore } from '#src/adapters/db/database.ts';
import { Pidfile } from '#src/adapters/pidfile.ts';
import { codeVersion } from '#src/adapters/plugin-version.ts';
import { messagesOf, stateDir } from '#src/daemon/config.ts';
import type { HandoffPrinter, PrintResult } from '#src/ports/handoff-print.ts';
import { deliverHandoff, type DeliverDeps, type DeliverRequest } from '#src/recap/application/handoff-request.ts';
import { exitCodeOf, messageKeyOf, type HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';

export type HandoffArguments =
    | { readonly mode: 'print'; readonly from: PaneId; readonly to: PaneId | null; readonly note: string | null }
    | ({ readonly mode: 'deliver' } & DeliverRequest);

export interface HandoffWiring {
    readonly printer: HandoffPrinter;
    readonly deliver: (request: DeliverRequest) => Promise<HandoffOutcome>;
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
