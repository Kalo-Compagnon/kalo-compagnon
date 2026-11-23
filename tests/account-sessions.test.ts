import { test } from "node:test";
import assert from "node:assert/strict";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { AccountSessions, AccountLoginRequired } from "../src/account-sessions";

function session(id: string, refresh = `refresh-${id}`): Session {
  return {
    access_token: `access-${id}`,
    refresh_token: refresh,
    user: { id, email: `${id}@example.test` },
  } as Session;
}
function setup() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  let active = session("a");
  let failure: { status: number; message: string } | null = null;
  const calls: string[] = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: active }, error: null }),
      setSession: async (tokens: {
        access_token: string;
        refresh_token: string;
      }) => {
        calls.push(tokens.refresh_token);
        if (failure) return { data: { session: null }, error: failure };
        active = session(
          tokens.access_token.slice(7),
          tokens.refresh_token + "-rotated",
        );
        return { data: { session: active }, error: null };
      },
    },
  } as unknown as SupabaseClient;
  const accounts = new AccountSessions(client, storage, "project");
  return {
    accounts,
    storage,
    client,
    data,
    calls,
    active: () => active,
    fail: (status: number) => {
      failure = { status, message: "Auth failure" };
    },
  };
}

test("deux comptes, aller-retour et rotation des jetons sans mots de passe", async () => {
  const s = setup();
  s.accounts.handleAuth("SIGNED_IN", session("a"));
  s.accounts.handleAuth("SIGNED_IN", session("b"));
  await s.accounts.switchTo("b");
  assert.equal(s.active().user.id, "b");
  await s.accounts.switchTo("a");
  await s.accounts.switchTo("b");
  assert.deepEqual(s.calls, ["refresh-b", "refresh-a", "refresh-b-rotated"]);
  assert.equal(s.accounts.list().length, 2);
  assert.ok(s.accounts.list().every((a) => !("tokens" in a)));
  assert.ok(![...s.data.values()].join().includes("password"));
});
test("rafraîchissement automatique conservé et comptes retrouvés après rechargement", async () => {
  const s = setup();
  s.accounts.handleAuth("SIGNED_IN", session("a"));
  s.accounts.handleAuth("TOKEN_REFRESHED", session("a", "new-refresh"));
  s.accounts.label("a", "Camille");
  const restored = new AccountSessions(s.client, s.storage, "project");
  assert.equal(restored.list()[0].name, "Camille");
  assert.ok([...s.data.values()][0].includes("new-refresh"));
  assert.deepEqual(
    new AccountSessions(s.client, s.storage, "other-project").list(),
    [],
  );
});
test("session révoquée : demander une reconnexion sans perdre le compte actif", async () => {
  const s = setup();
  s.accounts.remember(session("a"));
  s.accounts.remember(session("b"));
  s.fail(400);
  await assert.rejects(s.accounts.switchTo("b"), AccountLoginRequired);
  assert.equal(s.active().user.id, "a");
  assert.equal(s.accounts.list().find((a) => a.id === "b")?.needsLogin, true);
  await assert.rejects(s.accounts.switchTo("b"), AccountLoginRequired);
  assert.equal(s.calls.length, 1);
});
test("erreur réseau : conserver la session mémorisée pour réessayer", async () => {
  const s = setup();
  s.accounts.remember(session("b"));
  s.fail(503);
  await assert.rejects(s.accounts.switchTo("b"));
  assert.equal(s.accounts.list().find((a) => a.id === "b")?.needsLogin, false);
  assert.equal(s.active().user.id, "a");
});
test("déconnexion et retrait n'effacent que le compte concerné", async () => {
  const s = setup();
  s.accounts.handleAuth("SIGNED_IN", session("a"));
  s.accounts.handleAuth("SIGNED_IN", session("b"));
  s.accounts.handleAuth("SIGNED_OUT", null);
  assert.deepEqual(
    s.accounts.list().map((a) => a.id),
    ["a"],
  );
  s.accounts.forget("a");
  await assert.rejects(s.accounts.switchTo("a"));
  assert.deepEqual(s.calls, []);
});
test("stockage corrompu ou indisponible : la connexion ordinaire reste utilisable", () => {
  const s = setup();
  s.data.set("kalo:accounts:project", "broken");
  assert.deepEqual(s.accounts.list(), []);
  const broken = new AccountSessions(
    s.client,
    {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
    },
    "project",
  );
  assert.doesNotThrow(() => broken.handleAuth("SIGNED_IN", session("a")));
});
