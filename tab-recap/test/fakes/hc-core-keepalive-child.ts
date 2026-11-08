import { brand } from '#src/recap/domain/brand.ts';
import { duration } from '#src/recap/domain/time.ts';
import { CoreEvents } from '#src/adapters/hc-core-events.ts';

const path = brand<string, 'SocketPath'>(process.argv[2] ?? '');
const events = new CoreEvents({ path, timing: { backoffBase: duration(300), backoffCap: duration(300), silence: duration(5000) } });

process.on('SIGTERM', () => { void events.close(); });
events.start();
for await (const feed of events.feed) {
    process.stdout.write(`${feed.kind}\n`);
}
