import { useEffect, useState } from "react";
import { useSettingsStore } from "../store/settingsStore";
import { getLoginMode, getOrCreateLocalIdentity, getSigningPubkey, isLoggedIn } from "../nostr/identity";
import { publishProfile, profileFromEvent } from "../lib/profile";
import { getSharedRelayPool } from "../hooks/useNostrCatalog";
import { KIND } from "../types";
import { useCatalogStore } from "../store/catalogStore";
import { verifyNip05 } from "../lib/nip05";
import { uploadToBlossom } from "../lib/blossom";

export type SettingsTab = "profile" | "keys" | "relays" | "filtering" | "pumps";

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
  const [profileName, setProfileName] = useState("");
  const [profileNip05, setProfileNip05] = useState("");
  const [profilePicture, setProfilePicture] = useState("");
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const setProfile = useCatalogStore((s) => s.setProfile);

  const f = settings.filters;
  const identity = getOrCreateLocalIdentity();
  const loginMode = getLoginMode();

  useEffect(() => {
    if (!isLoggedIn()) return;
    getSigningPubkey().then(async (pubkey) => {
      const cached = useCatalogStore.getState().profiles.get(pubkey);
      const event = await getSharedRelayPool()?.fetchEvent({ kinds: [KIND.METADATA], authors: [pubkey] });
      const profile = event ? profileFromEvent(event) : cached;
      setProfileName(profile?.name ?? profile?.displayName ?? "");
      setProfileNip05(profile?.nip05 ?? "");
      setProfilePicture(profile?.picture ?? "");
    }).catch(() => undefined);
  }, []);

  async function saveProfile() {
    setProfileBusy(true); setProfileMessage(null);
    try {
      const nip05 = profileNip05.trim();
      if (nip05) {
        const pubkey = await getSigningPubkey();
        if (!(await verifyNip05(nip05, pubkey))) throw new Error("That NIP-05 identifier does not verify for this account.");
      }
      let picture = profilePicture.trim();
      if (pictureFile) {
        const urls = await uploadToBlossom(pictureFile, settings.blossom.servers);
        picture = urls[0];
      }
      const event = await publishProfile({ name: profileName.trim(), display_name: profileName.trim(), nip05, picture });
      const profile = profileFromEvent(event);
      if (profile) setProfile(profile);
      setProfilePicture(picture);
      setPictureFile(null);
      setProfileMessage("Profile saved.");
    } catch (err) { setProfileMessage(err instanceof Error ? err.message : "Couldn't save profile."); }
    finally { setProfileBusy(false); }
  }

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
          <button className={"settings-tab" + (tab === "profile" ? " active" : "")} onClick={() => setTab("profile")}>Profile</button>
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

        {tab === "profile" && <section>
          <h3>Profile</h3>
          {!isLoggedIn() ? <p className="hint">Log in to edit your profile.</p> : <>
            <label className="field">Username / display name
              <input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Your name" />
            </label>
            <label className="field">NIP-05 identifier
              <input value={profileNip05} onChange={(e) => setProfileNip05(e.target.value)} placeholder="you@example.com" />
              <div className="hint">Your NIP-05 must resolve to this account before it can be saved.</div>
            </label>
            <label className="field">Profile picture
              {profilePicture && <img className="profile-picture-preview" src={profilePicture} alt="Current profile" />}
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                onChange={(e) => setPictureFile(e.target.files?.[0] ?? null)}
              />
              <div className="hint">Upload an image to your configured Blossom servers, then save your profile.</div>
            </label>
            <button className="btn" onClick={saveProfile} disabled={profileBusy}>{profileBusy ? "Saving…" : "Save profile"}</button>
            {profileMessage && <div className={profileMessage === "Profile saved." ? "hint" : "card-error"}>{profileMessage}</div>}
          </>}
        </section>}

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
            Each tier below is independent and answers a different question — there's no single
            master switch. Turning off anti-spam alone, for example, doesn't disable NIP-05 or
            Web of Trust if those are also on: every enabled tier gates the grid on its own. None
            of these prove a torrent's contents actually match what it claims — they're provenance
            signals, not proof. Allowlist further down is a special case: it doesn't combine with
            the others at all — see the note above it.
          </p>
          <button
            className="btn-small"
            onClick={() =>
              updateFilters({
                requireNip05: false,
                webOfTrust: { ...f.webOfTrust, enabled: false },
                antiSpam: { ...f.antiSpam, enabled: false },
                allowlist: { ...f.allowlist, enabled: false },
                requireProfilePicture: false,
                requireProfileName: false,
                requireProfileDescription: false,
              })
            }
          >
            Disable all filtering
          </button>

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
              <div className="setting-title">Has Published with PoW</div>
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

          <label className="setting-row">
            <input
              type="checkbox"
              checked={f.requireProfilePicture}
              onChange={(e) => updateFilters({ requireProfilePicture: e.target.checked })}
            />
            <div>
              <div className="setting-title">Has PFP</div>
              <div className="hint">
                Hides listings from publishers whose kind 0 has no picture set. Weak on its own —
                anyone can fill this in with anything — but throwaway/spam accounts very often skip
                profile setup entirely, so this filters out the laziest ones when combined with the
                tiers above.
              </div>
            </div>
          </label>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={f.requireProfileName}
              onChange={(e) => updateFilters({ requireProfileName: e.target.checked })}
            />
            <div>
              <div className="setting-title">Has Name</div>
              <div className="hint">
                Hides listings from publishers whose kind 0 has no name or display name set. Weak
                on its own — anyone can fill this in with anything — but throwaway/spam accounts
                very often skip profile setup entirely, so this filters out the laziest ones when
                combined with the tiers above.
              </div>
            </div>
          </label>

          <label className="setting-row">
            <input
              type="checkbox"
              checked={f.requireProfileDescription}
              onChange={(e) => updateFilters({ requireProfileDescription: e.target.checked })}
            />
            <div>
              <div className="setting-title">Has Profile Description</div>
              <div className="hint">
                Hides listings from publishers whose kind 0 has no bio/about text set.
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
              <div className="setting-title">Has been NIP-05 verified</div>
              <div className="hint">Only show listings from users with a verified username@domain.</div>
            </div>
          </label>

          <label className="setting-row">
            <span>Must pass at least</span>
            <input
              type="number"
              min={1}
              value={f.combineMinPass}
              onChange={(e) => updateFilters({ combineMinPass: Math.max(1, Number(e.target.value)) })}
              style={{ width: 60 }}
            />
            <span>of the enabled tiers above</span>
          </label>
          <p className="hint">
            Only counts tiers that were actually enabled AND resolved (a disabled tier, or one
            that's still waiting on a network lookup, never counts toward the total or the
            threshold). Set this to 1 for the old "ANY" behavior, or to a high number (it's
            automatically capped at however many tiers are actually enabled) for the old "ALL"
            behavior. Allowlist below is separate and always decisive on its own: if it's enabled
            and non-empty, being on it always shows a listing, and NOT being on it always hides
            one — regardless of this threshold or how the other tiers score it.
          </p>

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
