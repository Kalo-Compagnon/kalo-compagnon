import { useEffect, useRef } from "react";
import {
  allDays,
  consumed,
  expense,
  complete,
  labelDay,
  type State,
  sub,
  dayKey,
  entriesOn,
  basal,
} from "./domain";
import { sharedCalorieScale, calorieHeights } from "./duo-calorie-scale";
interface ChartProfile {
  state: State;
  name: string;
  accent: string;
  intake: string;
  hatch: string;
  allowed: boolean;
}
export function CalorieChart({
  state,
  through,
  comparison,
}: {
  state: State;
  through?: string;
  comparison?: ChartProfile[];
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    scroll = useRef<HTMLDivElement>(null);
  const days = comparison
    ? [
        ...new Set(
          comparison
            .filter((profile) => profile.allowed)
            .flatMap((profile) => [
              ...Object.keys(profile.state.days),
              ...profile.state.entries.map((entry) => dayKey(entry.timestamp)),
            ]),
        ),
      ]
        .filter((day) => day <= (through ?? dayKey()))
        .sort()
    : allDays(state, through).reverse();
  useEffect(() => {
    const canvas = ref.current!,
      parent = scroll.current!;
    function draw() {
      const colors = getComputedStyle(canvas);
      const color = (name: string) => colors.getPropertyValue(name).trim();
      const width = Math.max(
          parent.clientWidth,
          days.length * (comparison ? 180 : 120) + 24,
        ),
        height = 220,
        ratio = devicePixelRatio || 1;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const c = canvas.getContext("2d")!;
      c.scale(ratio, ratio);
      const bottom = 182,
        top = 28,
        group = (width - 24) / days.length;
      const scale = comparison
        ? sharedCalorieScale(
            comparison.map((profile) =>
              days.flatMap((day) =>
                profile.allowed &&
                entriesOn(profile.state, day).length > 0 &&
                basal(profile.state, day) > 0
                  ? [
                      {
                        intake: consumed(profile.state, day),
                        spent: expense(profile.state, day),
                      },
                    ]
                  : [],
              ),
            ),
          )
        : null;
      c.strokeStyle = color("--border");
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(20, bottom);
      c.lineTo(width - 20, bottom);
      c.stroke();
      days.forEach((d, i) => {
        if (comparison) {
          const center = 12 + group * (i + 0.5);
          comparison.forEach((profile, index) => {
            const x = center + (index === 0 ? -36 : 36);
            const present =
              profile.allowed &&
              entriesOn(profile.state, d).length > 0 &&
              basal(profile.state, d) > 0;
            c.textAlign = "center";
            c.font = "10px 'DM Sans Variable'";
            c.fillStyle = color("--muted");
            if (!present) {
              c.fillText("—", x, 110);
              return;
            }
            const intake = consumed(profile.state, d),
              spent = expense(profile.state, d);
            const heights = calorieHeights(
              { intake, spent },
              scale!.maximum,
              bottom - top,
            );
            c.fillStyle = profile.accent;
            c.beginPath();
            c.roundRect(x - 23, bottom - heights.total, 46, heights.total, 5);
            c.fill();
            if (intake > 0) {
              const h = heights.intake;
              c.fillStyle = profile.intake;
              c.beginPath();
              c.roundRect(x - 23, bottom - h, 46, h, 5);
              c.fill();
              c.save();
              c.clip();
              c.strokeStyle = profile.hatch;
              c.lineWidth = 1;
              c.beginPath();
              for (let offset = -h; offset < 46 + h; offset += 8) {
                c.moveTo(x - 23 + offset, bottom);
                c.lineTo(x - 23 + offset + h, bottom - h);
              }
              c.stroke();
              c.restore();
            }
            const delta = sub(spent, intake);
            c.fillStyle = color("--text");
            c.fillText(
              `${delta >= 0 ? "-" : "+"}${Math.round(Math.abs(delta))} kcal${complete(profile.state, d) ? "" : " *"}`,
              x,
              21,
            );
          });
          c.fillStyle = color("--muted");
          c.font = "12px 'DM Sans Variable'";
          c.textAlign = "center";
          c.fillText(`${d.slice(8)}/${d.slice(5, 7)}`, center, bottom + 23);
          return;
        }
        const intake = consumed(state, d),
          spent = expense(state, d),
          x = 12 + group * (i + 0.5);
        c.fillStyle = color("--chart-expense");
        c.beginPath();
        c.roundRect(x - 23, top, 46, bottom - top, 5);
        c.fill();
        if (intake > 0) {
          const h =
            (bottom - top) *
            Math.min(1, Math.max(0, intake / (intake + spent)));
          c.fillStyle = color("--chart-intake");
          c.beginPath();
          c.roundRect(x - 23, bottom - h, 46, h, 5);
          c.fill();
        }
        c.textAlign = "center";
        c.font = "10px 'DM Sans Variable'";
        c.fillStyle = intake <= spent ? color("--green") : color("--pink");
        const delta = sub(spent, intake);
        c.fillText(
          `${delta >= 0 ? "-" : "+"}${Math.round(Math.abs(delta))} kcal`,
          x,
          21,
        );
        c.fillStyle = color("--muted");
        c.font = "12px 'DM Sans Variable'";
        c.fillText(
          `${d.slice(8)}/${d.slice(5, 7)}${complete(state, d) ? "" : " *"}`,
          x,
          bottom + 23,
        );
      });
      if (comparison && scale) {
        comparison.forEach((profile, index) => {
          const reference = scale.halfReferences[index];
          if (reference === null) return;
          const y = bottom - ((bottom - top) * reference) / scale.maximum;
          c.save();
          c.globalAlpha = 0.3;
          c.strokeStyle = profile.accent;
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(20, y);
          c.lineTo(width - 20, y);
          c.stroke();
          c.restore();
        });
      } else {
        c.strokeStyle = color("--chart-warning");
        c.lineWidth = 2;
        c.setLineDash([8, 6]);
        c.beginPath();
        c.moveTo(20, 110);
        c.lineTo(width - 20, 110);
        c.stroke();
        c.setLineDash([]);
        c.fillStyle = color("--chart-warning");
        c.textAlign = "left";
        c.font = "10px 'DM Sans Variable'";
        c.fillText("50 %", 22, 105);
      }
    }
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    const scopedAppearance = canvas.closest(".duo-home-profile");
    const appearanceObserver = new MutationObserver(draw);
    if (scopedAppearance)
      appearanceObserver.observe(scopedAppearance, {
        attributes: true,
        attributeFilter: ["style"],
      });
    draw();
    parent.scrollLeft = parent.scrollWidth;
    window.addEventListener("kalo-appearance-change", draw);
    return () => {
      ro.disconnect();
      appearanceObserver.disconnect();
      window.removeEventListener("kalo-appearance-change", draw);
    };
  }, [state, through, comparison]);
  return (
    <div ref={scroll} className="card chart-scroll">
      <canvas
        ref={ref}
        role="img"
        aria-label={
          comparison
            ? `Apport et dépense du Duo. ${days.map((day) => `${labelDay(day)} : ${comparison.map((profile) => (!profile.allowed ? `${profile.name}, catégorie non autorisée` : !entriesOn(profile.state, day).length || basal(profile.state, day) <= 0 ? `${profile.name}, données insuffisantes` : `${profile.name}, apport ${consumed(profile.state, day)} kcal, dépense ${expense(profile.state, day)} kcal${complete(profile.state, day) ? "" : ", données incomplètes"}`)).join("; ")}`).join(". ")}`
            : days
                .map(
                  (d) =>
                    `${labelDay(d)} : apport ${consumed(state, d)}, dépense ${expense(state, d)}${complete(state, d) ? "" : ", données incomplètes"}`,
                )
                .join(". ")
        }
      />
    </div>
  );
}
