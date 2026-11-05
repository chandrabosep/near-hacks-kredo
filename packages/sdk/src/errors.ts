/** Contract refusals: the user's limit, balance or the app's settings said no. Retrying won't help. */
const DECLINED = new Set([
  "OverLimit",
  "LimitExpired",
  "InsufficientBalance",
  "OverMaxCharge",
  "AppInactive",
  "OverHeld",
  "OverSpent",
  "HoldExpired",
]);

export class CreditsError extends Error {
  override name = "CreditsError";

  constructor(
    message: string,
    /** HTTP status, or 0 when the network failed before any response. */
    readonly status: number,
    /** Machine-readable code, like "OverLimit", "rate_limited" or "DailyBudgetReached". */
    readonly code: string,
    readonly txHash?: string,
  ) {
    super(message);
  }

  /** The user can't pay this: over their limit, out of credits, or the app is off. Show them the buy or connect flow. */
  get isDeclined(): boolean {
    return DECLINED.has(this.code);
  }

  /** Safe to try again later with the same ref: rate limits, gas budget pauses and network failures. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status === 502 || this.status === 503;
  }
}
