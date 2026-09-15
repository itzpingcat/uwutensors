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

  return (
    <div id="app">
      <Banner message={bannerMsg} onDismiss={() => setBannerMsg(null)} />

      <header id="top">
        <h1>
          UwUTensors <span className="ver-badge">v{APP_VERSION}</span>
        </h1>
        <div className="top-right">
          <span className="stat">
            {connectedRelays}/{totalRelays} relays
          </span>
          <button className="btn" onClick={() => setSettingsOpen(true)}>
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
