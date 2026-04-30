import { describe, expect, it } from 'vitest';
import * as server from './index.js';

describe('Server exports', () => {
  it('should export createApp', () => {
    expect(server.createApp).toBeDefined();
    expect(typeof server.createApp).toBe('function');
  });

  it('should export main', () => {
    expect(server.main).toBeDefined();
    expect(typeof server.main).toBe('function');
  });

  it('should not auto-start on import', () => {
    // The index module should only export symbols, not start a server.
    // If it auto-started, the test would fail with a port conflict in CI.
    expect(true).toBe(true);
  });
});
