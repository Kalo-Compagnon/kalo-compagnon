import { useEffect, useRef, useState } from "react";
import {
  useApp,
  Button,
  Sheet,
  NumberField,
  PhotoInput,
  ActionRow,
  Confirm,
  num,
} from "./ui";
import { groups, zones, fmt, timestamp, type Physical } from "./domain";

function MeasurementInput({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value ? String(value) : "");
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      type="text"
      value={draft}
      placeholder="0"
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
      }}
      onChange={(e) => {
        const text = e.target.value;
        if (!/^\d*(?:[.,]\d*)?$/.test(text)) return;
        setDraft(text);
        const number = Number(text.replace(",", "."));
        if (Number.isFinite(number)) onChange(number);
      }}
    />
  );
}

const positions = [0.215, 0.255, 0.315, 0.39, 0.42, 0.452, 0.55, 0.755];
const labelsOverview = [0.17, 0.22, 0.29, 0.36, 0.44, 0.51, 0.65, 0.72],
  labelsDetail = [0.195, 0.255, 0.325, 0.335, 0.425, 0.515, 0.59, 0.755];
function Body({
  slide,
  selected,
  values,
  onSelect,
  onSlide,
}: {
  slide: number;
  selected: string;
  values: Record<string, number>;
  onSelect: (s: string) => void;
  onSlide: (d: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    bounds = useRef<
      { zone: string; x: number; y: number; w: number; h: number }[]
    >([]),
    start = useRef({ x: 0, y: 0 }),
    bodyRect = useRef({ x: 0, y: 0, w: 1, h: 1 });
  useEffect(() => {
    const canvas = ref.current!,
      img = new Image(),
      secret = slide === 4;
    img.src = secret
      ? `${import.meta.env.BASE_URL}assets/measurement_secret_anatomy.png`
      : `${import.meta.env.BASE_URL}assets/body_measurement_simple.png`;
    let gone = false;
    function draw() {
      if (gone || !img.complete || !img.naturalWidth) return;
      const w = canvas.parentElement!.clientWidth - 2,
        h = slide === 0 ? 430 : 490,
        dpr = devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const c = canvas.getContext("2d")!;
      c.scale(dpr, dpr);
      bounds.current = [];
      c.font = "bold 12px Roboto";
      const scale = Math.min(
          (w - 16) / img.naturalWidth,
          (h - 16) / img.naturalHeight,
        ),
        iw = img.naturalWidth * scale,
        ih = img.naturalHeight * scale,
        x = (w - iw) / 2,
        y = (h - ih) / 2;
      bodyRect.current = { x, y, w: iw, h: ih };
      function label(zone: string, lx: number, ly: number) {
        const value = values[zone] ? `${fmt(values[zone])} cm` : "—",
          bw =
            Math.max(c.measureText(zone).width, c.measureText(value).width) +
            20,
          active = slide > 0 && selected === zone;
        let top = Math.max(y, Math.min(y + ih - 54, ly - 25));
        for (const b of bounds.current.filter(
          (b) => b.x + b.w / 2 >= w / 2 === lx >= w / 2,
        ))
          top = Math.max(top, b.y + b.h + 8);
        const left = lx >= w / 2 ? lx - bw : lx;
        c.fillStyle = active ? "#FFD54F" : "rgba(37,42,54,.92)";
        c.beginPath();
        c.roundRect(left, top, bw, 50, 7);
        c.fill();
        c.textAlign = "center";
        c.fillStyle = active ? "#14161B" : "white";
        c.fillText(zone, left + bw / 2, top + 19);
        c.fillStyle = active ? "#14161B" : "#FFD54F";
        c.fillText(value, left + bw / 2, top + 40);
        bounds.current.push({ zone, x: left, y: top, w: bw, h: 50 });
      }
      if (secret) {
        const sx = img.naturalWidth * 0.25,
          sw = img.naturalWidth * 0.51,
          sh = img.naturalHeight * 0.98,
          hh = h * 0.66,
          ww = (hh * sw) / sh,
          xx = w * 0.53 - ww / 2,
          yy = h * 0.17;
        c.drawImage(img, sx, 0, sw, sh, xx, yy, ww, hh);
        c.strokeStyle = "#FFD54F";
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(w * 0.13, yy + hh * 0.04);
        c.lineTo(w * 0.13, yy + hh * 0.91);
        c.stroke();
        c.beginPath();
        c.ellipse(xx + ww * 0.34, yy + hh * 0.48, ww * 0.24, 11, 0, 0, Math.PI);
        c.stroke();
        label("Longueur", w * 0.035, h * 0.1);
        label("Circonférence", w * 0.97, h * 0.48);
        return;
      }
      const source = document.createElement("canvas");
      source.width = img.naturalWidth;
      source.height = img.naturalHeight;
      const sc = source.getContext("2d")!;
      sc.drawImage(img, 0, 0);
      const pixels = sc.getImageData(0, 0, source.width, source.height).data;
      function ring(zone: string, front: boolean) {
        if (slide > 0 && selected !== zone) return;
        const idx = zones.indexOf(zone),
          cy = y + ih * positions[idx];
        let cx = x + iw * 0.5,
          rx = iw * [0.205, 0.15, 0, 0.12, 0.135, 0.155, 0, 0][idx],
          ry = ih * [0.02, 0.016, 0, 0.014, 0.016, 0.019, 0, 0][idx];
        if ([2, 6, 7].includes(idx)) {
          const tx = idx === 2 ? 0.67 : idx === 6 ? 0.41 : 0.405,
            row = Math.floor(img.naturalHeight * positions[idx]);
          let center = Math.floor(img.naturalWidth * tx);
          const opaque = (p: number) =>
            p >= 0 &&
            p < img.naturalWidth &&
            pixels[(row * img.naturalWidth + p) * 4 + 3] > 24;
          if (!opaque(center)) {
            for (let k = 1; k < img.naturalWidth / 8; k++) {
              if (opaque(center - k)) {
                center -= k;
                break;
              }
              if (opaque(center + k)) {
                center += k;
                break;
              }
            }
          }
          let l = center,
            r = center;
          while (opaque(l - 1)) l--;
          while (opaque(r + 1)) r++;
          cx = x + (iw * (l + r)) / 2 / img.naturalWidth;
          rx = (iw * (r - l)) / 2 / img.naturalWidth + 2;
          ry =
            ((iw * (r - l)) / img.naturalWidth) *
            (idx === 2 ? 0.3 : idx === 6 ? 0.24 : 0.26);
        }
        c.strokeStyle =
          slide > 0
            ? front
              ? "#FFD54F"
              : "rgba(255,255,255,.59)"
            : "rgba(205,209,216,.22)";
        c.lineWidth = slide > 0 ? 3 : 1.3;
        c.beginPath();
        c.ellipse(
          cx,
          cy,
          Math.max(rx, 0.1),
          Math.max(ry, 0.1),
          0,
          front ? 0 : Math.PI,
          front ? Math.PI : Math.PI * 2,
        );
        c.stroke();
        if (slide > 0 && front) {
          c.fillStyle = "white";
          for (const dx of [-rx, rx]) {
            c.beginPath();
            c.arc(cx + dx, cy, 1.5, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
      groups[slide].forEach((z) => ring(z, false));
      c.drawImage(img, x, y, iw, ih);
      groups[slide].forEach((z) => ring(z, true));
      groups[slide].forEach((zone) => {
        const i = zones.indexOf(zone),
          right = ["Épaules", "Bras", "Ventre", "Mollet"].includes(zone);
        label(
          zone,
          right ? x + iw : x,
          y + ih * (slide === 0 ? labelsOverview[i] : labelsDetail[i]),
        );
      });
    }
    img.onload = draw;
    const ro = new ResizeObserver(draw);
    ro.observe(canvas.parentElement!);
    return () => {
      gone = true;
      ro.disconnect();
    };
  }, [slide, selected, values]);
  return (
    <>
      <canvas
        ref={ref}
        aria-label="Guide des mensurations"
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          const dx = e.clientX - start.current.x,
            dy = e.clientY - start.current.y;
          if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy)) {
            onSlide(dx < 0 ? 1 : -1);
            return;
          }
          const r = e.currentTarget.getBoundingClientRect(),
            x = e.clientX - r.left,
            y = e.clientY - r.top;
          const hit = bounds.current.find(
            (b) =>
              x >= b.x - 8 &&
              x <= b.x + b.w + 8 &&
              y >= b.y - 5 &&
              y <= b.y + b.h + 5,
          );
          if (hit) {
            onSelect(hit.zone);
            return;
          }
          if (slide === 0 || slide === 4 || Math.abs(dy) > 15) return;
          const body = bodyRect.current,
            nx = Math.max(0, Math.min(1, (x - body.x) / body.w)),
            ny = Math.max(0, Math.min(1, (y - body.y) / body.h)),
            nearest = groups[slide].reduce((a, b) =>
              Math.abs(positions[zones.indexOf(a)] - ny) <=
              Math.abs(positions[zones.indexOf(b)] - ny)
                ? a
                : b,
            ),
            candidate =
              ny >= 0.22 && ny <= 0.35 && (nx < 0.38 || nx > 0.62)
                ? "Bras"
                : ny >= 0.17 && ny <= 0.235
                  ? "Épaules"
                  : ny >= 0.235 && ny <= 0.34
                    ? "Poitrine"
                    : ny >= 0.35 && ny <= 0.405
                      ? "Taille"
                      : ny >= 0.405 && ny <= 0.435
                        ? "Ventre"
                        : ny >= 0.435 && ny <= 0.5
                          ? "Hanches"
                          : ny >= 0.5 && ny <= 0.7
                            ? "Cuisse"
                            : ny >= 0.7 && ny <= 0.86
                              ? "Mollet"
                              : nearest;
          onSelect(groups[slide].includes(candidate) ? candidate : nearest);
        }}
      />
      <div className="sr-only">
        {groups[slide].map((z) => (
          <button key={z} onClick={() => onSelect(z)}>
            {z}
          </button>
        ))}
      </div>
    </>
  );
}
export function Measurements() {
  const { state, day, update, modal, notify } = useApp();
  const [slide, setSlide] = useState(0),
    [selected, setSelected] = useState("Poitrine");
  const values = state.days[day]?.measurements ?? {},
    history = state.days[day]?.measurementHistory ?? [];
  function changeSlide(n: number) {
    const v = Math.max(0, Math.min(3, n));
    setSlide(v);
    if (v > 0 && !groups[v].includes(selected)) setSelected(groups[v][0]);
  }
  function select(z: string) {
    setSelected(z);
    if (slide === 0)
      setSlide(groups.findIndex((g, i) => i > 0 && g.includes(z)));
  }
  async function measure(v: number | ((current: number) => number)) {
    await update((s) => {
      s.days[day] = {
        ...s.days[day],
        measurements: {
          ...s.days[day]?.measurements,
          [selected]: Math.max(
            0,
            typeof v === "function"
              ? v(s.days[day]?.measurements?.[selected] ?? 0)
              : v,
          ),
        },
      };
    });
  }
  async function showHistory() {
    let next = history;
    if (!zones.every((z) => (values[z] ?? 0) > 0))
      notify("Complète toutes les mesures avant d'ajouter un relevé");
    else if (
      history.length &&
      zones.every((z) => history.at(-1)!.values[z] === values[z])
    )
      notify("Aucun changement : aucun nouveau relevé ajouté");
    else {
      next = [
        ...history,
        {
          timestamp: timestamp(day),
          values: Object.fromEntries(zones.map((z) => [z, values[z]])),
        },
      ].slice(-30);
      await update((s) => {
        s.days[day] = { ...s.days[day], measurementHistory: next };
      });
    }
    modal(
      <Sheet title="Évolution des mensurations">
        {next.length ? (
          next
            .map((h, i) => (
              <p className="card padded" key={i}>
                {new Date(h.timestamp).toLocaleString("fr-FR")}
                <br />
                {zones
                  .map((z) => {
                    const delta =
                      i > 0 ? h.values[z] - next[i - 1].values[z] : 0;
                    return `${z} ${fmt(h.values[z])} cm${delta ? ` (${delta > 0 ? "+" : ""}${fmt(delta)})` : ""}`;
                  })
                  .join(" · ")}
              </p>
            ))
            .reverse()
        ) : (
          <p>Aucun relevé enregistré.</p>
        )}
      </Sheet>,
    );
  }
  return (
    <>
      <div className="slide-controls">
        <button
          disabled={slide === 0}
          aria-label="Page précédente"
          onClick={() => changeSlide(slide === 4 ? 3 : slide - 1)}
        >
          ◀
        </button>
        <button
          className="slide-title"
          onClick={() => {
            if (slide === 3) {
              setSlide(4);
              setSelected("Longueur");
            }
          }}
        >
          {
            [
              "Vue globale",
              "Haut du corps",
              "Zone centrale",
              "Bas du corps",
              "Mesure secrète",
            ][slide]
          }
        </button>
        <button
          disabled={slide >= 3}
          aria-label="Page suivante"
          onClick={() => changeSlide(slide + 1)}
        >
          ▶
        </button>
      </div>
      <p className="slide-dots">
        {slide !== 4 &&
          [0, 1, 2, 3].map((i) => (i === slide ? "●" : "○")).join("  ")}
      </p>
      <div className="card body-figure">
        <Body
          slide={slide}
          selected={selected}
          values={values}
          onSelect={select}
          onSlide={(d) => changeSlide(slide + d)}
        />
      </div>
      {slide > 0 ? (
        <div className="card measure-editor">
          <button
            aria-label="Diminuer de 0,5 centimètre"
            onClick={() => void measure((v) => v - 0.5)}
          >
            −
          </button>
          <MeasurementInput
            key={selected}
            aria-label={`${selected} en centimètres`}
            label={`${selected} en centimètres`}
            value={values[selected] || 0}
            onChange={(value) => void measure(value)}
          />
          <span>cm</span>
          <button
            aria-label="Augmenter de 0,5 centimètre"
            onClick={() => void measure((v) => v + 0.5)}
          >
            +
          </button>
        </div>
      ) : (
        <>
          <Button
            primary
            className="measurement-history"
            onClick={() => void showHistory()}
          >
            Historique et évolution
          </Button>
          <div className="card padded measurement-preview">
            {history.length
              ? history
                  .slice(-5)
                  .reverse()
                  .map((h, i) => (
                    <p key={i}>
                      {new Date(h.timestamp).toLocaleString("fr-FR")}
                      <br />
                      {zones
                        .map((z) => `${z} · ${fmt(h.values[z])} cm`)
                        .join(" • ")}
                    </p>
                  ))
              : "Aucun relevé enregistré"}
          </div>
        </>
      )}
    </>
  );
}
export function PhysicalRecords() {
  const { state, update, modal } = useApp();
  return (
    <Sheet title="Progression physique">
      <Button primary onClick={() => modal(<PhysicalForm />)}>
        Ajouter un repère
      </Button>
      {state.physical
        .slice()
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((p) => (
          <ActionRow
            key={p.id}
            onEdit={() => modal(<PhysicalForm record={p} />)}
            onClick={() => modal(<PhysicalForm record={p} />)}
            onDelete={() =>
              modal(
                <Confirm
                  title="Supprimer ce repère ?"
                  action={() =>
                    update((s) => {
                      s.physical = s.physical.filter((x) => x.id !== p.id);
                    })
                  }
                />,
              )
            }
          >
            {new Date(p.timestamp).toLocaleDateString("fr-FR")} ·{" "}
            {fmt(p.waistCm)} cm{p.weightKg ? ` · ${fmt(p.weightKg)} kg` : ""}
            {p.imagePath?.startsWith("data:image/") && (
              <img
                className="entry-photo"
                src={p.imagePath}
                alt="Progression"
              />
            )}
          </ActionRow>
        ))}
    </Sheet>
  );
}
function PhysicalForm({ record }: { record?: Physical }) {
  const { update, close } = useApp();
  const [waist, setWaist] = useState(String(record?.waistCm ?? "")),
    [weight, setWeight] = useState(String(record?.weightKg ?? "")),
    [photo, setPhoto] = useState(record?.imagePath ?? "");
  return (
    <Sheet title="Repère de progression">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await update((s) => {
            const p: Physical = {
              id: record?.id ?? crypto.randomUUID(),
              timestamp: record?.timestamp ?? Date.now(),
              waistCm: num(waist),
              weightKg: weight ? num(weight) : undefined,
              imagePath: photo,
            };
            s.physical = s.physical.filter((x) => x.id !== p.id);
            s.physical.push(p);
          });
          close();
        }}
      >
        <NumberField
          label="Tour de taille (cm)"
          value={waist}
          onChange={setWaist}
          min={0.01}
          required
        />
        <NumberField
          label="Poids (kg), facultatif"
          value={weight}
          onChange={setWeight}
          min={0.01}
        />
        <PhotoInput value={photo} onChange={setPhoto} />
        <Button primary type="submit">
          Enregistrer
        </Button>
      </form>
    </Sheet>
  );
}
