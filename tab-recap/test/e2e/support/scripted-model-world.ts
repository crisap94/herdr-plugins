import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scratch } from '#test/fixtures/git-repo.ts';

const SCRIPT = join(import.meta.dirname, 'scripted-model.ts');

export interface ScriptedModel {
    readonly command: string;
    readonly directory: string;
    answer(call: number | 'default', text: string): void;
    calls(): readonly string[];
    pids(): { readonly script: number; readonly child: number } | null;
    clean(): void;
}

export function scriptedModel(): ScriptedModel {
    const fixture = scratch('tab-recap-model-');
    const directory = join(fixture.root, 'model');
    mkdirSync(join(directory, 'answers'), { recursive: true });
    return {
        command: `${process.execPath} ${SCRIPT} ${directory}`,
        directory,
        answer: (call, text) => { writeFileSync(join(directory, 'answers', String(call)), text); },
        calls: () => {
            try {
                return readdirSync(join(directory, 'calls')).toSorted((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10)).map((name) => readFileSync(join(directory, 'calls', name), 'utf8'));
            } catch {
                return [];
            }
        },
        pids: () => {
            try {
                return JSON.parse(readFileSync(join(directory, 'pids.json'), 'utf8'));
            } catch {
                return null;
            }
        },
        clean: () => { rmSync(fixture.root, { recursive: true, force: true }); },
    };
}
