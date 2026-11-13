// Delegate to document so dynamically opened sheets and histories are included.
export function installDisclosureMotion(root: Document = document) {
  const active = new Map<
    HTMLDetailsElement,
    { animation: Animation; opening: boolean }
  >();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  function click(event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      !(event.target instanceof Element)
    )
      return;
    const summary = event.target.closest("summary");
    const details = summary?.parentElement;
    if (
      !(details instanceof HTMLDetailsElement) ||
      event.target.closest("a,button,input,select,textarea")
    )
      return;
    event.preventDefault();
    const running = active.get(details);
    const opening = !(running?.opening ?? details.open);
    const from = details.getBoundingClientRect().height;
    running?.animation.cancel();
    active.delete(details);
    details.removeAttribute("data-disclosure-animating");
    if (reducedMotion.matches || typeof details.animate !== "function") {
      details.open = opening;
      return;
    }
    // Measure both natural states; the browser paints only after this handler.
    details.open = opening;
    const to = details.getBoundingClientRect().height;
    details.open = true;
    details.setAttribute("data-disclosure-animating", "");
    const animation = details.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      { duration: 240, easing: "cubic-bezier(.2,.7,.2,1)" },
    );
    active.set(details, { animation, opening });
    animation.onfinish = () => {
      if (active.get(details)?.animation !== animation) return;
      details.open = opening;
      details.removeAttribute("data-disclosure-animating");
      active.delete(details);
    };
  }
  root.addEventListener("click", click);
  return () => {
    root.removeEventListener("click", click);
    for (const [details, { animation, opening }] of active) {
      animation.cancel();
      details.open = opening;
      details.removeAttribute("data-disclosure-animating");
    }
    active.clear();
  };
}
