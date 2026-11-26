import { useCallback } from "react";
import { openFeedbackLink, type FeedbackLink } from "./api";
import type { ToastMessage } from "./components/Toast";

type ShowToast = (message: string, extra?: Omit<ToastMessage, "id" | "message">) => void;

/** The QQ group 「GST功能交流群」 for users without a GitHub account (README 反馈与交流); Rust holds its invite link. */
export const QQ_GROUP = "937943526";

/**
 * 设置 → 关于与反馈 (v0.4.6): the GitHub pages open in the default browser (GST itself does not connect),
 * and the QQ group number is copied to the clipboard.
 */
export function useFeedbackActions(showToast: ShowToast) {
  const open = useCallback(
    (link: FeedbackLink) => {
      void openFeedbackLink(link).catch(() => showToast("无法打开浏览器", { tone: "error" }));
    },
    [showToast],
  );

  const copyQqGroup = useCallback(() => {
    const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
    if (!clipboard) {
      showToast("无法复制群号", { tone: "error" });
      return;
    }
    clipboard.writeText(QQ_GROUP).then(
      () => showToast("已复制群号"),
      () => showToast("无法复制群号", { tone: "error" }),
    );
  }, [showToast]);

  return { open, copyQqGroup };
}
