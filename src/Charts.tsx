import { useEffect, useRef } from "react";
import {
  allDays,
  consumed,
  expense,
  complete,
  labelDay,
  type State,
  sub,
} from "./domain";
export function CalorieChart({ state }: { state: State }) {
  const ref = useRef<HTMLCanvasElement>(null),
    scroll = useRef<HTMLDivElement>(null);
  const days = allDays(state).reverse();
  useEffect(() => {
    const canvas = ref.current!,
      parent = scroll.current!;
    function draw() {
      const colors = getComputedStyle(document.documentElement);
      const color = (name: string) => colors.getPropertyValue(name).trim();
      const width = Math.max(parent.clientWidth, days.length * 120 + 24),
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
      c.strokeStyle = color("--border");
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(20, bottom);
      c.lineTo(width - 20, bottom);
      c.stroke();
      days.forEach((d, i) => {
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
        c.fillStyle =
          intake <= spent ? color("--chart-expense") : color("--chart-intake");
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
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    draw();
    parent.scrollLeft = parent.scrollWidth;
    window.addEventListener("kalo-appearance-change", draw);
    return () => {
      ro.disconnect();
      window.removeEventListener("kalo-appearance-change", draw);
    };
  }, [state]);
  return (
    <div ref={scroll} className="card chart-scroll">
      <canvas
        ref={ref}
        role="img"
        aria-label={days
          .map(
            (d) =>
              `${labelDay(d)} : apport ${consumed(state, d)}, dépense ${expense(state, d)}${complete(state, d) ? "" : ", données incomplètes"}`,
          )
          .join(". ")}
      />
    </div>
  );
}
