import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function resolvePosSessionCookieNames() {
  const handoffName = String(process.env.POS_SESSION_COOKIE_NAME ?? "pos_session_handoff").trim() || "pos_session_handoff";
  const sessionIdName = String(process.env.POS_SESSION_ID_COOKIE_NAME ?? "pos_session_id").trim() || "pos_session_id";

  return { handoffName, sessionIdName };
}

export function proxy(request: NextRequest) {
  const { handoffName, sessionIdName } = resolvePosSessionCookieNames();
  const hasPosSession = Boolean(request.cookies.get(sessionIdName)?.value || request.cookies.get(handoffName)?.value);

  if (hasPosSession) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login/store", request.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: "/preview/pos"
};
