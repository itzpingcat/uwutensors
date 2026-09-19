# uwutensors

`uwutensors` is a browser-based Nostr catalog for model and dataset torrents.
It discovers signed listings from Nostr relays, applies client-side trust and
quality filters, and lets users inspect, verify, and download the corresponding
`.torrent` files. It is the React/TypeScript successor to the single-file
`waifu-magnet-22.html` viewer used by llama.garden.

The app is a static frontend. It does not require a backend of its own: relays
provide the catalog, Blossom servers provide torrent mirrors, and optional pump
API polling supplies live seeder and download counts.

> **WARNING — MOSTLY VIBE CODED**
>
> This project was mostly vibe coded. It may contain bugs, incomplete behavior,
> and sharp edges. Use it at your own risk, inspect the code before trusting it,
> and do not use it with keys or data you cannot afford to lose.

## How it fits together

1. **Discover listings** — the app subscribes to configured Nostr relays for
   catalog, profile, label, and update events.
2. **Parse and filter** — kind `30099` events are converted into a common
   listing shape. v1 events must identify themselves with the
   `uwutensors-v1` schema tag; legacy listings use the compatibility path.
   Filters combine publisher allowlists, NIP-05/profile checks, Web of Trust,
   proof of work, and NIP-32 approval labels.
3. **Browse** — listings appear in a searchable, sortable responsive grid with
   source links, model metadata, profile information, and optional live pump
   counts.
4. **Verify downloads** — torrent mirrors are checked against the listing's
   torrent-file SHA-256 before the browser hands the file to the user's torrent
   client. Browser-compatible WebSocket trackers and HTTP webseeds are also
   supported where a listing provides them.
5. **Publish** — signed-in users can publish listings, request models or
   seeders, and manage publisher actions. Publishing uses NIP-13 proof of work
   and sends events to the configured relays.

## Features

- Responsive catalog and listing detail pages.
- Model and dataset listings using the `uwutensors-v1` schema.
- Legacy listing compatibility for existing llama.garden data.
- Client-side Schnorr signature verification through `nostr-tools`.
- Configurable relays, Blossom servers, filters, allowlists, and pump API.
- NIP-07 browser extension login, pasted `nsec` login, and locally generated
  throwaway identities.
- Listing, torrent, and model-card inspection with hash verification.
- Optional single-file HTML build for downloading or hosting as a static page.

## Running locally

Requirements: Node.js and npm.

```sh
npm install
npm run dev
```

The development server prints a local URL. Open it in a browser and use the
settings menu to change relays, filtering, Blossom mirrors, or pump counts.
Settings and locally generated identity data are stored in the browser's
`localStorage`.

## Building

```sh
# Type-check and build the normal static site
npm run build

# Run Oxlint
npm run lint

# Produce a self-contained dist/UwUTensors.html
npm run build:singlefile
```

The normal build outputs a conventional Vite site in `dist/`. The single-file
target inlines the application assets so the generated HTML can be opened or
served without a separate JavaScript bundle.

## Nostr protocol

The wire format is documented in [`SPEC.md`](SPEC.md). The principal event
kinds are:

| Kind | Purpose |
| --- | --- |
| `30099` | Addressable torrent listing |
| `30100` | Client/update announcement |
| `30102` | Seeder request |
| `30103` | Model request |
| `1985` | NIP-32 approval/rejection labels |
| `0` | Profile metadata |
| `10000` | User mute list |

The reference parser and publisher live in [`src/nostr`](src/nostr), while
the normalized runtime listing type is defined in
[`src/types/index.ts`](src/types/index.ts).

## Project layout

| Path | Purpose |
| --- | --- |
| `src/components/` | Catalog, listing, modal, settings, and account UI |
| `src/hooks/` | Relay subscriptions, filtering, publishing, and polling |
| `src/nostr/` | Event parsing, identity, relay access, and proof of work |
| `src/lib/` | Torrent, Blossom, source, formatting, and verification helpers |
| `src/store/` | Catalog and persisted settings state |
| `SPEC.md` | `uwutensors-v1` event schema |
| `vite.config.ts` | Normal and single-file build targets |

## Related project

The original llama.garden implementation and its README are available at
[`etemiz/llama.garden`](https://github.com/etemiz/llama.garden). This project
keeps the catalog's Nostr/torrent purpose while moving the viewer into a
maintainable React application and making relay, filtering, and trust settings
editable at runtime.
