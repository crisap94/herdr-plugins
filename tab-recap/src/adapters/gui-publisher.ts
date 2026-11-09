import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { blankRecap, type RecapRecords } from '#src/ports/recap-records.ts';
import type { TabView, TabViews } from '#src/ports/tab-views.ts';
import { BLANK_READS, type GuiReads } from '#src/recap/application/gui-tab-reads.ts';
import { guiIndexRow } from '#src/recap/application/gui-index-build.ts';
import { guiTabOf } from '#src/recap/application/gui-tab-build.ts';
import type { Directory } from '#src/recap/domain/directory.ts';
import { fitGuiTab } from '#src/recap/domain/gui-fit.ts';
import { GUI_TAB_LIMIT, encodeGuiTab, guiFileName, parseGuiIndex, type GuiIndex, type GuiTab } from '#src/recap/domain/gui-tab.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import { parseNonEmptyText, type NonEmptyText } from '#src/recap/domain/text.ts';
import type { Instant } from '#src/recap/domain/time.ts';
import { writeAtomically } from './os/atomic-file.ts';
import type { DesktopBus } from './desktop-bus.ts';

const INDEX = 'index.json';
const limit = must(parseCount(GUI_TAB_LIMIT));

export interface GuiPublisherDeps {
    readonly dir: Directory;
    readonly records: RecapRecords;
    readonly views: TabViews;
    readonly now: () => Instant;
    readonly reads?: (tab: TabId, view: TabView | null) => GuiReads;
    readonly log: (line: NonEmptyText) => void;
    readonly bus?: DesktopBus;
}

function rowsOn(dir: Directory): GuiIndex {
    try {
        const parsed = parseGuiIndex(JSON.parse(readFileSync(join(dir, INDEX), 'utf8')));
        return parsed.kind === 'ok' ? parsed.value : [];
    } catch {
        return [];
    }
}

export class GuiPublisher {
    private readonly deps: GuiPublisherDeps;

    constructor(deps: GuiPublisherDeps) {
        this.deps = deps;
    }

    document(tab: TabId): GuiTab | null {
        const recap = this.deps.records.readRecap(tab);
        const view = this.deps.views.readTab(tab);
        if (recap === null && view === null) { return null; }
        const reads = this.deps.reads === undefined ? BLANK_READS : this.deps.reads(tab, view);
        return guiTabOf(recap ?? blankRecap(tab), view, this.deps.now(), reads);
    }

    publish(tab: TabId): void {
        try {
            this.write(tab);
        } catch (error) {
            this.deps.log(must(parseNonEmptyText(`gui: tab ${tab} not published: ${error instanceof Error ? error.message : String(error)}`)));
        }
    }

    private write(tab: TabId): void {
        const document = this.document(tab);
        if (document === null) { return; }
        const fitted = fitGuiTab(document, limit);
        if (fitted.cuts.length > 0) {
            this.deps.log(must(parseNonEmptyText(`gui: tab ${tab} was cut to fit: ${fitted.cuts.map((each) => `${each.part} ${each.kept}/${each.total}`).join(', ')}`)));
        }
        const encoded = encodeGuiTab(fitted);
        if (encoded.kind === 'err') {
            this.deps.log(must(parseNonEmptyText(`gui: tab ${tab} is ${encoded.error.bytes} bytes, over the limit: not published`)));
            return;
        }
        writeAtomically(join(this.deps.dir, guiFileName(tab)), encoded.value);
        this.deps.bus?.publish('tab', tab);
        const others = rowsOn(this.deps.dir).filter((row) => row.tab !== tab);
        writeAtomically(join(this.deps.dir, INDEX), JSON.stringify({ version: 1, tabs: [guiIndexRow(document), ...others] }));
        this.deps.bus?.publish('index', null);
    }
}
