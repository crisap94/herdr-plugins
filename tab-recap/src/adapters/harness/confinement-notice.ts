import type { BackendHarness, LogLine } from '#src/ports/harness.ts';
import { isUnknown } from '@stateforge-labs/session-ledger';
import { confinementNotice } from '#src/recap/domain/confinement-notice.ts';

export const noticing = (harness: BackendHarness, log: LogLine | undefined): BackendHarness =>
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
