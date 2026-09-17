import { useState } from "react";
import { KIND } from "../types";
import { buildAddTorrentTags, type AddTorrentFields } from "../nostr/submit";
import { deriveTorrentMeta, type DerivedTorrentMeta } from "../lib/torrentMeta";
import { lookupSourceMetadata, parseSourceUrl } from "../lib/sourceLookup";
import { isLoggedIn } from "../nostr/identity";
import { useMineAndPublish } from "../hooks/useMineAndPublish";
import { PowProgressBar } from "./PowProgressBar";

interface Props {
  onClose: () => void;
  onPublished: (msg: string) => void;
}

const MODEL_TYPES = ["n/a", "base", "finetune", "merge"] as const;
const LISTING_TYPES = ["model", "dataset"] as const;

/**
 * Publishing a uwutensors-v1 listing requires real infohash/magnet/pieces
 * derived from the actual .torrent file — see torrentMeta.ts — not
 * hand-typed metadata the old version of this modal collected. So the
 * flow here is: paste the .torrent URL, fetch + decode it client-side to
 * derive that data (and hash-verify what you're about to publish before
 * publishing it), THEN fill in the rest (name/type/lab/etc, prefilled
 * from the torrent's own info.name where possible) and publish.
 */
export function AddTorrentModal({ onClose, onPublished }: Props) {
  const [url, setUrl] = useState("");
  const [fetchStatus, setFetchStatus] = useState<"idle" | "fetching" | "ready" | "error">("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [meta, setMeta] = useState<DerivedTorrentMeta | null>(null);

  const [name, setName] = useState("");
  const [listingType, setListingType] = useState<AddTorrentFields["type"]>("model");
  const [hf, setHf] = useState("");
  const [lab, setLab] = useState("");
  const [modelType, setModelType] = useState<"n/a" | "base" | "finetune" | "merge">("n/a");
  const [quantType, setQuantType] = useState("");
  const [cardUrl, setCardUrl] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [sourceLookupStatus, setSourceLookupStatus] = useState<"idle" | "looking-up" | "done" | "error">("idle");
  const [sourceLookupError, setSourceLookupError] = useState<string | null>(null);
  const [sourceCommit, setSourceCommit] = useState<string | undefined>(undefined);
  const { submitting, pct, label, error, submit } = useMineAndPublish();

  // Autofill from a pasted HF/ModelScope source URL — only ever fills
  // fields the user hasn't already typed something into. Re-running the
  // lookup (e.g. after fixing a typo'd URL) never clobbers anything you
  // already edited, including a value it filled in on a previous lookup
  // that you've since changed.
  async function handleAutofillFromSource() {
    if (!hf.trim() || !parseSourceUrl(hf.trim())) return;
    setSourceLookupStatus("looking-up");
    setSourceLookupError(null);
    try {
      const info = await lookupSourceMetadata(hf.trim(), listingType === "dataset");
      if (!name.trim() && info.name) setName(info.name);
      if (!lab.trim() && info.lab) setLab(info.lab);
      if (info.type) setListingType(info.type);
      if (modelType === "n/a" && info.modelType && info.modelType !== "n/a") setModelType(info.modelType);
      if (!tagsInput.trim() && info.tags && info.tags.length > 0) setTagsInput(info.tags.join(", "));
      if (!cardUrl.trim() && info.cardUrl) setCardUrl(info.cardUrl);
      if (info.sourceCommit) setSourceCommit(info.sourceCommit);
      setSourceLookupStatus("done");
    } catch (err) {
      setSourceLookupError(err instanceof Error ? err.message : "Couldn't fetch metadata for this source.");
      setSourceLookupStatus("error");
    }
  }

  async function handleFetchTorrent() {
    if (!url.trim()) return;
    setFetchStatus("fetching");
    setFetchError(null);
    setMeta(null);
    try {
      const resp = await fetch(url.trim());
      if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching .torrent`);
      const bytes = await resp.arrayBuffer();
      const derived = await deriveTorrentMeta(bytes);
      setMeta(derived);
      if (!name.trim()) setName(derived.name);
      setFetchStatus("ready");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to read .torrent file.");
      setFetchStatus("error");
    }
  }

  async function handleSubmit() {
    if (!meta || !name.trim()) return;
    // Defense in depth — CatalogGrid's toolbar button already refuses to
    // open this modal when logged out, but guard the actual publish too in
    // case this is ever reached another way.
    if (!isLoggedIn()) return;
    if (!hf.trim()) {
      const proceed = window.confirm(
        "No HuggingFace (or other source) link provided. This is strongly suggested so others can " +
          "verify the torrent. Continue anyway?"
      );
      if (!proceed) return;
    }

    const fields: AddTorrentFields = {
      infohash: meta.infohash,
      magnet: meta.magnet,
      name: name.trim(),
      totalSize: meta.totalSize,
      torrentSha256: meta.torrentSha256,
      type: listingType,
      pieces: meta.pieces,
      lab: lab.trim() || undefined,
      card: cardUrl.trim() || undefined,
      tags: tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      modelType: modelType === "n/a" ? undefined : modelType,
      quantType: listingType === "model" ? quantType.trim() || undefined : undefined,
      urls: [url.trim()],
      trackers: meta.trackers,
      webseeds: meta.webseeds,
      source: hf.trim() || undefined,
      sourceCommit,
    };
    const tags = buildAddTorrentTags(fields);

    const result = await submit(KIND.TORRENT_LISTING, tags);
    if (result) {
      onClose();
      onPublished(
        `Listing published for "${name.trim()}" (uwutensors-v1). Note: this comes from your own key, ` +
          `not a curator's, so depending on your filter settings it may not appear in your own grid until ` +
          `you add yourself to the allowlist. Others can still find it via Nostr. ` +
          `(${result.okCount}/${result.total} relays, PoW: ${result.powBits} bits.)`
      );
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>Publish a torrent listing</h2>
        <p className="req-intro">
          Paste a link to your .torrent file — the infohash, magnet link, and piece layout are all read
          directly from the file itself, not typed in by hand, so what you publish always matches what
          the torrent actually contains.
        </p>

        <div className="field">
          <label>
            .torrent file URL <span className="req">*</span>
          </label>
          <div className="seg-row" style={{ gap: 8 }}>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            <button className="btn-small" type="button" onClick={handleFetchTorrent} disabled={fetchStatus === "fetching" || !url.trim()}>
              {fetchStatus === "fetching" ? "Reading…" : "Read .torrent"}
            </button>
          </div>
          <div className="hint">Direct link to the .torrent file (e.g. hosted on Blossom).</div>
          {fetchStatus === "error" && <div className="card-error">{fetchError}</div>}
          {fetchStatus === "ready" && meta && (
            <div className="hint">
              ✓ Infohash <code>{meta.infohash}</code> · {meta.pieces.count} pieces · sha256 verified
            </div>
          )}
        </div>

        {meta && (
          <>
            <div className="field">
              <label>
                Name <span className="req">*</span>
              </label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="field">
              <label>Type</label>
              <div className="seg-row">
                <div className="seg">
                  {LISTING_TYPES.map((t) => (
                    <button key={t} className={listingType === t ? "active" : ""} onClick={() => setListingType(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="field">
              <label>
                Source link <span className="opt">(HuggingFace, ModelScope, etc — strongly suggested)</span>
              </label>
              <input
                value={hf}
                onChange={(e) => {
                  setHf(e.target.value);
                  setSourceLookupStatus("idle");
                }}
                onBlur={handleAutofillFromSource}
                placeholder="https://huggingface.co/org/repo"
              />
              <div className="hint">
                Strongly Recommended: If this is a copy of an existing model on a HuggingFace or
                ModelScope Repo, paste it here. Other fields will autofill.
              </div>
              {sourceLookupStatus === "looking-up" && <div className="hint">Looking up source metadata…</div>}
              {sourceLookupStatus === "done" && <div className="hint">✓ Autofilled from source metadata.</div>}
              {sourceLookupStatus === "error" && <div className="card-error">{sourceLookupError}</div>}
            </div>

            <div className="field">
              <label>Lab / publisher</label>
              <input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="e.g. the org before the slash on HF" />
            </div>

            {listingType === "model" && (
              <div className="field">
                <label>Model type</label>
                <div className="seg-row">
                  <div className="seg">
                    {MODEL_TYPES.map((k) => (
                      <button key={k} className={modelType === k ? "active" : ""} onClick={() => setModelType(k)}>
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {listingType === "model" && (
              <div className="field">
                <label>Quant / precision format</label>
                <input value={quantType} onChange={(e) => setQuantType(e.target.value)} placeholder="gguf, bf16, awq, …" />
              </div>
            )}

            <div className="field">
              <label>
                Model card <span className="opt">(Blossom URL to a README.md)</span>
              </label>
              <input value={cardUrl} onChange={(e) => setCardUrl(e.target.value)} placeholder="https://…" />
            </div>

            <div className="field">
              <label>Tags</label>
              <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="comma, separated" />
            </div>

            <PowProgressBar active={submitting} pct={pct} label={label} />
            {!submitting && (
              <div className="pow-notice">
                Before publishing, your computer will mine a proof-of-work for ~10 seconds to combat spam.
                Your CPU will be busy during that time — keep this tab open.
              </div>
            )}
            {error && <div className="card-error">{error}</div>}

            <button className="submit-btn btn" disabled={submitting || !name.trim()} onClick={handleSubmit}>
              {submitting ? "Mining PoW…" : "Publish torrent listing"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
