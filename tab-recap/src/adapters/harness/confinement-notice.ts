import type { ConfinementCell, CostBasis, Harness, HarnessCall, HarnessSettings, LogLine, Ran } from '#src/ports/harness.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { CONFINEMENT_NOTICE } from './library-constants.ts';

type Performed = Extract<Ran, { kind: 'ran' }>;

const isWeak = (cell: ConfinementCell): boolean => CONFINEMENT_NOTICE.weakStates.some((state) => state === cell.state);

const isUnmeasured = (basis: CostBasis | undefined): boolean => CONFINEMENT_NOTICE.unmeasuredCosts.some((weak) => weak === basis);

export function noticeOf(id: string, ran: Performed): string | null {
    const cells = (ran.confinement ?? []).filter(isWeak).map((cell) => `${cell.axis} ${cell.state}`).join(CONFINEMENT_NOTICE.cellSeparator);
    const parts = [cells, isUnmeasured(ran.costBasis) ? `cost ${String(ran.costBasis)}` : ''].filter((part) => part !== '');
    return parts.length === 0 ? null : `harness ${id}: ${parts.join(CONFINEMENT_NOTICE.partSeparator)}`;
}

class ConfinementNoticed<Id extends string> implements Harness<Id> {
    readonly id: Id;
    readonly limit: number | null;
    private readonly inner: Harness<Id>;
    private readonly log: LogLine;

    constructor(inner: Harness<Id>, log: LogLine) {
        this.inner = inner;
        this.id = inner.id;
        this.limit = inner.limit;
        this.log = log;
    }

    label(settings: HarnessSettings): string {
        return this.inner.label(settings);
    }

    async run(call: HarnessCall, settings: HarnessSettings): Promise<Ran> {
        const ran = await this.inner.run(call, settings);
        const notice = isUnknown(ran) ? null : noticeOf(this.id, ran);
        if (notice !== null) this.log(notice);
        return ran;
    }
}

export const noticing = <Id extends string>(harness: Harness<Id>, log: LogLine | undefined): Harness<Id> => (log === undefined ? harness : new ConfinementNoticed(harness, log));
