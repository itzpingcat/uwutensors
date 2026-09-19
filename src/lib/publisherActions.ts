import { getSigningPubkey, signWithActiveIdentity } from "../nostr/identity";
import { KIND } from "../types";
import { getSharedRelayPool } from "../hooks/useNostrCatalog";

export async function getPublisherListState(pubkey: string): Promise<{ followed: boolean; blocked: boolean }> {
  const me = await getSigningPubkey();
  const pool = getSharedRelayPool();
  if (!pool) return { followed: false, blocked: false };
  const [follow, block] = await Promise.all([
    pool.fetchEvent({ kinds: [KIND.FOLLOW_LIST], authors: [me] }),
    pool.fetchEvent({ kinds: [KIND.MUTE_LIST], authors: [me] }),
  ]);
  return {
    followed: !!follow?.tags.some((tag) => tag[0] === "p" && tag[1] === pubkey),
    blocked: !!block?.tags.some((tag) => tag[0] === "p" && tag[1] === pubkey),
  };
}

export async function updatePublisherList(pubkey: string, action: "follow" | "block"): Promise<void> {
  const me = await getSigningPubkey();
  const pool = getSharedRelayPool();
  if (!pool) throw new Error("Relays are still connecting. Try again in a moment.");
  const kind = action === "follow" ? KIND.FOLLOW_LIST : KIND.MUTE_LIST;
  const current = await pool.fetchEvent({ kinds: [kind], authors: [me] });
  // A missing response can mean a relay timeout or an unready pool, not an
  // actually empty list. Never replace a list we failed to read: doing so
  // would silently discard every other follow/mute entry.
  if (!current) throw new Error("Couldn't load your current list safely. Please try again.");
  const existing = current.tags.some((tag) => tag[0] === "p" && tag[1] === pubkey);
  const tags = current.tags.filter((tag) => tag[0] !== "p" || tag[1] !== pubkey);
  if (!existing) tags.push(["p", pubkey]);
  const event = await signWithActiveIdentity({ kind, created_at: Math.floor(Date.now() / 1000), tags, content: current?.content ?? "" });
  await pool.publish(event);
}
