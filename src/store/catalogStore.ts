import { create } from "zustand";
import type {
  ClientAnnouncement,
  ModelRequest,
  ProfileMetadata,
  PumpStatus,
  SeederInfo,
  SeederRequest,
  TorrentListing,
} from "../types";

interface CatalogState {
  listings: Map<string, TorrentListing>; // keyed by infohash
  approvedEventIds: Set<string>; // 30099 ids vouched-for via kind 1985 labels
  modelRequests: ModelRequest[];
  seederRequests: SeederRequest[];
  pumpStatus: Map<string, PumpStatus>; // keyed by infohash
  seederInfo: Map<string, SeederInfo>; // keyed by infohash — unified, source-labeled seeder count for display
  latestClientAnnouncement: ClientAnnouncement | null;
  connectedRelays: number;
  totalRelays: number;
  relayStatus: Map<string, boolean>; // per-relay url -> connected, for the relay-list hover tooltip
  profiles: Map<string, ProfileMetadata>; // pubkey -> kind 0 metadata
  nip05Verified: Map<string, boolean>; // pubkey -> whether their claimed NIP-05 identifier actually resolves to them

  upsertListing: (listing: TorrentListing) => void;
  addApprovedId: (id: string) => void;
  addModelRequest: (req: ModelRequest) => void;
  addSeederRequest: (req: SeederRequest) => void;
  setPumpStatus: (status: PumpStatus) => void;
  setSeederInfo: (info: SeederInfo) => void;
  setClientAnnouncement: (ann: ClientAnnouncement) => void;
  setRelayCounts: (connected: number, total: number) => void;
  setRelayStatus: (status: Map<string, boolean>) => void;
  setProfile: (profile: ProfileMetadata) => void;
  setNip05Verified: (pubkey: string, verified: boolean) => void;
  reset: () => void;
}

export const useCatalogStore = create<CatalogState>((set) => ({
  listings: new Map(),
  approvedEventIds: new Set(),
  modelRequests: [],
  seederRequests: [],
  pumpStatus: new Map(),
  seederInfo: new Map(),
  latestClientAnnouncement: null,
  connectedRelays: 0,
  totalRelays: 0,
  relayStatus: new Map(),
  profiles: new Map(),
  nip05Verified: new Map(),

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

  setSeederInfo: (info) =>
    set((s) => {
      const next = new Map(s.seederInfo);
      next.set(info.infohash, info);
      return { seederInfo: next };
    }),

  setClientAnnouncement: (ann) => set({ latestClientAnnouncement: ann }),
  setRelayCounts: (connected, total) => set({ connectedRelays: connected, totalRelays: total }),
  setRelayStatus: (status) => set({ relayStatus: status }),

  setProfile: (profile) =>
    set((s) => {
      const existing = s.profiles.get(profile.pubkey);
      if (existing && existing.updatedAt >= profile.updatedAt) return s;
      const next = new Map(s.profiles);
      next.set(profile.pubkey, profile);
      return { profiles: next };
    }),

  setNip05Verified: (pubkey, verified) =>
    set((s) => {
      if (s.nip05Verified.get(pubkey) === verified) return s;
      const next = new Map(s.nip05Verified);
      next.set(pubkey, verified);
      return { nip05Verified: next };
    }),

  reset: () =>
    set({
      listings: new Map(),
      approvedEventIds: new Set(),
      modelRequests: [],
      seederRequests: [],
      pumpStatus: new Map(),
      seederInfo: new Map(),
      latestClientAnnouncement: null,
    }),
}));
