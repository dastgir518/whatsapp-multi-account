import { getTokenFromCookies } from "./auth";
import { publicGatewayUrl } from "./config";

const gatewayUrl = () =>
  process.env.GATEWAY_URL || publicGatewayUrl();

export async function gatewayFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getTokenFromCookies();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${gatewayUrl()}${path}`, { ...init, headers });
}

export { publicGatewayUrl };
