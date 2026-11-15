export interface Project {
    readonly name: string;
    readonly host: string;
    readonly things: readonly string[];
    readonly branches: readonly string[];
}

export const PROJECTS: Readonly<Record<string, Project>> = {
    'orchard-api': {
        name: 'orchard-api',
        host: 'git.orchard.test',
        things: [
            'src/routes/harvest.ts', 'src/routes/plots.ts', 'src/routes/crews.ts', 'src/auth/session.ts', 'src/auth/tokens.ts', 'src/db/pool.ts',
            'src/db/migrate.ts', 'src/jobs/reminder.ts', 'src/jobs/cleanup.ts', 'src/mail/render.ts', 'src/mail/queue.ts', 'src/geo/parcel.ts',
            'src/geo/distance.ts', 'src/pricing/quote.ts', 'src/pricing/season.ts', 'src/export/csv.ts', 'src/export/ics.ts', 'src/health/ready.ts',
            'src/config/env.ts', 'src/rate/limiter.ts', 'src/audit/trail.ts', 'src/search/index.ts', 'src/uploads/photos.ts', 'src/weather/client.ts',
        ],
        branches: ['feat/crew-roster', 'fix/pool-leak', 'chore/env-cleanup', 'feat/ics-export', 'fix/quote-season', 'feat/photo-limits'],
    },
    'lantern-ui': {
        name: 'lantern-ui',
        host: 'git.lantern.test',
        things: [
            'src/lib/Table.svelte', 'src/lib/Modal.svelte', 'src/lib/Tabs.svelte', 'src/lib/Tooltip.svelte', 'src/lib/DatePicker.svelte', 'src/lib/Avatar.svelte',
            'src/lib/Breadcrumb.svelte', 'src/lib/Toast.svelte', 'src/routes/login/+page.svelte', 'src/routes/reports/+page.svelte', 'src/routes/devices/+page.svelte', 'src/routes/alerts/+page.svelte',
            'src/stores/session.ts', 'src/stores/filters.ts', 'src/stores/theme.ts', 'src/api/client.ts', 'src/api/retry.ts', 'src/i18n/load.ts',
            'src/i18n/plural.ts', 'src/utils/format.ts', 'src/utils/debounce.ts', 'src/charts/axis.ts', 'src/charts/scale.ts', 'src/a11y/focus.ts',
        ],
        branches: ['feat/device-table', 'fix/modal-focus', 'chore/i18n-keys', 'feat/report-filters', 'fix/toast-stack', 'feat/axis-ticks'],
    },
    'quarry-etl': {
        name: 'quarry-etl',
        host: 'git.quarry.test',
        things: [
            'jobs/extract_customers.py', 'jobs/extract_invoices.py', 'jobs/extract_shipments.py', 'jobs/load_dim_product.py', 'jobs/load_dim_store.py', 'jobs/load_fact_sales.py',
            'jobs/load_fact_returns.py', 'lib/warehouse.py', 'lib/cursor.py', 'lib/checkpoint.py', 'lib/schema_diff.py', 'lib/retry.py',
            'lib/secrets.py', 'lib/partition.py', 'lib/dedupe.py', 'sql/dim_calendar.sql', 'sql/fact_sales_daily.sql', 'sql/stg_inventory.sql',
            'dags/nightly.py', 'dags/hourly.py', 'dags/backfill.py', 'checks/row_counts.py', 'checks/freshness.py', 'checks/nulls.py',
        ],
        branches: ['feat/returns-fact', 'fix/cursor-reset', 'chore/sql-format', 'feat/store-dim', 'fix/partition-prune', 'feat/null-checks'],
    },
    tidewatch: {
        name: 'tidewatch',
        host: 'git.tidewatch.test',
        things: [
            'cmd/tidewatchd/main.go', 'cmd/tidectl/main.go', 'internal/probe/http.go', 'internal/probe/tcp.go', 'internal/probe/icmp.go', 'internal/alert/router.go',
            'internal/alert/dedupe.go', 'internal/alert/silence.go', 'internal/store/ring.go', 'internal/store/compact.go', 'internal/store/wal.go', 'internal/config/load.go',
            'internal/config/watch.go', 'internal/notify/mail.go', 'internal/notify/webhook.go', 'internal/notify/pager.go', 'internal/sched/tick.go', 'internal/sched/jitter.go',
            'internal/gauge/level.go', 'internal/gauge/salinity.go', 'internal/gauge/battery.go', 'internal/httpapi/status.go', 'internal/httpapi/series.go', 'internal/tls/reload.go',
        ],
        branches: ['feat/silence-windows', 'fix/wal-truncate', 'chore/probe-names', 'feat/battery-gauge', 'fix/jitter-seed', 'feat/series-api'],
    },
    'pelican-cli': {
        name: 'pelican-cli',
        host: 'git.pelican.test',
        things: [
            'src/main.rs', 'src/cmd/publish.rs', 'src/cmd/verify.rs', 'src/cmd/init.rs', 'src/cmd/yank.rs', 'src/cmd/login.rs',
            'src/manifest/parse.rs', 'src/manifest/lock.rs', 'src/manifest/semver.rs', 'src/archive/tar.rs', 'src/archive/zip.rs', 'src/archive/layout.rs',
            'src/registry/client.rs', 'src/registry/auth.rs', 'src/registry/mirror.rs', 'src/sign/keyring.rs', 'src/sign/verify.rs', 'src/ui/progress.rs',
            'src/ui/prompt.rs', 'src/ui/color.rs', 'src/net/proxy.rs', 'src/net/retry.rs', 'src/cache/store.rs', 'src/cache/evict.rs',
        ],
        branches: ['feat/mirror-fallback', 'fix/lock-order', 'chore/prompt-copy', 'feat/yank-reason', 'fix/proxy-env', 'feat/cache-evict'],
    },
    mossbank: {
        name: 'mossbank',
        host: 'git.mossbank.test',
        things: [
            'app/invoice/Builder.kt', 'app/invoice/Numbering.kt', 'app/invoice/Pdf.kt', 'app/invoice/Mailer.kt', 'app/plan/Catalog.kt', 'app/plan/Proration.kt',
            'app/plan/Trial.kt', 'app/payment/Gateway.kt', 'app/payment/Refund.kt', 'app/payment/Webhook.kt', 'app/payment/Retry.kt', 'app/customer/Profile.kt',
            'app/customer/Address.kt', 'app/customer/Merge.kt', 'app/dunning/Schedule.kt', 'app/dunning/Notice.kt', 'app/report/Mrr.kt', 'app/report/Churn.kt',
            'app/report/Aging.kt', 'app/coupon/Redeem.kt', 'app/coupon/Limits.kt', 'app/usage/Meter.kt', 'app/usage/Rollup.kt', 'app/audit/Journal.kt',
        ],
        branches: ['feat/aging-report', 'fix/webhook-replay', 'chore/pdf-fonts', 'feat/coupon-limits', 'fix/trial-end', 'feat/usage-rollup'],
    },
};

