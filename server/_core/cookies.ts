import type { CookieOptions } from "express";
import type { Request } from "express";

export function getSessionCookieOptions(req: Request): CookieOptions {
  const isSecure =
    req.secure ||
    req.protocol === "https" ||
    req.headers?.["x-forwarded-proto"] === "https";

  const isCrossSite = Boolean(
    req.headers.origin &&
    req.headers.host &&
    !req.headers.origin.includes(req.headers.host)
  );

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isCrossSite && isSecure ? "none" : "lax",
    path: "/",
  };
}
