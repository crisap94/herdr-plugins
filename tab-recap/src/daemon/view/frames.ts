import { knownOr } from '#src/ports/guarded-reads.ts';
import { stripVTControlCharacters } from 'node:util';
import { parseCursor, parseHeight, parseLine, screen as fitScreen } from '@stateforge-labs/recap-view';
import { expandedScreen } from '#src/column/expanded-modal.ts';
import type { Store } from '#src/adapters/db/database.ts';
import type { Settings } from '#src/daemon/config.ts';
import type { Version } from '#src/daemon/slots.ts';
import type { GlowCache } from '#src/daemon/view/glow-cache.ts';
import { notesByPaneOf, warningTextsOf } from '#src/extensions/load.ts';
import { storedNotes } from '#src/extensions/stored-notes.ts';
import { messagesFor } from '#src/i18n/index.ts';
import { worktreeSwitch } from '#src/daemon/worktree-switch.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { Clock } from '@stateforge-labs/session-ledger';
import { parseCount, type Count } from '@stateforge-labs/session-ledger';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { footer, present, presentBar } from '#src/recap/render/present.ts';
import type { ColumnView, Markdown } from '#src/recap/render/present.ts';
import { coloured } from '#src/recap/render/wrap.ts';
import { wordingOf } from '#src/view-model/wording.ts';
import type { Style } from '#src/recap/render/wrap.ts';
import type { Role } from '#src/wire/view/protocol.ts';

const GUTTER: Count = must(parseCount(2));
const MIN_WIDTH: Count = must(parseCount(10));
const ZERO: Count = must(parseCount(0));

export interface Screen {
    readonly role: Role;
    readonly tab: ScopeId;
    readonly cols: Count;
    readonly rows: Count;
    readonly style: Style;
    readonly scroll: Count;
}

export interface FrameParts {
    readonly store: Store;
    readonly glow: GlowCache;
    readonly clock: Clock;
    readonly version: () => Version | null;
    readonly config: () => Settings;
}

export interface Frame {
    readonly lines: readonly Text[];
    readonly scroll: Count;
    readonly awaiting: readonly Text[];
}

export interface FrameSource {
    lines(screen: Screen): Frame;
}

export function frameSource(parts: FrameParts): FrameSource {
    const modal = expandedScreen(parts.store);
    return {
        lines(screen: Screen): Frame {
            const config = parts.config();
            const messages = messagesFor(config.locale);
            const style = screen.style;
            const stored = parts.store.views.readTab(screen.tab);
            const extensions = [storedNotes({ statuses: parts.store.worktrees, notes: parts.store.paneNotes, alerts: parts.store.paneAlerts, gitNote: worktreeSwitch })];
            const view: ColumnView = {
                tab: stored,
                recap: knownOr(parts.store.records.readRecap(screen.tab), null),
                notes: notesByPaneOf(extensions, stored?.lanes, config.locale),
                warnings: warningTextsOf(extensions, config.locale),
                now: parts.clock.now(),
                messages,
                version: parts.version(),
                compactHint: config.compaction.hint,
                compactions: parts.store.compactions.shownFor(screen.tab),
                style,
            };
            const span = Math.max(MIN_WIDTH, screen.cols - GUTTER);
            if (screen.role === 'bar') {
                return { lines: presentBar(view, span).map((line) => must(parseText(line))), scroll: ZERO, awaiting: [] };
            }
            const awaiting: Text[] = [];
            const markdown: Markdown = (text, width) => {
                const drawn = parts.glow.render(must(parseText(text)), must(parseCount(width)));
                if (drawn === null) {
                    awaiting.push(must(parseText(text)));
                    return null;
                }
                return style === coloured ? drawn : drawn.map((line) => must(parseText(stripVTControlCharacters(line))));
            };
            const body = screen.role === 'modal' ? modal(view, span) : present(view, span, markdown);
            const fitted = fitScreen(body.map((line) => must(parseLine(line))), must(parseHeight(screen.rows)), must(parseCursor(screen.scroll)));
            const shown = [...fitted.lines, footer(span, screen.role, wordingOf(messages), style)];
            return { lines: shown.map((line) => must(parseText(line))), scroll: must(parseCount(fitted.cursor)), awaiting };
        },
    };
}
