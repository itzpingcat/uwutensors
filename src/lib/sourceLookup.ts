/**
 * Looks up model/dataset metadata from a pasted HuggingFace or ModelScope
 * URL, to autofill AddTorrentModal's blank fields. Deliberately returns a
 * plain data bag rather than writing into form state itself — the modal
 * decides field-by-field whether to apply a value (only into fields the
 * user hasn't already typed something into), so this module doesn't need
 * to know anything about React state.
 *
 * This is unrelated to hfVerification.ts's tier-0 hash verification (which
 * checks downloaded BYTES against HF's reported hashes and is never
 * skippable/optional) — this is pure convenience autofill of descriptive
 * metadata, and its result is never treated as verified.
 */

export type SourceKind = "huggingface" | "modelscope";

export interface ParsedSourceUrl {
  kind: SourceKind;
  repoId: string; // "org/name"
}

export interface SourceLookupResult {
  lab?: string; // org/publisher, i.e. the part before the slash
  name?: string; // repo/model name, i.e. the part after the slash
  type?: "model" | "dataset";
  tags?: string[];
  baseModel?: string; // if the source declares one (HF card_data.base_model)
  /**
   * "base" | "finetune" | "n/a" — inferred, not asserted by the source.
   * A repo's own tags only ever tell you what THAT repo is (e.g. a GGUF
   * quant repo's tags say "quantized", not whether the model underneath
   * started life as a base model or a finetune) — so when the repo looks
   * like a quant, we walk base_model links upward (see traceModelLineage)
   * to find the underlying, non-quantized ancestor and classify THAT.
   * "n/a" means we couldn't determine it (no base_model chain to follow,
   * or the chain didn't resolve within MAX_LINEAGE_DEPTH hops).
   */
  modelType?: "base" | "finetune" | "merge" | "n/a";
  sourceCommit?: string; // latest revision's commit sha
  sourceCommitName?: string; // that commit's message, if available
  cardUrl?: string; // direct README.md URL — not a Blossom mirror, but usable as-is
}

/** Parses a HF or ModelScope URL into {kind, repoId}, or null if unrecognized. */
export function parseSourceUrl(raw: string): ParsedSourceUrl | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "huggingface.co") {
    // Supports /org/name, /org/name/tree/..., /datasets/org/name, etc.
    const isDataset = parts[0] === "datasets";
    const rest = isDataset ? parts.slice(1) : parts;
    if (rest.length < 2) return null;
    return { kind: "huggingface", repoId: `${rest[0]}/${rest[1]}` };
  }

  if (host === "modelscope.cn") {
    // /models/org/name/... or /datasets/org/name/...
    const isDataset = parts[0] === "datasets";
    const rest = isDataset ? parts.slice(1) : parts[0] === "models" ? parts.slice(1) : parts;
    if (rest.length < 2) return null;
    return { kind: "modelscope", repoId: `${rest[0]}/${rest[1]}` };
  }

  return null;
}

/**
 * HF encodes a repo's exact relationship to its declared base_model as a
 * SECOND tag of the literal form `base_model:<relation>:<repo_id>` —
 * sitting alongside the plain `base_model:<repo_id>` tag — where
 * <relation> is one of "quantized", "finetune", "adapter", "merge", etc.
 * (this is also what backs HF's own `?base_model_relation=` search facet
 * and the "Model tree" UI). This is a real, documented, structured
 * signal, not a heuristic — e.g. bartowski/Llama-3.2-3B-Instruct-GGUF
 * carries both:
 *   "base_model:meta-llama/Llama-3.2-3B-Instruct"
 *   "base_model:quantized:meta-llama/Llama-3.2-3B-Instruct"
 * We read the relation straight off this tag instead of pattern-matching
 * repo names/tags for quant-format keywords, which only ever tells you
 * what a repo IS, never its relationship to whatever it's derived from.
 */
type BaseModelRelation = "quantized" | "finetune" | "adapter" | "merge" | "other";

const BASE_MODEL_RELATION_TAG = /^base_model:(quantized|finetune|adapter|merge):(.+)$/;

function findBaseModelRelation(tags: string[]): { relation: BaseModelRelation; repoId: string } | undefined {
  for (const tag of tags) {
    const m = BASE_MODEL_RELATION_TAG.exec(tag);
    if (m) return { relation: m[1] as BaseModelRelation, repoId: m[2] };
  }
  return undefined;
}

interface LineageNode {
  repoId: string;
  tags: string[];
  baseModel?: string;
}

