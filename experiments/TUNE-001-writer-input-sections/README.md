# TUNE-001 · Writer input bytes per section on the live ledger

| Field | Value |
|---|---|
| Status | concluded (measurement) |
| Decision | inconclusive for the input-growth reading; the section shares are confirmed. The caps are not decided here: tasks 2.2 and 2.3 decide them |
| Owner | OpenSpec change `tuning-defaults-measured`, task 2.1 |
| Dates | 2026-10-10. Snapshot taken at the newest recap run (2026-10-10, 20:47 UTC) |
| Parent | `ledger-pruning` design, Evidence and D2 (archived 2026-10-10) |
| Links | this merge request |

## Question and hypothesis

Question: on the two busiest live tabs, how many bytes of the writer's input does each ledger section take, and how many open facts does each section hold per hour over the last 24 hours? Does the data confirm the design's Reading: the size lives in `done`, `next` and `decisions`, and the ledger's growth explains the input rise?

- Confirms the Reading if `done`, `next` and `decisions` together take most of the median input, and the input rise over the measured runs is in the ledger sections.
- Rejects the growth part if the measured runs show no rise in the ledger sections, or if the rise is outside them.

## Method

- **Tabs.** The two tabs with the highest summed `cost_micro_usd` of `run` rows in the 24 hours up to the newest run. The join is `run` to `chapter` to the tab. They are labelled tab-A (the higher cost) and tab-B. Window spend: 9.1193 USD over 1673 runs on 240 tabs; the two labelled tabs are 63.6 % of it.
- **Input.** Each run's `run_input` row holds the writer document, gzip-compressed UTF-8. The script decompresses it and checks that its UTF-8 byte length equals the stored `bytes` column; this held for all 40 runs.
- **Sections.** Every `<fact section="…">…</fact>` and `<hidden section="…"/>` element is measured in bytes, tags included, and summed by its section. `rest` is the document's total minus those elements: the tab header, agents, tasks, notes, transcripts, candidates and whitespace. The writer serializer escapes `>` and `"` in attribute values (`src/recap/application/xml.ts`), so element boundaries are unambiguous.
- **Runs.** The last 20 runs of each tab, by run id (time-ordered), each with its input. Per section: minimum, median and maximum over the 20 runs, and the run order from oldest to newest.
- **Open facts per hour.** From the `fact` table of each tab. A fact is open at time t when `first_at` ≤ t and (`closed_at` is null or `closed_at` > t). Counted at 24 points, t = newest run minus k hours, for k = 23 … 0. The count is by the fact's `section` column.
- **Cost.** Recorded writer spend, `cost_micro_usd` / 1 000 000. Not a billed figure.
- **Access.** The live database was opened read-only (`DatabaseSync`, `readOnly: true`). Nothing was written to it or copied into the repository. The analysis script lives outside the repository and is not committed. Only section names, counts, byte sizes, hours and costs are recorded here.

## Results

### Window and span

| Tab | Window cost (USD) | Window runs | Share of window cost (%) | Span of the 20 measured runs (h) |
|---|---:|---:|---:|---:|
| tab-A | 3.5327 | 285 | 38.7 | 3.37 |
| tab-B | 2.2651 | 243 | 24.8 | 13.58 |

### Writer input bytes per section, last 20 runs of each tab

