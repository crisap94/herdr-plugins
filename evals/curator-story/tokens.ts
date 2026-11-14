const EDGE = /^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu;

const normal = (raw: string): string => raw.replace(EDGE, '').replace(/['’]s$/u, '').replace(/(\d),(?=\d{3}(\D|$))/g, '$1').toLowerCase();

const isChecked = (raw: string): boolean => /\d/.test(raw) || /[_@]/.test(raw) || /[a-z][A-Z]/.test(raw) || /[A-Za-z0-9]{2,}\.[A-Za-z]{2,}/.test(raw);

export function checkedTokens(text: string): string[] {
    const found = new Set<string>();
    for (const word of text.split(/\s+/u)) {
        const bare = word.replace(EDGE, '').replace(/['’]s$/u, '');
        if (bare !== '' && isChecked(bare)) {
            found.add(normal(word));
        }
    }
    return [...found].sort();
}

const digitRuns = (token: string): string[] => (token.match(/\d+/g) ?? []).map((run) => run.replace(/^0+(?=\d)/, ''));

const bounded = (whole: string, part: string): boolean => {
    let from = whole.indexOf(part);
    while (from !== -1) {
        const before = from === 0 ? '' : whole.charAt(from - 1);
        const after = whole.charAt(from + part.length);
        if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) {
            return true;
        }
        from = whole.indexOf(part, from + 1);
    }
    return false;
};

export interface Allowed {
    readonly names: readonly string[];
    readonly times: readonly string[];
    readonly facts: number;
}

const dateParts = (times: readonly string[]): string[] => times.flatMap((time) => /^(\d{4})-(\d{2})-(\d{2})/.exec(time)?.slice(1) ?? []).map((part) => part.replace(/^0+(?=\d)/, ''));

export function allowedBy(allowed: Allowed, token: string): boolean {
    const wanted = normal(token);
    const id = /^f(\d+)$/.exec(wanted);
    if (id !== null && Number(id[1]) >= 1 && Number(id[1]) <= allowed.facts) {
        return true;
    }
    if (allowed.times.some((time) => time === wanted || time.split(' ').includes(wanted))) {
        return true;
    }
    if (/^\d{1,2}:\d{2}$/.test(wanted)) {
        return allowed.names.includes(wanted);
    }
    const numbered = /^(\d+)[a-z%]*$/.exec(wanted);
    if (numbered !== null) {
        const number = (numbered[1] ?? '').replace(/^0+(?=\d)/, '');
        return dateParts(allowed.times).includes(number) || allowed.names.some((one) => digitRuns(one).includes(number));
    }
    return allowed.names.some((one) => bounded(one, wanted));
}

export function outsideOf(allowed: Allowed, story: string): string[] {
    return checkedTokens(story).filter((token) => !allowedBy(allowed, token));
}
