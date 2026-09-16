import { useState } from "react";
import { useNostrCatalog } from "./hooks/useNostrCatalog";
import { useCatalogStore } from "./store/catalogStore";
import { CatalogGrid } from "./components/CatalogGrid";
import { SettingsPanel } from "./components/SettingsPanel";
import { Banner } from "./components/Banner";
import { APP_VERSION } from "./lib/defaults";
import "./App.css";

export default function App() {
  useNostrCatalog();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const connectedRelays = useCatalogStore((s) => s.connectedRelays);
  const totalRelays = useCatalogStore((s) => s.totalRelays);
  const relayStatus = useCatalogStore((s) => s.relayStatus);
  const [relayTooltipOpen, setRelayTooltipOpen] = useState(false);

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
          <button className="btn-secondary" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      <main id="content">
        <CatalogGrid onPublished={setBannerMsg} />
      </main>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
