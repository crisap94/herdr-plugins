export type Section = 'goal' | 'now' | 'needs' | 'done' | 'decisions' | 'next' | 'links' | 'rules';

export interface F {
    readonly k: string;
    readonly section: Section;
    readonly text: string;
    readonly why?: string;
    readonly ref?: string;
}

export interface E {
    readonly role: 'user' | 'agent' | 'tool';
    readonly text: string;
    readonly kind?: 'shell' | 'edit' | 'web' | 'agent' | 'other' | 'read';
    readonly what?: string;
    readonly summary?: true;
}

export const f = (k: string, section: Section, text: string, more: { why?: string; ref?: string } = {}): F => ({ k, section, text, ...more });
export const u = (text: string): E => ({ role: 'user', text });
export const a = (text: string): E => ({ role: 'agent', text });
export const sh = (what: string, text = ''): E => ({ role: 'tool', kind: 'shell', what, text });
export const ed = (what: string): E => ({ role: 'tool', kind: 'edit', what, text: '' });
export const rd = (what: string): E => ({ role: 'tool', kind: 'read', what, text: '' });
export const sumU = (text: string): E => ({ role: 'user', text, summary: true });
export const sumA = (text: string): E => ({ role: 'agent', text, summary: true });

export interface Project {
    readonly title: string;
    readonly bg: readonly F[];
    readonly chat: readonly (readonly E[])[];
}

