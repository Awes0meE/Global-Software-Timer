// Preview only (v0.4.8 motion picks): a small panel bottom left that switches data-motion-style between
// the two candidate styles in src/motion.ts. ?motionstyle=b starts on B.
export function mountMotionSwitch(params: URLSearchParams): void {
  const root = document.documentElement;
  if (params.get("motionstyle") === "b") root.dataset.motionStyle = "b";
  const panel = document.createElement("div");
  panel.setAttribute("data-modal-keep", "");
  Object.assign(panel.style, {
    position: "fixed",
    left: "12px",
    bottom: "12px",
    zIndex: "100",
    display: "flex",
    gap: "4px",
    padding: "4px",
    borderRadius: "10px",
    background: "rgba(0,0,0,0.72)",
    color: "#fff",
    font: "12px/1 system-ui, sans-serif",
  });
  const styles = [
    ["a", "A 整体浮起 · 横滑"],
    ["b", "B 逐块浮起 · 淡换"],
  ] as const;
  const buttons = styles.map(([id, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    Object.assign(button.style, { border: "0", borderRadius: "7px", padding: "6px 10px", cursor: "pointer", font: "inherit" });
    button.addEventListener("click", () => {
      root.dataset.motionStyle = id;
      paint();
    });
    return [id, button] as const;
  });
  const paint = () => {
    const current = root.dataset.motionStyle ?? "a";
    for (const [id, button] of buttons) {
      button.style.background = id === current ? "#fff" : "transparent";
      button.style.color = id === current ? "#000" : "#fff";
    }
  };
  for (const [, button] of buttons) panel.append(button);
  paint();
  document.body.append(panel);
}
