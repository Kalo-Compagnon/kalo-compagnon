import { useEffect, useRef, useState } from "react";
import "./kermit.css";
import kermitAvatar from "./assets/kermit-avatar.jpg";
import { Button, useApp } from "./ui";
import {
  X,
  Plus,
  ArrowUp,
  Camera,
  ImagePlus,
  Square,
} from "lucide-react";
import { kermitEntry } from "./kermit-entry";
import { repository, supabase } from "./persistence";
import { askKermit, prepareKermitPhoto } from "./kermit-client";
import {
  type Estimate,
  type Reply,
  type Turn,
} from "../supabase/functions/_shared/kermit";

interface Message {
  role: "user" | "model";
  text: string;
  image?: string;
  reply?: Reply;
}

export default function Kermit() {
  const { close, update, day, notify } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinkingVisible, setThinkingVisible] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [attachments, setAttachments] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const context = useRef<Turn[]>([]);
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true),
    lock = useRef(false),
    saveLock = useRef(false);
  const allowClose = useRef(false),
    dirty = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const cancelClose = useRef<HTMLButtonElement>(null);
  const scope = useRef(repository.scope);
  const sessionDay = useRef(day);
  const photoVersion = useRef(0);
  dirty.current = !!(
    messages.length ||
    text.trim() ||
    image ||
    preparing ||
    busy
  );
  useEffect(() => {
    alive.current = true;
    const marker = crypto.randomUUID();
    window.history.pushState({ ...window.history.state, kermit: marker }, "");
    const guard = (event: Event) => {
      if (dirty.current && !allowClose.current) {
        event.preventDefault();
        setConfirm(true);
      }
    };
    const back = () => {
      if (dirty.current && !allowClose.current) {
        window.history.pushState(
          { ...window.history.state, kermit: marker },
          "",
        );
        setConfirm(true);
      } else close();
    };
    window.addEventListener("kermit:beforeclose", guard);
    window.addEventListener("popstate", back);
    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if ((session?.user.id ?? "guest") !== scope.current) {
        alive.current = false;
        controller.current?.abort();
        context.current = [];
        allowClose.current = true;
        close();
      }
    }).data.subscription;
    return () => {
      alive.current = false;
      photoVersion.current++;
      controller.current?.abort();
      context.current = [];
      subscription?.unsubscribe();
      window.removeEventListener("kermit:beforeclose", guard);
      window.removeEventListener("popstate", back);
      if (window.history.state?.kermit === marker) window.history.back();
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }, [messages, busy]);
  useEffect(() => {
    if (busy) {
      setThinkingVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setThinkingVisible(false), 220);
    return () => window.clearTimeout(timer);
  }, [busy]);
  useEffect(() => {
    const field = composer.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = Math.min(field.scrollHeight, 112) + "px";
  }, [text]);
  useEffect(() => {
    if (confirm) cancelClose.current?.focus();
  }, [confirm]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const dialog = end.current?.closest("dialog");
    const resize = () => {
      if (dialog && viewport) {
        dialog.style.maxHeight = `${Math.floor(viewport.height - 24)}px`;
        dialog.style.bottom = `${Math.max(12, window.innerHeight - viewport.height - viewport.offsetTop + 12)}px`;
      }
    };
    resize();
    viewport?.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      dialog?.style.removeProperty("max-height");
      dialog?.style.removeProperty("bottom");
    };
  }, []);
  async function photo(file?: File) {
    if (!file) return;
    const version = ++photoVersion.current;
    setPreparing(true);
    setError("");
    try {
      const result = await prepareKermitPhoto(file);
      if (alive.current && version === photoVersion.current) setImage(result);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current && version === photoVersion.current)
        setPreparing(false);
    }
  }
  async function send() {
    if (lock.current || preparing || (!text.trim() && !image)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const input = {
      text: text.trim(),
      ...(image ? { image } : {}),
      history: [...context.current],
    };
    setMessages((m) => [
      ...m,
      { role: "user", text: input.text, image: input.image },
    ]);
    setText("");
    setImage("");
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 55000);
    try {
      const reply = await askKermit(input, abort.signal);
      if (!alive.current || scope.current !== repository.scope) return;
      context.current.push(
        {
          role: "user",
          text:
            input.text || "[Photo de repas analysée dans la réponse suivante]",
        },
        { role: "model", text: JSON.stringify(reply) },
      );
      setMessages((m) => [...m, { role: "model", text: reply.message, reply }]);
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        setText(input.text);
        setImage(input.image ?? "");
      }
    } finally {
      clearTimeout(timeout);
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function save(estimate: Estimate) {
    if (
      saveLock.current ||
      saved.includes(estimate.meal_id) ||
      repository.scope !== scope.current
    )
      return;
    saveLock.current = true;
    setSaving(true);
    try {
      const id = `kermit-${estimate.meal_id}`;
      const entry = kermitEntry(estimate, sessionDay.current, id);
      await update((s) => {
        if (!alive.current || repository.scope !== scope.current)
          throw new Error("Compte modifié");
        if (!s.entries.some((e) => e.id === id)) s.entries.push(entry);
      });
      if (alive.current) {
        setSaved((ids) => [...ids, estimate.meal_id]);
        notify("Repas ajouté au journal");
      }
    } catch {
      if (alive.current)
        setError("Le repas n’a pas pu être enregistré. Réessaie.");
    } finally {
      saveLock.current = false;
      if (alive.current) setSaving(false);
    }
  }
  return (
    <div className="kermit-chat">
      <header className="kermit-header">
        <span className="kermit-emblem">
          <img className="kermit-avatar" src={kermitAvatar} alt="" width={44} height={44} />
        </span>
        <div>
          <h2>Kermit Cuisto</h2>
          <p>Une estimation, à la louche près.</p>
        </div>
        <button
          type="button"
          className="kermit-icon"
          aria-label="Fermer"
          onClick={close}
        >
          <X size={21} aria-hidden="true" />
        </button>
      </header>
      {confirm && (
        <section
          className="kermit-confirm card padded"
          aria-label="Confirmer la fermeture"
        >
          <p>
            Fermer Kermit ? La conversation et les photos seront perdues. Les
            repas ajoutés au journal seront conservés.
          </p>
          <button
            ref={cancelClose}
            className="outline"
            type="button"
            onClick={() => setConfirm(false)}
          >
            Annuler
          </button>
          <Button
            primary
            onClick={() => {
              allowClose.current = true;
              close();
            }}
          >
            Fermer la conversation
          </Button>
        </section>
      )}
      <div
        className="kermit-messages"
        role="log"
        aria-label="Conversation Kermit"
        aria-live="polite"
      >
        {!messages.length && (
          <div className="kermit-welcome">
            <img className="kermit-avatar kermit-welcome-avatar" src={kermitAvatar} alt="" width={80} height={80} />
            <h3>Qu’est-ce qu’on mange ?</h3>
            <p>
              Décris ton assiette ou envoie une photo.
              <br />
              On estime ça ensemble.
            </p>
          </div>
        )}
        {messages.map((m, index) => (
          <section
            className={`kermit-bubble kermit-bubble-${m.role}`}
            key={index}
          >
            <strong>{m.role === "user" ? "Toi" : "Kermit Cuisto"}</strong>
            {m.role === "model" && (
              <div className="kermit-author" aria-hidden="true">
                <img className="kermit-avatar" src={kermitAvatar} alt="" width={28} height={28} />
                <span>Kermit Cuisto</span>
              </div>
            )}
            {m.text && <p className="kermit-text">{m.text}</p>}
            {m.image && (
              <img
                className="kermit-photo"
                src={m.image}
                alt="Photo du repas envoyée"
              />
            )}
            {m.reply?.type === "estimation" &&
              !messages
                .slice(index + 1)
                .some(
                  (next) =>
                    next.reply?.type === "estimation" &&
                    next.reply.meal_id === (m.reply as Estimate).meal_id,
                ) && (
                <section
                  className="meal-calorie-details"
                  aria-label="Estimation calorique"
                >
                  <h3>{m.reply.nom_repas}</h3>
                  <dl>
                    {m.reply.ingredients.map((i, n) => (
                      <div key={n}>
                        <dt>
                          {i.nom}
                          <small>
                            {i.quantite_g === null
                              ? "Quantité inconnue"
                              : `Environ ${i.quantite_g} g`}
                          </small>
                        </dt>
                        <dd>≈ {i.kcal} kcal</dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    <strong>Total estimé : {m.reply.total_kcal} kcal</strong>
                  </p>
                  <p className="note">Estimation Gemini</p>
                  {m.reply.incertitudes.map((s, n) => (
                    <p className="note" key={n}>
                      {s}
                    </p>
                  ))}
                  <Button
                    primary
                    disabled={busy || saving || saved.includes(m.reply.meal_id)}
                    onClick={() => void save(m.reply as Estimate)}
                  >
                    {saved.includes(m.reply.meal_id)
                      ? "Ajouté au journal"
                      : "Ajouter au journal"}
                  </Button>
                  {saved.includes(m.reply.meal_id) && (
                    <p className="note">
                      Les corrections ne modifient pas le repas déjà ajouté au
                      journal.
                    </p>
                  )}
                </section>
              )}
          </section>
        ))}
        {thinkingVisible && (
          <div className={`kermit-thinking${busy ? " is-thinking" : ""}`}>
            <div className="kermit-thinking-inner">
              <div className="kermit-thinking-bubble" role="status" aria-label="Kermit réfléchit" aria-hidden={!busy}>
                <img className="kermit-avatar" src={kermitAvatar} alt="" width={28} height={28} />
                <span>Kermit réfléchit</span>
                <span className="kermit-thinking-dots" aria-hidden="true"><i /><i /><i /></span>
              </div>
            </div>
          </div>
        )}
        <div ref={end} />
      </div>
      <footer className="kermit-footer">
        {error && (
          <p className="kermit-error" role="alert">
            {error}
          </p>
        )}
        {image && (
          <div className="kermit-preview">
            <img src={image} alt="Photo prête à envoyer" />
            <button
              type="button"
              className="kermit-icon"
              aria-label="Retirer la photo"
              disabled={busy}
              onClick={() => setImage("")}
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div
          className={`kermit-attachments${attachments ? " is-open" : ""}`}
          aria-hidden={!attachments}
          inert={!attachments}
        >
          <div className="kermit-attachments-inner">
            <label className="outline file-button">
              <Camera size={18} aria-hidden="true" />
              Prendre une photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={busy || preparing}
                onChange={(e) => {
                  void photo(e.target.files?.[0]);
                  setAttachments(false);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="outline file-button">
              <ImagePlus size={18} aria-hidden="true" />
              Importer une photo
              <input
                type="file"
                accept="image/*"
                disabled={busy || preparing}
                onChange={(e) => {
                  void photo(e.target.files?.[0]);
                  setAttachments(false);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        {preparing && <p role="status">Préparation de la photo…</p>}
        <form
          className="kermit-composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <button
            type="button"
            className="kermit-icon"
            aria-label="Ajouter une photo"
            aria-expanded={attachments}
            disabled={busy || preparing}
            onClick={() => setAttachments(!attachments)}
          >
            <Plus size={23} aria-hidden="true" />
          </button>
          <textarea
            ref={composer}
            aria-label="Ton repas ou ta correction"
            placeholder="Décris ton repas…"
            rows={1}
            value={text}
            maxLength={4000}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {busy ? (
            <button
              className="kermit-send primary"
              type="button"
              aria-label="Interrompre l’analyse"
              onClick={() => controller.current?.abort()}
            >
              <Square size={17} aria-hidden="true" />
            </button>
          ) : (
            <button
              className="kermit-send primary"
              type="submit"
              aria-label="Envoyer"
              disabled={preparing || (!text.trim() && !image)}
            >
              <ArrowUp size={21} aria-hidden="true" />
            </button>
          )}
        </form>
        <p className="kermit-caption">
          Des estimations, pas des mesures exactes.
        </p>
      </footer>
    </div>
  );
}
