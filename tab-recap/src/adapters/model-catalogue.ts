import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';
import { obj } from './jsonl.ts';
import type { Row } from './jsonl.ts';

export function catalogueFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
    const cache = env['XDG_CACHE_HOME'];
    return join(cache !== undefined && cache !== '' ? cache : join(homedir(), '.cache'), 'opencode', 'models.json');
}

const positive = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null);

const contextOf = (provider: Row, model: string): number | null => positive(obj(obj(obj(provider['models'])[model])['limit'])['context']);

export class LocalCatalogue implements ModelCatalogue {
    private readonly file: string;
    private loaded: Row | null = null;

    constructor(file = catalogueFile()) {
        this.file = file;
    }

    private providers(): Row {
        if (this.loaded === null) {
            try {
                this.loaded = obj(JSON.parse(readFileSync(this.file, 'utf8')));
            } catch {
                this.loaded = {};
            }
        }
        return this.loaded;
    }

    windowOf(model: string): number | null {
        const providers = this.providers();
        const id = model.replace(/\[1m\]$/i, '');
        const slash = id.indexOf('/');
        if (slash > 0) {
            return contextOf(obj(providers[id.slice(0, slash)]), id.slice(slash + 1));
        }
        const order = ['anthropic', ...Object.keys(providers).filter((name) => name !== 'anthropic')];
        return order.map((name) => contextOf(obj(providers[name]), id)).find((found) => found !== null) ?? null;
    }
}
