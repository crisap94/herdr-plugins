import type { DeciderPort } from '#src/ports/decider.ts';
import type { Harness, HarnessChoice, HarnessPort, HarnessSettings, HarnessRun, Ran } from '#src/ports/harness.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { instant, parseMilliseconds, type Instant } from '#src/recap/domain/time.ts';
import { parseUsd } from '#src/recap/domain/usd.ts';
import { HarnessPortDecider } from './decider.ts';

const choiceOf = (settings: HarnessSettings): HarnessChoice => {
    const model = must(parseText(settings.model));
    return settings.timeoutMs === undefined
        ? { model, effort: settings.effort }
        : { model, effort: settings.effort, timeoutMs: must(parseMilliseconds(settings.timeoutMs)) };
};

const portOf = (harness: Harness): HarnessPort => ({
    id: must(parseText(harness.id)),
    label: (choice) => must(parseText(harness.label(choice))),
    limit: harness.limit === null ? null : must(parseCount(harness.limit)),
    ...(harness.structured === undefined ? {} : { structured: harness.structured }),
    ...(harness.tools === undefined ? {} : { tools: harness.tools }),
    run: async (call, choice): Promise<HarnessRun> => {
        const ran: Ran = await harness.run(call, choice);
        return isUnknown(ran) ? ran : { ...ran, text: must(parseText(ran.text)), costUsd: must(parseUsd(ran.costUsd)) };
    },
});

export function deciderPortOf(harness: Harness, settings: HarnessSettings, now: () => Instant = (): Instant => instant(Date.now())): DeciderPort {
    return new HarnessPortDecider(portOf(harness), choiceOf(settings), now);
}
