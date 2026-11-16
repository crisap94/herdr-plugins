import { startCompact, type CompactStart } from '#src/recap/application/compact-start.ts';
import type { Line } from '#src/daemon/slots.ts';
import type { Done } from '#src/ports/columns.ts';
import { must } from '#src/protocol/result.ts';
import { brand } from '#src/recap/domain/brand.ts';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import type { TabId } from '#src/recap/domain/ids.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';
import type { Intent } from '#src/wire/view/keys.ts';
import type { Role } from '#src/wire/view/protocol.ts';

export type Action = Extract<Intent, { readonly kind: 'refresh' | 'compact' | 'configure' | 'hide' | 'show-modal' }>;

export type Launch = { readonly kind: 'compact'; readonly tab: TabId } | { readonly kind: 'configure'; readonly tab: TabId; readonly role: Role };

export type EnvName = 'TAB_RECAP_TAB' | 'TAB_RECAP_COMPACT_DELAY_MS' | 'HERDR_PLUGIN_CONTEXT_JSON' | 'HERDR_TAB_ID' | 'TAB_RECAP_OPEN_DELAY_MS';

export type Env = Readonly<Partial<Record<EnvName, Text>>>;

export interface Connection {
    readonly role: Role;
    readonly tab: TabId;
    close(): void;
}

export type IntentSink = (action: Action, connection: Connection) => void;

export interface IntentParts {
    readonly observe: (observation: Observation) => void;
    readonly show: (tab: TabId) => Promise<Done>;
    readonly compact: CompactStart;
    readonly compactNote: () => CompactNote;
    readonly launch: (launch: Launch) => void;
    readonly log: (line: Line) => void;
}

type Label = 'show' | 'compact';

export function launchEnv(launch: Launch): Env {
    if (launch.kind === 'compact') {
        return { TAB_RECAP_TAB: must(parseText(launch.tab)), TAB_RECAP_COMPACT_DELAY_MS: must(parseText('400')) };
    }
    return { HERDR_PLUGIN_CONTEXT_JSON: must(parseText('')), HERDR_TAB_ID: must(parseText(launch.tab)), TAB_RECAP_OPEN_DELAY_MS: must(parseText(launch.role === 'modal' ? '400' : '0')) };
}

export function runIntent(parts: IntentParts): IntentSink {
    const settle = (label: Label, pending: Promise<Done>): void => {
        pending.then(
            (done) => {
                if (done.kind === 'unknown') {
                    parts.log(brand<string, 'LogLine'>(`${label}: ${done.why.why}`));
                }
            },
            (error: Error) => {
                parts.log(brand<string, 'LogLine'>(`${label}: ${error.message}`));
            },
        );
    };
    return (action, connection) => {
        switch (action.kind) {
            case 'refresh':
                parts.observe({ kind: 'requested', tab: connection.tab });
                return;
            case 'hide':
                parts.observe({ kind: 'visibility', target: { tab: connection.tab }, hidden: true });
                return;
            case 'show-modal':
                settle('show', parts.show(connection.tab));
                return;
            case 'compact':
                if (connection.role === 'modal') {
                    parts.launch({ kind: 'compact', tab: connection.tab });
                    connection.close();
                    return;
                }
                settle('compact', startCompact(connection.tab, null, undefined, parts.compactNote(), parts.compact));
                return;
            case 'configure':
                parts.launch({ kind: 'configure', tab: connection.tab, role: connection.role });
                if (connection.role === 'modal') {
                    connection.close();
                }
                return;
        }
    };
}