| Section | tab-A min | tab-A median | tab-A max | tab-A share of median total (%) | tab-B min | tab-B median | tab-B max | tab-B share of median total (%) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| goal | 238 | 239 | 512 | 0.1 | 228 | 228 | 228 | 0.2 |
| now | 1595 | 8540 | 9246 | 4.5 | 0 | 3709 | 8772 | 3.2 |
| next | 32555 | 33721.5 | 35303 | 17.8 | 18429 | 22048 | 27071 | 19.2 |
| done | 76404 | 78211 | 83555 | 41.3 | 29351 | 32858.5 | 35905 | 28.6 |
| needs | 10959 | 11958 | 12427 | 6.3 | 7509 | 8032 | 8101 | 7.0 |
| decisions | 30560 | 31576 | 32902 | 16.7 | 26840 | 28104.5 | 30063 | 24.5 |
| links | 19323 | 19842.5 | 20854 | 10.5 | 15796 | 16568 | 16633 | 14.4 |
| rules | 2608 | 3057 | 3275 | 1.6 | 950 | 950 | 950 | 0.8 |
| rest | 2074 | 3816.5 | 20502 | 2.0 | 1663 | 2481.5 | 3607 | 2.2 |
| total | 183861 | 189399.5 | 203538 | 100.0 | 102350 | 114843.5 | 130534 | 100.0 |
| fact elements | 851 | 869 | 891 |  | 455 | 505 | 564 |  |
| hidden elements | 0 | 0 | 0 |  | 0 | 0 | 0 |  |

Share of median total: the section's median bytes divided by the median total of the same tab, in %. Every run had input; none was missing.

### Growth across the 20 runs (first run to last run)

| Tab | First total | Last total | Change in total | Change in the 8 ledger sections | Change in `rest` |
|---|---:|---:|---:|---:|---:|
| tab-A | 183861 | 202940 | 19079 (10.4 %) | 5909 (3.3 %) | 13170 |
| tab-B | 128282 | 102350 | -25932 (-20.2 %) | -24706 (-19.8 %) | -1226 |

Percentages are rounded to one decimal place.

### Run order, tab-A

| Order (oldest = 1) | Total | done | next | decisions | links | needs | rest | Fact elements | Gap to previous run (h) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 183861 | 76404 | 32555 | 30560 | 19323 | 11521 | 2074 | 851 | - |
| 2 | 184268 | 76404 | 32555 | 30797 | 19323 | 11543 | 2222 | 852 | 0.00 |
| 3 | 185582 | 76404 | 32555 | 30797 | 19323 | 11543 | 3372 | 853 | 0.01 |
| 4 | 185113 | 76404 | 32995 | 31312 | 19323 | 11336 | 2126 | 856 | 0.10 |
| 5 | 187167 | 76404 | 32995 | 31312 | 19323 | 11336 | 3933 | 857 | 0.06 |
| 6 | 189118 | 76657 | 32995 | 31634 | 19323 | 11958 | 4487 | 863 | 0.04 |
| 7 | 188206 | 77385 | 32995 | 31888 | 19323 | 11958 | 2381 | 869 | 0.00 |
| 8 | 189163 | 77385 | 32995 | 31888 | 19323 | 11958 | 3596 | 868 | 0.03 |
| 9 | 191576 | 77885 | 32995 | 31888 | 19494 | 12175 | 5302 | 871 | 0.19 |
| 10 | 192926 | 78811 | 33462 | 31888 | 19805 | 12175 | 4478 | 882 | 0.01 |
| 11 | 193105 | 79434 | 34237 | 31888 | 19946 | 12427 | 2631 | 891 | 0.00 |
| 12 | 189636 | 78353 | 33981 | 31888 | 19946 | 12427 | 3700 | 873 | 0.41 |
| 13 | 190687 | 78090 | 34513 | 30931 | 19946 | 12427 | 5880 | 869 | 0.37 |
| 14 | 190849 | 78332 | 35303 | 31204 | 19946 | 12243 | 4476 | 875 | 0.23 |
| 15 | 188994 | 78793 | 35268 | 31518 | 19946 | 12243 | 2563 | 875 | 0.15 |
| 16 | 188909 | 79019 | 35268 | 31518 | 19946 | 12006 | 2494 | 875 | 0.01 |
| 17 | 190768 | 78469 | 34960 | 31364 | 19880 | 10959 | 8947 | 861 | 0.42 |
| 18 | 203538 | 79743 | 34789 | 31981 | 20016 | 10959 | 20502 | 866 | 0.51 |
| 19 | 192959 | 82520 | 35005 | 32902 | 20401 | 11159 | 5159 | 889 | 0.08 |
| 20 | 202940 | 83555 | 34437 | 32902 | 20854 | 11159 | 15244 | 891 | 0.71 |

