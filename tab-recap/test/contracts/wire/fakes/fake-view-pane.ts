import { decodeDaemon, encode } from '#src/wire/view/codec.ts';
import { PROTOCOL } from '#src/wire/view/protocol.ts';
import type { ClientMessage, DaemonMessage, Hello } from '#src/wire/view/protocol.ts';
import { connectTo, peerOf } from './transcript.ts';

export interface FakeViewPane {
    send(m: ClientMessage): void;
    next(): Promise<DaemonMessage>;
    close(): void;
}

export const FAKE_HELLO: Hello = { t: 'hello', protocol: PROTOCOL, version: '9.9.9', role: 'column', tab: 't1', pane: null, cols: 40, rows: 6, colour: false };

export async function connectFakePane(socketPath: string, hello?: Partial<Hello>): Promise<FakeViewPane> {
    const peer = peerOf(await connectTo(socketPath));
    peer.write(encode({ ...FAKE_HELLO, ...hello, t: 'hello' }));
    const next = async (): Promise<DaemonMessage> => {
        const line = await peer.next();
        if (line === null) {
            throw new Error('the connection closed before a daemon message arrived');
        }
        const message = decodeDaemon(line);
        return 'kind' in message ? next() : message;
    };
    return {
        send: (m: ClientMessage): void => {
            peer.write(encode(m));
        },
        next,
        close: (): void => {
            peer.socket.end();
        },
    };
}
