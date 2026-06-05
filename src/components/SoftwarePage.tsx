import { useCallback, useEffect, useState } from "react";
import {
  getSoftwarePageSummary,
  removeFocusedSoftwareIdentity,
  removeHiddenSoftwareIdentity,
  type SoftwarePageSummary,
} from "../api";
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

export function SoftwarePage() {
  const [summary, setSummary] = useState<SoftwarePageSummary>(emptySoftwareSummary);
  const [fetchError, setFetchError] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const [focusedEditing, setFocusedEditing] = useState(false);
  const [hiddenEditing, setHiddenEditing] = useState(false);

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
      void refreshSummary();
    } catch {
      setRemoveError(true);
    }
  };

  return (
    <main className="software-page" id="software-content">
      {fetchError ? <div className="warning">无法读取软件列表</div> : null}
      {removeError ? <div className="warning">移出软件失败</div> : null}

      <div className="software-layout">
        <div className="software-managed-column">
          <FocusedSoftwarePanel
            rows={summary.focused}
            editing={focusedEditing}
            onAdd={() => setFocusedEditing(false)}
            onEditToggle={() => setFocusedEditing((current) => !current)}
            onRemove={(identityKey) => void handleFocusedRemove(identityKey)}
          />
          <HiddenSoftwarePanel
            rows={summary.hidden}
            editing={hiddenEditing}
            onAdd={() => setHiddenEditing(false)}
            onEditToggle={() => setHiddenEditing((current) => !current)}
            onRemove={(identityKey) => void handleHiddenRemove(identityKey)}
          />
        </div>
        <DiscoveredSoftwarePanel rows={summary.discovered} />
      </div>
    </main>
  );
}