### Run order, tab-B

| Order (oldest = 1) | Total | done | next | decisions | links | needs | rest | Fact elements | Gap to previous run (h) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 128282 | 34554 | 26613 | 29807 | 16279 | 8032 | 3594 | 551 | - |
| 2 | 129533 | 35252 | 27071 | 29807 | 16326 | 8032 | 3607 | 556 | 0.01 |
| 3 | 130534 | 35720 | 27050 | 30063 | 16633 | 8032 | 3598 | 561 | 0.52 |
| 4 | 129157 | 35905 | 27050 | 30063 | 16633 | 8032 | 1818 | 563 | 0.02 |
| 5 | 129466 | 35905 | 27050 | 30063 | 16633 | 8032 | 1833 | 564 | 0.00 |
| 6 | 123190 | 35164 | 24917 | 28825 | 16633 | 8032 | 1849 | 539 | 0.50 |
| 7 | 123326 | 35164 | 24917 | 28825 | 16633 | 8032 | 1985 | 539 | 0.00 |
| 8 | 123004 | 35164 | 24917 | 28825 | 16633 | 8032 | 1663 | 539 | 0.00 |
| 9 | 123454 | 35164 | 24917 | 29071 | 16633 | 8032 | 1867 | 540 | 0.00 |
| 10 | 123632 | 35357 | 24946 | 29071 | 16633 | 8032 | 1823 | 541 | 0.03 |
| 11 | 103591 | 29351 | 18890 | 26840 | 15796 | 7509 | 3480 | 455 | 0.99 |
| 12 | 104508 | 29810 | 19150 | 27106 | 16002 | 7509 | 3206 | 460 | 0.04 |
| 13 | 105321 | 30053 | 19150 | 27106 | 16002 | 7695 | 3346 | 463 | 0.07 |
| 14 | 106683 | 30222 | 19150 | 27384 | 16335 | 8035 | 3553 | 469 | 0.12 |
| 15 | 105308 | 30714 | 19179 | 27383 | 16537 | 8101 | 1718 | 471 | 0.50 |
| 16 | 104730 | 30714 | 18429 | 27066 | 16537 | 7695 | 2892 | 464 | 2.33 |
| 17 | 104911 | 30917 | 18429 | 27066 | 16599 | 7695 | 2808 | 464 | 0.97 |
| 18 | 104047 | 31163 | 18429 | 27066 | 16599 | 7695 | 1669 | 465 | 0.51 |
| 19 | 102577 | 29456 | 18429 | 27066 | 16158 | 7695 | 2595 | 455 | 5.15 |
| 20 | 102350 | 29456 | 18429 | 27066 | 16158 | 7695 | 2368 | 455 | 1.82 |

### Open facts per section per hour, tab-A

The rows are the hours before the newest run. The count is the open facts at that point, from the `fact` table.

