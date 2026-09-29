# Muse Spark 1.3 Free: near-capacity text test

On 2026-09-29 the installed Codex Router → native bridge → official OpenCode
route accepted **1,039,790 input tokens** and returned all five random markers
correctly. Including 1,810 output/reasoning tokens, actual use was 1,041,600
tokens, **99.33% of the advertised 1,048,576-token window**. The request allowed
8,192 output tokens, leaving only 594 tokens beyond input plus that reservation.
It completed in 94.387 seconds within the installed 180-second deadline.

| Route / stage | Actual input tokens, including cache | Output and reasoning | Time | Marker retrieval |
|---|---:|---:|---:|---:|
| Isolated calibration | 32,214 | 426 | 6.250 s | 5/5 |
| Isolated half capacity | 501,525 | 422 | 23.255 s | 5/5 |
| Isolated approximately 1M | 998,381 | 1,395 | 82.143 s | 5/5 |
| Installed route, near full | 1,039,790 | 1,810 | 94.387 s | 5/5 |

The synthetic text contained random nine-digit numbers and independent random
markers at the start, 25%, middle, 75%, and end. No private documents were sent.
No client compaction was applied. These are single-request capacity and retrieval
checks, not evidence of sustained throughput, concurrent stability, or strong
long-document reasoning. The desktop's existing 891,289-token automatic
compaction threshold was preserved. Near-capacity images were not tested.

A follow-up request estimated above 1.07M input tokens hit provider HTTP 429.
It was not retried. This does not establish the exact overflow boundary or prove
that oversized input is rejected rather than truncated.

## Accounting correction found during the test

OpenCode reports uncached input separately from cache reads/writes. The bridge
previously exposed only uncached input as Responses `input_tokens`. One near-1M
request reported 124 uncached tokens plus 998,257 cached tokens; treating 124 as
the whole prompt broke adaptive test sizing. That malformed follow-up contained
no data and is explicitly excluded. A separate preliminary 768-token output
budget also produced an incomplete answer and was raised to 8,192.

Responses now includes uncached input plus cache reads/writes in `input_tokens`
and exposes cache reads in `input_tokens_details.cached_tokens`. A regression
test covers the observed near-1M counters. All 94 tests, syntax checks and the
installed-package check passed. The final near-full request was sent through the
installed route after this correction and used fresh synthetic data.

See the [sanitized receipt](receipts/muse-capacity.json) for hashes, timings and
scope. This result supports near-1M text input on the tested route; it does not
remove provider-controlled free-tier limits.
