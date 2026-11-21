import { stripClaudeContextSuffix } from '@stateforge-labs/harness-adapters/claude';
import { opencodeModelsFile, readOpencodeCatalogue } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeCatalogue } from '@stateforge-labs/harness-adapters/opencode';
import type { ModelWindows } from '#src/ports/model-catalogue.ts';
import { must } from '#src/protocol/result.ts';
import { countFromLibrary } from './legacy.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { Text } from '#src/recap/domain/text.ts';

export { LocalCatalogue } from './legacy.ts';

const ANTHROPIC = 'anthropic';
const SEPARATOR = '/';

export class CatalogueWindows implements ModelWindows {
    private readonly file: FsPath;
    private loaded: OpenCodeCatalogue | null | undefined = undefined;

    constructor(file: FsPath = must(parseFsPath(opencodeModelsFile()))) {
        this.file = file;
    }

    private catalogue(): OpenCodeCatalogue | null {
        if (this.loaded === undefined) {
            this.loaded = readOpencodeCatalogue(this.file);
        }
        return this.loaded;
    }

    windowOf(model: Text): Count | null {
        const catalogue = this.catalogue();
        if (catalogue === null) {
            return null;
        }
        const id = stripClaudeContextSuffix(model);
        const slash = id.indexOf(SEPARATOR);
        if (slash > 0) {
            return countFromLibrary(catalogue.contextWindow(id.slice(0, slash), id.slice(slash + 1)));
        }
        const order = [ANTHROPIC, ...catalogue.providers().filter((name) => name !== ANTHROPIC)];
        return order.map((name) => countFromLibrary(catalogue.contextWindow(name, id))).find((found) => found !== null) ?? null;
    }
}
