import { useCallback, useEffect, useRef, useState } from "react";
import {
  addFocusedSoftwareIdentities,
  addHiddenSoftwareIdentities,
  getSoftwarePageSummary,
  removeFocusedSoftwareIdentity,
  removeHiddenSoftwareIdentity,
  type DurationFormat,
  type SoftwarePageSummary,
} from "../api";
import { AddSoftwareDialog, type AddTarget } from "./AddSoftwareDialog";
import {
  DiscoveredSoftwarePanel,
  FocusedSoftwarePanel,
  HiddenSoftwarePanel,
} from "./SoftwarePanels";

const emptySoftwareSummary: SoftwarePageSummary = {
  focused: [],
  hidden: [],
  discovered: [],
};

interface SoftwarePageProps {
  durationFormat?: DurationFormat;
  onDefaultSummariesChanged: () => void;
}

export function SoftwarePage({
  durationFormat = "decimal_hours",
  onDefaultSummariesChanged,
}: SoftwarePageProps) {
  const [summary, setSummary] = useState<SoftwarePageSummary>(emptySoftwareSummary);
  const [fetchError, setFetchError] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const [focusedEditing, setFocusedEditing] = useState(false);
  const [hiddenEditing, setHiddenEditing] = useState(false);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const addOpenerRef = useRef<HTMLButtonElement | null>(null);

  const refreshSummary = useCallback(async (): Promise<boolean> => {
    try {
      const nextSummary = await getSoftwarePageSummary();
      setSummary(nextSummary);
      setFetchError(false);
      return true;
    } catch {
      setFetchError(true);
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    getSoftwarePageSummary()
      .then((nextSummary) => {
        if (!cancelled) {
          setSummary(nextSummary);
          setFetchError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleFocusedRemove = async (identityKey: string) => {
    setRemoveError(false);

    try {
      await removeFocusedSoftwareIdentity(identityKey);
      void refreshSummary();
    } catch {
      setRemoveError(true);
    }
  };

  const handleHiddenRemove = async (identityKey: string) => {
    setRemoveError(false);

    try {
      await removeHiddenSoftwareIdentity(identityKey);
      onDefaultSummariesChanged();
      void refreshSummary();
    } catch {
      setRemoveError(true);
    }
  };

  const handleFocusedAdd = (opener: HTMLButtonElement) => {
    addOpenerRef.current = opener;
    setFocusedEditing(false);
    setAddTarget("focused");
  };

  const handleHiddenAdd = (opener: HTMLButtonElement) => {
    addOpenerRef.current = opener;
    setHiddenEditing(false);
    setAddTarget("hidden");
  };

  const handleAddClose = () => {
    const opener = addOpenerRef.current;
    setAddTarget(null);

    window.setTimeout(() => {
      if (opener && document.contains(opener)) {
        opener.focus();
      }
    }, 0);

    addOpenerRef.current = null;
  };

  const handleAddSubmit = async (identityKeys: string[]) => {
    const target = addTarget;

    if (!target) {
      return;
    }

    setRemoveError(false);

    if (target === "focused") {
      await addFocusedSoftwareIdentities(identityKeys);
    } else {
      await addHiddenSoftwareIdentities(identityKeys);
      onDefaultSummariesChanged();
    }

    await refreshSummary();
  };

  return (
    <main className="software-page" id="software-content">
      {fetchError ? <div className="warning">无法读取软件列表</div> : null}
      {removeError ? <div className="warning">移出软件失败</div> : null}

      <div className="software-layout">
        <div className="software-managed-column">
          <FocusedSoftwarePanel
            rows={summary.focused}
            durationFormat={durationFormat}
            editing={focusedEditing}
            onAdd={handleFocusedAdd}
            onEditToggle={() => setFocusedEditing((current) => !current)}
            onRemove={(identityKey) => void handleFocusedRemove(identityKey)}
          />
          <HiddenSoftwarePanel
            rows={summary.hidden}
            durationFormat={durationFormat}
            editing={hiddenEditing}
            onAdd={handleHiddenAdd}
            onEditToggle={() => setHiddenEditing((current) => !current)}
            onRemove={(identityKey) => void handleHiddenRemove(identityKey)}
          />
        </div>
        <DiscoveredSoftwarePanel rows={summary.discovered} />
      </div>

      {addTarget ? (
        <AddSoftwareDialog
          rows={summary.discovered}
          target={addTarget}
          onClose={handleAddClose}
          onSubmit={handleAddSubmit}
        />
      ) : null}
    </main>
  );
}