const orchard: Project = {
    title: 'Invoice API v3 pagination',
    bg: [
        f('goal', 'goal', 'Ship version 3 of the orchard-api invoicing API with cursor pagination and immutable invoices'),
        f('b1', 'done', 'Split the invoice router into read and write modules', { ref: 'src/invoices/router.ts' }),
        f('b2', 'done', 'Added request ids to every log line of the API'),
        f('b3', 'done', 'Moved the tax tables from JSON files into the tax_rate table'),
        f('b4', 'done', 'Removed the legacy /v1/charges endpoint and its tests'),
        f('b5', 'done', 'Wrote the load test for the invoice list: 400 requests per second for 5 minutes', { ref: 'load/invoice-list.js' }),
        f('b6', 'done', 'Pinned the Postgres image to 17.2 in the compose file', { ref: 'compose.yaml' }),
        f('b7', 'links', 'API reference draft', { ref: 'https://docs.orchard.test/api/draft' }),
        f('b8', 'rules', 'Every migration ships with a down script'),
        f('b9', 'decisions', 'Keep invoices immutable after they are sent', { why: 'auditors need the sent copy to stay as it was' }),
        f('b10', 'done', 'Documented the error codes of the payments module', { ref: 'docs/errors.md' }),
        f('b11', 'done', 'Fixed the rounding of half cents in line totals'),
        f('b12', 'links', 'Staging dashboard', { ref: 'https://grafana.orchard.test/d/api-staging' }),
        f('b13', 'done', 'Added the customers.archived_at column with migration 0042', { ref: 'migrations/0042_archived_at.sql' }),
        f('b14', 'rules', 'No direct SQL in route handlers: go through the repository layer'),
        f('b15', 'decisions', 'Use ULIDs for public ids', { why: 'sortable by time and safe to expose' }),
        f('b16', 'done', 'Replaced the hand-written pagination with the cursor helper'),
        f('b17', 'links', 'Merge request 218: cursor pagination', { ref: 'https://git.orchard.test/orchard/api/-/merge_requests/218' }),
        f('b18', 'done', 'Set up the nightly dump of the staging database'),
        f('b19', 'rules', 'Money is stored as integer cents, never as floats'),
        f('b20', 'done', 'Deleted the unused coupon feature flag'),
        f('b21', 'decisions', 'Serve PDFs from object storage, not from the API pods', { why: 'the pods run out of memory on large invoices' }),
        f('b22', 'links', 'Load test report of 3 November', { ref: 'reports/load-2026-11-03.html' }),
        f('b23', 'next', 'Write the upgrade notes for clients of the v2 API'),
        f('b24', 'done', 'Added a health endpoint that reports the build commit', { ref: 'src/health.ts' }),
    ],
    chat: [
        [
            u('The linter complains about unused imports in the test helpers again. Can you clean those up before we go on? Only the helpers, do not touch the tests themselves.'),
            sh('bunx eslint test/helpers --fix', '14 problems fixed, 0 remaining'),
            ed('test/helpers/factories.ts'),
            a('Cleaned up the test helpers: 14 unused imports removed across factories.ts, clock.ts and http.ts. Nothing else changed in those files, and I left the test files alone as you asked. The linter is quiet on test/helpers now. One import in clock.ts looked unused but is needed for its side effect (it registers the fake timers), so I kept it and added it to the allow list of the lint rule instead of deleting it.'),
        ],
        [
            u('In the mailer templates the variable is called custName in some places and customerName in others. Make it customerName everywhere.'),
            sh('rg -l custName src/mailer', 'src/mailer/templates/receipt.hbs\nsrc/mailer/templates/reminder.hbs\nsrc/mailer/render.ts'),
            ed('src/mailer/render.ts'),
            a('Renamed custName to customerName in the two templates and in render.ts. The snapshot tests of the mailer needed no update because the rendered text is the same. I also searched the fixtures: no custName is left anywhere under src/mailer or test/mailer.'),
        ],
        [
            u('How does the seed script decide how many customers to create? I get a different number every time.'),
            rd('scripts/seed.ts'),
            a('The seed script reads SEED_CUSTOMERS from the environment and falls back to a random number between 20 and 60 when it is not set, which is why you see a different count on every run. Each customer then gets between 1 and 8 invoices, drawn from the same random source. If you want the same data every time, set SEED_CUSTOMERS and SEED_RANDOM: the second one fixes the random source, so names, amounts and dates repeat exactly. I did not change the script; this is only how it works today.'),
        ],
        [
            u('The currency formatter test fails on my machine but not in CI. Any idea?'),
            sh('bun test test/format/currency.test.ts', '1 fail: expected "1.234,50" received "1,234.50"'),
            ed('src/format/currency.ts'),
            sh('bun test test/format/currency.test.ts', '6 pass, 0 fail'),
            a('The currency formatter took the locale from the machine, and yours differs from the one in CI. The formatter now takes the locale as an explicit argument and the test passes the locale it expects, so the result no longer depends on where it runs. The six tests of that file pass here.'),
        ],
        [
            u('The local setup section of the README is out of date, it still talks about yarn. Tidy it up.'),
            ed('README.md'),
            a('Rewrote the local setup section of the README: it now names bun for install and test, lists the two environment variables a first run needs (DATABASE_URL and SEED_CUSTOMERS), and drops the paragraph about yarn workspaces. I kept the troubleshooting list as it was, apart from removing the entry about the yarn cache.'),
        ],
        [
            u('Bump the test runner to the latest patch release and check nothing breaks.'),
            sh('bun update --latest @orchard/test-kit', 'updated @orchard/test-kit 4.2.1 -> 4.2.3'),
            sh('bun test', '412 pass, 0 fail, 3 skip'),
            a('The test kit is on 4.2.3 now (it was 4.2.1). The whole suite ran afterwards: 412 pass, none fail, and the same 3 skipped tests as before (the ones that need the sandbox payment account). The lockfile changed by two lines only.'),
        ],
        [
            u('There are typos in the OpenAPI descriptions, "recieve" and "adress" at least. Fix what you find.'),
            sh('rg -n "recieve|adress|seperate" openapi/', 'openapi/customers.yaml:41\nopenapi/customers.yaml:77\nopenapi/webhooks.yaml:12'),
            ed('openapi/customers.yaml'),
            ed('openapi/webhooks.yaml'),
            a('Fixed three typos in the OpenAPI descriptions: "recieve" in webhooks.yaml and "adress" twice in customers.yaml. I also ran the spell checker over the whole openapi folder; it reported nothing else apart from product names. The generated client did not change, since descriptions are not part of it.'),
        ],
        [
            u('Why is the docker build so slow lately?'),
            sh('docker build . --progress=plain', 'step 7/12 COPY . . invalidates cache (38 s)\nstep 8/12 bun install (71 s)'),
            a('The build copies the whole repository before it installs the dependencies, so any change to any file throws away the cached install layer: that is the 71 seconds you see on every build. Copying package.json and the lockfile first, installing, and only then copying the rest would keep the install cached until a dependency changes. I have not changed the Dockerfile; tell me if you want it.'),
        ],
    ],
};