export const DONE: readonly string[] = [
    '`{t}` passes its tests after the retry fix',
    '`{t}` no longer logs the session token',
    '`{t}` reads its timeout from the config file',
    '`{t}` returns a clear error for an unknown id',
    '`{t}` is covered by the smoke run',
    '`{t}` handles an empty input without a crash',
    '`{t}` got its dead branch removed',
    '`{t}` uses the shared logger now',
    '`{t}` is split into two smaller modules',
    '`{t}` has its magic numbers named',
    '`{t}` closes its file handle on every path',
    '`{t}` validates its arguments before any write',
    '`{t}` reports progress every 500 records',
    '`{t}` retries three times with a one second pause',
    '`{t}` is documented in the README table',
    '`{t}` builds without warnings',
    '`{t}` keeps its public signature after the cleanup',
    '`{t}` rejects a payload larger than 2 MB',
    '`{t}` has a regression test for the off-by-one',
    '`{t}` writes UTC timestamps only',
    '`{t}` is formatted and lint clean',
    '`{t}` loads in under 200 ms on the test fixture',
    '`{t}` drops the unused feature flag',
    '`{t}` emits one metric per call',
    '`{t}` got its error messages reworded',
    '`{t}` passes the type check in strict mode',
    '`{t}` is renamed consistently across imports',
    '`{t}` caches its lookup for five minutes',
    '`{t}` exits with code 2 on bad usage',
    '`{t}` skips hidden files as intended',
];

