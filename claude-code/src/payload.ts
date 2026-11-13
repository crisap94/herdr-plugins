export const SESSION_SOURCES = ['startup', 'resume', 'clear', 'compact', 'fork'] as const;
export type SessionSource = (typeof SESSION_SOURCES)[number];

export const COMPACT_TRIGGERS = ['manual', 'auto'] as const;
export type CompactTrigger = (typeof COMPACT_TRIGGERS)[number];

export const HOOK_EVENTS = ['SessionStart', 'PreCompact', 'PostCompact', 'Stop'] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

export interface HookSession {
    readonly session: string;
    readonly records: string;
    readonly cwd: string;
}

export type HostEvent =
    | (HookSession & { readonly name: 'SessionStart'; readonly source: SessionSource })
    | (HookSession & { readonly name: 'PreCompact'; readonly trigger: CompactTrigger; readonly instructions: string | null })
    | (HookSession & { readonly name: 'PostCompact'; readonly trigger: CompactTrigger; readonly compactText: string | null })
    | (HookSession & { readonly name: 'Stop'; readonly lastMessage: string | null });

export type RefusalReason = 'malformed' | 'not-an-object' | 'unknown-event' | 'missing-field' | 'bad-value';

export interface Refused {
    readonly kind: 'refused';
    readonly why: RefusalReason;
    readonly detail: string;
}

export type Parsed = { readonly kind: 'event'; readonly event: HostEvent } | Refused;

type Fields = Readonly<Record<string, unknown>>;

type Read<T> = { readonly kind: 'value'; readonly value: T } | Refused;

const refused = (why: RefusalReason, detail: string): Refused => ({ kind: 'refused', why, detail });

const value = <T>(found: T): Read<T> => ({ kind: 'value', value: found });

function requiredText(fields: Fields, key: string): Read<string> {
    const found = fields[key];
    if (found === undefined || found === null) {
        return refused('missing-field', key);
    }
    return typeof found === 'string' && found.trim() !== '' ? value(found) : refused('bad-value', key);
}

function optionalText(fields: Fields, key: string): Read<string | null> {
    const found = fields[key];
    if (found === undefined || found === null) {
        return value(null);
    }
    return typeof found === 'string' ? value(found) : refused('bad-value', key);
}

function oneOf<T extends string>(fields: Fields, key: string, allowed: readonly T[]): Read<T> {
    const found = requiredText(fields, key);
    if (found.kind === 'refused') {
        return found;
    }
    const known = allowed.find((each) => each === found.value);
    return known === undefined ? refused('bad-value', `${key}: ${found.value}`) : value(known);
}

function sessionOf(fields: Fields): Read<HookSession> {
    const session = requiredText(fields, 'session_id');
    const records = requiredText(fields, 'transcript_path');
    const cwd = requiredText(fields, 'cwd');
    if (session.kind === 'refused') {
        return session;
    }
    if (records.kind === 'refused') {
        return records;
    }
    if (cwd.kind === 'refused') {
        return cwd;
    }
    return value({ session: session.value, records: records.value, cwd: cwd.value });
}

function eventOf(name: HookEvent, base: HookSession, fields: Fields): Parsed {
    switch (name) {
        case 'SessionStart': {
            const source = oneOf(fields, 'source', SESSION_SOURCES);
            return source.kind === 'refused' ? source : { kind: 'event', event: { ...base, name, source: source.value } };
        }
        case 'PreCompact': {
            const trigger = oneOf(fields, 'trigger', COMPACT_TRIGGERS);
            const instructions = optionalText(fields, 'custom_instructions');
            if (trigger.kind === 'refused') {
                return trigger;
            }
            return instructions.kind === 'refused' ? instructions : { kind: 'event', event: { ...base, name, trigger: trigger.value, instructions: instructions.value } };
        }
        case 'PostCompact': {
            const trigger = oneOf(fields, 'trigger', COMPACT_TRIGGERS);
            const compactText = optionalText(fields, 'compact_summary');
            if (trigger.kind === 'refused') {
                return trigger;
            }
            return compactText.kind === 'refused' ? compactText : { kind: 'event', event: { ...base, name, trigger: trigger.value, compactText: compactText.value } };
        }
        case 'Stop': {
            const lastMessage = optionalText(fields, 'last_assistant_message');
            return lastMessage.kind === 'refused' ? lastMessage : { kind: 'event', event: { ...base, name, lastMessage: lastMessage.value } };
        }
        default: {
            const exhaustive: never = name;
            return exhaustive;
        }
    }
}

function decoded(text: string): Read<unknown> {
    try {
        return value(JSON.parse(text));
    } catch (error) {
        return refused('malformed', error instanceof Error ? error.message : String(error));
    }
}

const isFields = (found: unknown): found is Fields => typeof found === 'object' && found !== null && !Array.isArray(found);

export function parsePayload(text: string): Parsed {
    const json = decoded(text);
    if (json.kind === 'refused') {
        return json;
    }
    if (!isFields(json.value)) {
        return refused('not-an-object', typeof json.value);
    }
    const fields = json.value;
    const named = fields['hook_event_name'];
    const name = HOOK_EVENTS.find((each) => each === named);
    if (name === undefined) {
        return refused('unknown-event', typeof named === 'string' ? named : typeof named);
    }
    const base = sessionOf(fields);
    return base.kind === 'refused' ? base : eventOf(name, base.value, fields);
}
