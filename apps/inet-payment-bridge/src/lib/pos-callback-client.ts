type ForwardResult = {
  skipped: boolean;
  statusCode?: number;
  body?: unknown;
  reason?: string;
};

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export async function forwardInetCallbackToPos(rawBody: string): Promise<ForwardResult> {
  const callbackUrl = env("POS_INET_CALLBACK_URL");
  if (!callbackUrl) {
    return { skipped: true, reason: "pos_callback_not_configured" };
  }

  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: rawBody
  });
  const text = await response.text();
  let body: unknown = text;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text.slice(0, 500);
    }
  }
  if (!response.ok) {
    throw new Error(`pos_callback_forward_failed:${response.status}`);
  }
  return {
    skipped: false,
    statusCode: response.status,
    body
  };
}
