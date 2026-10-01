import { openDB } from "idb";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cloud } from './cloud';
import { mergeImport } from './transfer';
import { initialState, type State, type Settings, seedFoods } from "./domain";
export type Payload = unknown;
export interface Doc {
  key: string;
  value: Payload;
  revision: number;
  pending: boolean;
  conflict?: { value: Payload; revision: number };
}
const db = openDB("logger-web-v2", 1, {
  upgrade(db) {
    db.createObjectStore("documents");
  },
});
const url = import.meta.env?.VITE_SUPABASE_URL || cloud.url,
  key = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || cloud.publishableKey;
export const supabase = typeof window !== 'undefined' && url && key ? createClient(url, key) : null;
export const docsToState = (docs: Doc[]): State => {
  const s = initialState();
  const prefs: Record<string, unknown> = {};
  for (const d of docs) {
    if (d.value === null) continue;
    const [kind, ...idParts] = d.key.split("/"),
      id = idParts.join("/");
    switch (kind) {
      case "settings":
        prefs[id] = d.value;
        break;
      case "day":
        s.days[id] = d.value as State["days"][string];
        break;
      case "entry":
        s.entries.push(d.value as State["entries"][number]);
        break;
      case "meal":
        s.meals.push(d.value as State["meals"][number]);
        break;
      case "physical":
        s.physical.push(d.value as State["physical"][number]);
        break;
      case "fit":
        s.imports.push(d.value as State["imports"][number]);
        break;
      case "food":
        s.foods = s.foods.filter((f) => f.id !== id);
        s.foods.push(d.value as State["foods"][number]);
    }
  }
  s.settings = { ...s.settings, ...prefs };
  return s;
};
export function stateToValues(s: State): Map<string, Payload> {
  const map = new Map<string, Payload>();
  for (const [k, v] of Object.entries(s.settings)) map.set(`settings/${k}`, v);
  for (const [k, v] of Object.entries(s.days)) map.set(`day/${k}`, v);
  for (const [kind, values] of [
    ["entry", s.entries],
    ["meal", s.meals],
    ["physical", s.physical],
    ["fit", s.imports],
    [
      "food",
      s.foods.filter(
        (v) =>
          !v.id.startsWith("seed-") ||
          v.isCustom ||
          v.isFavorite ||
          v.usageCount > 0,
      ),
    ],
  ] as const)
    for (const v of values) map.set(`${kind}/${v.id}`, v);
  return map;
}
export class Repository {
  constructor(private readonly client: SupabaseClient | null = supabase) {}
  docs: Doc[] = [];
  scope = "guest";
  status = "Enregistré sur cet appareil";
  listeners = new Set<() => void>();
  private busy = false;
  private queued: Promise<unknown> = Promise.resolve();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  notify() {
    this.listeners.forEach((fn) => fn());
  }
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queued.then(fn);
    this.queued = p.catch(() => {});
    return p;
  }
  async load(scope: string) {
    await this.run(async () => {
      this.scope = scope;
      const database = await db;
      this.docs = (await database.get("documents", scope)) ?? [];
      this.status =
        scope === "guest" ? "Enregistré sur cet appareil" : "Connexion…";
      this.notify();
    });
  }
  get state() {
    // Editors must not mutate the stored snapshot before the IDB transaction succeeds.
    return docsToState(structuredClone(this.docs));
  }
  async update(change: (s: State) => void) {
    return this.run(async () => {
      const s = this.state;
      change(s);
      const values = stateToValues(s),
        next = this.docs.map((d) => ({ ...d }));
      for (const [k, v] of values) {
        const old = next.find((d) => d.key === k);
        if (!old) next.push({ key: k, value: v, revision: 0, pending: true });
        else if (JSON.stringify(old.value) !== JSON.stringify(v)) {
          old.value = v;
          old.pending = true;
        }
      }
      for (const old of next)
        if (!values.has(old.key) && old.value !== null) {
          old.value = null;
          old.pending = true;
        }
      await (await db).put("documents", next, this.scope);
      this.docs = next;
      this.status =
        this.scope === "guest"
          ? "Enregistré sur cet appareil"
          : "Modifications à synchroniser";
      this.notify();
    });
  }
  async sync() {
    const client = this.client;
    if (
      !client ||
      this.scope === "guest" ||
      this.busy ||
      navigator.onLine === false
    )
      return;
    this.busy = true;
    const scope = this.scope;
    try {
      this.status = "Synchronisation…";
      this.notify();
      // Pull every page: default PostgREST response limit is 1000 rows.
      const remote: { key: string; value: Payload; revision: number }[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await client
          .from("logger_documents")
          .select("key,value,revision")
          .eq("user_id", scope)
          .order("key")
          .range(offset, offset + 499);
        if (error) throw error;
        remote.push(...data);
        if (data.length < 500) break;
      }
      await this.run(async () => {
        if (this.scope !== scope) return;
        const next = structuredClone(this.docs);
        for (const r of remote) {
          const local = next.find((d) => d.key === r.key);
          if (!local) next.push({ ...r, pending: false });
          else if (r.revision > local.revision) {
            if (
              local.pending &&
              JSON.stringify(local.value) !== JSON.stringify(r.value)
            )
              local.conflict = { value: r.value, revision: r.revision };
            else
              Object.assign(local, r, { pending: false, conflict: undefined });
          }
        }
        await (await db).put("documents", next, scope);
        this.docs = next;
        this.notify();
      });
      for (const snapshot of structuredClone(this.docs).filter(
        (d) => d.pending && !d.conflict,
      )) {
        if (this.scope !== scope) break;
        const { data, error } = await client.rpc("logger_put", {
          p_key: snapshot.key,
          p_value: snapshot.value,
          p_revision: snapshot.revision,
        });
        if (error) throw error;
        await this.run(async () => {
          if (this.scope !== scope) return;
          const next = structuredClone(this.docs),
            local = next.find((d) => d.key === snapshot.key);
          if (!local) return;
          if (!data.accepted)
            local.conflict = { value: data.value, revision: data.revision };
          else {
            local.revision = data.revision;
            local.pending =
              JSON.stringify(local.value) !== JSON.stringify(snapshot.value);
          }
          await (await db).put("documents", next, scope);
          this.docs = next;
          this.notify();
        });
      }
      if (this.scope === scope)
        this.status = this.docs.some((d) => d.conflict)
          ? "Conflit à résoudre dans Synchronisation"
          : this.docs.some((d) => d.pending)
            ? "Modifications à synchroniser"
            : "Synchronisé";
    } catch (e) {
      if (this.scope === scope)
        this.status = `Synchronisation en attente : ${e instanceof Error ? e.message : ((e as { message?: string }).message ?? "connexion indisponible")}`;
    } finally {
      this.busy = false;
      this.notify();
    }
  }
  async resolve(key: string, useRemote: boolean) {
    await this.run(async () => {
      const next = structuredClone(this.docs),
        d = next.find((d) => d.key === key);
      if (!d?.conflict) return;
      d.revision = d.conflict.revision;
      if (useRemote) d.value = d.conflict.value;
      d.pending = !useRemote;
      delete d.conflict;
      await (await db).put("documents", next, this.scope);
      this.docs = next;
      this.notify();
    });
    await this.sync();
  }
  async mergeGuest() {
    if (this.scope === 'guest') throw new Error('Connecte-toi pour transférer les données');
    const guest: Doc[] = (await (await db).get("documents", "guest")) ?? [];
    if (!guest.some(d => d.value !== null)) return;
    // The account dialog explicitly confirms this merge; keep unrelated cloud records.
    await this.update(s => mergeImport(s, docsToState(structuredClone(guest))));
    await this.sync();
  }
}
export const repository = new Repository();
