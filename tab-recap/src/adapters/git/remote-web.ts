import type { WebBase } from '#src/ports/lane-repo.ts';
import type { Result } from '#src/protocol/result.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';

const SCP_LIKE = /^(?:[^@/:\s]+@)?([^/:\s]+):(?!\/)(.+)$/u;
const CONTROL = /[\p{Cc}\s]/u;
const GITHUB = must(parseText('github.com'));

const okOrNull = <T, E>(result: Result<T, E>): T | null => (result.kind === 'ok' ? result.value : null);

const forgeOf = (host: Text): WebBase['forge'] => (host === GITHUB ? 'github' : 'gitlab');

function based(host: Text, path: Text, port: Text | null): WebBase | null {
    const clean = okOrNull(parseText(path.replace(/^\/+/u, '').replace(/\/+$/u, '').replace(/\.git$/u, '')));
    if (host === '' || clean === null || clean === '' || !clean.includes('/') || CONTROL.test(`${host}${clean}`)) {
        return null;
    }
    return { base: must(parseText(`https://${host}${port ?? ''}/${clean}`)), forge: forgeOf(host) };
}

function viaUrl(remote: Text): WebBase | null {
    try {
        const url = new URL(remote);
        const web = url.protocol === 'http:' || url.protocol === 'https:';
        const host = okOrNull(parseText(url.hostname));
        const path = okOrNull(parseText(decodeURIComponent(url.pathname)));
        const port = web && url.port !== '' ? okOrNull(parseText(`:${url.port}`)) : null;
        return host === null || path === null ? null : based(host, path, port);
    } catch {
        return null;
    }
}

export function webOf(remote: Text): WebBase | null {
    const text = okOrNull(parseText(remote.trim()));
    if (text === null) {
        return null;
    }
    if (/^(?:https?|ssh|git|git\+ssh|ssh\+git):\/\//u.test(text)) {
        return viaUrl(text);
    }
    const scp = SCP_LIKE.exec(text);
    const host = okOrNull(parseText(scp?.[1] ?? ''));
    const path = okOrNull(parseText(scp?.[2] ?? ''));
    return host === null || path === null ? null : based(host, path, null);
}
