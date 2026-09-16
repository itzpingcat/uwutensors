import { useEffect, useState } from "react";
import { useNostrCatalog } from "./hooks/useNostrCatalog";
import { useOwnProfile } from "./hooks/useProfile";
import { useCatalogStore } from "./store/catalogStore";
import { CatalogGrid } from "./components/CatalogGrid";
import { SettingsPanel, type SettingsTab } from "./components/SettingsPanel";
import { Banner } from "./components/Banner";
import { APP_VERSION } from "./lib/defaults";
import { getActivePubkey, getSigningPubkey, isLoggedIn, logIn, logOut } from "./nostr/identity";
import { AvatarIcon } from "./components/AvatarIcon";
import "./App.css";

export default function App() {
  useNostrCatalog();
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [authError, setAuthError] = useState<string | null>(null);
  // The pubkey actually signing right now. getActivePubkey() resolves
  // synchronously for "local"/"out" but not for a NIP-07 login (the
  // extension's pubkey can only be read async), so this is refreshed
  // via getSigningPubkey() whenever login state changes.
  const [activePubkey, setActivePubkey] = useState<string | null>(getActivePubkey());
  const connectedRelays = useCatalogStore((s) => s.connectedRelays);
  const totalRelays = useCatalogStore((s) => s.totalRelays);
  const relayStatus = useCatalogStore((s) => s.relayStatus);
  const profiles = useCatalogStore((s) => s.profiles);
  const [relayTooltipOpen, setRelayTooltipOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSigningPubkey().then((pk) => {
      if (!cancelled) setActivePubkey(pk);
    });
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  useOwnProfile(loggedIn ? activePubkey : null);
  const ownProfile = activePubkey ? profiles.get(activePubkey) : undefined;

  function openTab(tab: SettingsTab) {
    setSettingsTab(tab);
    setAccountMenuOpen(false);
  }

  async function handleAuthClick() {
    setAccountMenuOpen(false);
    setAuthError(null);
    if (loggedIn) {
      logOut();
      setLoggedIn(false);
      return;
    }
    try {
      const { pubkeyHex } = await logIn();
      setActivePubkey(pubkeyHex);
      setLoggedIn(true);
    } catch (err) {
      // NIP-07 extension present but the user declined the permission
      // prompt, or it errored — stay logged out and surface why, rather
      // than silently doing nothing (the original bug report).
      setAuthError(err instanceof Error ? err.message : "Login failed or was declined.");
    }
  }

  return (
    <div id="app">
      <Banner message={bannerMsg} onDismiss={() => setBannerMsg(null)} />

      <header id="top">
        <h1>
          uwutensors <span className="ver-badge">v{APP_VERSION}</span>
        </h1>
        <div className="top-right">
          <span
            className="stat relay-stat"
            onMouseEnter={() => setRelayTooltipOpen(true)}
            onMouseLeave={() => setRelayTooltipOpen(false)}
          >
            <span
              className={
                "conn-dot " +
                (totalRelays === 0 ? "" : connectedRelays === 0 ? "err" : connectedRelays >= totalRelays ? "live" : "")
              }
            />
            <b>{connectedRelays}</b>/{totalRelays} relays
            {relayTooltipOpen && relayStatus.size > 0 && (
              <div className="relay-tooltip">
                {[...relayStatus.entries()].map(([url, connected]) => (
                  <div key={url} className="relay-tooltip-row">
                    <span className={"conn-dot " + (connected ? "live" : "err")} />
                    <span className="relay-tooltip-url">{url}</span>
                  </div>
                ))}
              </div>
            )}
          </span>
          <span
            className="account-menu-wrap"
            onMouseEnter={() => setAccountMenuOpen(true)}
            onMouseLeave={() => setAccountMenuOpen(false)}
          >
            <button
              className={"btn-secondary account-btn" + (loggedIn && (ownProfile?.displayName || ownProfile?.name) ? " has-name" : "")}
              onClick={() => setAccountMenuOpen((o) => !o)}
              aria-label="Account"
            >
              <AvatarIcon seed={activePubkey ?? "anon"} picture={ownProfile?.picture} loggedIn={loggedIn} />
              {loggedIn && (ownProfile?.displayName || ownProfile?.name) && (
                <span className="account-btn-name">{ownProfile.displayName || ownProfile.name}</span>
              )}
            </button>
            {accountMenuOpen && (
              <div className="account-dropdown">
                <div className="account-dropdown-menu">
                  <button className="account-dropdown-item" onClick={() => openTab("keys")}>
                    Keys
                  </button>
                  <button className="account-dropdown-item" onClick={() => openTab("relays")}>
                    Relays
                  </button>
                  <button className="account-dropdown-item" onClick={() => openTab("filtering")}>
                    Filtering
                  </button>
                  <button className="account-dropdown-item" onClick={() => openTab("pumps")}>
                    Pumps
                  </button>
                  <div className="account-dropdown-sep" />
                  <button className="account-dropdown-item" onClick={handleAuthClick}>
                    {loggedIn ? "Log Out" : "Log In"}
                  </button>
                  {authError && <div className="account-dropdown-error">{authError}</div>}
                </div>
              </div>
            )}
          </span>
        </div>
      </header>

      <main id="content">
        <CatalogGrid onPublished={setBannerMsg} />
      </main>

      {settingsTab && <SettingsPanel initialTab={settingsTab} onClose={() => setSettingsTab(null)} />}
    </div>
  );
}
