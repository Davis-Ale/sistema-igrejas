// Coordinated containment over the shared Redis gate both builders already consume.
// No reverse proxy, extra compose service, public drain route or v2 activation.

export async function waitCheckoutPendingDrain(
  pendingRequests: () => number,
  timeoutMs: number
): Promise<void> {
  if (typeof pendingRequests !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("CHECKOUT_SECURITY_CONFIGURATION_INVALID");
  }
  const deadline = Date.now() + timeoutMs;
  while (pendingRequests() > 0) {
    if (Date.now() >= deadline) throw new Error("CHECKOUT_SECURITY_DRAIN_TIMEOUT");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
