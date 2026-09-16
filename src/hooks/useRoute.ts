import { useEffect, useState } from "react";

/**
 * Minimal hash-based router — no dependency, since this app is a single
 * static HTML bundle with no server to configure history-API fallback
 * routes on. `#/model/<infohash>` gives each listing a real, bookmarkable,
 * shareable URL and a browser-back/forward history entry, instead of only
 * a modal that vanishes on refresh and leaves no address to share.
 */
export type Route = { name: "catalog" } | { name: "model"; infohash: string };

function parseHash(hash: string): Route {
  // location.hash includes the leading '#'; strip it and any leading '/'.
  const path = hash.replace(/^#\/?/, "");
  const [segment, infohash] = path.split("/");
  if (segment === "model" && infohash) {
    return { name: "model", infohash: decodeURIComponent(infohash) };
  }
  return { name: "catalog" };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    function onHashChange() {
      setRoute(parseHash(window.location.hash));
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}

export function navigateToModel(infohash: string): void {
  window.location.hash = `/model/${encodeURIComponent(infohash)}`;
}

export function navigateToCatalog(): void {
  // Clearing the hash entirely (rather than setting it to '#/' or '#')
  // avoids leaving a stray '#' in the address bar.
  history.pushState(null, "", window.location.pathname + window.location.search);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