| Hours before newest run | Total | goal | now | next | done | needs | decisions | links | rules |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 23 | 240 | 1 | 0 | 39 | 136 | 8 | 17 | 35 | 4 |
| 22 | 277 | 1 | 0 | 46 | 147 | 14 | 24 | 39 | 6 |
| 21 | 308 | 1 | 2 | 49 | 161 | 12 | 33 | 44 | 6 |
| 20 | 337 | 1 | 3 | 57 | 174 | 13 | 36 | 47 | 6 |
| 19 | 380 | 1 | 3 | 69 | 194 | 16 | 39 | 51 | 7 |
| 18 | 405 | 1 | 2 | 74 | 203 | 21 | 44 | 53 | 7 |
| 17 | 428 | 1 | 2 | 79 | 216 | 22 | 45 | 56 | 7 |
| 16 | 479 | 1 | 1 | 84 | 244 | 28 | 52 | 62 | 7 |
| 15 | 563 | 1 | 0 | 106 | 270 | 34 | 65 | 76 | 11 |
| 14 | 600 | 1 | 1 | 116 | 287 | 35 | 67 | 81 | 12 |
| 13 | 603 | 1 | 1 | 115 | 289 | 35 | 68 | 82 | 12 |
| 12 | 618 | 1 | 1 | 115 | 299 | 36 | 70 | 84 | 12 |
| 11 | 629 | 1 | 2 | 115 | 304 | 37 | 71 | 87 | 12 |
| 10 | 656 | 1 | 1 | 115 | 318 | 37 | 75 | 97 | 12 |
| 9 | 663 | 1 | 1 | 117 | 320 | 37 | 76 | 99 | 12 |
| 8 | 676 | 1 | 2 | 118 | 325 | 38 | 78 | 102 | 12 |
| 7 | 683 | 1 | 1 | 119 | 329 | 38 | 79 | 104 | 12 |
| 6 | 697 | 1 | 1 | 122 | 336 | 38 | 79 | 108 | 12 |
| 5 | 707 | 1 | 1 | 121 | 340 | 39 | 81 | 112 | 12 |
| 4 | 765 | 1 | 1 | 142 | 351 | 48 | 93 | 117 | 12 |
| 3 | 824 | 1 | 2 | 159 | 373 | 48 | 105 | 121 | 15 |
| 2 | 837 | 1 | 1 | 164 | 377 | 49 | 107 | 123 | 15 |
| 1 | 867 | 1 | 2 | 166 | 395 | 51 | 110 | 127 | 15 |
| 0 | 894 | 1 | 2 | 169 | 409 | 53 | 115 | 130 | 15 |

### Open facts per section per hour, tab-B

| Hours before newest run | Total | goal | now | next | done | needs | decisions | links | rules |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 23 | 42 | 1 | 1 | 10 | 9 | 5 | 6 | 10 | 0 |
| 22 | 49 | 1 | 0 | 11 | 11 | 6 | 7 | 13 | 0 |
| 21 | 59 | 1 | 0 | 12 | 14 | 7 | 8 | 16 | 1 |
| 20 | 60 | 1 | 0 | 11 | 14 | 9 | 8 | 16 | 1 |
| 19 | 122 | 1 | 1 | 30 | 25 | 12 | 23 | 27 | 3 |
| 18 | 225 | 1 | 1 | 48 | 54 | 17 | 47 | 54 | 3 |
| 17 | 323 | 1 | 0 | 69 | 84 | 23 | 68 | 74 | 4 |
| 16 | 346 | 1 | 0 | 74 | 93 | 23 | 73 | 78 | 4 |
| 15 | 410 | 1 | 1 | 85 | 120 | 30 | 81 | 88 | 4 |
| 14 | 448 | 1 | 0 | 90 | 132 | 33 | 91 | 97 | 4 |
| 13 | 452 | 1 | 0 | 89 | 136 | 33 | 92 | 97 | 4 |
| 12 | 464 | 1 | 1 | 88 | 142 | 34 | 93 | 101 | 4 |
| 11 | 464 | 1 | 1 | 88 | 142 | 34 | 93 | 101 | 4 |
| 10 | 464 | 1 | 1 | 88 | 142 | 34 | 93 | 101 | 4 |
| 9 | 455 | 1 | 1 | 88 | 135 | 34 | 93 | 99 | 4 |
| 8 | 455 | 1 | 0 | 88 | 136 | 34 | 93 | 99 | 4 |
| 7 | 455 | 1 | 0 | 88 | 136 | 34 | 93 | 99 | 4 |
| 6 | 455 | 1 | 0 | 88 | 136 | 34 | 93 | 99 | 4 |
| 5 | 455 | 1 | 0 | 88 | 136 | 34 | 93 | 99 | 4 |
| 4 | 455 | 1 | 0 | 88 | 136 | 34 | 93 | 99 | 4 |
| 3 | 455 | 1 | 0 | 88 | 136 | 34 | 93 | 99 | 4 |
| 2 | 455 | 1 | 0 | 88 | 136 | 34 | 93 | 99 | 4 |
| 1 | 455 | 1 | 0 | 88 | 136 | 34 | 93 | 99 | 4 |
| 0 | 455 | 1 | 0 | 88 | 136 | 34 | 93 | 99 | 4 |

