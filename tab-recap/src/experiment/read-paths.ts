const LOOKERS = /^(cat|sed\s+-n|head|tail)\b/;

const unquote = (token: string): string => token.replace(/^['"]|['"]$/g, '');

const looksLikePath = (token: string): boolean => {
    if (token === '' || token.startsWith('-') || /^[\d,;$p]+$/.test(token) || /^\d+[,;]\S*p$/.test(token)) return false;
    return token.startsWith('/') || token.startsWith('~') || token.startsWith('./') || token.startsWith('../') || /[\w-]\/[\w.-]/.test(token) || /\.\w{1,6}$/.test(token);
};

export function shellReads(command: string): readonly string[] {
    const first = command.trim().split(/\s*(?:\||&&|;|\|\|)\s*/)[0] ?? '';
    if (!LOOKERS.test(first)) return [];
    return first.split(/\s+/).slice(1).map(unquote).filter(looksLikePath);
}

export function readsOf(name: string, input: Readonly<Record<string, unknown>>): readonly string[] {
    if (name === 'Read') {
        const path = input['file_path'];
        return typeof path === 'string' && path !== '' ? [path] : [];
    }
    const command = input['command'];
    return name === 'Bash' && typeof command === 'string' ? shellReads(command) : [];
}
