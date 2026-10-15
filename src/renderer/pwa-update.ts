// Run only once, at page startup. A worker found later must wait for the next
// operator-initiated reload so an active sale or stock form is never discarded.
export async function activatePendingShell(serviceWorkers: ServiceWorkerContainer, reload: () => void): Promise<void> {
  const registration = await serviceWorkers.getRegistration();
  if (!registration?.waiting) return;
  serviceWorkers.addEventListener('controllerchange', reload, { once: true });
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
}
