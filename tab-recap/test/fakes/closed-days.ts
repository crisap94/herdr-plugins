import { closedLaneDaysOrDefault, parseClosedLaneDays } from '#src/recap/domain/retention.ts';
import type { ClosedLaneDays } from '#src/recap/domain/retention.ts';

export const closedDaysOf = (raw: string | undefined): ClosedLaneDays => closedLaneDaysOrDefault(parseClosedLaneDays(raw));
