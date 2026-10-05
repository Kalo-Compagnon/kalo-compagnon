import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
} from "react";
import { repository, type Repository } from "./persistence";
import { type State, f } from "./domain";
export interface AppContext {
  state: State;
  repo: Repository;
  day: string;
  editDay: (day: string | null) => void;
  modal: (node: ReactNode) => void;
  close: () => void;
  notify: (message: string) => void;
  update: (fn: (state: State) => void) => Promise<void>;
}
export const Context = createContext<AppContext>(null!);
export const useApp = () => useContext(Context);
export function HistoryList({
  children,
  visibleCount = 5,
}: {
  children: ReactNode[];
  visibleCount?: number;
}) {
  return (
    <>
      {children.slice(0, visibleCount)}
      {children.length > visibleCount && (
        <details className="history-older">
          <summary>
            Voir les relevés précédents ({children.length - visibleCount})
          </summary>
          <div className="history-older-list">
            {children.slice(visibleCount)}
          </div>
        </details>
      )}
    </>
  );
}
export function Button({
  children,
  onClick,
  primary = false,
  className = "",
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  className?: string;
  disabled?: boolean;
  type?: "submit" | "button";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${primary ? "primary" : "outline"} ${className}`}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="field">
      {label}
      <input {...props} />
    </label>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  required = false,
  step = "any",
}: {
  label: string;
  value: number | string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  required?: boolean;
  step?: string | number;
}) {
  return (
    <Field
      label={label}
      type="number"
      inputMode={step === 1 ? "numeric" : "decimal"}
      min={min}
      max={max}
      step={step}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
export const num = (s: string | number) =>
  f(Number(String(s).replace(",", ".")));
export function Sheet({
  title,
  subtitle,
  children,
  back,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  back?: () => void;
}) {
  const { close } = useApp();
  return (
    <>
      <div className="sheet-handle" />
      <div className="sheet-toolbar">
        {back ? (
          <button className="text-button" onClick={back}>
            ‹ Retour
          </button>
        ) : (
          <span />
        )}
        <button className="text-button" onClick={close}>
          Fermer
        </button>
      </div>
      <h2>{title}</h2>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      <div className="sheet-content">{children}</div>
    </>
  );
}
export function ValueDialog({
  title,
  label,
  initial,
  min = 0,
  max,
  onSave,
}: {
  title: string;
  label?: string;
  initial: number;
  min?: number;
  max?: number;
  onSave: (v: number) => Promise<void>;
}) {
  const [value, setValue] = useState(String(initial)),
    [error, setError] = useState("");
  const { close } = useApp();
  return (
    <Sheet title={title}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await onSave(num(value));
            close();
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        <NumberField
          label={label ?? title}
          value={value}
          onChange={setValue}
          min={min}
          max={max}
          required
          step={1}
        />
        {error && <p role="alert">{error}</p>}
        <Button primary type="submit">
          Enregistrer
        </Button>
      </form>
    </Sheet>
  );
}
export function ActionRow({
  children,
  onClick,
  onEdit,
  onDelete,
  onFavorite,
  favorite = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onFavorite?: () => void;
  favorite?: boolean;
}) {
  const [show, setShow] = useState(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    long = useRef(false);
  function clear() {
    if (timer.current) clearTimeout(timer.current);
  }
  return (
    <div
      className="action-row card"
      onContextMenu={(e) => {
        e.preventDefault();
        setShow(true);
      }}
    >
      <button
        className="row-main"
        onPointerDown={() => {
          long.current = false;
          timer.current = setTimeout(() => {
            long.current = true;
            setShow(true);
          }, 550);
        }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onPointerLeave={clear}
        onClick={() => {
          if (!long.current) onClick?.();
        }}
      >
        {children}
      </button>
      <button
        className="row-menu"
        aria-label="Actions"
        onClick={() => setShow(!show)}
      >
        ⋮
      </button>
      {show && (
        <div className="row-actions">
          {onFavorite && (
            <button
              onClick={onFavorite}
              aria-label={
                favorite ? "Retirer des favoris" : "Ajouter aux favoris"
              }
            >
              {favorite ? "★" : "☆"}
            </button>
          )}
          {onEdit && <button onClick={onEdit}>Modifier</button>}
          {onDelete && (
            <button className="danger" onClick={onDelete}>
              Supprimer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
export function Confirm({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action: () => Promise<void>;
}) {
  const { close, notify } = useApp();
  return (
    <Sheet title={title}>
      {children}
      <Button
        primary
        onClick={() =>
          void action()
            .then(close)
            .catch((e) => notify(String(e)))
        }
      >
        Confirmer
      </Button>
      <Button onClick={close}>Annuler</Button>
    </Sheet>
  );
}
export async function photoData(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choisis une image");
  if (file.size > 10 * 1024 * 1024) throw new Error("Image limitée à 10 Mo");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Image inaccessible"));
    reader.readAsDataURL(file);
  });
}
export function PhotoInput({
  value,
  onChange,
}: {
  value?: string;
  onChange: (s: string) => void;
}) {
  const { notify } = useApp();
  const read = async (file?: File) => {
    if (file)
      try {
        onChange(await photoData(file));
      } catch (e) {
        notify(String(e));
      }
  };
  return (
    <div className="photo-input">
      {value && value.startsWith("data:image/") && (
        <img src={value} alt="Photo jointe" />
      )}
      <label className="outline file-button">
        Prendre une photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void read(e.target.files?.[0])}
        />
      </label>
      <label className="outline file-button">
        Importer une photo
        <input
          type="file"
          accept="image/*"
          onChange={(e) => void read(e.target.files?.[0])}
        />
      </label>
      {value && <Button onClick={() => onChange("")}>Retirer la photo</Button>}
    </div>
  );
}
