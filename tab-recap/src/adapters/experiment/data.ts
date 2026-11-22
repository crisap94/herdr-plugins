import type { Labelled as LabelledRow } from '#src/experiment/kappa-report.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';

import { readRecords } from './io.ts';
import type { PointAt } from './point.ts';

export { readLabelled, readPoints } from './legacy.ts';

export const readPointsAt = (path: FsPath): readonly PointAt[] => {
    const rows: readonly unknown[] = readRecords(path);
    return rows as readonly PointAt[];
};

export const readLabelledAt = (path: FsPath): readonly LabelledRow[] => {
    const rows: readonly unknown[] = readRecords(path);
    return rows as readonly LabelledRow[];
};
