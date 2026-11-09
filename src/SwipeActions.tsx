import { useEffect, useRef, useState, type ReactNode } from "react";

export function SwipeActions({
  children,
  onEdit,
  onDelete,
  className = "",
}: {
  children: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    x: number;
    y: number;
    pointer: number;
    moved: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppress = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  function finish(remove: boolean) {
    if (timer.current) return;
    setDragging(false);
    setOffset(remove ? 104 : -104);
    timer.current = setTimeout(
      () => {
        timer.current = null;
        gesture.current = null;
        setOffset(0);
        if (remove) onDelete();
        else onEdit();
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 180,
    );
  }
  return (
    <div
      className={`swipe-card ${className}`}
      onPointerDown={(e) => {
        if (!e.isPrimary || e.button !== 0 || timer.current) return;
        suppress.current = false;
        gesture.current = {
          x: e.clientX,
          y: e.clientY,
          pointer: e.pointerId,
          moved: false,
        };
      }}
      onPointerMove={(e) => {
        const start = gesture.current;
        if (!start || start.pointer !== e.pointerId || timer.current) return;
        const dx = e.clientX - start.x,
          dy = Math.abs(e.clientY - start.y);
        if (!start.moved && dy > 12 && dy > Math.abs(dx)) {
          gesture.current = null;
          suppress.current = true;
          setDragging(false);
          setOffset(0);
          return;
        }
        if (Math.abs(dx) > 8 || start.moved) {
          if (!start.moved) e.currentTarget.setPointerCapture(e.pointerId);
          start.moved = true;
          suppress.current = true;
          setDragging(true);
          setOffset(Math.max(-120, Math.min(120, dx)));
        }
      }}
      onPointerUp={(e) => {
        const start = gesture.current;
        if (!start || start.pointer !== e.pointerId) return;
        setDragging(false);
        if (start.moved && Math.abs(e.clientX - start.x) > 60)
          finish(e.clientX > start.x);
        else {
          gesture.current = null;
          setOffset(0);
        }
      }}
      onPointerCancel={() => {
        gesture.current = null;
        suppress.current = true;
        setDragging(false);
        setOffset(0);
      }}
      onClickCapture={(e) => {
        if (suppress.current && e.detail !== 0) {
          e.preventDefault();
          e.stopPropagation();
        }
        suppress.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "Delete") {
          e.preventDefault();
          finish(e.key === "Delete");
        }
      }}
    >
      <span className="swipe-reveal swipe-remove" aria-hidden="true">
        Supprimer
      </span>
      <span className="swipe-reveal swipe-edit" aria-hidden="true">
        Modifier
      </span>
      <div
        className={`swipe-content${dragging ? " is-dragging" : ""}`}
        style={{ transform: `translateX(${offset}px)` }}
      >
        {children}
      </div>
    </div>
  );
}
