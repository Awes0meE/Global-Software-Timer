import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const GAP = 8;
const EDGE = 8;

interface Position {
  top: number;
  left: number;
}

type Align = "start" | "end";

// The help sits in sticky table headers and panel heads inside scroll and
// container-query boxes, which clip or trap an absolutely positioned bubble.
// Render it on document.body and keep it inside the window instead. "end"
// lines the bubble's right edge up with the button; "start" lets it grow
// rightwards from a title near a panel's left edge.
function placePopover(button: DOMRect, popover: DOMRect, align: Align): Position {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const maxLeft = Math.max(EDGE, viewportWidth - popover.width - EDGE);
  const preferred = align === "start" ? button.left - GAP : button.right + GAP - popover.width;
  const left = Math.min(Math.max(preferred, EDGE), maxLeft);
  const below = button.bottom + GAP;
  const above = button.top - GAP - popover.height;
  const fitsBelow = below + popover.height <= viewportHeight - EDGE;
  const top = fitsBelow || above < EDGE ? below : above;
  return { top, left };
}

interface HelpPopoverProps {
  /** The ? button's accessible name. */
  label: string;
  /** The bubble's heading, also its accessible name. */
  title: string;
  children: ReactNode;
  align?: Align;
}

/** A ? button that opens a short explanation; a second click, Escape or a click outside closes it. */
export function HelpPopover({ label, title, children, align = "end" }: HelpPopoverProps) {
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
          align,
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
  }, [open, align]);

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
        aria-label={label}
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
              aria-label={title}
              style={{
                position: "fixed",
                top: `${position?.top ?? 0}px`,
                left: `${position?.left ?? 0}px`,
                visibility: position ? "visible" : "hidden",
              }}
            >
              <strong>{title}</strong>
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

export function ActiveTimeHelpPopover() {
  return (
    <HelpPopover label="什么是专注时长" title="什么是专注时长？">
      <p>窗口是软件开着任务栏窗口的时间；后台是没有窗口、进程还在跑的时间。</p>
      <p>专注是它的窗口被选中、在最前面的时间，不管有没有键鼠操作；概览的活跃只算其中 5 分钟内有键鼠操作的部分。</p>
    </HelpPopover>
  );
}
