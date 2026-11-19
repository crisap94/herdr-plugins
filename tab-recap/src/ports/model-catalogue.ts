import type { Count } from '#src/recap/domain/count.ts';
import type { Text } from '#src/recap/domain/text.ts';

export type { ModelCatalogue } from './twins/runs/legacy.ts';

export interface ModelWindows {
    windowOf(model: Text): Count | null;
}
