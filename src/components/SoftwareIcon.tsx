import type { AppUsageRow } from "../api";

interface Props {
  app: Pick<AppUsageRow, "display_name" | "icon_data_url">;
  size?: "sm" | "md" | "lg";
}

export function SoftwareIcon({ app, size = "md" }: Props) {
  const label = `${app.display_name} 图标`;

  return (
    <span className={`software-icon software-icon-${size}`} role="img" aria-label={label}>
      {app.icon_data_url ? (
        <img src={app.icon_data_url} alt="" aria-hidden="true" />
      ) : (
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
