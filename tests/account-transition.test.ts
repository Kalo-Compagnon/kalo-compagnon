import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Repository } from "../src/persistence";

test("le changement de session attend la fin des écritures de l'ancien compte", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let identity = "transition-a";
  const writes: string[] = [];
  const client = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        async range() {
          await pending;
          return { data: [], error: null };
        },
      };
    },
    async rpc() {
      writes.push(identity);
      return { data: { accepted: true, revision: 1 }, error: null };
    },
  } as unknown as SupabaseClient;
  const repo = new Repository(client);
  await repo.load(identity);
  await repo.update((s) => {
    s.settings.displayName = "Premier compte";
  });
  const sync = repo.sync();
  let changed = false;
  const change = repo.changeAccount(async () => {
    changed = true;
    identity = "transition-b";
    await repo.load(identity);
  });
  await repo.sync(); // Paused during the transition; must not start a second sync.
  assert.equal(changed, false);
  release();
  await Promise.all([sync, change]);
  assert.ok(writes.length > 0);
  assert.ok(writes.every((id) => id === "transition-a"));
  assert.notEqual(repo.state.settings.displayName, "Premier compte");
  await repo.load("transition-a");
  assert.equal(repo.state.settings.displayName, "Premier compte");
});

test("aucune requête n'utilise le nouveau compte avant le chargement de son journal", async () => {
  let requests = 0;
  const repo = new Repository({
    from() {
      requests++;
      throw Error("Must not sync");
    },
  } as unknown as SupabaseClient);
  await repo.load("old-account");
  await repo.update((s) => {
    s.settings.displayName = "Ancien compte";
  });
  repo.setSessionScope("new-account");
  await repo.sync();
  assert.equal(requests, 0);
  assert.equal(repo.state.settings.displayName, "Ancien compte");
});

test("une notification de connexion interrompt les uploads de l'ancien compte", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let uploads = 0;
  const client = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        async range() {
          await gate;
          return { data: [], error: null };
        },
      };
    },
    async rpc() {
      uploads++;
      return { data: { accepted: true, revision: 1 }, error: null };
    },
  } as unknown as SupabaseClient;
  const repo = new Repository(client);
  await repo.load("inflight-a");
  repo.setSessionScope("inflight-a");
  await repo.update((s) => {
    s.settings.displayName = "Données privées A";
  });
  const sync = repo.sync();
  repo.setSessionScope("inflight-b");
  release();
  await sync;
  assert.equal(uploads, 0);
  assert.ok(repo.docs.some((d) => d.pending));
});
