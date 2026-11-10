// Keep trackpad gestures native; translate vertical mouse-wheel movement only
// when the hovered horizontal scroller can actually move in that direction.
export function enableHorizontalWheel(root: HTMLElement) {
  const onWheel = (event: WheelEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.shiftKey || event.deltaX || !event.deltaY) return;
    for (let node = event.target instanceof Element ? event.target : null;
      node && root.contains(node); node = node.parentElement) {
      if (!(node instanceof HTMLElement)) continue;
      const style = getComputedStyle(node);
      // A nested vertical list must keep its usual wheel behaviour.
      if (/^(auto|scroll)$/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return;
      if (!/^(auto|scroll)$/.test(style.overflowX) || node.scrollWidth <= node.clientWidth + 1) continue;
      const scale = event.deltaMode === 1 ? (parseFloat(style.lineHeight) || 16)
        : event.deltaMode === 2 ? node.clientWidth : 1;
      const before = node.scrollLeft;
      node.scrollLeft += event.deltaY * scale;
      if (node.scrollLeft !== before) event.preventDefault();
      return;
    }
  };
  root.addEventListener("wheel", onWheel, { passive: false });
  return () => root.removeEventListener("wheel", onWheel);
}
