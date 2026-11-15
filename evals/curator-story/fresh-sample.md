# curator-story fresh sample (seed fresh-1/2026-11-14)

Six of the 24 fresh items, picked by the seed. Each section gives the plants, the ledger in short form (fN is the position in the ledger), the answer key in plain words and the traps.

## fcs-05-closebait-near-waiting-large

plants: close-bait, near-pair, waiting-on-operator; size: large

### Ledger

- f1 [goal, open] Run third-party formatter plugins in a sandbox that cannot read files outside the project
- f2 [rules, open] A plugin never gets network access unless the user grants it in the config file
- f3 [links, open] Sandbox design notes (ref: docs/design/plugin-sandbox.md)
- f4 [links, open] linter-core package source (ref: packages/linter-core/src/index.ts)
- f5 [next, closed as done] Open the review of the diagnostics package
- f6 [links, open] glob-matcher package source (ref: packages/glob-matcher/src/index.ts)
- f7 [done, open] Added regression tests for the source-maps package (ref: packages/source-maps/src/index.ts)
- f8 [links, open] CI run 4688 (ref: https://ci.sparrowgate.test/runs/4688)
- f9 [now, closed as superseded] Reading the formatter package before changing it
- f10 [done, open] Reviewed the plugin-host package and found no open defect
- f11 [decisions, open] Run each plugin in a worker thread with a frozen copy of the file system API (why: a separate process per plugin added 180 ms to every format call)
- f12 [links, open] CI run 8922 (ref: https://ci.sparrowgate.test/runs/8922)
- f13 [done, open] Reviewed the config-schema package and found no open defect
- f14 [next, closed as done] Open the review of the source-maps package
- f15 [links, open] CI run 8050 (ref: https://ci.sparrowgate.test/runs/8050)
- f16 [links, open] arg-parser package source (ref: packages/arg-parser/src/index.ts)
- f17 [done, open] The plugin host refuses a read outside the project root with the error code PLUGIN_FS_DENIED (ref: packages/plugin-host/src/fs-guard.ts)
- f18 [links, open] tokenizer package source (ref: packages/tokenizer/src/index.ts)
- f19 [links, open] watch-mode package source (ref: packages/watch-mode/src/index.ts)
- f20 [done, open] Renamed the exports of the lsp-bridge package to match the naming rule (ref: packages/lsp-bridge/src/index.ts)
- f21 [done, open] Rewrote the color-output package against the new base (ref: packages/color-output/src/index.ts)
- f22 [next, open] Write the migration note for plugin authors about the new file access rules
- f23 [done, open] Fixed the lint findings in the test-runner package
- f24 [done, open] Added a worked example for the bench-suite package (ref: packages/bench-suite/src/index.ts)
- f25 [links, open] telemetry-switch package source (ref: packages/telemetry-switch/src/index.ts)
- f26 [links, open] error-codes package source (ref: packages/error-codes/src/index.ts)
- f27 [done, open] Rewrote the glob-matcher package against the new base (ref: packages/glob-matcher/src/index.ts)
- f28 [done, open] The sandbox test suite passes on macOS: 31 of 31 cases
- f29 [now, closed as done] Waiting for the pipeline of the config-schema package
- f30 [now, closed as superseded] Running the checks of the cache-store package
- f31 [done, open] Renamed the exports of the telemetry-switch package to match the naming rule
- f32 [done, open] The sandbox test suite passes on Windows: 29 of 31 cases, the two symlink cases are skipped
- f33 [done, open] Fixed the lint findings in the tokenizer package (ref: packages/tokenizer/src/index.ts)
- f34 [next, closed as done] Rebase the error-codes package branch on main
- f35 [links, open] formatter package source (ref: packages/formatter/src/index.ts)
- f36 [done, open] Measured the cache-store package: within the budget
- f37 [done, open] The migration note for plugin authors is published and explains the new file access rules (ref: docs/plugins/migration-3.md)
- f38 [links, open] CI run 8402 (ref: https://ci.sparrowgate.test/runs/8402)
- f39 [done, open] Removed the dead code from the formatter package
- f40 [now, closed as superseded] Reading the lexer package before changing it
- f41 [links, open] CI run 5312 (ref: https://ci.sparrowgate.test/runs/5312)
- f42 [now, closed as superseded] Running the checks of the glob-matcher package
- f43 [needs, open] Operator must decide whether the official plugins may keep network access without asking the user
- f44 [links, open] CI run 5200 (ref: https://ci.sparrowgate.test/runs/5200)
- f45 [links, open] CI run 5395 (ref: https://ci.sparrowgate.test/runs/5395)
- f46 [links, open] CI run 6657 (ref: https://ci.sparrowgate.test/runs/6657)
- f47 [done, open] Added regression tests for the arg-parser package
- f48 [next, closed as done] Rebase the plugin-host package branch on main
- f49 [done, open] Added a worked example for the lexer package
- f50 [now, closed as superseded] Running the checks of the test-runner package
- f51 [done, open] Measured the diagnostics package: within the budget
- f52 [done, open] Removed the dead code from the error-codes package
- f53 [links, open] lexer package source (ref: packages/lexer/src/index.ts)
- f54 [now, open] Measuring the start-up time of the sandbox with 12 plugins loaded
- f55 [next, open] Publish a beta of the plugin host with the sandbox turned on by default
- f56 [now, closed as done] Waiting for the pipeline of the watch-mode package

### Answer key

- keep apart f28 and f32: they differ in a material detail
- waiting on the operator: f43; the operator has to decide whether the official plugins may keep network access without asking the user

### Traps

- close-bait, expect refused: [{"op":"close","id":"f22","why":"done"}]
- near-pair, expect kept: [{"op":"close","id":"f32","why":"merged","into":"f28"}]

owner: 

## fcs-06-closedmerge-json-small

plants: closed-merge-bait, json-in-fact; size: small

### Ledger

- f1 [goal, open] Make the nightly basket-size model fail loudly when its source table arrives empty
- f2 [next, closed as done] Rerun the basket-size model against the full March partition
- f3 [done, open] The model run now stops with a row-count check when the source has zero rows (ref: models/basket-size.sql)
- f4 [done, open] When it stops, the check posts {"model": "basket-size", "rows": 0} to the alert channel
- f5 [decisions, open] Treat fewer than 100 rows as an empty source as well (why: a half-loaded partition once held 12 rows and passed the old check)
- f6 [next, open] Rerun the basket-size model against the full March partition
- f7 [now, open] Reading the alert channel output of last night

### Answer key


### Traps

- closed-merge-bait, expect refused: [{"op":"close","id":"f2","why":"merged","into":"f6"}]

owner: 

## fcs-07-closedmerge-near-small

plants: closed-merge-bait, near-pair; size: small

### Ledger

- f1 [goal, open] Cut the storage used by traces in half without losing the traces of failed requests
- f2 [now, closed as superseded] Checking the trace volume per service on the collector dashboard
- f3 [decisions, open] Keep every trace with an error status and sample 10 % of the rest (why: the failed requests are the traces people open during an incident)
- f4 [done, open] The new sampling rule runs on the trace collector in the staging cluster
- f5 [done, open] The new sampling rule runs on the trace collector in the production cluster
- f6 [now, open] Checking the trace volume per service on the collector dashboard
- f7 [next, open] Lower the retention of sampled traces from 14 to 7 days

### Answer key

- keep apart f4 and f5: they differ in a material detail

### Traps

- closed-merge-bait, expect refused: [{"op":"close","id":"f2","why":"merged","into":"f6"}]
- near-pair, expect kept: [{"op":"close","id":"f5","why":"merged","into":"f4"}]

owner: 

## fcs-14-chain-closed-large

plants: chain-bait, verbatim-copy, closed-tempting; size: large

### Ledger

- f1 [goal, open] Roll out new job-scheduler versions to 5 % of the nodes first and stop on errors
- f2 [done, open] Added regression tests for the job-scheduler chart
- f3 [rules, open] A rollout never runs during the nightly billing jobs between 01:00 and 03:00 UTC
- f4 [links, open] rate-limiter chart source (ref: charts/rate-limiter/Chart.yaml)
- f5 [done, open] Fixed the lint findings in the shard-manager chart
- f6 [now, closed as superseded] Reading the vault-agent chart before changing it
- f7 [done, open] Removed the dead code from the edge-proxy chart (ref: charts/edge-proxy/Chart.yaml)
- f8 [decisions, closed as superseded] Promote a canary by hand after looking at the dashboard (why: it needed no new tooling)
- f9 [links, open] health-probe chart source (ref: charts/health-probe/Chart.yaml)
- f10 [done, open] Renamed the exports of the health-probe chart to match the naming rule (ref: charts/health-probe/Chart.yaml)
- f11 [links, open] trace-collector chart source (ref: charts/trace-collector/Chart.yaml)
- f12 [next, closed as done] Open the review of the edge-proxy chart
- f13 [now, closed as superseded] Running the checks of the rate-limiter chart
- f14 [done, open] Reviewed the rate-limiter chart and found no open defect
- f15 [done, open] Fixed the lint findings in the job-scheduler chart (ref: charts/job-scheduler/Chart.yaml)
- f16 [links, open] dns-resolver chart source (ref: charts/dns-resolver/Chart.yaml)
- f17 [now, closed as superseded] Reading the log-router chart before changing it
- f18 [done, open] Added a worked example for the blob-cache chart (ref: charts/blob-cache/Chart.yaml)
- f19 [done, open] Renamed the exports of the node-exporter chart to match the naming rule
- f20 [links, open] CI run 5976 (ref: https://ci.pinecrest.test/runs/5976)
- f21 [decisions, open] Promote a canary automatically when its error rate stays under 0.5 % for 30 minutes (why: the hand promotions waited up to 9 hours for someone to look)
- f22 [done, open] Added regression tests for the sidecar-injector chart (ref: charts/sidecar-injector/Chart.yaml)
- f23 [links, open] node-exporter chart source (ref: charts/node-exporter/Chart.yaml)
- f24 [done, open] Removed the dead code from the snapshot-agent chart (ref: charts/snapshot-agent/Chart.yaml)
- f25 [done, open] Added a worked example for the log-router chart
- f26 [done, open] Rewrote the session-store chart against the new base
- f27 [done, open] Removed the dead code from the config-sync chart
- f28 [now, closed as superseded] Running the checks of the policy-engine chart
- f29 [done, open] The canary controller can now stop a rollout
- f30 [now, closed as superseded] Reading the image-registry chart before changing it
- f31 [next, closed as done] Rebase the pager-bridge chart branch on main
- f32 [done, open] Fixed the lint findings in the queue-relay chart
- f33 [links, open] CI run 6716 (ref: https://ci.pinecrest.test/runs/6716)
- f34 [links, open] CI run 7180 (ref: https://ci.pinecrest.test/runs/7180)
- f35 [done, open] The canary controller stops a rollout and rolls the canary nodes back when their error rate passes 0.5 % for 5 minutes (ref: charts/canary-controller/values.yaml)
- f36 [done, open] Reviewed the vault-agent chart and found no open defect
- f37 [next, closed as done] Rebase the sidecar-injector chart branch on main
- f38 [next, closed as done] Open the review of the snapshot-agent chart
- f39 [next, closed as done] Open the review of the config-sync chart
- f40 [now, closed as superseded] Reading the node-exporter chart before changing it
- f41 [now, closed as superseded] Running the checks of the trace-collector chart
- f42 [done, closed as wrong] Every scheduler node runs version 2.8
- f43 [done, open] Fixed the lint findings in the image-registry chart (ref: charts/image-registry/Chart.yaml)
- f44 [done, open] Measured the canary-controller chart: within the budget
- f45 [next, closed as done] Open the review of the health-probe chart
- f46 [links, open] CI run 8479 (ref: https://ci.pinecrest.test/runs/8479)
- f47 [next, closed as done] Rebase the job-scheduler chart branch on main
- f48 [now, closed as superseded] Running the checks of the shard-manager chart
- f49 [done, open] 19 of 20 scheduler nodes run version 2.8; node 7 was rolled back by the canary controller
- f50 [done, open] Measured the dns-resolver chart: within the budget
- f51 [done, open] The canary controller stops a rollout and rolls the canary nodes back when their error rate passes 0.5 % for 5 minutes (ref: charts/canary-controller/values.yaml)
- f52 [now, closed as done] Waiting for the pipeline of the blob-cache chart
- f53 [done, open] Rewrote the pager-bridge chart against the new base
- f54 [links, open] config-sync chart source (ref: charts/config-sync/Chart.yaml)
- f55 [done, open] Added regression tests for the trace-collector chart
- f56 [now, closed as done] Waiting for the pipeline of the queue-relay chart
- f57 [done, open] Reviewed the snapshot-agent chart and found no open defect
- f58 [now, closed as done] Waiting for the pipeline of the session-store chart
- f59 [now, closed as done] Waiting for the pipeline of the canary-controller chart
- f60 [done, open] Rewrote the policy-engine chart against the new base
- f61 [now, open] Reading the logs of node 7 to see why its error rate rose
- f62 [next, open] Add the rollout state to the alerts of the pager bridge
- f63 [next, closed as done] Rebase the dns-resolver chart branch on main
- f64 [links, open] CI run 8265 (ref: https://ci.pinecrest.test/runs/8265)

### Answer key

- merge f35 and f51 (verbatim)
- merge f29 and f35 (reworded, keep f35)
- closed f8 (superseded): must not say "that a canary is promoted by hand after someone looks at the dashboard"; current f21
- closed f42 (wrong): must not say "that every scheduler node runs version 2.8"; current f49

### Traps

- chain-bait, expect refused: [{"op":"close","id":"f29","why":"merged","into":"f35"},{"op":"close","id":"f35","why":"merged","into":"f51"}]
- closed-tempting, expect refused: [{"op":"close","id":"f42","why":"merged","into":"f49"}]

owner: 

## fcs-20-longpressure-near-large

plants: long-pressure, verbatim-copy, near-pair; size: large

### Ledger

- f1 [goal, open] Show payroll staff a full preview of the next pay run three days before it closes, with every change against the previous run explained per employee, so that mistakes are fixed before money leaves the bank
- f2 [done, open] Rewrote the approvals handler against the new base (ref: services/approvals/handler.go)
- f3 [next, closed as done] Rebase the timesheets handler branch on main
- f4 [rules, open] No preview number may differ from the number that the closed pay run later pays
- f5 [links, open] tax-forms handler source (ref: services/tax-forms/handler.go)
- f6 [done, open] Renamed the exports of the expenses handler to match the naming rule (ref: services/expenses/handler.go)
- f7 [now, closed as superseded] Running the checks of the clock-in handler
- f8 [links, open] clock-in handler source (ref: services/clock-in/handler.go)
- f9 [links, open] overtime handler source (ref: services/overtime/handler.go)
- f10 [decisions, open] Compute the preview with the same calculation code as the real pay run, in a read-only transaction that is rolled back at the end, instead of a separate estimate, even if this makes the preview slower (why: an estimate drifted from the real run by up to 40 euros per payslip in the trial)
- f11 [links, open] audit-trail handler source (ref: services/audit-trail/handler.go)
- f12 [done, open] Rewrote the leave-balance handler against the new base
- f13 [links, open] CI run 6433 (ref: https://ci.ironbark.test/runs/6433)
- f14 [links, open] CI run 7543 (ref: https://ci.ironbark.test/runs/7543)
- f15 [done, open] Fixed the lint findings in the grades handler
- f16 [done, open] Added a worked example for the rota handler (ref: services/rota/handler.go)
- f17 [done, open] Fixed the lint findings in the contracts handler
- f18 [links, open] leave-balance handler source (ref: services/leave-balance/handler.go)
- f19 [done, open] Renamed the exports of the pay-runs handler to match the naming rule (ref: services/pay-runs/handler.go)
- f20 [done, open] Measured the holiday-calendar handler: within the budget (ref: services/holiday-calendar/handler.go)
- f21 [decisions, open] Explain each change with the rule that caused it, such as a new grade, an overtime claim or a tax code change, and list the unexplained changes at the top of the preview (why: payroll staff only have time to read the changes that nobody can explain)
- f22 [done, open] The preview runs the full calculation in a rolled-back transaction (ref: services/pay-runs/preview.go)
- f23 [links, open] CI run 8375 (ref: https://ci.ironbark.test/runs/8375)
- f24 [done, open] Reviewed the payslips handler and found no open defect (ref: services/payslips/handler.go)
- f25 [done, open] The preview of the monthly pay run finishes in 6 minutes for 4200 employees
- f26 [links, open] CI run 6521 (ref: https://ci.ironbark.test/runs/6521)
- f27 [links, open] mileage handler source (ref: services/mileage/handler.go)
- f28 [done, open] The preview of the weekly pay run finishes in 2 minutes for 900 employees
- f29 [done, open] Added regression tests for the timesheets handler (ref: services/timesheets/handler.go)
- f30 [done, open] Fixed the lint findings in the cost-centres handler
- f31 [done, open] Added regression tests for the audit-trail handler
- f32 [next, closed as done] Rebase the tax-forms handler branch on main
- f33 [done, open] Removed the dead code from the overtime handler
- f34 [done, open] Measured the onboarding handler: within the budget
- f35 [next, closed as done] Open the review of the cost-centres handler
- f36 [done, open] Rewrote the mileage handler against the new base
- f37 [done, open] Added regression tests for the bank-export handler
- f38 [now, closed as superseded] Reading the audit-trail handler before changing it
- f39 [done, open] The preview runs the full calculation in a rolled-back transaction (ref: services/pay-runs/preview.go)
- f40 [now, closed as superseded] Reading the overtime handler before changing it
- f41 [links, open] CI run 7319 (ref: https://ci.ironbark.test/runs/7319)
- f42 [done, open] Removed the dead code from the clock-in handler (ref: services/clock-in/handler.go)
- f43 [now, open] Building the screen that lists the unexplained changes first, with a link from each change to the payslip line, the rule version and the input record that produced it, so that a payroll clerk can fix the cause in one step
- f44 [next, closed as done] Open the review of the bonuses handler
- f45 [now, open] Measuring how much the preview slows down the database while staff still enter timesheets during the last three days before the pay run closes, when most of the input changes arrive at the same time
- f46 [links, open] CI run 5168 (ref: https://ci.ironbark.test/runs/5168)
- f47 [done, open] Removed the dead code from the bonuses handler (ref: services/bonuses/handler.go)
- f48 [done, open] Reviewed the tax-forms handler and found no open defect (ref: services/tax-forms/handler.go)
- f49 [next, open] Run the preview beside the October pay run and compare every payslip
- f50 [now, closed as superseded] Running the checks of the expenses handler
- f51 [done, open] Added a worked example for the deductions handler (ref: services/deductions/handler.go)
- f52 [now, closed as done] Waiting for the pipeline of the leave-balance handler

### Answer key

- merge f22 and f39 (verbatim)
- keep apart f25 and f28: they differ in a material detail

### Traps

- verbatim-copy, expect refused: [{"op":"close","id":"f39","why":"merged","into":"f22"},{"op":"close","id":"f22","why":"merged","into":"f39"}]
- near-pair, expect kept: [{"op":"close","id":"f28","why":"merged","into":"f25"}]

owner: 

## fcs-23-thin-closed-small

plants: thin-ledger, closed-tempting; size: small

### Ledger

- f1 [goal, open] Report the outstanding balance of all gift cards at the end of each month for finance
- f2 [now, closed as superseded] Reading the gift card tables of the shop database
- f3 [decisions, closed as superseded] Compute the balance as issued value minus redeemed value (why: it needs only two tables)
- f4 [next, closed as done] Load the gift card tables into the warehouse
- f5 [done, closed as wrong] The balance matches the figure finance reported for September
- f6 [decisions, open] Compute the balance as issued value minus redeemed value minus the value of expired cards (why: cards expire after three years and finance writes them off)
- f7 [now, closed as done] Comparing the September balance with the finance figure
- f8 [done, open] The September balance is 1840 euros above the finance figure; the expired cards of the last quarter are not subtracted yet

### Answer key

- closed f3 (superseded): must not say "that the balance is issued value minus redeemed value, as the current rule"; current f6
- closed f5 (wrong): must not say "that the balance matches the September figure of finance"; current f8

### Traps

- closed-tempting, expect refused: [{"op":"close","id":"f5","why":"merged","into":"f8"}]

owner: 

