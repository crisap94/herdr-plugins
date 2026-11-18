import type { Migration, MigrationHistory } from './contract.ts';

export interface FixtureOptions {
    readonly gapAt?: number;
    readonly brokenForeignKeyAt?: number;
    readonly throwAt?: number;
}

const createSql = (step: number): string => `CREATE TABLE t${step} (id INTEGER PRIMARY KEY, note TEXT)`;

function upOf(step: number, extra: FixtureOptions): Migration['up'] {
    if (step === extra.throwAt) {
        return () => {
            throw new Error(`step ${step} throws`);
        };
    }
    if (step === extra.brokenForeignKeyAt) {
        return [
            `CREATE TABLE p${step} (id INTEGER PRIMARY KEY)`,
            `CREATE TABLE t${step} (id INTEGER PRIMARY KEY, parent INTEGER REFERENCES p${step} (id))`,
            `INSERT INTO t${step} (parent) VALUES (7)`,
        ];
    }
    if (step % 3 === 1) {
        return createSql(step);
    }
    if (step % 3 === 2) {
        return [createSql(step), `INSERT INTO t${step} (note) VALUES ('seed ${step}')`];
    }
    return (handle) => {
        handle.exec(createSql(step));
    };
}

export function fixtureHistory(count: number, extra: FixtureOptions = {}): MigrationHistory {
    const steps: Migration[] = [];
    for (let step = 1; step <= count; step += 1) {
        const version = extra.gapAt !== undefined && step >= extra.gapAt ? step + 1 : step;
        steps.push({ version, name: `fixture-${step}`, up: upOf(step, extra) });
    }
    return steps;
}
