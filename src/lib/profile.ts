import { getSharedRelayPool } from "../hooks/useNostrCatalog";
import { getSigningPubkey, signWithActiveIdentity } from "../nostr/identity";
import { KIND, type NostrEvent, type ProfileMetadata } from "../types";

export async function publishProfile(fields: { name?: string; display_name?: string; nip05?: string }): Promise<NostrEvent> {
  const pubkey = await getSigningPubkey();
  const pool = getSharedRelayPool();
  if (!pool) throw new Error("Relays are still connecting. Try again in a moment.");
  const current = await pool.fetchEvent({ kinds: [KIND.METADATA], authors: [pubkey] });
  let existing: Record<string, unknown> = {};
  if (current) {
    try {
      const parsed = JSON.parse(current.content);
      if (parsed && typeof parsed === "object") existing = parsed as Record<string, unknown>;
    } catch { /* replace malformed profile content with valid JSON */ }
  }
  const content = JSON.stringify({
    ...existing,
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(fields.display_name !== undefined ? { display_name: fields.display_name } : {}),
    ...(fields.nip05 !== undefined ? { nip05: fields.nip05 } : {}),
  });
  const event = await signWithActiveIdentity({ kind: KIND.METADATA, created_at: Math.floor(Date.now() / 1000), tags: [], content });
  await pool.publish(event);
  return event;
}

export function profileFromEvent(event: NostrEvent): ProfileMetadata | null {
  try {
    const data = JSON.parse(event.content) as Record<string, unknown>;
    return {
      pubkey: event.pubkey,
      name: typeof data.name === "string" ? data.name : undefined,
      displayName: typeof data.display_name === "string" ? data.display_name : undefined,
      picture: typeof data.picture === "string" ? data.picture : undefined,
      nip05: typeof data.nip05 === "string" ? data.nip05 : undefined,
      about: typeof data.about === "string" ? data.about : undefined,
      updatedAt: event.created_at,
    };
  } catch {
    return null;
  }
}
