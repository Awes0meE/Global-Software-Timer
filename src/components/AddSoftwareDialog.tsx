import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { X } from "lucide-react";
import type { SoftwareMark, SoftwarePageRow } from "../api";
import { formatLastOpenedAt, highlightDisplayName, rankSoftwareRows } from "../softwareSearch";
import { SoftwareIcon } from "./SoftwareIcon";

export type AddTarget = "focused" | "hidden";

interface Props {
  rows: SoftwarePageRow[];
  target: AddTarget;
  onClose: () => void;
  onSubmit: (identityKeys: string[]) => Promise<void>;
}

const hiddenConflictMessage = "该软件已加入隐藏列表哦！请先移出再尝试";
const focusedConflictMessage = "该软件已加入特别关注哦！请先移出再尝试";

export function AddSoftwareDialog({ rows, target, onClose, onSubmit }: Props) {
  const [query, setQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const title = target === "focused" ? "添加特别关注" : "添加隐藏软件";
  const rankedRows = useMemo(() => rankSoftwareRows(rows, query), [rows, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, submitting]);

  useEffect(() => {
    setSelectedKeys((currentKeys) =>
      currentKeys.filter((key) => {
        const row = rows.find((item) => item.identity_key === key);
        return row ? getConflictMessage(row) === null : false;
      }),
    );
  }, [rows, target]);

  const handleRowClick = (row: SoftwarePageRow) => {
    if (submitting) {
      return;
    }

    const conflictMessage = getConflictMessage(row);

    if (conflictMessage) {
      setMessage(conflictMessage);
      return;
    }

    setMessage(null);
    setSelectedKeys((currentKeys) =>
      currentKeys.includes(row.identity_key)
        ? currentKeys.filter((key) => key !== row.identity_key)
        : [...currentKeys, row.identity_key],
    );
  };

  const handleSubmit = async () => {
    if (selectedKeys.length === 0 || submitting) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await onSubmit(selectedKeys);
      onClose();
    } catch {
      setMessage("添加失败，请重试。");
      setSubmitting(false);
    }
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = getFocusableElements(dialogRef.current);

    if (focusableElements.length === 0) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey) {
      if (activeElement === firstElement || !dialogRef.current?.contains(activeElement)) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div className="modal-backdrop add-software-backdrop">
      <section
        ref={dialogRef}
        className="add-software-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-software-title"
        onKeyDown={handleDialogKeyDown}
      >
        <div className="add-software-head">
          <h2 id="add-software-title">{title}</h2>
          <button
            className="add-software-close"
            type="button"
            aria-label="关闭"
            disabled={submitting}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="add-software-search-wrap">
          <input
            ref={inputRef}
            className="add-software-search"
            type="search"
            aria-label="搜索已发现软件"
            placeholder="搜索已发现软件"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="add-software-results" aria-label="可添加软件">
          {rankedRows.map((row) => {
            const selected = selectedKeys.includes(row.identity_key);
            const conflictMessage = getConflictMessage(row);

            return (
              <AddSoftwareRow
                key={row.identity_key}
                row={row}
                query={query}
                selected={selected}
                disabled={Boolean(conflictMessage) || submitting}
                onClick={() => handleRowClick(row)}
              />
            );
          })}
        </div>

        <div className="add-software-footer">
          {message ? (
            <p className="dialog-error add-software-message" role="alert">
              {message}
            </p>
          ) : (
            <span aria-hidden="true" />
          )}
          <div className="add-software-actions">
            <button
              className="dialog-secondary"
              type="button"
              disabled={submitting}
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="dialog-primary"
              type="button"
              disabled={selectedKeys.length === 0 || submitting}
              onClick={() => void handleSubmit()}
            >
              {selectedKeys.length === 0 ? "添加" : `添加 ${selectedKeys.length} 个`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function AddSoftwareRow({
  row,
  query,
  selected,
  disabled,
  onClick,
}: {
  row: SoftwarePageRow;
  query: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const segments = highlightDisplayName(row.display_name, query);

  return (
    <button
      className={`add-software-row${selected ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}
      type="button"
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={onClick}
    >
      <SoftwareIcon app={row} size="sm" />
      <span className="add-software-copy">
        <strong>
          {segments.map((segment, index) =>
            segment.highlighted ? (
              <mark key={`${segment.text}-${index}`}>{segment.text}</mark>
            ) : (
              <span key={`${segment.text}-${index}`}>{segment.text}</span>
            ),
          )}
        </strong>
        <small>{row.process_name}</small>
      </span>
      <SoftwareMarkBadge mark={row.mark} />
      <span className="add-software-last-opened">{formatLastOpenedAt(row.last_opened_at)}</span>
    </button>
  );
}

function SoftwareMarkBadge({ mark }: { mark: SoftwareMark }) {
  if (mark === "focused") {
    return <span className="software-mark software-mark-focused">特别关注</span>;
  }

  if (mark === "hidden") {
    return <span className="software-mark software-mark-hidden">已隐藏</span>;
  }

  return <span aria-hidden="true" />;
}

function getFocusableElements(dialog: HTMLElement | null): HTMLElement[] {
  if (!dialog) {
    return [];
  }

  const selector = [
    "a[href]",
    "button:not(:disabled)",
    "input:not(:disabled)",
    "select:not(:disabled)",
    "textarea:not(:disabled)",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true",
  );
}

function getConflictMessage(row: SoftwarePageRow): string | null {
  if (row.mark === "hidden") {
    return hiddenConflictMessage;
  }

  if (row.mark === "focused") {
    return focusedConflictMessage;
  }

  return null;
}
