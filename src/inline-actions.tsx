import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export function useInlineActions() {
  const [content, setContent] = useState<ReactNode>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const motion = useRef<Animation | null>(null);
  const resume = useRef<{ height: number; opacity: number } | null>(null);

  useEffect(() => {
    const capture = (event: Event) => {
      if (event.target instanceof Element)
        trigger.current = event.target.closest<HTMLElement>(
          "button,a,input,[role=button]",
        );
    };
    document.addEventListener("click", capture, true);
    document.addEventListener("pointerdown", capture, true);
    document.addEventListener("contextmenu", capture, true);
    return () => {
      document.removeEventListener("click", capture, true);
      document.removeEventListener("pointerdown", capture, true);
      document.removeEventListener("contextmenu", capture, true);
    };
  }, []);

  const clearImmediately = useCallback(() => {
    motion.current?.cancel();
    motion.current = null;
    setContent(null);
    setHost(null);
    hostRef.current?.remove();
    hostRef.current = null;
    if (opener.current?.isConnected)
      opener.current.focus({ preventScroll: true });
    opener.current = null;
  }, []);

  const clear = useCallback(() => {
    const current = hostRef.current;
    if (
      !current?.isConnected ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      clearImmediately();
      return;
    }
    if (current.dataset.motion === "closing") return;
    const height = current.getBoundingClientRect().height;
    const opacity = getComputedStyle(current).opacity;
    motion.current?.cancel();
    current.dataset.motion = "closing";
    current.inert = true;
    const animation = current.animate(
      [
        { height: `${height}px`, opacity },
        { height: "0px", opacity: 0 },
      ],
      { duration: 380, easing: "cubic-bezier(.4,0,.2,1)", fill: "both" },
    );
    motion.current = animation;
    animation.onfinish = () => {
      if (hostRef.current === current) clearImmediately();
    };
  }, [clearImmediately]);

  const open = useCallback(
    (node: ReactNode) => {
      if (!node) {
        clear();
        return;
      }
      const source = trigger.current?.isConnected
        ? trigger.current
        : (document.activeElement as HTMLElement | null);
      if (
        hostRef.current?.isConnected &&
        source === opener.current &&
        hostRef.current.dataset.motion !== "closing"
      ) {
        if (
          window.dispatchEvent(
            new Event("kermit:beforeclose", { cancelable: true }),
          )
        )
          clear();
        return;
      }
      if (hostRef.current?.dataset.motion === "closing") {
        resume.current = {
          height: hostRef.current.getBoundingClientRect().height,
          opacity: Number(getComputedStyle(hostRef.current).opacity),
        };
        motion.current?.cancel();
        hostRef.current.inert = false;
        hostRef.current.dataset.motion = "opening";
      }
      if (
        hostRef.current?.isConnected &&
        source &&
        source !== opener.current &&
        !hostRef.current.contains(source)
      ) {
        motion.current?.cancel();
        resume.current = null;
        hostRef.current.remove();
        hostRef.current = null;
      }
      if (!hostRef.current?.isConnected) {
        opener.current = source;
        const container = document.createElement("div");
        container.className = "inline-action-host";
        if (source?.closest(".food-picker,.meal-food-picker"))
          container.dataset.reveal = "true";
        let anchor = source?.closest<HTMLElement>(
          ".weight-record,.action-row,.card,section,.history-day,.meals-preparation",
        );
        // Account and appearance controls belong to the existing page header.
        if (
          !anchor ||
          source?.closest(".logger-topbar,.logger-sidebar,.liquid-nav")
        )
          anchor = document.querySelector<HTMLElement>("main.screen > header");
        // Never nest a form inside another form or an interactive element.
        const form = anchor?.closest("form");
        if (form) anchor = form;
        if (anchor?.matches("button,a,form")) anchor.after(container);
        else
          (anchor ?? document.querySelector("main.screen")!).append(container);
        hostRef.current = container;
        setHost(container);
      }
      setContent(node);
    },
    [clear],
  );

  useLayoutEffect(() => {
    if (!content || !host || host.dataset.motion === "open") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      host.dataset.motion = "open";
      return;
    }
    const from = resume.current ?? { height: 0, opacity: 0 };
    resume.current = null;
    motion.current?.cancel();
    const expandedHeight = host.getBoundingClientRect().height;
    host.dataset.motion = "opening";
    const animation = host.animate(
      [
        { height: `${from.height}px`, opacity: from.opacity },
        { height: `${expandedHeight}px`, opacity: 1 },
      ],
      { duration: 460, easing: "cubic-bezier(.4,0,.2,1)", fill: "both" },
    );
    motion.current = animation;
    animation.onfinish = () => {
      if (hostRef.current === host) {
        host.dataset.motion = "open";
        animation.cancel();
      }
    };
  }, [content, host]);

  useEffect(() => {
    if (!content || !host) return;
    let cancelled = false;
    const panel = host.querySelector<HTMLElement>(".inline-action");
    panel?.focus({ preventScroll: true });
    if (host.dataset.reveal === "true") {
      const reveal = async () => {
        try {
          await motion.current?.finished;
        } catch {
          return;
        }
        if (
          cancelled ||
          !panel?.isConnected ||
          hostRef.current !== host ||
          host.dataset.motion === "closing"
        )
          return;
        const rect = panel.getBoundingClientRect();
        if (rect.top < 16 || rect.bottom > window.innerHeight - 88) {
          panel.scrollIntoView({
            block: rect.height > window.innerHeight - 104 ? "start" : "center",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
        }
      };
      void reveal();
    }
    const observer = new MutationObserver(() => {
      if (hostRef.current === host && !host.isConnected) clearImmediately();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [content, host, clearImmediately]);

  useEffect(
    () => () => {
      motion.current?.cancel();
      hostRef.current?.remove();
    },
    [],
  );
  return { content, host, open, clear: clearImmediately };
}
