import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseLegacyHidden, parseLegacyRecapFile, parseLegacyViewFile, parseLegacyVisibility, type LegacyViewFile } from '#src/ports/legacy-store-files.ts';
import type { TabRecap } from '#src/ports/recap-records.ts';
import type { VisibilityRequest } from '#src/ports/requests.ts';
import { must, type Result } from '#src/protocol/result.ts';
import type { HiddenState } from '#src/recap/domain/board.ts';
import { parseFsPath, type FsPath } from '#src/recap/domain/fs-path.ts';
import type { PaneId, TabId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Presence } from './equivalence.ts';

type Kind = 'recaps' | 'tabs' | 'requests' | 'visibility';

const KINDS: readonly Kind[] = ['recaps', 'tabs', 'requests', 'visibility'];

export const fileKey = (id: TabId | PaneId): Text => must(parseText(id.replaceAll(':', '_').replaceAll('/', '_')));

function attempt<T, E>(read: () => Result<T, E>): T | null {
    try {
        const result = read();
        return result.kind === 'ok' ? result.value : null;
    } catch {
        return null;
    }
}

function readRequest(path: FsPath): readonly Text[] {
    try {
        const tab = parseText(readFileSync(path, 'utf8').trim());
        return tab.kind === 'ok' && tab.value !== '' ? [tab.value] : [];
    } catch {
        return [];
    }
}

export class LegacyStoreFiles {
    readonly root: FsPath;

    constructor(root: FsPath) {
        this.root = root;
    }

    private file(kind: Kind, name: Text): FsPath {
        return must(parseFsPath(join(this.root, kind, name)));
    }

    private hiddenFile(): FsPath {
        return must(parseFsPath(join(this.root, 'hidden.json')));
    }

    private names(kind: Kind): Text[] {
        try {
            return readdirSync(join(this.root, kind))
                .filter((name) => !name.endsWith('.tmp'))
                .toSorted()
                .flatMap((name) => {
                    const text = parseText(name);
                    return text.kind === 'ok' ? [text.value] : [];
                });
        } catch {
            return [];
        }
    }

    recaps(): readonly TabRecap[] {
        return this.names('recaps').flatMap((name) => {
            const file = attempt(() => parseLegacyRecapFile(JSON.parse(readFileSync(this.file('recaps', name), 'utf8'))));
            return file === null ? [] : [file];
        });
    }

    views(): readonly LegacyViewFile[] {
        return this.names('tabs').flatMap((name) => {
            const file = attempt(() => parseLegacyViewFile(JSON.parse(readFileSync(this.file('tabs', name), 'utf8'))));
            return file === null ? [] : [file];
        });
    }

    readHidden(): HiddenState | null {
        return attempt(() => parseLegacyHidden(JSON.parse(readFileSync(this.hiddenFile(), 'utf8'))));
    }

    pendingRequests(): readonly Text[] {
        return this.names('requests').flatMap((name) => readRequest(this.file('requests', name)));
    }

    pendingVisibility(): readonly VisibilityRequest[] {
        return this.names('visibility')
            .filter((name) => name.endsWith('.json'))
            .flatMap((name) => {
                const asked = attempt(() => parseLegacyVisibility(JSON.parse(readFileSync(this.file('visibility', name), 'utf8'))));
                return asked === null ? [] : [asked];
            });
    }

    exists(): Presence {
        return KINDS.some((kind) => this.names(kind).length > 0) || this.readHidden() !== null ? 'present' : 'absent';
    }
}
