import { useEffect, useRef, useState } from "react";
import { useNostrCatalog } from "./hooks/useNostrCatalog";
import { useOwnProfile } from "./hooks/useProfile";
import { useMuteList } from "./hooks/useMuteList";
import { useCatalogStore } from "./store/catalogStore";
import { CatalogGrid } from "./components/CatalogGrid";
import { SettingsPanel, type SettingsTab } from "./components/SettingsPanel";
import { Banner } from "./components/Banner";
import { APP_VERSION } from "./lib/defaults";
import { getActivePubkey, getSigningPubkey, isLoggedIn, logOut } from "./nostr/identity";
import { AvatarIcon } from "./components/AvatarIcon";
import { LoginModal } from "./components/LoginModal";
import { TorrentPage } from "./components/TorrentPage";
import { useRoute, navigateToCatalog } from "./hooks/useRoute";
import "./App.css";

export default function App() {
  useNostrCatalog();
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  // Whether the dropdown was opened by a click (as opposed to a hover) —
  // a clicked-open dropdown stays open when the mouse leaves it and only
  // closes on an explicit outside click, matching normal menu behavior.
  // A hover-opened one keeps the old close-on-mouse-leave behavior.
  const [accountMenuPinned, setAccountMenuPinned] = useState(false);
  const accountMenuRef = useRef<HTMLSpanElement | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [loginModalOpen, setLoginModalOpen] = useState(false);
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
  const route = useRoute();
  const listings = useCatalogStore((s) => s.listings);
  const routeListing =
    route.name === "model" ? listings.get(route.infohash) : undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pk = await getSigningPubkey();
      if (!cancelled) setActivePubkey(pk);
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn]);

  useOwnProfile(loggedIn ? activePubkey : null);
  useMuteList(loggedIn);
  const ownProfile = activePubkey ? profiles.get(activePubkey) : undefined;

  // A click-pinned dropdown only closes on an outside click, not on
  // mouse-leave (see accountMenuPinned above).
  useEffect(() => {
    if (!accountMenuOpen || !accountMenuPinned) return;
    function handlePointerDown(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
        setAccountMenuPinned(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [accountMenuOpen, accountMenuPinned]);

  function closeAccountMenu() {
    setAccountMenuOpen(false);
    setAccountMenuPinned(false);
  }

  function openTab(tab: SettingsTab) {
    setSettingsTab(tab);
    closeAccountMenu();
  }

  function handleAuthClick() {
    closeAccountMenu();
    if (loggedIn) {
      logOut();
      setLoggedIn(false);
      return;
    }
    setLoginModalOpen(true);
  }

  function handleLoggedIn(pubkeyHex: string) {
    setActivePubkey(pubkeyHex);
    setLoggedIn(true);
    setLoginModalOpen(false);
  }

  return (
    <div id="app">
      <Banner message={bannerMsg} onDismiss={() => setBannerMsg(null)} />

      <header id="top">
        <h1 className="app-title" onClick={navigateToCatalog} role="button" tabIndex={0}>
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
            ref={accountMenuRef}
            className="account-menu-wrap"
            onMouseEnter={() => {
              if (!accountMenuPinned) setAccountMenuOpen(true);
            }}
            onMouseLeave={() => {
              if (!accountMenuPinned) setAccountMenuOpen(false);
            }}
          >
            <button
              className={"btn-secondary account-btn" + (loggedIn && (ownProfile?.displayName || ownProfile?.name) ? " has-name" : "")}
              onClick={() => {
                // A click always pins the dropdown open, or closes it if it
                // was already pinned open — independent of whatever the
                // hover state happened to leave it at.
                if (accountMenuPinned) {
                  closeAccountMenu();
                } else {
                  setAccountMenuPinned(true);
                  setAccountMenuOpen(true);
                }
              }}
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
                  <button className="account-dropdown-item" onClick={() => openTab("profile")}>
                    Profile
                  </button>
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
                </div>
              </div>
            )}
          </span>
        </div>
      </header>

      <main id="content">
        {route.name === "model" ? (
          routeListing ? (
            <TorrentPage listing={routeListing} onPublished={setBannerMsg} />
          ) : (
            <div className="torrent-page">
              <button className="btn-small back-btn" onClick={navigateToCatalog}>
                ← Back
              </button>
              <div className="hint">Loading this listing from relays…</div>
            </div>
          )
        ) : (
          <CatalogGrid onPublished={setBannerMsg} onRequireLogin={() => setLoginModalOpen(true)} />
        )}
      </main>

      {settingsTab && <SettingsPanel initialTab={settingsTab} onClose={() => setSettingsTab(null)} />}
      {loginModalOpen && <LoginModal onClose={() => setLoginModalOpen(false)} onLoggedIn={handleLoggedIn} />}
    </div>
  );
}
