import { create } from "zustand";
import type { ClientAnnouncement, ModelRequest, PumpStatus, SeederRequest, TorrentListing } from "../types";

interface CatalogState {
  listings: Map<string, TorrentListing>; // keyed by infohash
  approvedEventIds: Set<string>; // 30099 ids vouched-for via kind 1985 labels
  modelRequests: ModelRequest[];
  seederRequests: SeederRequest[];
  pumpStatus: Map<string, PumpStatus>; // keyed by infohash
  latestClientAnnouncement: ClientAnnouncement | null;
  connectedRelays: number;
  totalRelays: number;

  upsertListing: (listing: TorrentListing) => void;
  addApprovedId: (id: string) => void;
  addModelRequest: (req: ModelRequest) => void;
  addSeederRequest: (req: SeederRequest) => void;
  setPumpStatus: (status: PumpStatus) => void;
  setClientAnnouncement: (ann: ClientAnnouncement) => void;
  setRelayCounts: (connected: number, total: number) => void;
  reset: () => void;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  listings: new Map(),
  approvedEventIds: new Set(),
  modelRequests: [],
  seederRequests: [],
  pumpStatus: new Map(),
  latestClientAnnouncement: null,
  connectedRelays: 0,
  totalRelays: 0,

  upsertListing: (listing) =>
    set((s) => {
      const existing = s.listings.get(listing.infohash);
      if (existing && existing.event.created_at >= listing.event.created_at) return s;
      const next = new Map(s.listings);
      next.set(listing.infohash, listing);
      return { listings: next };
    }),

  addApprovedId: (id) =>
    set((s) => {
      if (s.approvedEventIds.has(id)) return s;
      const next = new Set(s.approvedEventIds);
      next.add(id);
      return { approvedEventIds: next };
    }),

  addModelRequest: (req) => set((s) => ({ modelRequests: [...s.modelRequests, req] })),
  addSeederRequest: (req) => set((s) => ({ seederRequests: [...s.seederRequests, req] })),

  setPumpStatus: (status) =>
    set((s) => {
      const next = new Map(s.pumpStatus);
      next.set(status.infohash, status);
      return { pumpStatus: next };
    }),

  setClientAnnouncement: (ann) => set({ latestClientAnnouncement: ann }),
  setRelayCounts: (connected, total) => set({ connectedRelays: connected, totalRelays: total }),

  reset: () =>
    set({
      listings: new Map(),
      approvedEventIds: new Set(),
      modelRequests: [],
      seederRequests: [],
      pumpStatus: new Map(),
      latestClientAnnouncement: null,
    }),
}));
