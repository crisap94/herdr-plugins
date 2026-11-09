import { stripClaudeContextSuffix } from '@stateforge-labs/harness-adapters/claude';
import { opencodeModelsFile, readOpencodeCatalogue } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeCatalogue } from '@stateforge-labs/harness-adapters/opencode';
import type { ModelCatalogue } from '#src/ports/model-catalogue.ts';

const ANTHROPIC = 'anthropic';
const SEPARATOR = '/';

export class LocalCatalogue implements ModelCatalogue {
    private readonly file: string;
    private loaded: OpenCodeCatalogue | null | undefined = undefined;

    constructor(file = opencodeModelsFile()) {
        this.file = file;
    }

    private catalogue(): OpenCodeCatalogue | null {
        if (this.loaded === undefined) {
            this.loaded = readOpencodeCatalogue(this.file);
        }
        return this.loaded;
    }

    windowOf(model: string): number | null {
        const catalogue = this.catalogue();
        if (catalogue === null) {
            return null;
        }
        const id = stripClaudeContextSuffix(model);
        const slash = id.indexOf(SEPARATOR);
        if (slash > 0) {
            return catalogue.contextWindow(id.slice(0, slash), id.slice(slash + 1));
        }
        const order = [ANTHROPIC, ...catalogue.providers().filter((name) => name !== ANTHROPIC)];
        return order.map((name) => catalogue.contextWindow(name, id)).find((found) => found !== null) ?? null;
    }
}
