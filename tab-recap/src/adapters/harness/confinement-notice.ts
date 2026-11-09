import type { Harness, LogLine } from '#src/ports/harness.ts';
import { isUnknown } from '#src/ports/unknowable.ts';
import type { BackendId } from '#src/recap/domain/backend.ts';
import { confinementNotice } from '#src/recap/domain/confinement-notice.ts';

export const noticing = <Id extends BackendId>(harness: Harness<Id>, log: LogLine | undefined): Harness<Id> =>
    log === undefined
        ? harness
        : {
              id: harness.id,
              limit: harness.limit,
              label: harness.label.bind(harness),
              run: async (call, settings) => {
                  const ran = await harness.run(call, settings);
                  const notice = isUnknown(ran) ? null : confinementNotice(harness.id, ran.confinement ?? [], ran.costBasis);
                  if (notice !== null) log(notice);
                  return ran;
              },
          };
