import { beginCompact, type CompactStart } from '#src/recap/application/compact-start.ts';
import { parseLine, parseMessage, type Line } from '#src/daemon/slots.ts';
import type { Done } from '#src/ports/columns.ts';
import { must } from '@stateforge-labs/session-ledger';
import type { CompactNote } from '#src/recap/domain/compact-note.ts';
import type { ScopeId } from '#src/recap/domain/ids.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import type { Intent } from '#src/wire/view/keys.ts';
import type { Role } from '#src/wire/view/protocol.ts';

export type Action = Extract<Intent, { readonly kind: 'refresh' | 'compact' | 'configure' | 'hide' | 'show-modal' }>;

export type Launch = { readonly kind: 'compact'; readonly tab: ScopeId } | { readonly kind: 'configure'; readonly tab: ScopeId; readonly role: Role };

export type EnvName = 'TAB_RECAP_TAB' | 'TAB_RECAP_COMPACT_DELAY_MS' | 'HERDR_PLUGIN_CONTEXT_JSON' | 'HERDR_TAB_ID' | 'TAB_RECAP_OPEN_DELAY_MS';

export type Env = Readonly<Partial<Record<EnvName, Text>>>;

export interface Connection {
    readonly role: Role;
    readonly tab: ScopeId;
    close(): void;
}

export type IntentSink = (action: Action, connection: Connection) => void;

export interface IntentParts {
    readonly observe: (observation: Observation) => void;
    readonly show: (tab: ScopeId) => Promise<Done>;
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
    const settle = async (label: Label, pending: Promise<Done>): Promise<void> => {
        try {
            const done = await pending;
            if (done.kind === 'unknown') {
                parts.log(parseLine(`${label}: ${done.why.why}`));
            }
        } catch (error: unknown) {
            parts.log(parseLine(`${label}: ${parseMessage(error)}`));
        }
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
                void settle('show', parts.show(connection.tab));
                return;
            case 'compact':
                if (connection.role === 'modal') {
                    parts.launch({ kind: 'compact', tab: connection.tab });
                    connection.close();
                    return;
                }
                void settle('compact', beginCompact(connection.tab, null, undefined, parts.compactNote(), parts.compact));
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
