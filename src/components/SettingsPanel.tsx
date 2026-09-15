import { useState } from "react";
import { useSettingsStore } from "../store/settingsStore";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, update, updateFilters, addAllowlistPubkey, removeAllowlistPubkey, addRelay, removeRelay, resetToDefaults } =
    useSettingsStore();
  const [newPubkey, setNewPubkey] = useState("");
  const [newRelay, setNewRelay] = useState("");

  const f = settings.filters;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>Settings</h2>

        <section>
          <h3>Filtering</h3>
          <p className="hint">
            Each tier below answers a different question. Only HF verification checks whether a
            torrent's contents actually match what it claims — the rest are provenance signals,
            not proof.
          </p>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={f.hfVerification.enabled}
              onChange={(e) => updateFilters({ hfVerification: { ...f.hfVerification, enabled: e.target.checked } })}
            />
            <div>
              <div className="setting-title">HuggingFace cross-reference (tier 0)</div>
              <div className="hint">
                After download, compares each file's hash against HF's own API for the claimed
                repo/commit. The only tier that verifies content, not authorship.
              </div>
            </div>
          </label>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={f.requireNip05}
              onChange={(e) => updateFilters({ requireNip05: e.target.checked })}
            />
            <div>
              <div className="setting-title">Require NIP-05 verified publishers</div>
              <div className="hint">Only show listings from users with a verified username@domain.</div>
            </div>
          </label>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={f.webOfTrust.enabled}
              onChange={(e) =>
                updateFilters({ webOfTrust: { ...f.webOfTrust, enabled: e.target.checked } })
              }
            />
            <div>
              <div className="setting-title">Web of Trust</div>
              <div className="hint">
                Weight listings by your follow graph. Requires a signed-in Nostr identity — silently
                skipped otherwise.
              </div>
            </div>
          </label>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={f.antiSpam.enabled}
              onChange={(e) => updateFilters({ antiSpam: { ...f.antiSpam, enabled: e.target.checked } })}
            />
            <div>
              <div className="setting-title">Anti-spam heuristics</div>
              <div className="hint">
                Requires minimum proof-of-work and metadata completeness. Threshold:{" "}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={f.antiSpam.threshold}
                  onChange={(e) =>
                    updateFilters({ antiSpam: { ...f.antiSpam, threshold: Number(e.target.value) } })
                  }
                />
              </div>
            </div>
          </label>

          <div className="setting-row">
            <input
              type="checkbox"
              checked={f.allowlist.enabled}
              onChange={(e) =>
                updateFilters({ allowlist: { ...f.allowlist, enabled: e.target.checked } })
              }
            />
            <div style={{ flex: 1 }}>
              <div className="setting-title">Allowlist</div>
              <div className="hint">
                Trusted publisher pubkeys (hex). Empty = not enforced. This replaces the hardcoded
                NPUBS array from the original viewer with something you control.
              </div>
              <div className="pubkey-list">
                {f.allowlist.pubkeys.map((pk) => (
                  <div key={pk} className="pubkey-row">
                    <code>{pk}</code>
                    <button className="btn-small" onClick={() => removeAllowlistPubkey(pk)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="add-row">
                <input
                  placeholder="hex pubkey"
                  value={newPubkey}
                  onChange={(e) => setNewPubkey(e.target.value)}
                />
                <button
                  className="btn-small"
                  onClick={() => {
                    if (newPubkey.trim()) {
                      addAllowlistPubkey(newPubkey.trim());
                      setNewPubkey("");
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <label className="setting-row">
            <span>Combine tiers with</span>
            <select
              value={f.combineMode}
              onChange={(e) => updateFilters({ combineMode: e.target.value as "any" | "all" })}
            >
              <option value="any">ANY (pass if any enabled tier passes)</option>
              <option value="all">ALL (must pass every enabled tier)</option>
            </select>
          </label>
        </section>

        <section>
          <h3>Relays</h3>
          <div className="pubkey-list">
            {settings.relays.relays.map((r) => (
              <div key={r} className="pubkey-row">
                <code>{r}</code>
                <button className="btn-small" onClick={() => removeRelay(r)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="add-row">
            <input placeholder="wss://relay.example.com" value={newRelay} onChange={(e) => setNewRelay(e.target.value)} />
            <button
              className="btn-small"
              onClick={() => {
                if (newRelay.trim()) {
                  addRelay(newRelay.trim());
                  setNewRelay("");
                }
              }}
            >
              Add
            </button>
          </div>
        </section>

        <section>
          <h3>Pump / seeder-count API</h3>
          <p className="hint">
            Optional, additive infrastructure — if disabled or unreachable, torrent listings and
            downloads still work via BitTorrent and HF webseeds. This only affects the live
            seeder/download count shown on each card.
          </p>
          <label className="setting-row">
            <input
              type="checkbox"
              checked={settings.pumps.enabled}
              onChange={(e) => update({ pumps: { ...settings.pumps, enabled: e.target.checked } })}
            />
            <span>Enable pump API polling</span>
          </label>
          {settings.pumps.enabled && (
            <div className="add-row">
              <input
                placeholder="https://api.example.com/pumps"
                value={settings.pumps.apiUrl}
                onChange={(e) => update({ pumps: { ...settings.pumps, apiUrl: e.target.value } })}
              />
            </div>
          )}
        </section>

        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={resetToDefaults}>
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
