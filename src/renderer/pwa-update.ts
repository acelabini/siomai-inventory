// Run only once, at page startup. A worker found later must wait for the next
// operator-initiated reload so an active sale or stock form is never discarded.
export async function activatePendingShell(serviceWorkers: ServiceWorkerContainer, reload: () => void, signal?: AbortSignal): Promise<boolean> {
  const registration = await serviceWorkers.getRegistration();
  if (signal?.aborted || !registration?.waiting) return false;
  const waiting = registration.waiting;
  return new Promise<boolean>((resolve, reject) => {
    function cleanup() {
      serviceWorkers.removeEventListener('controllerchange', onControl);
      signal?.removeEventListener('abort', onAbort);
    }
    function onAbort() { cleanup(); resolve(false); }
    function onControl() {
      cleanup();
      try { reload(); resolve(true); } catch (cause) { reject(cause); }
    }
    serviceWorkers.addEventListener('controllerchange', onControl, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    try { waiting.postMessage({ type: 'SKIP_WAITING' }); }
    catch (cause) { cleanup(); reject(cause); }
  });
}

// Interactive UI starts only after this decision, or after every reload callback
// has been disarmed. A stalled browser API must not block the ledger indefinitely.
export async function bootstrapWebRenderer(serviceWorkers: ServiceWorkerContainer, render: () => void, reload: () => void): Promise<void> {
  const startup = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    deadline = setTimeout(() => { startup.abort(); resolve(false); }, 5000);
  });
  let reloading = false;
  try {
    reloading = await Promise.race([activatePendingShell(serviceWorkers, reload, startup.signal), timedOut]);
  } catch { /* An update failure keeps the current shell usable. */ }
  finally {
    clearTimeout(deadline);
    startup.abort();
  }
  if (!reloading) render();
}
