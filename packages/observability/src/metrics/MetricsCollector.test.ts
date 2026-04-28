import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector } from './MetricsCollector.js';

describe('MetricsCollector', () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector();
    metrics.reset();
  });

  it('should record exact hits', () => {
    metrics.recordHit('exact');
    const counters = metrics.getCounters();
    expect(counters.cache_hits_total_exact).toBe(1);
    expect(counters.cache_requests_total).toBe(1);
  });

  it('should record semantic hits', () => {
    metrics.recordHit('semantic');
    const counters = metrics.getCounters();
    expect(counters.cache_hits_total_semantic).toBe(1);
  });

  it('should record misses', () => {
    metrics.recordMiss();
    const counters = metrics.getCounters();
    expect(counters.cache_misses_total).toBe(1);
  });

  it('should record latency', () => {
    metrics.recordLatency('get', 42);
    const histograms = metrics.getHistograms();
    expect(histograms.cache_latency_ms_get).toContain(42);
  });

  it('should record savings', () => {
    metrics.recordSavings(1.5);
    const counters = metrics.getCounters();
    expect(counters.cache_cost_savings_total).toBe(1.5);
  });

  it('should record semantic hit quality', () => {
    metrics.recordSemanticHitQuality(true, 'qa');
    const counters = metrics.getCounters();
    expect(counters.semantic_hit_quality_accepted_qa).toBe(1);
  });

  it('should reset all metrics', () => {
    metrics.recordHit('exact');
    metrics.recordMiss();
    metrics.reset();
    const counters = metrics.getCounters();
    expect(Object.keys(counters)).toHaveLength(0);
  });

  it('should not record when disabled', () => {
    const disabled = new MetricsCollector({ enabled: false });
    disabled.recordHit('exact');
    const counters = disabled.getCounters();
    expect(Object.keys(counters)).toHaveLength(0);
  });

  it('should bucket label values once cardinality cap is reached', () => {
    const capped = new MetricsCollector({ maxLabelCardinality: 2 });
    capped.recordError('op', 'a');
    capped.recordError('op', 'b');
    capped.recordError('op', 'c');
    const counters = capped.getCounters();
    expect(counters.cache_errors_total_op_a).toBe(1);
    expect(counters.cache_errors_total_op_b).toBe(1);
    expect(counters.cache_errors_total_op_other).toBe(1);
  });

  it('should cap histogram sample count', () => {
    const capped = new MetricsCollector({ maxHistogramSamples: 3 });
    for (let i = 0; i < 10; i++) capped.recordLatency('get', i);
    expect(capped.getHistograms().cache_latency_ms_get).toEqual([7, 8, 9]);
  });

  it('should sanitize unsafe label characters', () => {
    metrics.recordError('/cache/get', 'TypeError');
    const counters = metrics.getCounters();
    expect(counters.cache_errors_total_other_TypeError).toBe(1);
  });

  it('should render Prometheus text exposition', () => {
    metrics.recordHit('exact');
    metrics.recordLatency('get', 10);
    metrics.recordLatency('get', 20);
    const text = metrics.toPrometheus();
    expect(text).toContain('# TYPE cache_hits_total_exact counter');
    expect(text).toContain('cache_hits_total_exact 1');
    expect(text).toContain('# TYPE cache_latency_ms_get summary');
    expect(text).toContain('cache_latency_ms_get_count 2');
    expect(text).toContain('cache_latency_ms_get_sum 30');
  });
});
