import { useState } from "react";
import { useSettingsStore } from "../store/settingsStore";
import { getLoginMode, getOrCreateLocalIdentity } from "../nostr/identity";

export type SettingsTab = "keys" | "relays" | "filtering" | "pumps";

export function SettingsPanel({
  onClose,
  initialTab = "filtering",
}: {
  onClose: () => void;
  initialTab?: SettingsTab;
}) {
  const {
    settings,
    update,
    updateFilters,
    addAllowlistPubkey,
    removeAllowlistPubkey,
    addRelay,
    removeRelay,
    addBlossomServer,
    removeBlossomServer,
    resetToDefaults,
  } = useSettingsStore();
  const [newPubkey, setNewPubkey] = useState("");
  const [newRelay, setNewRelay] = useState("");
  const [newBlossom, setNewBlossom] = useState("");
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [nsecRevealed, setNsecRevealed] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy");

  const f = settings.filters;
  const identity = getOrCreateLocalIdentity();
  const loginMode = getLoginMode();

  async function copyNsec() {
    try {
      await navigator.clipboard.writeText(identity.nsec);
      setCopyLabel("Copied!");
      setTimeout(() => setCopyLabel("Copy"), 1500);
    } catch {
      setCopyLabel("Copy failed");
      setTimeout(() => setCopyLabel("Copy"), 1500);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>Settings</h2>

        <div className="settings-tabs">
          <button className={"settings-tab" + (tab === "keys" ? " active" : "")} onClick={() => setTab("keys")}>
            Keys
          </button>
          <button className={"settings-tab" + (tab === "relays" ? " active" : "")} onClick={() => setTab("relays")}>
            Relays
          </button>
          <button
            className={"settings-tab" + (tab === "filtering" ? " active" : "")}
            onClick={() => setTab("filtering")}
          >
            Filtering
          </button>
          <button className={"settings-tab" + (tab === "pumps" ? " active" : "")} onClick={() => setTab("pumps")}>
            Pumps
          </button>
        </div>

        {tab === "keys" && (
          <section>
            <h3>Keys</h3>
            {loginMode === "nip07" ? (
              <>
                <p className="hint">
                  Logged in via a NIP-07 browser extension. It holds your private key — this app
                  never sees it, and only asks the extension to sign each event you publish.
                </p>
              </>
            ) : (
              <p className="hint">
                {loginMode === "out"
                  ? "Not logged in. Publishing (requests, seeder pings, torrent listings) still works using a local, anonymous key — nothing here is tied to an account until you log in."
                  : "Local publishing identity, generated and stored in this browser. Used to sign requests, seeder pings, and torrent listings you submit — not the same as Web-of-Trust scoring, which needs a real NIP-07 signer with a social graph."}
              </p>
            )}
            <div className="modal-fields">
              <dt>Public key</dt>
              <dd>{identity.npub}</dd>
              <dt>Hex pubkey</dt>
              <dd>{identity.pubkeyHex}</dd>
            </div>

            {loginMode !== "nip07" && (
              <div className="nsec-row">
                <div className="setting-title">Private key (nsec)</div>
                <p className="hint">
                  Never share this with anyone or paste it into a website — anyone with it can
                  publish as you. It's blurred by default so it doesn't end up in a screenshot or
                  screen-share by accident.
                </p>
                <div className="nsec-reveal">
                  <code className={nsecRevealed ? "" : "nsec-blurred"}>{identity.nsec}</code>
                  <button className="btn-small" onClick={() => setNsecRevealed((r) => !r)}>
                    {nsecRevealed ? "Hide" : "Reveal"}
                  </button>
                  <button className="btn-small" onClick={copyNsec}>
                    {copyLabel}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "relays" && (
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

            <h3 style={{ marginTop: 20 }}>Blossom servers</h3>
            <p className="hint">
              Where .torrent files are fetched from (and, when publishing, uploaded to). A
              listing's .torrent is hash-verified against these mirrors before use, so a
              compromised Blossom server can't silently swap in a tampered file — see the
              .torrent files list in a listing's detail view.
            </p>
            <div className="pubkey-list">
              {settings.blossom.servers.map((b) => (
                <div key={b} className="pubkey-row">
                  <code>{b}</code>
                  <button className="btn-small" onClick={() => removeBlossomServer(b)}>
                    Remove
                  </button>
                </div>
              ))}
              {settings.blossom.servers.length === 0 && (
                <div className="hint">No Blossom servers configured.</div>
              )}
            </div>
            <div className="add-row">
              <input
                placeholder="https://blossom.example.com"
                value={newBlossom}
                onChange={(e) => setNewBlossom(e.target.value)}
              />
              <button
                className="btn-small"
                onClick={() => {
                  if (newBlossom.trim()) {
                    addBlossomServer(newBlossom.trim());
                    setNewBlossom("");
                  }
                }}
              >
                Add
              </button>
            </div>
          </section>
        )}

        {tab === "filtering" && (
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
        )}

        {tab === "pumps" && (
        <section>
          <h3>Pump / seeder-count API</h3>
          <p className="hint">
            Fallback only. Seeder counts are fetched by scraping a torrent's own WebSocket
            tracker directly when it has one — decentralized, no third-party API involved. This
            pump API is used only when a torrent lists no wss:// tracker, or that tracker doesn't
            respond: it's llama.garden's own Transmission fleet, a single company's private view
            of its own infrastructure, not the full swarm. Optional either way — if disabled or
            unreachable, torrent listings and downloads still work via BitTorrent and HF webseeds;
            this only affects the live seeder/download count shown on each card, and the card
            always shows which source a count came from.
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
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={resetToDefaults}>
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
  );
}
