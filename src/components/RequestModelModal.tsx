import { useState } from "react";
import { KIND } from "../types";
import { buildModelRequestTags } from "../nostr/submit";
import { getOrCreateLocalIdentity } from "../nostr/identity";
import { useMineAndPublish } from "../hooks/useMineAndPublish";
import { PowProgressBar } from "./PowProgressBar";

interface Props {
  onClose: () => void;
  onPublished: (msg: string) => void;
}

const TYPES = ["all", "base", "fine-tune", "quant"];

export function RequestModelModal({ onClose, onPublished }: Props) {
  const [name, setName] = useState("");
  const [links, setLinks] = useState("");
  const [type, setType] = useState("all");
  const [vram, setVram] = useState("");
  const { submitting, pct, label, error, submit } = useMineAndPublish();

  async function handleSubmit() {
    if (!name.trim()) return;
    const identity = getOrCreateLocalIdentity();
    const linkList = links.split("\n").map((s) => s.trim()).filter(Boolean);
    const tags = buildModelRequestTags(identity.pubkeyHex, name.trim(), linkList, type, vram.trim() || undefined);

    const result = await submit(KIND.MODEL_REQUEST, tags);
    if (result) {
      onClose();
      onPublished(
        `Thanks for submitting a request. We will check it. (Published to ${result.okCount}/${result.total} relays, PoW: ${result.powBits} bits.)`
      );
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>Request a model</h2>
        <p className="req-intro">
          Want a model added to the listings? Fill out this form to show your interest. We or someone
          else may or may not add it — no guarantees, just signal.
        </p>

        <div className="field">
          <label>
            Model name <span className="req">*</span>
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label>Links</label>
          <textarea
            rows={3}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            placeholder="one URL per line"
          />
          <div className="hint">HuggingFace URLs preferred; any link accepted.</div>
        </div>

        <div className="field">
          <label>Type</label>
          <div className="seg-row">
            <div className="seg">
              {TYPES.map((t) => (
                <button key={t} className={type === t ? "active" : ""} onClick={() => setType(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <label>VRAM (GB)</label>
          <input value={vram} onChange={(e) => setVram(e.target.value)} />
          <div className="hint">How much VRAM you have to run the model.</div>
        </div>

        <PowProgressBar active={submitting} pct={pct} label={label} />
        {!submitting && (
          <div className="pow-notice">
            To combat spam, your computer will mine a small proof-of-work for ~10 seconds before
            publishing. Your CPU will be busy during that time.
          </div>
        )}
        {error && <div className="card-error">{error}</div>}

        <button className="submit-btn btn" disabled={submitting || !name.trim()} onClick={handleSubmit}>
          {submitting ? "Mining PoW…" : "Submit request"}
        </button>
      </div>
    </div>
  );
}
