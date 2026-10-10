import { existsSync } from 'node:fs';
import type { CheckAnchors } from '#src/ports/judge.ts';
import { anchorsOf, withText } from '#src/recap/application/judge-anchors.ts';
import { connectReadOnly } from './connection.ts';
import { RunInputsRepository } from './run-inputs.ts';
import { VerdictsRepository } from './verdicts.ts';

export function operatorAnchors(path: string): CheckAnchors {
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
