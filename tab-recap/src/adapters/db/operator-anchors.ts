import { existsSync } from 'node:fs';
import type { CheckAnchor } from '#src/ports/judge.ts';
import { anchorsOf, withText } from '#src/recap/application/judge-anchors.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { connectReadOnly } from './connection.ts';
import { RunInputsRepository } from './run-inputs/legacy.ts';
import { VerdictsRepository } from './verdicts/legacy.ts';

export function operatorAnchors(path: FsPath): ReadonlyMap<Text, readonly CheckAnchor[]> {
    if (!existsSync(path)) {
        return new Map();
    }
    const db = connectReadOnly(path);
    try {
        return anchorsOf(withText(new VerdictsRepository(db).disagreements(), new RunInputsRepository(db)));
    } catch {
        return new Map();
    } finally {
        db.close();
    }
}
