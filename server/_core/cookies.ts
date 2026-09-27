import type { CookieOptions } from "express";
import type { Request } from "express";

export function getSessionCookieOptions(req: Request): CookieOptions {
  const isSecure =
    req.secure ||
    req.protocol === "https" ||
    req.headers?.["x-forwarded-proto"] === "https";

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? "none" : "lax",
    path: "/",
  };
}
