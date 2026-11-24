import { describe, expect, it, vi } from "vitest";
import { saveBinaryExport } from "../api";
import { invoke } from "../../scripts/ui-preview/tauri-core";

vi.mock("@tauri-apps/api/core", () => import("../../scripts/ui-preview/tauri-core"));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

// The browser preview's save_binary_export: checks like the app, never touches the disk.
describe("preview mock PNG save", () => {
  it("resolves to a fake Downloads path named by the decoded header", async () => {
    await expect(saveBinaryExport(PNG, "GST-成就-VS Code-2026-11-20.png")).resolves.toBe(
      "C:\\Users\\demo\\Downloads\\GST-成就-VS Code-2026-11-20.png",
    );
    await expect(saveBinaryExport(PNG, "GST-日报-2026-11-25")).resolves.toBe(
      "C:\\Users\\demo\\Downloads\\GST-日报-2026-11-25.png",
    );
  });

  it("rejects a non-raw body, a bad name header and non-PNG bytes with the app's codes", async () => {
    await expect(invoke("save_binary_export", { bytes: [1] }, { headers: { "x-gst-file-name": "a.png" } })).rejects.toBe(
      "export_invalid_request",
    );
    await expect(invoke("save_binary_export", PNG)).rejects.toBe("export_invalid_request");
    await expect(invoke("save_binary_export", PNG, { headers: { "x-gst-file-name": "%E6%88" } })).rejects.toBe(
      "export_invalid_request",
    );
    await expect(saveBinaryExport(new Uint8Array([1, 2, 3]), "a.png")).rejects.toBe("export_not_png");
  });

  it("rejects a body one byte over 32 MiB as export_too_large", async () => {
    const tooLarge = new Uint8Array(32 * 1024 * 1024 + 1);
    tooLarge.set(PNG);
    await expect(saveBinaryExport(tooLarge, "a.png")).rejects.toBe("export_too_large");
  });
});
