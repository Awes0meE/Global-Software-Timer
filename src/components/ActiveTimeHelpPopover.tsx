import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GAP = 8;
const EDGE = 8;

interface Position {
  top: number;
  left: number;
}

// The help sits in a sticky table header inside scroll and container-query
// boxes, which clip or trap an absolutely positioned bubble. Render it on
// document.body and keep it inside the window instead.
function placePopover(button: DOMRect, popover: DOMRect): Position {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const maxLeft = Math.max(EDGE, viewportWidth - popover.width - EDGE);
  const left = Math.min(Math.max(button.right + GAP - popover.width, EDGE), maxLeft);
  const below = button.bottom + GAP;
  const above = button.top - GAP - popover.height;
  const fitsBelow = below + popover.height <= viewportHeight - EDGE;
  const top = fitsBelow || above < EDGE ? below : above;
  return { top, left };
}

export function ActiveTimeHelpPopover() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const place = () => {
      if (!buttonRef.current || !popoverRef.current) {
        return;
      }
      setPosition(
        placePopover(
          buttonRef.current.getBoundingClientRect(),
          popoverRef.current.getBoundingClientRect(),
        ),
      );
    };

    place();
    window.addEventListener("resize", place);
    // Capture scrolls of the table and page containers, not only the window.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <span className="active-help">
      <button
        ref={buttonRef}
        className="active-help-button"
        type="button"
        aria-label="什么是活跃时长"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              className="active-help-popover"
              role="dialog"
              aria-label="什么是活跃时长？"
              style={{
                position: "fixed",
                top: `${position?.top ?? 0}px`,
                left: `${position?.left ?? 0}px`,
                visibility: position ? "visible" : "hidden",
              }}
            >
              <strong>什么是活跃时长？</strong>
              <p>运行时长表示软件被 GST 记录为正在运行的时间。</p>
              <p>活跃时长表示这个软件窗口真正获得 Windows 焦点的时间。</p>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
