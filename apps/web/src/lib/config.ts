export function publicGatewayUrl() {
  return process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4000";
}
