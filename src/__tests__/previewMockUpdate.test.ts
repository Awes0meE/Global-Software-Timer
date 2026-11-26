import { afterEach, describe, expect, it } from "vitest";
import type { UpdateInfo, UpdateProgress } from "../api";
import { Channel, invoke } from "../../scripts/ui-preview/tauri-core";

function withQuery(query: string) {
  window.history.replaceState(null, "", `/${query}`);
}

// The browser preview's answers to the v0.4.6 检查更新 commands; nothing goes online.
describe("preview mock update", () => {
  afterEach(() => {
    withQuery("");
  });

  it("finds nothing by default, V0.4.7 with ?update=found and fails with ?update=offline", async () => {
    await expect(invoke("check_for_update")).resolves.toBeNull();
    withQuery("?update=found");
    await expect(invoke<UpdateInfo>("check_for_update")).resolves.toEqual({
      version: "0.4.7",
      current_version: "0.4.6",
      size_bytes: Math.round(6.3 * 1024 * 1024),
    });
    withQuery("?update=offline");
    await expect(invoke("check_for_update")).rejects.toBe("update_check_failed");
  });

  it("streams progress to the whole installer, then resolves", async () => {
    const progress: UpdateProgress[] = [];
    const channel = new Channel<UpdateProgress>((message) => progress.push(message));
    await expect(invoke("install_update", { onProgress: channel })).resolves.toBeUndefined();
    const total = Math.round(6.3 * 1024 * 1024);
    expect(progress.length).toBeGreaterThan(2);
    expect(progress.every((step) => step.total === total)).toBe(true);
    expect(progress[progress.length - 1].downloaded).toBe(total);
  });

  it("stops with update_cancelled when cancelled", async () => {
    const channel = new Channel<UpdateProgress>();
    const install = invoke("install_update", { onProgress: channel });
    await invoke("cancel_update");
    await expect(install).rejects.toBe("update_cancelled");
  });
});
