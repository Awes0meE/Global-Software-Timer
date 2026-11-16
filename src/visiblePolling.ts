/** Poll only while visible, without queuing requests behind a slow read. */
export function startVisiblePolling(refresh: () => Promise<unknown>, intervalMs: number): () => void {
  let stopped = false;
  let inFlight = false;
  let timer: number | undefined;

  const poll = async () => {
    if (stopped || document.hidden || inFlight) return;
    inFlight = true;
    try {
      await refresh();
    } finally {
      inFlight = false;
    }
  };
  const update = () => {
    window.clearInterval(timer);
    timer = undefined;
    if (!document.hidden) {
      void poll();
      timer = window.setInterval(() => void poll(), intervalMs);
    }
  };
  document.addEventListener("visibilitychange", update);
  update();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", update);
  };
}
