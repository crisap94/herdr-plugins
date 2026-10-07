// The operator's corrections of the judge held in a database — read-only, so a replay can calibrate its judge without writing to it.
import { existsSync } from 'node:fs';
import type { CheckAnchors } from '#src/ports/judge.ts';
import { anchorsOf, withText } from '#src/recap/application/judge-anchors.ts';
import { connectReadOnly } from './connection.ts';
import { RunInputsRepository } from './run-inputs.ts';
import { VerdictsRepository } from './verdicts.ts';

/** The anchors of the database at `path`; none when the file is not there or is from before verdicts existed. */
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
