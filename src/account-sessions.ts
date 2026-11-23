import type {
  AuthChangeEvent,
  Session,
  SupabaseClient,
} from "@supabase/supabase-js";

type Tokens = { access_token: string; refresh_token: string };
export interface SavedAccount {
  id: string;
  email: string;
  name: string;
  needsLogin: boolean;
}
interface StoredAccount extends Omit<SavedAccount, "needsLogin"> {
  tokens: Tokens | null;
}
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export class AccountLoginRequired extends Error {
  constructor(public readonly email: string) {
    super("Reconnecte ce compte pour réactiver le changement rapide.");
  }
}

// Same browser storage model as Supabase's persisted session. Never store passwords.
export class AccountSessions {
  private activeId: string | null = null;
  private listeners = new Set<() => void>();
  private readonly key: string;
  constructor(
    private readonly client: SupabaseClient | null,
    private readonly storage: Storage | null,
    project: string,
  ) {
    this.key = `kalo:accounts:${project}`;
  }
  private read(): StoredAccount[] {
    try {
      const value: unknown = JSON.parse(
        this.storage?.getItem(this.key) ?? "[]",
      );
      if (!Array.isArray(value)) return [];
      return value.filter(
        (a): a is StoredAccount =>
          !!a &&
          typeof a.id === "string" &&
          typeof a.email === "string" &&
          typeof a.name === "string" &&
          (a.tokens === null ||
            (typeof a.tokens?.access_token === "string" &&
              typeof a.tokens?.refresh_token === "string")),
      );
    } catch {
      return [];
    }
  }
  private write(accounts: StoredAccount[]) {
    if (!this.storage)
      throw new Error("Le stockage de cet appareil est indisponible.");
    this.storage.setItem(this.key, JSON.stringify(accounts));
    this.listeners.forEach((fn) => fn());
  }
  list = (): SavedAccount[] =>
    this.read().map(({ tokens, ...account }) => ({
      ...account,
      needsLogin: !tokens,
    }));
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  remember(session: Session) {
    const accounts = this.read();
    const old = accounts.find((a) => a.id === session.user.id);
    const account: StoredAccount = {
      id: session.user.id,
      email: session.user.email ?? "",
      name: old?.name ?? "",
      tokens: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
    };
    this.write(
      old
        ? accounts.map((a) => (a.id === account.id ? account : a))
        : [...accounts, account],
    );
    this.activeId = account.id;
  }
  handleAuth(event: AuthChangeEvent, session: Session | null) {
    // Auth callbacks stay synchronous and never call Supabase APIs (auth lock).
    try {
      if (session) this.remember(session);
      else if (event === "SIGNED_OUT" && this.activeId) {
        this.forget(this.activeId);
        this.activeId = null;
      }
    } catch {
      /* Ordinary authentication still works when browser storage is full. */
    }
  }
  label(id: string, name: string) {
    const accounts = this.read();
    const account = accounts.find((a) => a.id === id);
    if (!account || account.name === name) return;
    account.name = name;
    try {
      this.write(accounts);
    } catch {
      /* Display names are optional. */
    }
  }
  forget(id: string) {
    this.write(this.read().filter((a) => a.id !== id));
  }
  async switchTo(id: string) {
    if (!this.client) throw new Error("Connexion indisponible.");
    const target = this.read().find((a) => a.id === id);
    if (!target) throw new Error("Ce compte a été retiré de cet appareil.");
    if (!target.tokens) throw new AccountLoginRequired(target.email);
    const current = await this.client.auth.getSession();
    if (current.error) throw current.error;
    if (current.data.session?.user.id === id) return;
    if (current.data.session) this.remember(current.data.session);
    const { data, error } = await this.client.auth.setSession(target.tokens);
    if (error) {
      if (
        error.status === 400 ||
        error.status === 401 ||
        error.status === 403
      ) {
        this.write(
          this.read().map((a) => (a.id === id ? { ...a, tokens: null } : a)),
        );
        throw new AccountLoginRequired(target.email);
      }
      throw error;
    }
    if (!data.session || data.session.user.id !== id)
      throw new Error("La session reçue ne correspond pas au compte choisi.");
    this.remember(data.session);
  }
}