const tidewater: Project = {
    title: 'Orders pipeline backfill',
    bg: [
        f('goal', 'goal', 'Make the tidewater orders pipeline load a full day in under 20 minutes without duplicate rows'),
        f('b1', 'done', 'Moved the extract step from full table scans to the updated_at watermark'),
        f('b2', 'done', 'Added a row count check between the staging and the warehouse tables', { ref: 'checks/row_counts.sql' }),
        f('b3', 'done', 'Split the loader into batches of 5,000 rows'),
        f('b4', 'links', 'Pipeline run history', { ref: 'https://runs.tidewater.test/pipelines/orders' }),
        f('b5', 'rules', 'A backfill never runs against the production warehouse between 08:00 and 18:00'),
        f('b6', 'decisions', 'Keep raw extracts for 14 days', { why: 'long enough to replay a bad week, short enough for the bucket quota' }),
        f('b7', 'done', 'Wrote the runbook for a failed nightly load', { ref: 'docs/runbooks/nightly-load.md' }),
        f('b8', 'done', 'Removed the unused currency_legacy column from the staging schema'),
        f('b9', 'links', 'Warehouse cost dashboard', { ref: 'https://grafana.tidewater.test/d/warehouse-cost' }),
        f('b10', 'done', 'Added retries with backoff to the extract of the returns table'),
        f('b11', 'rules', 'Schema changes go through a migration file, never through the console'),
        f('b12', 'done', 'Replaced the cron entry with a scheduler job named orders-nightly'),
        f('b13', 'decisions', 'Deduplicate on order_id plus line_no', { why: 'order_id alone repeats across split shipments' }),
        f('b14', 'done', 'Added the load_id column to every warehouse table'),
        f('b15', 'links', 'Sample of the bad batch of 28 October', { ref: 'samples/2026-10-28-batch-0412.csv' }),
        f('b16', 'done', 'Tuned the warehouse connection pool from 4 to 12 connections'),
        f('b17', 'done', 'Fixed the time zone of order timestamps: they are stored in UTC now'),
        f('b18', 'rules', 'Every pipeline step writes its row counts to the run log'),
        f('b19', 'done', 'Wrote unit tests for the line item parser: 38 cases', { ref: 'tests/test_line_items.py' }),
        f('b20', 'links', 'Schema of the orders feed', { ref: 'docs/feeds/orders-v4.md' }),
        f('b21', 'done', 'Dropped the temporary table tmp_orders_fix after the October repair'),
        f('b22', 'next', 'Document the load_id column in the data dictionary'),
        f('b23', 'decisions', 'Run the nightly load at 02:30 UTC', { why: 'the source system finishes its own batch at 02:00' }),
    ],
    chat: [
        [
            u('The type checker is unhappy with the helpers in utils/dates.py. Can you look? No behaviour change please.'),
            sh('mypy utils/dates.py', 'utils/dates.py:22: error: Returning Any from function declared to return "date"\nFound 3 errors in 1 file'),
            ed('utils/dates.py'),
            sh('mypy utils/dates.py', 'Success: no issues found in 1 source file'),
            a('The three type errors in utils/dates.py are gone. They all came from one helper that returned the result of a parse call without saying what type it is; it now checks the type before returning. Behaviour is the same: the 12 tests of the date helpers pass unchanged.'),
        ],
        [
            u('What does the --since flag of the extract command accept? The help text is not clear.'),
            rd('cli/extract.py'),
            a('The --since flag accepts either a date (2026-11-01), a date and time in UTC (2026-11-01T06:00:00Z) or a relative value such as 3d or 12h. A date alone means midnight UTC of that day. A relative value is counted back from the moment the command starts, not from the last successful run. The help text only shows the first form, which is why it is unclear; I can extend it if you want, but I have not touched it.'),
        ],
        [
            u('Rename the log field "dur" to "duration_ms" in the step logger, the dashboards people keep asking what dur means.'),
            sh('rg -n "\\"dur\\"" pipeline/', 'pipeline/log.py:31\npipeline/log.py:58'),
            ed('pipeline/log.py'),
            a('The step logger writes duration_ms instead of dur now, in both places where it was set. The value is the same number of milliseconds as before. Saved searches that filter on dur will need the new name; I found two of them in the dashboards folder and listed them in the commit message, but did not edit the dashboards.'),
        ],
        [
            u('Is there a quick way to run one step locally against the sample files?'),
            rd('Makefile'),
            a('Yes: make step STEP=transform SAMPLE=samples/small runs a single step against a folder of sample files and writes its output to out/local. It uses the local SQLite stand-in for the warehouse, so nothing leaves your machine. The three sample folders are small (200 orders), medium (20,000) and wide (few orders with many line items). The command prints the row counts of the step at the end, the same ones a real run writes to its log.'),
        ],
        [
            u('The pre-commit hook takes ages. What is it doing?'),
            sh('pre-commit run --all-files --verbose', 'ruff 2.1s\nmypy 48.7s\nsqlfluff 6.3s'),
            a('Almost all of the time is the type checker: 48.7 of about 57 seconds, because the hook checks the whole project on every commit. Running it only on the changed files, with the cache turned on, brings it to a few seconds; the full check would then run in CI only. The other two hooks are fine at 2.1 and 6.3 seconds. I have not changed the hook configuration yet.'),
        ],
        [
            u('Sort the columns in the staging DDL files alphabetically after the key columns, it makes diffs easier to read.'),
            ed('ddl/staging/orders.sql'),
            ed('ddl/staging/order_lines.sql'),
            ed('ddl/staging/returns.sql'),
            a('The three staging DDL files now list the key columns first and every other column in alphabetical order. This changes only the text of the files: the column order of the existing tables is untouched, and no migration is needed because the staging tables are created fresh on each run.'),
        ],
        [
            u('Add a small test for the helper that turns a file name into a load date.'),
            ed('tests/test_load_date.py'),
            sh('pytest tests/test_load_date.py -q', '5 passed in 0.21s'),
            a('Added tests/test_load_date.py with five cases: a plain name, a name with a sequence suffix, a name with an upper-case extension, a name without a date (expects an error) and a date that does not exist such as 31 February (expects an error). All five pass.'),
        ],
        [
            u('Why does the transform step print a warning about a deprecated option on every run?'),
            sh('python -W error -m pipeline.transform --dry-run', 'DeprecationWarning: the "infer_datetime" option is deprecated'),
            ed('pipeline/transform.py'),
            a('The warning came from an option of the CSV reader that its library has deprecated; the transform step passed it explicitly although its value was the default. I removed the option, so the warning is gone and the parsed result is identical: I compared the output of the medium sample before and after, byte for byte.'),
        ],
    ],
};