## Anomalies and threats to validity

- **Span.** The 20 runs cover 3.4 hours on tab-A and 13.6 hours on tab-B, not 24 hours. The per-run input therefore cannot show a 24-hour trend. The open-fact counts can, and they are the only 24-hour series here.
- **Closed facts inside the input.** The writer's document includes the facts closed in the last two hours (`CLOSED_SHOWN_MS` in `src/recap/application/ledger-input.ts`). The section bytes here include those closed facts; they are not split from the open ones.
- **Hidden facts.** No `<hidden>` element appears in the 40 documents, so the writer was given every open fact in these runs and the view was not pruned.
- **Different figures in the design.** The design's Evidence reports 74 KB and 72 KB of input per run for its two orchestrator tabs, and 25 KB to 68 KB as the mean for 10-10. This measurement reports 183.9 KB to 203.5 KB for tab-A and 102.3 KB to 130.5 KB for tab-B over the last 20 runs, using the stored uncompressed size. The design does not name its byte measure. Its open-fact counts for its two orchestrator tabs (446 and 331) cannot be set against the 894 and 455 here without knowing whether they are the same tabs. I could not reconcile the two from the data available.
- **Snapshot.** One snapshot of a live database. The counts are not reproducible on a later snapshot, and the database is private, so its hash is not recorded.
- **Tokens.** Bytes are not tokens, and no token count was taken.

## Interpretation

**The size lives in `done`, `next` and `decisions`: confirmed for the share.** Together they are 75.8 % of the median input on tab-A and 72.3 % on tab-B. `goal` and `rules` are small (0.1 % and 1.6 % on tab-A; 0.2 % and 0.8 % on tab-B). The Reading does not name `links`, which is 10.5 % and 14.4 % of the median input and larger than `needs` (6.3 % and 7.0 %).

**The ledger's growth explains the input rise: not confirmed, and not rejected at the 24-hour scale.**

- Over the 20 measured runs, tab-A's total input rose by 19079 bytes (10.4 %). Of that, the 8 ledger sections rose by 5909 bytes (3.3 %), and `rest` rose by 13170 bytes. The rise over these runs is mostly outside the ledger.
- Over its 20 runs (13.6 h), tab-B's total input fell by 25932 bytes, and its ledger sections fell by 24706 bytes. There was no rise to explain.
- Open facts grew across the day. tab-A rose from 240 to 894 open facts and went up in 23 of 23 hourly steps. tab-B rose from 42 to 455 and went up in 11 of 23 steps. Over its last 12 hours it stayed between 455 and 464 open facts.
- The open-fact count is the size of the ledger's open facts, so the ledger grew over the day. Whether that growth shows up in input bytes over 24 hours was not measured: the input for the earlier hours is not in the 20 runs. The `run_input` table holds 2067 documents for 2308 runs across all tabs, so a measurement of the full window is possible. It is a follow-up, not a result here.

## Next steps

- Measure input bytes per section across every stored run of tab-A and tab-B in the 24-hour window, not only the last 20 (task 2.2 reuses the same method).
- Split each document's ledger bytes into open facts and facts closed within two hours, so the closed part of the input can be seen.
- Name `links` in the Reading when the design is next revised.

## Reproducibility checklist

- [x] Code commit recorded: `b914aab` (the `main` head the code was read at)
- [ ] Corpus versioned and hashed: the live database is private and is not in the repository
- [ ] Container images pinned: not applicable, no container
- [x] Exact commands recorded: a read-only `node:sqlite` query and a gzip decode, run once, one process at a time; the script stays outside the repository
- [x] Resource limits and host recorded: one local node process, read-only database access
- [ ] Raw outputs kept: not published (they quote tab content); the aggregates above are the record
- [x] Invalid runs kept and explained: none
- [x] Known limitations stated: see the threats above
