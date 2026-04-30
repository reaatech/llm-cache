export interface MetricsCollectorConfig {
  serviceName?: string;
  enabled?: boolean;
  /** Cap on distinct counter labels per metric family. Excess values are bucketed as "other". */
  maxLabelCardinality?: number;
  /** Cap on samples retained per histogram. Older samples are dropped. */
  maxHistogramSamples?: number;
}

const DEFAULT_MAX_LABELS = 128;
const DEFAULT_MAX_HISTOGRAM = 1024;
const SAFE_LABEL = /^[a-zA-Z0-9_]+$/;

function sanitizeLabelValue(value: string): string {
  return SAFE_LABEL.test(value) ? value : 'other';
}

export class MetricsCollector {
  private enabled: boolean;
  private maxLabels: number;
  private maxHistogram: number;
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private labelSeen = new Map<string, Set<string>>();

  constructor(config: MetricsCollectorConfig = {}) {
    this.enabled = config.enabled ?? true;
    this.maxLabels = config.maxLabelCardinality ?? DEFAULT_MAX_LABELS;
    this.maxHistogram = config.maxHistogramSamples ?? DEFAULT_MAX_HISTOGRAM;
  }

  recordHit(type: 'exact' | 'semantic'): void {
    if (!this.enabled) return;
    this.increment(`cache_hits_total_${type}`);
    this.increment('cache_requests_total');
  }

  recordMiss(): void {
    if (!this.enabled) return;
    this.increment('cache_misses_total');
    this.increment('cache_requests_total');
  }

  recordLatency(operation: string, durationMs: number): void {
    if (!this.enabled) return;
    const key = `cache_latency_ms_${sanitizeLabelValue(operation)}`;
    const arr = this.histograms.get(key) ?? [];
    arr.push(durationMs);
    if (arr.length > this.maxHistogram) {
      arr.splice(0, arr.length - this.maxHistogram);
    }
    this.histograms.set(key, arr);
  }

  recordSavings(amount: number): void {
    if (!this.enabled) return;
    this.increment('cache_cost_savings_total', amount);
  }

  recordSemanticHitQuality(accepted: boolean, useCase: string): void {
    if (!this.enabled) return;
    const safeUseCase = this.bucketLabel('semantic_hit_quality', useCase);
    this.increment(`semantic_hit_quality_${accepted ? 'accepted' : 'rejected'}_${safeUseCase}`);
  }

  recordError(operation: string, errorType: string): void {
    if (!this.enabled) return;
    const safeOp = this.bucketLabel('cache_errors_op', operation);
    const safeType = this.bucketLabel('cache_errors_type', errorType);
    this.increment(`cache_errors_total_${safeOp}_${safeType}`);
  }

  getCounters(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }

  getHistograms(): Record<string, number[]> {
    return Object.fromEntries(this.histograms);
  }

  /** Render in Prometheus text exposition format. */
  toPrometheus(): string {
    const lines: string[] = [];
    for (const [name, value] of this.counters) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }
    for (const [name, samples] of this.histograms) {
      if (samples.length === 0) continue;
      const sorted = [...samples].sort((a, b) => a - b);
      const sum = sorted.reduce((s, x) => s + x, 0);
      const p50 = quantile(sorted, 0.5);
      const p95 = quantile(sorted, 0.95);
      const p99 = quantile(sorted, 0.99);
      lines.push(`# TYPE ${name} summary`);
      lines.push(`${name}_count ${sorted.length}`);
      lines.push(`${name}_sum ${sum}`);
      lines.push(`${name}{quantile="0.5"} ${p50}`);
      lines.push(`${name}{quantile="0.95"} ${p95}`);
      lines.push(`${name}{quantile="0.99"} ${p99}`);
    }
    return `${lines.join('\n')}\n`;
  }

  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.labelSeen.clear();
  }

  private bucketLabel(family: string, value: string): string {
    const safe = sanitizeLabelValue(value || 'unknown');
    let seen = this.labelSeen.get(family);
    if (!seen) {
      seen = new Set();
      this.labelSeen.set(family, seen);
    }
    if (seen.has(safe)) return safe;
    if (seen.size >= this.maxLabels) return 'other';
    seen.add(safe);
    return safe;
  }

  private increment(key: string, amount = 1): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + amount);
  }
}

function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  const frac = pos - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}