const lantern: Project = {
    title: 'Settings page redesign',
    bg: [
        f('goal', 'goal', 'Redesign the lantern-ui settings page with the new tokens and full keyboard support'),
        f('b1', 'done', 'Moved the settings page to the two-column layout', { ref: 'src/pages/Settings.tsx' }),
        f('b2', 'done', 'Replaced the hand-drawn icons with the shared icon set'),
        f('b3', 'links', 'Design file of the settings page', { ref: 'https://design.lantern.test/files/settings-v5' }),
        f('b4', 'rules', 'Every interactive element is reachable with the Tab key and shows a focus ring'),
        f('b5', 'decisions', 'Keep the form state in the URL', { why: 'a reload or a shared link must show the same tab and filters' }),
        f('b6', 'done', 'Added visual regression snapshots for the three breakpoints'),
        f('b7', 'done', 'Removed the old modal component and its 9 usages'),
        f('b8', 'links', 'Accessibility audit of October', { ref: 'docs/audits/2026-10-a11y.md' }),
        f('b9', 'rules', 'No colour value outside the token file'),
    ],
    chat: [
        [
            u('The storybook build prints a wall of warnings about missing display names. Can you quiet that down properly, not by hiding the warnings?'),
            sh('bun run storybook:build', '37 warnings: Component definition is missing display name'),
            ed('src/components/forms/index.ts'),
            sh('bun run storybook:build', 'built in 41 s, 0 warnings'),
            a('The 37 warnings came from components wrapped in forwardRef without a name. Each of them now sets its display name next to its definition, so the storybook build is clean and the component tree in the browser tools shows real names instead of "Anonymous". No behaviour changed.'),
        ],
        [
            u('What breakpoints do we actually use? I see four different numbers in the code.'),
            sh('rg -n "min-width" src/styles', 'src/styles/layout.css:12: 640px\nsrc/styles/layout.css:30: 960px\nsrc/styles/legacy.css:8: 600px\nsrc/styles/legacy.css:19: 1000px'),
            a('There are two sets. layout.css uses 640 and 960 pixels, which are the ones in the design file. legacy.css uses 600 and 1000 pixels and is only loaded by the old help pages. So the settings page and everything new follow 640 and 960; the other two numbers will disappear when the help pages are rebuilt. I changed nothing.'),
        ],
        [
            u('Sort the imports in the components folder the way the linter wants, I am tired of the noise in reviews.'),
            sh('bunx eslint src/components --fix --rule "import/order: error"', '58 files changed'),
            a('Sorted the imports in 58 files under src/components. It is a pure reordering: the type checker and the 203 unit tests pass as before, and the bundle size is the same to the byte.'),
        ],
        [
            u('The test for the tooltip is flaky, it fails maybe one run in ten.'),
            sh('bun test src/components/Tooltip.test.tsx --rerun-each 30', '30 runs: 27 pass, 3 fail (timeout waiting for role=tooltip)'),
            ed('src/components/Tooltip.test.tsx'),
            sh('bun test src/components/Tooltip.test.tsx --rerun-each 30', '30 runs: 30 pass'),
            a('The tooltip test waited a fixed 100 milliseconds for the tooltip, while the component shows it after a delay that can run slightly longer on a busy machine. The test now uses fake timers and advances them past the delay, so it no longer depends on real time. Thirty runs in a row pass.'),
        ],
    ],
};

