export class RateLimit {
  private hits = new Map<string, number[]>();

  allow(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [key, hits] of this.hits) {
      if (hits.every((at) => now - at >= 60_000)) this.hits.delete(key);
      if (this.hits.size <= 4000) return;
    }
  }
}
