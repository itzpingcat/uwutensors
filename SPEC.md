# uwutensors-v1

A Nostr event schema for publishing torrent-based model and dataset listings —
the successor to the pre-v1 ("llama.garden") schema this app inherited from
`waifu-magnet-22.html`. Listings live on kind `30099` (a NIP-33 addressable
event) and are discovered by any client subscribing to that kind with no
author filter; trust/spam filtering happens client-side against each
listing's publisher, not at the relay level.

This document describes the wire format only — see `src/nostr/parse.ts` and
`src/nostr/submit.ts` for the reference implementation, and `src/types/index.ts`
for the runtime `TorrentListing` shape every listing (v1 or legacy) is
normalized into once parsed.

## Why a new spec

The pre-v1 schema conflated "a torrent listing" with "a model listing" — every
`30099` event was implicitly assumed to be a model, with no field actually
saying so. It also had no reliable way to distinguish a real BitTorrent v1
infohash from a client's `d` tag; the reference implementation's own Add
Torrent form used to synthesize a fake `d` value that never round-tripped
through its own parser correctly. uwutensors-v1 fixes both: every field
required for a listing to actually function (real infohash, real magnet,
verifiable piece layout, a torrent hash to check downloads against) is
mandatory, and a listing must declare what kind of content it is.

## Identifying a v1 event

A kind `30099` event is uwutensors-v1 if and only if it carries:

```
["schema", "uwutensors-v1"]
```

Any event without this exact tag/value is evaluated under the legacy
conversion path instead (see **Legacy backcompat** below), never assumed to
be v1 with missing fields defaulted.

## Required tags

| Tag | Meaning |
|---|---|
| `d` | Infohash — the torrent's real BitTorrent v1 infohash (BEP 3: SHA-1 of the raw bencoded `info` dict), lowercase 40-char hex. Doubles as the NIP-33 addressable-event identifier. |
| `magnet` | Full magnet URI (`magnet:?xt=urn:btih:<infohash>&dn=<name>&tr=<tracker>...`). |
| `name` | Model or dataset name. |
| `size` | Total content size in bytes, as a string. |
| `x` | sha256 of the `.torrent` file itself (not the content it describes) — hex string. Used to hash-verify a `.torrent` fetched from any of the listing's `url` mirrors before trusting anything derived from it (see `src/lib/torrentDownload.ts`). |
| `type` | `model` \| `dataset`. Anything else is treated as unrecognized content and not rendered as a listing at all — see **Content type** below. |
| `pieces` | Piece layout, compact form: `"<count>*<length_bytes>"`, e.g. `"1056*16384"` (1056 pieces of 16384 bytes each). |

A v1 event missing any of the above is rejected by the parser outright — it
is not a partially-valid listing, it's not a listing.

## Optional tags

| Tag | Meaning |
|---|---|
| `lab` | Publisher/org — e.g. the part before the slash in a HuggingFace repo id. |
| `card` | Blossom URL to a README/model-card blob. This is the Nostr-native model card — it does not depend on HuggingFace or any other source existing. Prefer this over inlining card content into `content` (event size limits on many relays make a full README risky to carry as event content or a tag value). |
| `tags` | Repeatable. Freeform classification tags, HF-style (e.g. `"text-generation"`, `"en"`). |
| `model_type` | `base` \| `finetune` \| `merge` \| `n/a`. Describes the *underlying model's* lineage, not the listing's own packaging — see **Inferring model_type** below for why this can't be read off a repo's own tags directly. A LoRA/adapter is classified as `finetune` (same relationship to a single base model, just a low-rank delta rather than full weights); a merge gets its own value since it combines multiple lineages and doesn't reduce to base-or-finetune. |
| `quant_type` | `gguf` \| `mlx` \| `awq` \| `gptq` \| `fp8` \| `nvfp4` \| `mxfp4` \| `bnb` \| `onnx` \| `bf16` \| `fp16` \| `f16`. Only meaningful for `type: model` — a `dataset` listing should never carry this tag, and clients should not render a quant-format selector for datasets at all. |
| `url` | Repeatable. Blossom (or other) mirror URLs to fetch the `.torrent` file from. |
| `webseed` | Repeatable. HTTP(S) webseed URLs (BEP 19). |
| `tracker` | Repeatable. `wss://` WebSocket tracker URLs — the one tracker flavor a browser can speak to directly (see `src/lib/wsTracker.ts`); classic UDP/HTTP trackers are unreachable from browser JS. |
| `source` | Link to the original model/dataset (HuggingFace, ModelScope, etc), as a bare `host/path` string (e.g. `huggingface.co/org/repo`), not a full URL with scheme. |
| `source_commit` | Source revision/commit hash. |
| `source_commit_name` | That commit's human-readable message (e.g. `"feat: add x, y, and z"`) — analogous to a git commit message, distinct from the hash itself. |
| `nonce` | NIP-13 proof-of-work, standard form: `["nonce", "<value>", "<target-bits>"]`. Optional — an event with no PoW is still a valid listing. When present, the second element states the *claimed* difficulty a publisher mined for, letting clients filter/sort by it without recomputing leading-zero-bits themselves (clients that do want to verify can still recompute from the event id — PoW is self-certifying via the id, this tag is a convenience declaration of intent, not the proof itself). |