const brasswork: Project = {
    title: 'Prune command and release 0.9',
    bg: [
        f('goal', 'goal', 'Release brasswork 0.9.0 with the prune command and Windows support'),
        f('b1', 'done', 'Added the prune command with age and count limits', { ref: 'src/commands/prune.rs' }),
        f('b2', 'done', 'Moved the configuration loader into its own module named settings'),
        f('b3', 'rules', 'Never push to the release branch without approval from the operator'),
        f('b4', 'links', 'Milestone 0.9.0', { ref: 'https://git.brasswork.test/tools/brasswork/-/milestones/9' }),
        f('b5', 'decisions', 'Read the configuration from TOML only', { why: 'two formats doubled the parsing bugs in 0.8' }),
        f('b6', 'done', 'Replaced the hand-written argument parser with the derive macros'),
        f('b7', 'done', 'Added shell completions for bash, zsh and fish'),
        f('b8', 'links', 'Benchmark of prune on 100,000 files', { ref: 'benches/prune-100k.md' }),
        f('b9', 'rules', 'Exit codes follow the table in docs/exit-codes.md'),
    ],
    chat: [
        [
            u('clippy has new complaints since the toolchain update. Fix them without changing behaviour.'),
            sh('cargo clippy --all-targets', 'warning: 11 warnings (needless_borrow, manual_let_else)'),
            ed('src/fs/walk.rs'),
            sh('cargo clippy --all-targets', 'Finished: 0 warnings'),
            a('The 11 clippy warnings are fixed: nine needless borrows and two places where a match could be a let-else. They are spread over walk.rs, report.rs and main.rs. The 164 tests pass and the binary size is unchanged.'),
        ],
        [
            u('How do I see what the tool would read from my config without running anything?'),
            rd('src/settings/mod.rs'),
            a('Run brasswork config show. It prints the configuration after merging the defaults, the file it found and the environment variables, and it says for every value where it came from. Add --path to print only the path of the file it would read. Neither form touches the file system beyond reading that one file.'),
        ],
        [
            u('The help output wraps badly in a narrow terminal. Can it follow the terminal width?'),
            ed('src/cli.rs'),
            sh('COLUMNS=60 cargo run -- --help', 'help text wrapped at 60 columns'),
            a('The help text follows the terminal width now and falls back to 80 columns when the width is unknown, for example when the output is piped into a file. I checked it at 60, 80 and 120 columns.'),
        ],
        [
            u('Make the error for a missing directory friendlier, right now it only prints the OS error number.'),
            ed('src/error.rs'),
            sh('cargo run -- prune /no/such/dir', 'error: the directory /no/such/dir does not exist'),
            a('A missing directory now gives "the directory ... does not exist" with the path, instead of the bare OS error number. The exit code stays the same as before, and the test that checks the message was updated to the new wording.'),
        ],
    ],
};

