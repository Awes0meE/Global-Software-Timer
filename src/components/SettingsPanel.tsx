import { useEffect, useState } from "react";
import {
  getAutostartEnabled,
  hideAppGroup,
  renameAppGroup,
  setAutostartEnabled,
  unhideAppGroup,
  type AppUsageRow,
} from "../api";

interface Props {
  hiddenApps: AppUsageRow[];
  onChanged: () => Promise<void>;
  visibleApps: AppUsageRow[];
}

const startupLoadError = "无法读取启动设置";
const settingsSaveError = "设置未保存";
const emptyNameError = "名称不能为空";

export function SettingsPanel({ hiddenApps, onChanged, visibleApps }: Props) {
  const [autostartEnabled, setAutostartEnabledState] = useState(false);
  const [draftNames, setDraftNames] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busyAppId, setBusyAppId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    getAutostartEnabled()
      .then((enabled) => {
        if (!cancelled) {
          setAutostartEnabledState(enabled);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMessage(startupLoadError);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDraftNames(
      Object.fromEntries(visibleApps.map((app) => [app.app_id, app.display_name])),
    );
  }, [visibleApps]);

  async function toggleAutostart(nextEnabled: boolean) {
    setMessage(null);
    try {
      await setAutostartEnabled(nextEnabled);
      setAutostartEnabledState(nextEnabled);
    } catch {
      setMessage(settingsSaveError);
    }
  }

  async function runAppAction(appId: number, action: () => Promise<void>) {
    setMessage(null);
    setBusyAppId(appId);
    try {
      await action();
      await onChanged();
    } catch {
      setMessage(settingsSaveError);
    } finally {
      setBusyAppId(null);
    }
  }

  async function saveName(app: AppUsageRow) {
    const nextName = (draftNames[app.app_id] ?? "").trim();
    if (nextName.length === 0) {
      setMessage(emptyNameError);
      return;
    }

    await runAppAction(app.app_id, () => renameAppGroup(app.app_id, nextName));
  }

  return (
    <section className="settings-panel" aria-label="设置">
      <div className="settings-heading">
        <h2>设置</h2>
        <label className="toggle-row">
          <input
            aria-label="开机自动启动"
            checked={autostartEnabled}
            onChange={(event) => void toggleAutostart(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>开机自动启动</span>
        </label>
      </div>

      {message ? <div className="settings-warning">{message}</div> : null}

      <div className="settings-columns">
        <div className="settings-group">
          <h3>显示的软件</h3>
          {visibleApps.length === 0 ? (
            <p className="muted compact-copy">暂无可管理的软件。</p>
          ) : (
            visibleApps.map((app) => (
              <div className="settings-row" key={app.app_id}>
                <div className="settings-app-name">
                  <strong>{app.display_name}</strong>
                  <small>{app.process_name}</small>
                </div>
                <input
                  aria-label={`重命名 ${app.display_name}`}
                  onChange={(event) => {
                    const nextValue = event.currentTarget.value;
                    setDraftNames((current) => ({
                      ...current,
                      [app.app_id]: nextValue,
                    }));
                  }}
                  value={draftNames[app.app_id] ?? app.display_name}
                />
                <button
                  aria-label={`保存 ${app.display_name} 名称`}
                  disabled={busyAppId === app.app_id}
                  onClick={() => void saveName(app)}
                  type="button"
                >
                  保存
                </button>
                <button
                  aria-label={`隐藏 ${app.display_name}`}
                  disabled={busyAppId === app.app_id}
                  onClick={() =>
                    void runAppAction(app.app_id, () => hideAppGroup(app.app_id))
                  }
                  type="button"
                >
                  隐藏
                </button>
              </div>
            ))
          )}
        </div>

        <div className="settings-group">
          <h3>隐藏的软件</h3>
          {hiddenApps.length === 0 ? (
            <p className="muted compact-copy">没有隐藏的软件。</p>
          ) : (
            hiddenApps.map((app) => (
              <div className="settings-row hidden-settings-row" key={app.app_id}>
                <div className="settings-app-name">
                  <strong>{app.display_name}</strong>
                  <small>{app.process_name}</small>
                </div>
                <button
                  aria-label={`恢复 ${app.display_name}`}
                  disabled={busyAppId === app.app_id}
                  onClick={() =>
                    void runAppAction(app.app_id, () => unhideAppGroup(app.app_id))
                  }
                  type="button"
                >
                  恢复
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
