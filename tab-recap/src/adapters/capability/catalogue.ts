import { stripClaudeContextSuffix } from '@stateforge-labs/harness-adapters/claude';
import { opencodeModelsFile, readOpencodeCatalogue } from '@stateforge-labs/harness-adapters/opencode';
import type { OpenCodeCatalogue } from '@stateforge-labs/harness-adapters/opencode';
import type { ModelWindows } from '#src/ports/model-catalogue.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import { countOf, parseCount } from '@stateforge-labs/session-ledger';
import type { Count } from '@stateforge-labs/session-ledger';
import { parseFsPath } from '#src/recap/domain/fs-path.ts';
import type { FsPath } from '#src/recap/domain/fs-path.ts';
import type { Text } from '@stateforge-labs/session-ledger';

const ANTHROPIC = 'anthropic';
const SEPARATOR = '/';

export interface Candidate {
    readonly provider: Text;
    readonly model: Text;
}

const defaultPath = (): FsPath | null => {
    const path = parseFsPath(opencodeModelsFile());
    return path.kind === 'ok' ? path.value : null;
};

const candidate = (provider: Text, model: Text): Candidate => ({ provider, model });

export function candidatesOf(catalogue: OpenCodeCatalogue, model: Text): readonly Candidate[] {
    const id = stripClaudeContextSuffix(model);
    const slash = id.indexOf(SEPARATOR);
    if (slash > 0) {
        return [candidate(must(parseText(id.slice(0, slash))), must(parseText(id.slice(slash + 1))))];
    }
    const bare = must(parseText(id));
    return [ANTHROPIC, ...catalogue.providers().filter((name) => name !== ANTHROPIC)].map((name) => candidate(must(parseText(name)), bare));
}

export class CatalogueWindows implements ModelWindows {
    private readonly file: FsPath | null;
    private loaded: OpenCodeCatalogue | null | undefined = undefined;

    constructor(file: FsPath | null = defaultPath()) {
        this.file = file;
    }

    opened(): OpenCodeCatalogue | null {
        if (this.file === null) {
            return null;
        }
        if (this.loaded === undefined) {
            this.loaded = readOpencodeCatalogue(this.file);
        }
        return this.loaded;
    }

    windowOf(model: Text): Count | null {
        const catalogue = this.opened();
        if (catalogue === null) {
            return null;
        }
        const reported = candidatesOf(catalogue, model).flatMap((one) => catalogue.contextWindow(one.provider, one.model) ?? []);
        const chosen = reported.find((window) => parseCount(window).kind === 'ok') ?? reported[0];
        return chosen === undefined ? null : countOf(chosen);
    }
}
