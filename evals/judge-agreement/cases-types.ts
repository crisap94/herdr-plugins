export type Section = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';

export type Breach = 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7' | 'S';

export interface Beat {
    readonly role: 'user' | 'agent' | 'tool';
    readonly text: string;
    readonly what?: string;
}

export interface Planted {
    readonly section: Section;
    readonly text: string;
    readonly breach: Breach | null;
    readonly say?: Beat;
    readonly later?: Beat;
    readonly rewords?: number;
    readonly absent?: readonly string[];
    readonly open?: readonly string[];
    readonly end?: boolean;
}

export interface Case {
    readonly n: number;
    readonly project: string;
    readonly size: 'small' | 'medium' | 'large';
    readonly target: number;
    readonly language: 'en' | 'es';
    readonly kind: 'claude' | 'codex';
    readonly label: string;
    readonly repo: string;
    readonly branch: string;
    readonly opening: string;
    readonly prior: readonly (readonly [Section, string])[];
    readonly items: readonly Planted[];
}

export const u = (text: string): Beat => ({ role: 'user', text });

export const a = (text: string): Beat => ({ role: 'agent', text });

export const t = (what: string, text: string): Beat => ({ role: 'tool', what, text });

type Extra = Partial<Pick<Planted, 'later' | 'rewords' | 'absent' | 'open' | 'end'>>;

export const ok = (section: Section, text: string, say: Beat, extra: Extra = {}): Planted => ({ section, text, breach: null, say, ...extra });

export const bad = (breach: Breach, section: Section, text: string, say: Beat | null, extra: Extra = {}): Planted => ({ section, text, breach, ...(say === null ? {} : { say }), ...extra });