async function fetchHfLineageNode(repoId: string): Promise<LineageNode | null> {
  try {
    const resp = await fetch(`https://huggingface.co/api/models/${repoId}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    const tags: string[] = Array.isArray(data.tags) ? data.tags : [];
    const cardData = data.cardData ?? data.card_data ?? {};
    const baseModelRaw = cardData.base_model;
    const baseModel = Array.isArray(baseModelRaw) ? baseModelRaw[0] : baseModelRaw;
    return { repoId, tags, baseModel: typeof baseModel === "string" ? baseModel : undefined };
  } catch {
    return null;
  }
}

const MAX_LINEAGE_DEPTH = 6;

/**
 * Walks base_model:<relation>:<repo> links upward from a repo to find the
 * nearest ancestor that ISN'T itself a quant/adapter/merge — i.e. the
 * actual model lineage rather than a repackaging of it — then classifies
 * THAT ancestor as "base" (no base_model relation tag at all) or
 * "finetune" (its relation tag says "finetune", or it declares a
 * base_model with no relation tag we recognize, which in practice on HF
 * still means "derived from something," most commonly a finetune).
 * Stops and returns "n/a" if a link is missing/unresolvable or after
 * MAX_LINEAGE_DEPTH hops, rather than guessing beyond what the chain
 * actually shows.
 */
async function traceModelLineage(
  startTags: string[],
  fetchNode: (repoId: string) => Promise<LineageNode | null>
): Promise<"base" | "finetune" | "merge" | "n/a"> {
  let tags = startTags;

  for (let depth = 0; depth < MAX_LINEAGE_DEPTH; depth++) {
    const rel = findBaseModelRelation(tags);
    if (!rel) {
      // No base_model:<relation>:... tag at all — check the plain
      // base_model tag as a fallback signal before calling this a root.
      const hasPlainBaseModel = tags.some((t) => /^base_model:(?!quantized:|finetune:|adapter:|merge:)/.test(t));
      return hasPlainBaseModel ? "finetune" : "base";
    }
    // An adapter (LoRA) is functionally a finetune — same relationship to
    // a single base model, just applied as a low-rank delta rather than
    // full weights — so it's classified the same way. A merge combines
    // multiple lineages and genuinely doesn't reduce to base-or-finetune,
    // so it gets its own type instead of being forced into either.
    if (rel.relation === "finetune" || rel.relation === "adapter") return "finetune";
    if (rel.relation === "merge") return "merge";
    // "quantized" (or an unrecognized future relation) — keep walking up.
    const node = await fetchNode(rel.repoId);
    if (!node) return "n/a"; // couldn't resolve the next link — stop rather than guess
    tags = node.tags;
  }
  return "n/a"; // chain too deep to be worth following further
}

async function lookupHuggingFace(repoId: string, isDataset: boolean): Promise<SourceLookupResult> {
  const apiBase = isDataset ? "https://huggingface.co/api/datasets" : "https://huggingface.co/api/models";
  const resp = await fetch(`${apiBase}/${repoId}`);
  if (!resp.ok) throw new Error(`HuggingFace API returned ${resp.status}`);
  const data = await resp.json();

  const [lab, name] = repoId.split("/");
  const tags: string[] = Array.isArray(data.tags) ? data.tags : [];
  const cardData = data.cardData ?? data.card_data ?? {};
  const baseModelRaw = cardData.base_model;
  const baseModel = Array.isArray(baseModelRaw) ? baseModelRaw[0] : baseModelRaw;
  const sha = typeof data.sha === "string" ? data.sha : undefined;

  const modelType = isDataset ? undefined : await traceModelLineage(tags, fetchHfLineageNode);

  return {
    lab,
    name,
    type: isDataset ? "dataset" : "model",
    tags,
    baseModel: typeof baseModel === "string" ? baseModel : undefined,
    modelType,
    sourceCommit: sha,
    cardUrl: `https://huggingface.co/${isDataset ? "datasets/" : ""}${repoId}/raw/${sha ?? "main"}/README.md`,
  };
}

async function lookupModelScope(repoId: string, isDataset: boolean): Promise<SourceLookupResult> {
  // ModelScope's public REST API — same shape for models and datasets,
  // just a different path segment.
  const kindSegment = isDataset ? "datasets" : "models";
  const resp = await fetch(`https://modelscope.cn/api/v1/${kindSegment}/${repoId}`);
  if (!resp.ok) throw new Error(`ModelScope API returned ${resp.status}`);
  const data = await resp.json();
  const info = data.Data ?? data.data ?? data;

  const [lab, name] = repoId.split("/");
  const tagsRaw = info.Tags ?? info.tags;
  const tags: string[] = Array.isArray(tagsRaw)
    ? tagsRaw.map((t: unknown) => (typeof t === "string" ? t : String(t)))
    : [];
  const revision = info.Revision ?? info.revision;

  // ModelScope doesn't expose HF's structured base_model:<relation>:...
  // tag convention, so there's no reliable signal to classify from here.
  const modelType: SourceLookupResult["modelType"] = isDataset ? undefined : "n/a";

  return {
    lab,
    name,
    type: isDataset ? "dataset" : "model",
    tags,
    modelType,
    sourceCommit: typeof revision === "string" ? revision : undefined,
    cardUrl: `https://modelscope.cn/${kindSegment}/${repoId}/resolve/${revision ?? "master"}/README.md`,
  };
}

/**
 * Fetches autofill metadata for a pasted source URL. `isDataset` should
 * reflect the modal's currently-selected listing type where the URL
 * itself doesn't already disambiguate (HF/ModelScope dataset URLs are
 * unambiguous; a bare model-looking URL falls back to this hint).
 */
export async function lookupSourceMetadata(
  raw: string,
  isDatasetHint: boolean
): Promise<SourceLookupResult> {
  const parsed = parseSourceUrl(raw);
  if (!parsed) throw new Error("Not a recognized HuggingFace or ModelScope URL.");

  // A /datasets/ path segment is authoritative when present; otherwise
  // fall back to the caller's hint (the form's current Type selection).
  const url = new URL(raw.trim());
  const explicitDataset = url.pathname.split("/").filter(Boolean)[0] === "datasets";
  const isDataset = explicitDataset || isDatasetHint;

  return parsed.kind === "huggingface"
    ? lookupHuggingFace(parsed.repoId, isDataset)
    : lookupModelScope(parsed.repoId, isDataset);
}
