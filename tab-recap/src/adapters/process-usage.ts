import { must } from '#src/protocol/result.ts';
import { parseCount } from '#src/recap/domain/count.ts';
import { duration } from '#src/recap/domain/time.ts';
import type { ProcessUsage, UsageSample } from '#src/ports/process-usage.ts';

const MIB = 1024 * 1024;
const MICROSECONDS_PER_MS = 1000;
const NO_MEMORY = must(parseCount(0));

export class NodeProcessUsage implements ProcessUsage {
    sample(): UsageSample {
        const spent = process.cpuUsage();
        const rss = parseCount(Math.round(process.memoryUsage.rss() / MIB));
        return { cpu: duration((spent.user + spent.system) / MICROSECONDS_PER_MS), rss: rss.kind === 'ok' ? rss.value : NO_MEMORY };
    }
}