const mossgate: Project = {
    title: 'Gateway middleware migration',
    bg: [
        f('goal', 'goal', 'Move every mossgate route to the new auth middleware and retire the old session store'),
        f('b1', 'done', 'Wrote the new auth middleware with scoped tokens', { ref: 'internal/auth/middleware.go' }),
        f('b2', 'done', 'Added structured audit events for login, logout and token refresh'),
        f('b3', 'links', 'Threat model of the gateway', { ref: 'docs/security/threat-model.md' }),
        f('b4', 'rules', 'No secret is written to a log line, not even at debug level'),
        f('b5', 'decisions', 'Sign tokens with Ed25519', { why: 'short keys and fast verification on the edge nodes' }),
        f('b6', 'done', 'Removed the basic-auth fallback from the health route'),
        f('b7', 'links', 'Staging gateway', { ref: 'https://gateway.staging.mossgate.test' }),
        f('b8', 'done', 'Added rate limiting of 20 login attempts per minute per address'),
        f('b9', 'rules', 'Key changes happen only inside the Thursday maintenance window'),
    ],
    chat: [
        [
            u('go vet shows shadowed variables in the handlers package. Clean that up.'),
            sh('go vet ./internal/handlers/...', '6 findings: declaration of "err" shadows declaration'),
            ed('internal/handlers/profile.go'),
            sh('go vet ./internal/handlers/...', 'ok'),
            a('The six shadowed err variables in the handlers package are renamed or folded into the outer one. It is a mechanical change: go vet is clean and the 88 handler tests pass.'),
        ],
        [
            u('Where does the gateway read its listen address from? I want to run two copies locally.'),
            rd('cmd/gateway/main.go'),
            a('The listen address comes from the MOSSGATE_LISTEN variable and defaults to 127.0.0.1:8443. To run two copies, give the second one another port, for example MOSSGATE_LISTEN=127.0.0.1:8444, and another data directory with MOSSGATE_DATA, otherwise both would open the same local store and the second would refuse to start.'),
        ],
        [
            u('The request log prints the full user agent, which makes the lines very long. Cut it at 80 characters.'),
            ed('internal/logging/request.go'),
            a('The request log now cuts the user agent at 80 characters and adds an ellipsis when it was longer. The full value is still available in the debug trace of a single request. One test covers a short value, one a value of exactly 80 characters and one a longer value.'),
        ],
        [
            u('Can you make the integration tests print which port they picked? When one hangs I cannot tell which process to look at.'),
            ed('internal/testkit/server.go'),
            sh('go test ./internal/integration -run TestLogin -v', 'testkit: gateway listening on 127.0.0.1:41873\nPASS'),
            a('Each integration test now prints the address its gateway listens on when it starts, in the form "testkit: gateway listening on 127.0.0.1:PORT". The line appears only with -v, so normal runs stay quiet.'),
        ],
    ],
};

