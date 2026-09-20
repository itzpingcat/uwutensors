import { useEffect, useState } from "react";
import type { TorrentListing } from "../types";
import { humanSize, displayFilePath } from "../lib/format";
import { useTorrentFiles } from "../hooks/useTorrentFiles";
import { navigateToCatalog } from "../hooks/useRoute";
import { TorrentOverview } from "./TorrentOverview";
import { ModelCard } from "./ModelCard";
import { getSigningPubkey, isLoggedIn } from "../nostr/identity";
import { KIND } from "../types";
import { buildDeletionRequestTags } from "../nostr/submit";
import { useMineAndPublish } from "../hooks/useMineAndPublish";
import { getPublisherListState, updatePublisherList } from "../lib/publisherActions";

type PageTab = "overview" | "files" | "community";

interface Props {
  listing: TorrentListing;
  onPublished: (msg: string) => void;
}

function FilesTab({ listing }: { listing: TorrentListing }) {
  const { status, files, error, verified } = useTorrentFiles(listing);

  if (status === "idle" || status === "loading") {
    return <div className="hint">Fetching and decoding the .torrent file…</div>;
  }
  if (status === "error") {
    return <div className="card-error">{error}</div>;
  }

  return (
    <div>
      <p className="hint">
        {files.length} file{files.length !== 1 ? "s" : ""} — read directly from the .torrent's own file
        table, not from anything the publisher wrote in the listing.{" "}
        {verified
          ? "The .torrent bytes were hash-verified against the listing's published sha256 before decoding."
          : "This listing published no sha256 to verify the .torrent against — the file list below is unverified."}
      </p>
      <div className="file-tree">
        {files.map((f) => (
          <div key={f.path} className="file-tree-row">
            <span className="file-tree-path" title={f.path}>
              {displayFilePath(f.path)}
            </span>
            <span className="file-tree-size">{humanSize(f.size)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TorrentPage({ listing, onPublished }: Props) {
  const [tab, setTab] = useState<PageTab>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [publisherState, setPublisherState] = useState({ followed: false, blocked: false });
  // The key of the last completed publisher-state load, instead of a boolean
  // flag reset synchronously in an effect: "loaded" is just "the load for
  // this pubkey (while the menu is open) has finished".
  const [publisherLoadedKey, setPublisherLoadedKey] = useState<string | null>(null);
  const [publisherAction, setPublisherAction] = useState<"follow" | "block" | null>(null);
  // The pubkey whose ownership has been resolved, instead of a boolean reset
  // synchronously in an effect: isOwner is derived, so there's no stale state
  // to clear when the listing (or login state) changes.
  const [ownerPubkey, setOwnerPubkey] = useState<string | null>(null);
  const [deletionAction, setDeletionAction] = useState(false);
  const deletion = useMineAndPublish();
  const title = listing.lab ? `${listing.lab} / ${listing.displayName ?? listing.name}` : listing.displayName ?? listing.name;
  const publisherStateLoaded = menuOpen && publisherLoadedKey === listing.event.pubkey;
  const isOwner = isLoggedIn() && ownerPubkey === listing.event.pubkey;

  useEffect(() => {
    if (!menuOpen || !isLoggedIn() || publisherLoadedKey === listing.event.pubkey) return;
    let cancelled = false;
    getPublisherListState(listing.event.pubkey)
      .then((state) => {
        if (!cancelled) {
          setPublisherState(state);
          setPublisherLoadedKey(listing.event.pubkey);
        }
      })
      .catch(() => {
        if (!cancelled) setPublisherLoadedKey(listing.event.pubkey);
      });
    return () => {
      cancelled = true;
    };
  }, [menuOpen, listing.event.pubkey, publisherLoadedKey]);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn()) return;
    getSigningPubkey().then((pubkey) => {
      if (!cancelled) setOwnerPubkey(pubkey);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [listing.event.pubkey]);

  async function requestDeletion() {
    if (!isOwner || deletionAction || deletion.submitting) return;
    if (!window.confirm("Send a good-faith request to delete this listing? It will remain visible until relays and clients honor the request.")) return;
    setDeletionAction(true);
    setActionError(null);
    const result = await deletion.submit(
      KIND.DELETION_REQUEST,
      buildDeletionRequestTags(listing.event.id, listing.event.pubkey, listing.infohash),
      "Good-faith deletion request from the listing owner."
    );
    setDeletionAction(false);
    if (result) {
      setMenuOpen(false);
      onPublished(`Deletion request published. (${result.okCount}/${result.total} relays, PoW: ${result.powBits} bits.)`);
    }
  }

  async function handlePublisherAction(action: "follow" | "block") {
    if (!isLoggedIn() || !publisherStateLoaded || publisherAction) return;
    setPublisherAction(action);
    setActionError(null);
    try {
      // updatePublisherList reads the latest list again immediately before
      // writing, so the server-side decision cannot use stale menu state.
      await updatePublisherList(listing.event.pubkey, action);
      const latest = await getPublisherListState(listing.event.pubkey);
      setPublisherState(latest);
      setMenuOpen(false);
      onPublished(action === "follow"
        ? (latest.followed ? "Publisher followed." : "Publisher unfollowed.")
        : (latest.blocked ? "Publisher blocked." : "Publisher unblocked."));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : `Couldn't update ${action} status.`);
    } finally {
      setPublisherAction(null);
    }
  }

  return (
    <div className="torrent-page">
      <div className="page-actions">
        <button className="btn-small back-btn" onClick={navigateToCatalog}>← Exit</button>
        <button className="btn-small" aria-label="Publisher actions" onClick={() => setMenuOpen((open) => !open)}>…</button>
        {menuOpen && <div className="publisher-menu">
          <button disabled={!publisherStateLoaded || !!publisherAction} onClick={() => handlePublisherAction("follow")}>{!publisherStateLoaded ? "Loading…" : publisherState.followed ? "Unfollow user" : "Follow publisher"}</button>
          <button disabled={!publisherStateLoaded || !!publisherAction} onClick={() => handlePublisherAction("block")}>{!publisherStateLoaded ? "Loading…" : publisherState.blocked ? "Unblock user" : "Block publisher"}</button>
          {isOwner && <button disabled={deletion.submitting || deletionAction} onClick={requestDeletion}>{deletion.submitting ? "Mining…" : "Request deletion"}</button>}
        </div>}
      </div>
      {actionError && <div className="card-error">{actionError}</div>}
      <h2>{title}</h2>

      <div className="page-tabs">
        <button className={"page-tab" + (tab === "overview" ? " active" : "")} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className={"page-tab" + (tab === "files" ? " active" : "")} onClick={() => setTab("files")}>
          Files
        </button>
        <button className={"page-tab" + (tab === "community" ? " active" : "")} onClick={() => setTab("community")}>
          Community
        </button>
      </div>

      {tab === "overview" && (
        <div className="overview-layout">
          <div className="overview-main">
            <ModelCard listing={listing} />
          </div>
          <aside className="overview-sidebar">
            <TorrentOverview listing={listing} onPublished={onPublished} />
          </aside>
        </div>
      )}
      {tab === "files" && <FilesTab listing={listing} />}
      {tab === "community" && (
        <div className="hint">Comments aren't built yet — coming in a later pass (NIP-22 threaded replies).</div>
      )}
    </div>
  );
}
