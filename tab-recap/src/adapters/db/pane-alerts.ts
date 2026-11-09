import type { Database } from 'bun:sqlite';
import { eq, sql } from 'drizzle-orm';
import { err, ok, type Result } from '#src/protocol/result.ts';
import type { PaneAlertReader, PaneAlertWriter } from '#src/ports/pane-alerts.ts';
import type { PaneId } from '#src/recap/domain/ids.ts';
import { parsePaneId } from '#src/recap/domain/ids.ts';
import { parseAlertSource } from '#src/recap/domain/pane-alert.ts';
import type { AlertSource, PaneAlert } from '#src/recap/domain/pane-alert.ts';
import type { ParseFailure } from '#src/recap/domain/parse-failure.ts';
import { parseText } from '#src/recap/domain/text.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { parseInstant } from '#src/recap/domain/time.ts';
import { paneAlert } from './drizzle/index.ts';
import { ormOf, type Orm } from './orm.ts';
import { guarded, isRow } from './rows.ts';

type PaneAlertRow = PaneAlert;

type AlertDetails = readonly Text[];

export function parseAlertDetails(input: unknown): Result<AlertDetails, ParseFailure> {
    const raw = parseText(input);
    if (raw.kind === 'err') {
        return raw;
    }
    let decoded: unknown;
    try {
        decoded = JSON.parse(raw.value);
    } catch {
        return err({ kind: 'not-a-row' });
    }
    if (!Array.isArray(decoded)) {
        return err({ kind: 'not-a-row' });
    }
    const items: readonly unknown[] = decoded;
    const texts: Text[] = [];
    for (const item of items) {
        const text = parseText(item);
        if (text.kind === 'err') {
            return text;
        }
        texts.push(text.value);
    }
    return ok(texts);
}

export function parsePaneAlertRow(input: unknown): Result<PaneAlertRow, ParseFailure> {
    if (!isRow(input)) {
        return err({ kind: 'not-a-row' });
    }
    const source = parseAlertSource(input.source);
    if (source.kind === 'err') {
        return source;
    }
    const pane = parsePaneId(input.pane);
    if (pane.kind === 'err') {
        return pane;
    }
    const label = parseText(input.label);
    if (label.kind === 'err') {
        return label;
    }
    const at = parseInstant(input.at);
    if (at.kind === 'err') {
        return at;
    }
    const details = parseAlertDetails(input.details);
    if (details.kind === 'err') {
        return details;
    }
    return ok({ source: source.value, pane: pane.value, label: label.value, at: at.value, details: details.value });
}

export class PaneAlertsRepository implements PaneAlertWriter, PaneAlertReader {
    private readonly orm: Orm;

    constructor(db: Database) {
        this.orm = ormOf(db);
    }

    put(alert: PaneAlert): void {
        this.orm.insert(paneAlert).values({ source: alert.source, pane: alert.pane, label: alert.label, at: alert.at, details: JSON.stringify(alert.details) })
            .onConflictDoUpdate({
                target: [paneAlert.source, paneAlert.pane],
                set: { label: sql`excluded.label`, at: sql`excluded.at`, details: sql`excluded.details` },
            })
            .run();
    }

    clear(source: AlertSource): void {
        this.orm.delete(paneAlert).where(eq(paneAlert.source, source)).run();
    }

    forgetPane(pane: PaneId): void {
        this.orm.delete(paneAlert).where(eq(paneAlert.pane, pane)).run();
    }

    alertsOf(pane: PaneId): readonly PaneAlert[] {
        return guarded(() => this.orm.select({ source: paneAlert.source, pane: paneAlert.pane, label: paneAlert.label, at: paneAlert.at, details: paneAlert.details }).from(paneAlert).where(eq(paneAlert.pane, pane)).orderBy(paneAlert.source).all().flatMap((row) => {
            const parsed = parsePaneAlertRow(row);
            return parsed.kind === 'ok' ? [parsed.value] : [];
        }), []);
    }
}
