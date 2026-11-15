import type { WebBase } from '#src/ports/lane-repo.ts';

const SCP_LIKE = /^(?:[^@/:\s]+@)?([^/:\s]+):(?!\/)(.+)$/u;
const CONTROL = /[\p{Cc}\s]/u;
const GITHUB = 'github.com';

const forgeOf = (host: string): WebBase['forge'] => (host === GITHUB ? 'github' : 'gitlab');

function based(host: string, path: string, port: string): WebBase | null {
    const clean = path.replace(/^\/+/u, '').replace(/\/+$/u, '').replace(/\.git$/u, '');
    if (host === '' || clean === '' || !clean.includes('/') || CONTROL.test(`${host}${clean}`)) {
        return null;
    }
    return { base: `https://${host}${port}/${clean}`, forge: forgeOf(host) };
}

function viaUrl(remote: string): WebBase | null {
    try {
        const url = new URL(remote);
        const web = url.protocol === 'http:' || url.protocol === 'https:';
        return based(url.hostname, decodeURIComponent(url.pathname), web && url.port !== '' ? `:${url.port}` : '');
    } catch {
        return null;
    }
}

export function webOf(remote: string): WebBase | null {
    const text = remote.trim();
    if (/^(?:https?|ssh|git|git\+ssh|ssh\+git):\/\//u.test(text)) {
        return viaUrl(text);
    }
    const scp = SCP_LIKE.exec(text);
    return scp === null ? null : based(scp[1] ?? '', scp[2] ?? '', '');
}