const kiteline: Project = {
    title: 'Offline sync for the field app',
    bg: [
        f('goal', 'goal', 'Make the kiteline field app usable offline: queue edits and sync them when the network returns'),
        f('b1', 'done', 'Added the local queue of pending edits', { ref: 'app/sync/queue.kt' }),
        f('b2', 'done', 'Wrote the conflict screen for edits made on two devices'),
        f('b3', 'links', 'Sync protocol notes', { ref: 'docs/sync-protocol.md' }),
        f('b4', 'rules', 'The app never drops a queued edit without showing it to the person first'),
        f('b5', 'decisions', 'Last write wins per field, not per record', { why: 'two people often edit different fields of one visit report' }),
        f('b6', 'done', 'Reduced the size of the first sync from 48 MB to 9 MB'),
        f('b7', 'links', 'Test devices list', { ref: 'https://wiki.kiteline.test/qa/devices' }),
        f('b8', 'done', 'Added a banner that shows the number of edits waiting to sync'),
        f('b9', 'rules', 'Photos upload on Wi-Fi only unless the person turns that off'),
    ],
    chat: [
        [
            u('The Kotlin linter flags wildcard imports in the sync package. Replace them with explicit ones.'),
            sh('./gradlew ktlintCheck', '23 violations: no-wildcard-imports'),
            ed('app/sync/Scheduler.kt'),
            sh('./gradlew ktlintCheck', 'BUILD SUCCESSFUL'),
            a('Replaced the wildcard imports in the sync package with explicit ones: 23 places in 7 files. The linter passes and nothing else changed.'),
        ],
        [
            u('How long does the app wait before it retries a failed sync?'),
            rd('app/sync/Backoff.kt'),
            a('It waits 5 seconds after the first failure and doubles the wait each time up to 10 minutes: 5 s, 10 s, 20 s and so on. A change of network (for example Wi-Fi coming back) resets the wait and triggers a try at once. After 12 failures in a row the app stops retrying on its own and shows the banner with a button to try again.'),
        ],
        [
            u('The strings file has a few entries nobody uses any more. Remove them.'),
            sh('./gradlew lintDebug', '14 unused resources in res/values/strings.xml'),
            ed('app/src/main/res/values/strings.xml'),
            a('Removed the 14 unused strings from the default strings file and from the two translations. The lint report shows no unused resources now, and the app builds for both flavours.'),
        ],
        [
            u('Make the debug menu show the build number, QA keeps asking which build they have.'),
            ed('app/debug/DebugMenu.kt'),
            a('The debug menu shows the build number and the commit it was built from on its first line. Long-pressing the line copies both to the clipboard, so they can be pasted into a bug report.'),
        ],
    ],
};

export const PROJECTS: Readonly<Record<'orchard' | 'tidewater' | 'lantern' | 'brasswork' | 'mossgate' | 'kiteline', Project>> = { orchard, tidewater, lantern, brasswork, mossgate, kiteline };

export function extend(more: Readonly<Record<string, readonly (readonly E[])[]>>): void {
    for (const [name, chats] of Object.entries(more)) {
        (PROJECTS[name as ProjectName].chat as (readonly E[])[]).push(...chats);
    }
}
export type ProjectName = keyof typeof PROJECTS;
