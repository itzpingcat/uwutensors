import { useState } from "react";
import { useNostrCatalog } from "./hooks/useNostrCatalog";
import { useCatalogStore } from "./store/catalogStore";
import { CatalogGrid } from "./components/CatalogGrid";
import { SettingsPanel, type SettingsTab } from "./components/SettingsPanel";
import { Banner } from "./components/Banner";
import { APP_VERSION } from "./lib/defaults";
import { isLoggedIn, logIn, logOut } from "./nostr/identity";
import "./App.css";

export default function App() {
  useNostrCatalog();
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const connectedRelays = useCatalogStore((s) => s.connectedRelays);
  const totalRelays = useCatalogStore((s) => s.totalRelays);
  const relayStatus = useCatalogStore((s) => s.relayStatus);
  const [relayTooltipOpen, setRelayTooltipOpen] = useState(false);

  function openTab(tab: SettingsTab) {
    setSettingsTab(tab);
    setAccountMenuOpen(false);
  }

  function handleAuthClick() {
    if (loggedIn) {
      logOut();
      setLoggedIn(false);
    } else {
      logIn();
      setLoggedIn(true);
    }
    setAccountMenuOpen(false);
  }

  return (
    <div id="app">
      <Banner message={bannerMsg} onDismiss={() => setBannerMsg(null)} />

      <header id="top">
        <h1>
          UwUTensors <span className="ver-badge">v{APP_VERSION}</span>
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
            <button className="btn-secondary" onClick={() => setAccountMenuOpen((o) => !o)}>
              Account
            </button>
            {accountMenuOpen && (
              <div className="account-dropdown">
                <button className="account-dropdown-item" onClick={() => openTab("keys")}>
                  Keys
                </button>
                <button className="account-dropdown-item" onClick={() => openTab("relays")}>
                  Relays
                </button>
                <button className="account-dropdown-item" onClick={() => openTab("filtering")}>
                  Filtering
                </button>
                <div className="account-dropdown-sep" />
                <button className="account-dropdown-item" onClick={handleAuthClick}>
                  {loggedIn ? "Log Out" : "Log In"}
                </button>
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
