import { supabase } from "./persistence";
import type { Doc } from "./persistence";
import type { Sharing } from "./duo-model";
export interface DuoSnapshot {
  status: "none" | "pending" | "active";
  code?: string;
  sharing?: Sharing;
  partnerSharing?: Sharing;
  partner?: { name: string | null; accent: string | null };
  documents?: Pick<Doc, "key" | "value">[];
}
export async function duoRequest(
  action = "snapshot",
  payload: unknown = {},
): Promise<DuoSnapshot> {
  if (!supabase) throw new Error("Connexion au compte requise.");
  const { data, error } = await supabase.rpc("logger_duo", {
    p_action: action,
    p_payload: payload,
  });
  if (error)
    throw new Error(
      "Duo indisponible. Vérifie ta connexion ou reconnecte-toi à ton compte, puis réessaie.",
    );
  return data as DuoSnapshot;
}
