import { nodeHost } from './node-host.mjs';
import { renderRefusal, supportOf } from './policy.mjs';

async function refusalText(refusal, path) {
    try {
        const { messagesOf } = await import('../daemon/config.ts');
        return messagesOf().cli.hostRefusal(refusal, path);
    } catch {
        return renderRefusal(refusal, path);
    }
}

async function stay(message) {
    process.stdout.write(`\u001b[2J\u001b[H${message.replaceAll('\n', '\r\n')}\r\n`);
    process.on('SIGTERM', () => { process.exit(0); });
    setInterval(() => undefined, 1 << 30);
    await new Promise(() => undefined);
}

async function refuse(kind, refusal, execPath) {
    const message = await refusalText(refusal, execPath);
    if (kind === 'pane') {
        await stay(message);
    }
    process.stderr.write(`${kind === 'daemon' ? `${new Date().toISOString()} ` : ''}${message}\n`);
    process.exit(1);
}

export async function launch(kind, entry, seams = {}) {
    const host = seams.host ?? nodeHost();
    const refusal = supportOf(host);
    if (refusal.ok) {
        await import(entry);
        return;
    }
    if (kind === 'command' && (seams.argv ?? process.argv.slice(2))[0] === 'status') {
        try {
            await import(entry);
        } catch {
            await refuse(kind, refusal, host.execPath);
        }
        return;
    }
    await refuse(kind, refusal, host.execPath);
}
