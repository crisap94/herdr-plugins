# G8-R01 summary (numbers only)

| kind | nominal delay s -> received/n |
|---|---|
| claude | 0:3/10 1:5/10 2:5/10 3:6/10 4:5/10 5:8/10 6:8/10 7:10/10 8:10/10 9:10/10 10:9/10 11:9/10 12:10/10 |
| codex | 0:10/10 1:10/10 2:10/10 3:10/10 4:10/10 5:10/10 6:10/10 7:10/10 8:10/10 9:10/10 10:10/10 11:10/10 12:10/10 |
| opencode | 0:0/5 1:0/3 2:0/5 3:0/5 4:0/3 5:0/3 6:0/5 7:0/4 8:0/5 9:0/4 10:0/5 11:0/3 12:0/4 15:0/3 20:0/4 30:0/4 45:1/3 60:3/3 90:3/3 120:3/3 |

Counts are recounted from m4-trials.jsonl: the 20 s and 30 s OpenCode cells are 0/4 (the first draft said 0/3).

Proposals: claude keep 10 000 ms; codex no loss at 0-12 s (margin chosen by the maintainer, not below 3 000 ms because the unknown-to-idle time was not measured); opencode 60 000 ms on this host (outside the 10 000 cap).
