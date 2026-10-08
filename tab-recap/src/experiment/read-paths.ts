// The files a tool call looks at: the Read tool's `file_path`, and the paths of `cat`, `sed -n`, `head` and `tail`. Pure.

const LOOKERS = /^(cat|sed\s+-n|head|tail)\b/;

const unquote = (token: string): string => token.replace(/^['"]|['"]$/g, '');

const looksLikePath = (token: string): boolean => {
    if (token === '' || token.startsWith('-') || /^[\d,;$p]+$/.test(token) || /^\d+[,;]\S*p$/.test(token)) return false;
    return token.startsWith('/') || token.startsWith('~') || token.startsWith('./') || token.startsWith('../') || /[\w-]\/[\w.-]/.test(token) || /\.\w{1,6}$/.test(token);
};

/** The paths a Bash command reads, when it starts with cat, sed -n, head or tail (only its first command, before a pipe, `&&` or `;`). */
export function shellReads(command: string): readonly string[] {
    const first = command.trim().split(/\s*(?:\||&&|;|\|\|)\s*/)[0] ?? '';
    if (!LOOKERS.test(first)) return [];
    return first.split(/\s+/).slice(1).map(unquote).filter(looksLikePath);
}

/** The paths one tool call reads: `name` and `input` as the transcript's tool_use block has them. */
export function readsOf(name: string, input: Readonly<Record<string, unknown>>): readonly string[] {
    if (name === 'Read') {
        const path = input['file_path'];
        return typeof path === 'string' && path !== '' ? [path] : [];
    }
    const command = input['command'];
    return name === 'Bash' && typeof command === 'string' ? shellReads(command) : [];
}
