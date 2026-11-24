import type { SessionKey } from '#src/recap/domain/ids.ts';
import type { AlertSource, PaneAlert } from '#src/recap/domain/pane-alert.ts';

export interface PaneAlertWriter {
    put(alert: PaneAlert): void;
    clear(source: AlertSource): void;
    forgetPane(pane: SessionKey): void;
}

export interface PaneAlertReader {
    alertsOf(pane: SessionKey): readonly PaneAlert[];
}
