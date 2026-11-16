import type { Config } from "./config.ts";
import { AppError } from "./errors.ts";

/** Validate with the issuer, never trust an unsigned/decoded client claim. */
export async function loginOwner(config: Config, token: string): Promise<string> {
  if (!config.storageUrl || !config.authPublishableKey || !config.authOwnerId)
    throw new AppError("Login is not configured yet", 503);
  if (!token || token.length > 16384) throw new AppError("Sign in to Zee Spark", 401);
  let response: Response;
  try {
    response = await fetch(`${config.storageUrl}/auth/v1/user`, {
      headers: { apikey: config.authPublishableKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
  } catch {
    throw new AppError("Login service is unavailable. Try again.", 503);
  }
  if (response.status === 401 || response.status === 403)
    throw new AppError("Session expired. Sign in again.", 401);
  if (!response.ok) throw new AppError("Login service is unavailable. Try again.", 503);
  const user = (await response.json()) as { id?: string; email_confirmed_at?: string };
  if (
    !user.id ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id) ||
    !user.email_confirmed_at
  )
    throw new AppError("Verify your email before signing in", 403);
  // Explicit UUID binding preserves the existing private workspace. Neither the
  // first signup nor a caller-editable metadata/email field can claim it.
  if (user.id === config.authOwnerId) return "local-user";
  if (!config.authPublicLogin) throw new AppError("This account is not invited yet", 403);
  return `user:${user.id}`;
}
