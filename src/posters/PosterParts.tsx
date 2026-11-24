import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import clockSvg from "../assets/gst-clock.svg?raw";
import { loadPosterFonts } from "./fonts";
import { layoutPoster } from "./layout";
import type { PosterTheme } from "./models";
import "./posters.css";

// Inlined so the capture never has to fetch the mark.
const CLOCK_MARK = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clockSvg)}`;

interface FrameProps {
  theme: PosterTheme;
  label: string;
  children: ReactNode;
}

/**
 * The 540×720 poster root. Lays itself out after every render and again once the poster fonts are in;
 * the forwarded ref is the node `renderPosterPng` captures.
 */
export const PosterFrame = forwardRef<HTMLDivElement, FrameProps>(function PosterFrame({ theme, label, children }, ref) {
  const node = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => node.current as HTMLDivElement);

  useLayoutEffect(() => {
    let current = true;
    if (node.current) layoutPoster(node.current);
    void loadPosterFonts().then(() => {
      if (current && node.current) layoutPoster(node.current);
    });
    return () => {
      current = false;
    };
  });

  return (
    <div ref={node} className={`gst-poster is-${theme}`} role="img" aria-label={label} lang="zh-CN">
      {children}
    </div>
  );
});

interface AbsProps {
  /** Left edge, right edge or centre x (one of them). */
  x?: number;
  right?: number;
  cx?: number;
  /** Top, baseline, centre y, or the hero's figure top (one of them). */
  y?: number;
  bl?: number;
  cy?: number;
  capTop?: number;
  /** Shrink the group to at most this width. */
  fit?: number;
  /** Base font size in px. */
  size?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** An absolutely placed text group; `layoutPoster` resolves its anchors. */
export function Abs({ x, right, cx, y, bl, cy, capTop, fit, size, className, style, children }: AbsProps) {
  return (
    <div
      className={className ? `poster-abs ${className}` : "poster-abs"}
      data-x={x}
      data-right={right}
      data-cx={cx}
      data-y={y}
      data-bl={bl}
      data-cy={cy}
      data-captop={capTop}
      data-fit={fit}
      data-fs={size}
      style={size === undefined ? style : { ...style, fontSize: size }}
    >
      {children}
    </div>
  );
}

/** A software name that shrinks to 0.8×, then wraps to two lines (`lines={2}`) or ellipsises. */
export function FitName({
  maxWidth,
  lines = 1,
  size,
  className,
  style,
  children,
}: {
  maxWidth: number;
  lines?: 1 | 2;
  size: number;
  className: string;
  style?: CSSProperties;
  children: string;
}) {
  return (
    <span
      className={className}
      data-maxw={maxWidth}
      data-lines={lines}
      data-fs={size}
      data-text={children}
      style={{ ...style, fontSize: size }}
    >
      {children}
    </span>
  );
}

/** The hero figure, with a little air around the decimal point. */
export function HeroNumber({ value }: { value: string }) {
  const point = value.indexOf(".");
  return (
    <span className="poster-hero">
      {point < 0 ? (
        value
      ) : (
        <>
          {value.slice(0, point)}
          <span className="poster-point">.</span>
          {value.slice(point + 1)}
        </>
      )}
    </span>
  );
}

export function Unit({ children, thin = false }: { children: string; thin?: boolean }) {
  return <span className={thin ? "poster-unit is-thin" : "poster-unit"}>{children}</span>;
}

function initial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? "A";
}

/** The software icon (a data: URL when captured), or a letter tile when there is none. */
export function PosterIcon({ src, name, left, top, size }: { src: string | null; name: string; left: number; top: number; size: number }) {
  const box: CSSProperties = { left, top, width: size, height: size };
  if (src) {
    return <img className="poster-icon" src={src} alt="" style={box} />;
  }
  return (
    <div className="poster-icon poster-tile" style={{ ...box, fontSize: Math.round(size * 0.46) }}>
      {initial(name)}
    </div>
  );
}

/** Footer: the clock mark + 全局软件计时器, centred. */
export function Signature() {
  return (
    <Abs cx={270} cy={673} className="poster-signature">
      <img src={CLOCK_MARK} alt="" />
      <span>全局软件计时器</span>
    </Abs>
  );
}