`content` (the event's own free-text body, not a tag) is left for optional
human-readable notes and is never required to hold structured data — the
model card lives in `card` instead, specifically so a large README doesn't
risk tripping relay size limits on the listing event itself.

## Content type (`type`)

This is the field the pre-v1 schema lacked entirely. A client MUST reject
(not render as a model) any `30099` whose `type` is missing or not one of the
recognized values. As of this spec, the recognized values are:

- `model`
- `dataset`

An unrecognized `type` value (from a future extension of this spec, or from
a client publishing something else entirely under kind `30099`) should be
treated as unknown content and hidden, not assumed to be a model. This is a
deliberate allowlist, not a denylist, so that a spec extension adding new
content types doesn't silently make old clients misrender them.

## Piece layout format

`pieces` is a single compact string: `"<count>*<length_bytes>"`. Both
numbers come directly from the `.torrent` file's own `info` dict
(`pieces` byte-string length ÷ 20, and `piece length`, respectively) — never
hand-typed. See `src/lib/torrentMeta.ts::deriveTorrentMeta` for the reference
derivation from a fetched `.torrent`'s bencoded bytes.

## Inferring `model_type`

A repo's own tags only ever describe *that specific repo's packaging*, not
the lineage of the model underneath it. A GGUF quant repo's tags say
"quantized" — they say nothing about whether the model it quantized was
originally a base model or a finetune. HuggingFace encodes the actual
relationship as a second, more specific tag alongside the plain
`base_model:<repo>` tag: `base_model:<relation>:<repo>`, where `<relation>`
is one of `quantized`, `finetune`, `adapter`, or `merge` (this is the same
structured signal behind HF's `?base_model_relation=` search facet and its
"Model tree" UI panel). To classify `model_type` correctly, a publisher tool
should walk this relation chain upward:

1. If the repo has no `base_model` relation at all → `base`.
2. If it has a plain `base_model` tag with no relation qualifier → `finetune`
   (derived from something, relation just wasn't machine-tagged).
3. If the relation is `finetune` or `adapter` → `finetune` (an adapter/LoRA
   is functionally a finetune: same single-base-model relationship, just a
   low-rank delta instead of full weights).
4. If the relation is `merge` → `merge` (combines multiple lineages; does
   not reduce to base-or-finetune).
5. If the relation is `quantized` → follow the linked `base_model` repo and
   repeat from step 1, up to a bounded depth (the reference client caps this
   at 6 hops). Stop and report `n/a` if a link can't be resolved.

See `src/lib/sourceLookup.ts::traceModelLineage` for the reference
implementation. This lineage tracing is a convenience for autofilling a
publish form — a client is never required to do this walk, and `model_type`
is optional in every case.

## Legacy backcompat

An event without a `schema: uwutensors-v1` tag is evaluated under the legacy
(pre-v1, "llama.garden") schema instead — but only accepted, and upgraded to
the v1 runtime shape, if it carries **sufficient data to actually function**
as a usable listing. "Sufficient" means, on top of the legacy schema's
original required fields (`d`, `magnet`, `name`, `size`):

- `x` (torrent sha256) must be present, so downloaded `.torrent` files can
  still be hash-verified, and
- either a legacy `pieces` + `piece_length` tag pair, **or** at least one
  `url` mirror a client could fetch the `.torrent` from and derive pieces
  itself.

A legacy event missing both of those is rejected outright — not shown as an
unverifiable, incomplete listing. This is a deliberate floor, not just a
minimum-viable-parse: an event that can't be hash-verified and has no
resolvable piece layout isn't meaningfully different from not existing, so
laundering it into a trusted-looking v1 object would be worse than dropping
it.

A legacy event that clears this bar is converted into the same
`TorrentListing` runtime shape v1 events produce, with:

- `type` defaulted to `"model"` (the only thing the legacy schema ever
  described),
- `pieces` reconstructed from the legacy `pieces`/`piece_length` tags into
  the compact `"N*BYTES"` form,
- `model_type` mapped from the legacy `model_kind` tag (`base`/`fine-tune`,
  note the hyphen) into v1's vocabulary (`base`/`finetune`, no hyphen) —
  the two are intentionally kept as separate types in the reference
  implementation (`ModelKind` vs `ModelType`) so the legacy vocabulary is
  never silently extended with values (like `merge`) it never had,
- `source`/`source_commit` mapped from the legacy `source`/`commit_sha`
  tags,
- `card` left unset (the legacy schema has no equivalent — legacy listings
  fall back to fetching a HuggingFace README directly, keyed off the
  legacy-only `repo_id` field, which v1 does not use at all).

Everything downstream of parsing — the catalog grid, the model/dataset page,
filters — only ever sees the normalized v1 shape and never branches on
which schema a listing originally came from.

## Fields the reference client also tracks that are NOT part of this spec

`repo_id`, `base_model` (as a flat field, distinct from the `model_type`
inference above), `subfolder`, `torrent_name`, `created_at` (HF's own
createdAt), `version` (HF revision label), `display_name`, `file_class`,
`quant_dev`, `quant_detail`, `quant_bpw`, and `model_name` are all
legacy-schema-only fields, kept in the runtime `TorrentListing` type purely
so converted legacy listings don't lose information the old schema carried.
A uwutensors-v1 publisher should not emit tags with these names — use the
v1 fields above instead (`source` + `source_commit` in place of `repo_id` +
`commit_sha`+`version`, `card` in place of fetching a README via `repo_id`,
etc).
