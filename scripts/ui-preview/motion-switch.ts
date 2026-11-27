// Preview only (v0.4.8 motion picks): a small panel bottom left that switches data-swap-style between
// the two candidate swap styles in styles.css. ?motionstyle=d starts on D.
export function mountMotionSwitch(params: URLSearchParams): void {
  const root = document.documentElement;
  root.dataset.swapStyle = params.get("motionstyle") === "d" ? "d" : "c";
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
    ["c", "C 原地溶解"],
    ["d", "D 溶解 + 方向"],
  ] as const;
  const buttons = styles.map(([id, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    Object.assign(button.style, { border: "0", borderRadius: "7px", padding: "6px 10px", cursor: "pointer", font: "inherit" });
    button.addEventListener("click", () => {
      root.dataset.swapStyle = id;
      paint();
    });
    return [id, button] as const;
  });
  const paint = () => {
    const current = root.dataset.swapStyle ?? "c";
    for (const [id, button] of buttons) {
      button.style.background = id === current ? "#fff" : "transparent";
      button.style.color = id === current ? "#000" : "#fff";
    }
  };
  for (const [, button] of buttons) panel.append(button);
  const rule = document.createElement("span");
  Object.assign(rule.style, { width: "1px", background: "rgba(255,255,255,0.3)", margin: "2px 4px" });
  panel.append(rule);
  const speeds = [
    ["240ms", "快"],
    ["400ms", "中"],
    ["600ms", "慢"],
  ] as const;
  const speedButtons = speeds.map(([value, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    Object.assign(button.style, { border: "0", borderRadius: "7px", padding: "6px 10px", cursor: "pointer", font: "inherit" });
    button.addEventListener("click", () => {
      root.style.setProperty("--swap-duration", value);
      paintSpeed();
    });
    panel.append(button);
    return [value, button] as const;
  });
  const paintSpeed = () => {
    const current = root.style.getPropertyValue("--swap-duration") || "400ms";
    for (const [value, button] of speedButtons) {
      button.style.background = value === current ? "#fff" : "transparent";
      button.style.color = value === current ? "#000" : "#fff";
    }
  };
  paintSpeed();
  paint();
  document.body.append(panel);
}
