import { readFileSync } from 'node:fs';
import { err, ok, type Result } from '#src/protocol/result.ts';

export type Lanes = Readonly<Record<string, readonly string[]>>;

const fileNames = (files: unknown): readonly string[] | null =>
    Array.isArray(files) && files.every((file): file is string => typeof file === 'string') ? files : null;

export const parseLanes = (input: unknown): Result<Lanes, string> => {
    if (typeof input !== 'object' || input === null || !('lanes' in input) || typeof input.lanes !== 'object' || input.lanes === null) {
        return err('the lane map holds an object under "lanes"');
    }
    const rows = Object.entries(input.lanes).map(([name, files]: [string, unknown]) => [name, fileNames(files)] as const);
    const bad = rows.find(([, files]) => files === null);
    if (bad !== undefined) {
        return err(`lane ${bad[0]} must list file names`);
    }
    return ok(Object.fromEntries(rows.map(([name, files]) => [name, files ?? []])));
};

export const loadLanes = (path: string): Result<Lanes, string> => {
    try {
        return parseLanes(JSON.parse(readFileSync(path, 'utf8')));
    } catch (error) {
        return err(`${path}: ${String(error)}`);
    }
};

export const laneOfFiles = (lanes: Lanes): ReadonlyMap<string, string> =>
    new Map(Object.entries(lanes).flatMap(([name, files]) => files.map((file): [string, string] => [file, name])));
