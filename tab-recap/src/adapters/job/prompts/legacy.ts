import type { AnchorCheck, AnchorChecks, CheckAnchor, CheckAnchors } from '#src/ports/judge.ts';
import { must } from '#src/protocol/result.ts';
import { parseText, type Text } from '#src/recap/domain/text.ts';

export const anchorChecksOf = (anchors: CheckAnchors): AnchorChecks => new Map(
    [...anchors].map(([check, list]): [Text, readonly AnchorCheck[]] => [
        must(parseText(check)),
        list.map((anchor: CheckAnchor): AnchorCheck => ({
            item: must(parseText(anchor.item)),
            verdict: anchor.pass ? 'pass' : 'fail',
            reason: must(parseText(anchor.reason)),
        })),
    ]),
);
