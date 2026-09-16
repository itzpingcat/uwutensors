import { useEffect, useState } from "react";
import type { TorrentListing } from "../types";
import { fetchAndVerifyTorrent } from "../lib/torrentDownload";
import { decodeBencode, extractTorrentFiles, type TorrentFileEntry } from "../lib/bencode";

interface FilesState {
  status: "idle" | "loading" | "ready" | "error";
  files: TorrentFileEntry[];
  error?: string;
  verified: boolean; // whether the fetched bytes matched the listing's published sha256
}

/**
 * The real file list inside a torrent, decoded from the .torrent file's
 * own bencode `info` dict — not from anything a publisher wrote in tags,
 * so it can't be misrepresented in a listing without also changing the
 * torrent's own infohash. Reuses fetchAndVerifyTorrent (same hash-verified
 * fetch the magnet-generation flow already uses) so this tab only ever
 * decodes bytes that matched the listing's published sha256, when one
 * exists — falling back to unverified bytes (flagged in the UI) rather
 * than refusing to show anything, same spirit as the magnet flow.
 */
export function useTorrentFiles(listing: TorrentListing) {
  const [state, setState] = useState<FilesState>({ status: "idle", files: [], verified: false });

  useEffect(() => {
    if (listing.urls.length === 0) {
      setState({ status: "error", files: [], error: "No .torrent file URL available for this listing.", verified: false });
      return;
    }
    let cancelled = false;
    setState({ status: "loading", files: [], verified: false });

    (async () => {
      try {
        const result = await fetchAndVerifyTorrent(listing.urls, listing.torrentSha256, listing.torrentSize);
        if (cancelled) return;
        const decoded = decodeBencode(result.bytes);
        const files = extractTorrentFiles(decoded);
        setState({ status: "ready", files, verified: !!listing.torrentSha256 });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          files: [],
          error: err instanceof Error ? err.message : "Failed to fetch or parse the .torrent file.",
          verified: false,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listing.infohash, listing.urls.join(","), listing.torrentSha256, listing.torrentSize]);

  return state;
}
