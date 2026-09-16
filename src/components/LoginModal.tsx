import { useState } from "react";
import {
  NoExtensionError,
  createNewLocalIdentity,
  hasNip07,
  importNsec,
  logIn,
  setLocalLoginMode,
} from "../nostr/identity";

/**
 * Real login picker with three explicit paths — this replaces the old
 * behavior where clicking "Log In" with no browser extension installed
 * silently generated (or reused) a random local key with no way for the
 * user to say "actually, here's my nsec" or "no really, give me a new
 * account." Nobody should end up logged in as an identity they didn't
 * choose.
 */
export function LoginModal({
  onClose,
  onLoggedIn,
}: {
  onClose: () => void;
  onLoggedIn: (pubkeyHex: string) => void;
}) {
  const [mode, setMode] = useState<"pick" | "paste">("pick");
  const [nsecInput, setNsecInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function tryExtension() {
    setError(null);
    setBusy(true);
    try {
      const { pubkeyHex } = await logIn();
      onLoggedIn(pubkeyHex);
    } catch (err) {
      if (err instanceof NoExtensionError) {
        setError("No compatible browser extension detected.");
      } else {
        setError(err instanceof Error ? err.message : "Login failed or was declined.");
      }
    } finally {
      setBusy(false);
    }
  }

  function submitNsec() {
    setError(null);
    try {
      const identity = importNsec(nsecInput);
      setLocalLoginMode();
      onLoggedIn(identity.pubkeyHex);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import that nsec.");
    }
  }

  function createNew() {
    setError(null);
    const identity = createNewLocalIdentity();
    setLocalLoginMode();
    onLoggedIn(identity.pubkeyHex);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal login-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          &times;
        </button>
        <h2>Log In</h2>

        {mode === "pick" && (
          <div className="login-options">
            <button className="login-option" onClick={tryExtension} disabled={busy}>
              <div className="setting-title">Browser extension</div>
              <div className="hint">
                {hasNip07()
                  ? "Use nos2x, Alby, or another NIP-07 signer detected in this browser. Your key never leaves the extension."
                  : "For nos2x, Alby, or another NIP-07 signer. None detected yet, but extensions can inject late — worth a try."}
              </div>
            </button>
            <button className="login-option" onClick={() => setMode("paste")}>
              <div className="setting-title">Paste an existing nsec</div>
              <div className="hint">Log in with a private key you already have, without installing an extension.</div>
            </button>
            <button className="login-option" onClick={createNew}>
              <div className="setting-title">Create a new account</div>
              <div className="hint">
                Generates a brand new local identity and shows you its nsec. There's no profile or follow graph
                attached until you set one up elsewhere.
              </div>
            </button>
          </div>
        )}

        {mode === "paste" && (
          <div className="login-paste">
            <p className="hint">
              Never share your nsec anywhere else. It's stored only in this browser and used to sign what you
              publish here.
            </p>
            <input
              type="password"
              placeholder="nsec1..."
              value={nsecInput}
              onChange={(e) => setNsecInput(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setMode("pick")}>
                Back
              </button>
              <button className="btn" onClick={submitNsec} disabled={!nsecInput.trim()}>
                Log In
              </button>
            </div>
          </div>
        )}

        {error && <div className="account-dropdown-error">{error}</div>}
      </div>
    </div>
  );
}
