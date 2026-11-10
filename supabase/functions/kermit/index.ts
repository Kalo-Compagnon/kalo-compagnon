import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "../_shared/kermit-handler.ts";

const env = (name: string) => Deno.env.get(name);
const client = () =>
  createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
Deno.serve(
  createHandler({
    env,
    user: async (token) => {
      const { data, error } = await client().auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    reserve: async (user, tokens) => {
      const { data, error } = await client().rpc("reserve_kermit_call", {
        p_user: user,
        p_tokens: tokens,
      });
      if (error) throw new Error("Quota unavailable");
      return data;
    },
    fetch,
  }),
);
