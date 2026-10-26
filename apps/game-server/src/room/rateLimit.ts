/** 簡單的 token bucket，防止單一連線洗訊息 */
export class TokenBucket {
  private tokens: number;
  private last = 0;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
  }

  take(now: number): boolean {
    if (this.last === 0) this.last = now;
    const elapsed = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
