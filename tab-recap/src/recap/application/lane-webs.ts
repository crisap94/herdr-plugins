import type { Lane } from '#src/recap/domain/lane.ts';
import type { Workplaces } from '#src/ports/lane-repo.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import type { SessionKey } from '#src/recap/domain/ids.ts';
import { textOf, type Text } from '#src/recap/domain/text.ts';
import type { LaneWebRecord } from '#src/ports/tab-views.ts';

const REMEMBERED = 200;

const keyOf = (web: LaneWebRecord | null | undefined): Text => textOf(web === null || web === undefined ? '' : `${web.base} ${web.forge} ${web.branch ?? ''}`);

export class LaneWebs {
    private readonly repos: Workplaces;
    private readonly known = new Map<SessionKey, LaneWebRecord | null>();

    constructor(repos: Workplaces) {
        this.repos = repos;
    }

    of(pane: SessionKey): LaneWebRecord | null {
        return this.known.get(pane) ?? null;
    }

    async refresh(lane: Lane): Promise<Presence> {
        const found = lane.cwd === null ? null : await this.repos.repoOf(lane.cwd);
        if (found?.kind === 'unknown') {
            return 'absent';
        }
        const web: LaneWebRecord | null = found?.kind === 'repo' && found.web !== null ? { ...found.web, branch: found.branch } : null;
        const pane = lane.pane;
        if (keyOf(this.known.get(pane)) === keyOf(web)) {
            return 'absent';
        }
        this.known.delete(pane);
        this.known.set(pane, web);
        if (this.known.size > REMEMBERED) {
            const oldest = this.known.keys().next().value;
            if (oldest !== undefined) {
                this.known.delete(oldest);
            }
        }
        return 'present';
    }
}
