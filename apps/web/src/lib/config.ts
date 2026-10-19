/**
 * Gateway base URL.
 * - Production / Hostinger unified: same origin (empty NEXT_PUBLIC_GATEWAY_URL)
 * - Local split mode: http://localhost:4000
 */
export function publicGatewayUrl() {
  if (process.env.NEXT_PUBLIC_GATEWAY_URL) {
    return process.env.NEXT_PUBLIC_GATEWAY_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  // Server-side (Next API routes calling gateway on same process)
  const port = process.env.PORT || "3000";
  return (
    process.env.GATEWAY_URL ||
    `http://127.0.0.1:${port}`
  ).replace(/\/$/, "");
}