export const NEXT: readonly string[] = [
    'Add a test for the timeout path of `{t}`',
    'Remove the deprecated option from `{t}`',
    'Profile `{t}` on the large fixture',
    'Write the changelog line for `{t}`',
    'Move the constants of `{t}` to the config module',
    'Review the error handling of `{t}`',
    'Rename the helpers in `{t}`',
    'Add input validation to `{t}`',
    'Document the return codes of `{t}`',
    'Split the long function in `{t}`',
    'Check `{t}` against the staging data',
    'Replace the hand-rolled parser in `{t}`',
    'Add a dry-run flag to `{t}`',
    'Port `{t}` to the new client',
    'Measure the memory use of `{t}`',
    'Pin the dependency used by `{t}`',
];

export const NEEDS: readonly string[] = [
    'Confirm whether `{t}` may drop the old format?',
    'Decide if `{t}` should fail hard on a missing key?',
    'Approve the rename of `{t}`?',
    'Should `{t}` keep the v1 fallback?',
    'May `{t}` write to the shared bucket?',
    'Is a 30 day retention right for `{t}`?',
    'Should `{t}` page the on-call or only log?',
    'Confirm the owner of `{t}`?',
    'May the tests of `{t}` use the network?',
    'Should `{t}` ship behind a flag?',
    'Is the default of `{t}` 10 or 20?',
    'Approve deleting the fixtures of `{t}`?',
    'Should `{t}` accept YAML as well as TOML?',
    'Confirm the limit for `{t}` is per user?',
];

export const DECISIONS: readonly (readonly [string, string])[] = [
    ['`{t}` stays synchronous', 'the callers are batch jobs and gain nothing from async'],
    ['`{t}` keeps the JSON format', 'two downstream readers parse it today'],
    ['`{t}` fails closed on a parse error', 'a silent default hid a bad config last month'],
    ['`{t}` is not split further', 'the pieces would share one private state'],
    ['`{t}` uses the standard library only', 'a new dependency needs a security review'],
    ['`{t}` logs at info level', 'debug output filled the disk in the last test'],
    ['`{t}` keeps its retry count at three', 'more retries only delayed the failure'],
    ['`{t}` owns its schema', 'a shared schema blocked two teams before'],
    ['`{t}` is tested with real fixtures', 'the mocks drifted from the real shape'],
    ['`{t}` reads config once at start', 'a reload in the middle caused mixed results'],
    ['`{t}` keeps the old flag as an alias', 'scripts in the field still pass it'],
    ['`{t}` sorts its output by id', 'a stable order keeps the diffs small'],
];

export const RULES: readonly string[] = [
    'Never edit `{t}` without running its tests',
    'Keep `{t}` free of network calls',
    'Ask before changing the public names in `{t}`',
    'No new dependency in `{t}` without approval',
    'Commit changes to `{t}` one concern at a time',
    'Keep `{t}` under 300 lines',
    'Never commit generated files next to `{t}`',
    'Always update the docs with `{t}`',
    'Do not touch `{t}` on a Friday',
    'Run the linter before pushing `{t}`',
];

export const ANCHOR_LEADS: readonly string[] = ['Done:', 'I checked and', 'Result:', 'Confirmed:', 'Update:', 'Noted:'];

export const MIX: readonly (readonly [string, number])[] = [['done', 0.43], ['links', 0.18], ['needs', 0.17], ['next', 0.12], ['decisions', 0.06], ['rules', 0.04]];
