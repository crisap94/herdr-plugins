import type { Lane } from '#src/recap/domain/lane.ts';
import type { LaneRepo, RepoResult } from '#src/ports/lane-repo.ts';
import type { LaneWeb } from '#src/ports/tab-views.ts';

const REMEMBERED = 200;

const keyOf = (web: LaneWeb | null | undefined): string => (web === null || web === undefined ? '' : `${web.base} ${web.forge} ${web.branch ?? ''}`);

function webOf(found: RepoResult | null): LaneWeb | null {
    return found?.kind === 'repo' && found.web !== null ? { ...found.web, branch: found.branch } : null;
}

export class LaneWebs {
    private readonly repos: LaneRepo;
    private readonly known = new Map<string, LaneWeb | null>();

    constructor(repos: LaneRepo) {
        this.repos = repos;
    }

    of(pane: string): LaneWeb | null {
        return this.known.get(pane) ?? null;
    }

    async refresh(lane: Lane): Promise<boolean> {
        const found = lane.cwd === null ? null : await this.repos.repoOf(lane.cwd);
        if (found?.kind === 'unknown') {
            return false;
        }
        const web = webOf(found);
        const pane = String(lane.pane);
        if (keyOf(this.known.get(pane)) === keyOf(web)) {
            return false;
        }
        this.known.delete(pane);
        this.known.set(pane, web);
        if (this.known.size > REMEMBERED) {
            this.known.delete(this.known.keys().next().value ?? '');
        }
        return true;
    }
}
