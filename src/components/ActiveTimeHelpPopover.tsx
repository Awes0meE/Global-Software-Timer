import { useEffect, useRef, useState } from "react";

export function ActiveTimeHelpPopover() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

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
      {open ? (
        <div
          ref={popoverRef}
          className="active-help-popover"
          role="dialog"
          aria-label="什么是活跃时长？"
        >
          <strong>什么是活跃时长？</strong>
          <p>运行时长表示软件被 GST 记录为正在运行的时间。</p>
          <p>活跃时长表示这个软件窗口真正获得 Windows 焦点的时间。</p>
        </div>
      ) : null}
    </span>
  );
}
