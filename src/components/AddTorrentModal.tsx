import { useState } from "react";
import { KIND } from "../types";
import { buildAddTorrentTags, type AddTorrentFields } from "../nostr/submit";
import { getSigningPubkey, isLoggedIn } from "../nostr/identity";
import { useMineAndPublish } from "../hooks/useMineAndPublish";
import { PowProgressBar } from "./PowProgressBar";

interface Props {
  onClose: () => void;
  onPublished: (msg: string) => void;
}

const FILE_CLASSES = ["n/a", "base", "fine-tune", "quant"];
const MODEL_KINDS = ["n/a", "base", "fine-tune"];

export function AddTorrentModal({ onClose, onPublished }: Props) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [hf, setHf] = useState("");
  const [sizeGb, setSizeGb] = useState("");
  const [fileClass, setFileClass] = useState("n/a");
  const [modelKind, setModelKind] = useState("n/a");
  const [lab, setLab] = useState("");
  const [quantType, setQuantType] = useState("");
  const [clientTool, setClientTool] = useState("");
  const [hfMatch, setHfMatch] = useState<AddTorrentFields["hfMatch"]>("yes");
  const { submitting, pct, label, error, submit } = useMineAndPublish();

  async function handleSubmit() {
    if (!url.trim() || !name.trim()) return;
    // Defense in depth — CatalogGrid's toolbar button already refuses to
    // open this modal when logged out, but guard the actual publish too in
    // case this is ever reached another way.
    if (!isLoggedIn()) return;
    if (!hf.trim()) {
      const proceed = window.confirm(
        "No HuggingFace link provided. This is strongly suggested so others can verify the torrent. Continue anyway?"
      );
      if (!proceed) return;
    }

    const pubkeyHex = await getSigningPubkey();
    const fields: AddTorrentFields = {
      url: url.trim(),
      name: name.trim(),
      hf: hf.trim() || undefined,
      sizeGb: sizeGb.trim() || undefined,
      fileClass,
      modelKind,
      lab: lab.trim() || undefined,
      quantType: quantType.trim() || undefined,
      clientTool: clientTool.trim() || undefined,
      hfMatch,
    };
    const tags = buildAddTorrentTags(pubkeyHex, fields);

    const result = await submit(KIND.TORRENT_LISTING, tags);
    if (result) {
      onClose();
      onPublished(
        `Torrent listing published for "${name.trim()}". Note: this comes from your own key, not a ` +
          `curator's, so depending on your filter settings it may not appear in your own grid until you ` +
          `add yourself to the allowlist. Others can still find it via Nostr. ` +
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
          Fill out the form to publish a torrent listing to Nostr so others can find and download the
          model.
        </p>

        <div className="field">
          <label>
            .torrent file URL <span className="req">*</span>
          </label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
          <div className="hint">Direct link to the uploaded .torrent file.</div>
        </div>

        <div className="field">
          <label>
            Model name <span className="req">*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label>
            HuggingFace link <span className="opt">(strongly suggested)</span>
          </label>
          <input value={hf} onChange={(e) => setHf(e.target.value)} />
          <div className="hint">
            Recommended: use the HF cross-reference verification (Settings) rather than trusting this
            link blindly — it's what actually checks the claim.
          </div>
        </div>

        <div className="field">
          <label>Size (GB)</label>
          <input value={sizeGb} onChange={(e) => setSizeGb(e.target.value)} />
        </div>

        <div className="field">
          <label>File class</label>
          <div className="seg-row">
            <div className="seg">
              {FILE_CLASSES.map((c) => (
                <button key={c} className={fileClass === c ? "active" : ""} onClick={() => setFileClass(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <label>Model kind</label>
          <div className="seg-row">
            <div className="seg">
              {MODEL_KINDS.map((k) => (
                <button key={k} className={modelKind === k ? "active" : ""} onClick={() => setModelKind(k)}>
                  {k}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <label>Lab</label>
          <input value={lab} onChange={(e) => setLab(e.target.value)} />
        </div>

        <div className="field">
          <label>Quant format</label>
          <input value={quantType} onChange={(e) => setQuantType(e.target.value)} />
        </div>

        <div className="field">
          <label>Torrent builder tool</label>
          <input value={clientTool} onChange={(e) => setClientTool(e.target.value)} />
        </div>

        <div className="field">
          <label>Does the torrent exactly match the HF source?</label>
          <div className="seg-row">
            <div className="seg">
              {(["yes", "no", "unsure"] as const).map((v) => (
                <button key={v} className={hfMatch === v ? "active" : ""} onClick={() => setHfMatch(v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <PowProgressBar active={submitting} pct={pct} label={label} />
        {!submitting && (
          <div className="pow-notice">
            Before publishing, your computer will mine a proof-of-work for ~10 seconds to combat spam.
            Your CPU will be busy during that time — keep this tab open.
          </div>
        )}
        {error && <div className="card-error">{error}</div>}

        <button className="submit-btn btn" disabled={submitting || !url.trim() || !name.trim()} onClick={handleSubmit}>
          {submitting ? "Mining PoW…" : "Publish torrent listing"}
        </button>
      </div>
    </div>
  );
}
