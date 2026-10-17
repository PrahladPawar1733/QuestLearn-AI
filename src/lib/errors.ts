/**
 * Application errors carry a safe, student-facing message and an HTTP status.
 * Internal details (stack traces, provider errors) are logged, never returned.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly userMessage: string,
    public readonly status = 400,
    public readonly retryable = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(`${code}: ${userMessage}`);
    this.name = "AppError";
  }
}

export const Errors = {
  notFound: (what: string) => new AppError("NOT_FOUND", `We couldn't find that ${what}.`, 404),
  forbidden: () => new AppError("FORBIDDEN", "You don't have access to this.", 403),
  badRequest: (msg: string, details?: Record<string, unknown>) =>
    new AppError("BAD_REQUEST", msg, 400, false, details),
  rateLimited: (seconds: number) =>
    new AppError("RATE_LIMITED", `You're going fast! Try again in about ${seconds} seconds.`, 429, true, {
      retryAfter: seconds,
    }),
  aiUnavailable: () =>
    new AppError(
      "AI_UNAVAILABLE",
      "AI processing isn't configured on this server, so your notes can't be analyzed right now. Your upload is saved. You can still play the demo quest.",
      503,
      false,
    ),
};
