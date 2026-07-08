export function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function isBridgeRequestAuthorized(requestKey: string | string[] | undefined) {
  const apiKey = process.env.BRIDGE_API_KEY?.trim();
  if (!apiKey) return true;
  return headerValue(requestKey) === apiKey;
}
