import { useState } from "react";
import type { AppUsageRow } from "../api";

interface Props {
  app: Pick<AppUsageRow, "display_name" | "icon_url">;
  size?: "sm" | "md" | "lg";
}

/** Icons already shown once, so remounting a page does not flash the initial. */
const loadedIcons = new Set<string>();

export function SoftwareIcon({ app, size = "md" }: Props) {
  const label = `${app.display_name} 图标`;
  const src = app.icon_url;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  // The backend extracts icons lazily: the initial stays until the image
  // arrives, and for good if the software has no icon (the request fails).
  const loaded = src !== null && (loadedSrc === src || loadedIcons.has(src));

  return (
    <span className={`software-icon software-icon-${size}`} role="img" aria-label={label}>
      {src && (
        <img
          key={src}
          src={src}
          decoding="async"
          alt=""
          aria-hidden="true"
          hidden={!loaded}
          onLoad={() => {
            loadedIcons.add(src);
            setLoadedSrc(src);
          }}
        />
      )}
      {!loaded && (
        <span className="default-mark" aria-hidden="true">
          {getInitial(app.display_name)}
        </span>
      )}
    </span>
  );
}

function getInitial(displayName: string): string {
  return displayName.trim().slice(0, 1).toUpperCase() || "A";
}
