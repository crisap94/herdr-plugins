import type { DatabaseSync, StatementSync } from 'node:sqlite';
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
import { all, guarded, isRow } from './rows.ts';

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
    private readonly read: StatementSync;
    private readonly upsert: StatementSync;
    private readonly clearSource: StatementSync;
    private readonly clearPane: StatementSync;

    constructor(db: DatabaseSync) {
        this.read = db.prepare('SELECT source, pane, label, at, details FROM pane_alert WHERE pane = ? ORDER BY source');
        this.upsert = db.prepare('INSERT OR REPLACE INTO pane_alert (source, pane, label, at, details) VALUES (?, ?, ?, ?, ?)');
        this.clearSource = db.prepare('DELETE FROM pane_alert WHERE source = ?');
        this.clearPane = db.prepare('DELETE FROM pane_alert WHERE pane = ?');
    }

    put(alert: PaneAlert): void {
        this.upsert.run(alert.source, alert.pane, alert.label, alert.at, JSON.stringify(alert.details));
    }

    clear(source: AlertSource): void {
        this.clearSource.run(source);
    }

    forgetPane(pane: PaneId): void {
        this.clearPane.run(pane);
    }

    alertsOf(pane: PaneId): readonly PaneAlert[] {
        return guarded(() => all(this.read, pane).flatMap((row) => {
            const parsed = parsePaneAlertRow(row);
            return parsed.kind === 'ok' ? [parsed.value] : [];
        }), []);
    }
}
