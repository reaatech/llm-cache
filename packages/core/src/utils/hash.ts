import { createHash } from 'node:crypto';
import type { ToolDefinition } from '../types/index.js';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function buildPromptHash(prompt: string): string {
  return sha256(prompt);
}

/**
 * Build a deterministic fingerprint of the generation config so two calls with
 * different sampling settings never share a cache entry.
 *
 * Defaults applied to omitted fields (so callers that don't pass them all bucket
 * together):
 *   - temperature: 1
 *   - topP: 1
 *   - systemPrompt: '' (empty)
 *   - responseFormat: 'text'
 *   - tools: '' (no tools)
 *   - maxTokens: undefined (omitted from canonical form)
 *
 * If your provider's default differs from these (some Bedrock/Vertex SKUs default
 * temperature to 0.7), pass the value explicitly to keep cache keys aligned.
 */
export function buildCacheFingerprint(options: {
  model: string;
  modelVersion: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
  responseFormat?: string;
}): string {
  const canonical = JSON.stringify({
    model: options.model,
    modelVersion: options.modelVersion,
    temperature: options.temperature ?? 1,
    topP: options.topP ?? 1,
    maxTokens: options.maxTokens,
    systemPrompt: options.systemPrompt ?? '',
    toolsHash: options.tools ? sha256(JSON.stringify(options.tools)) : '',
    responseFormat: options.responseFormat ?? 'text',
  });
  return sha256(canonical);
}

export function buildExactMatchKey(
  promptHash: string,
  useCase: string,
  generationConfigHash: string,
): string {
  // Hash the useCase to neutralize delimiter collisions and any user-supplied special chars.
  const safeUseCase = sha256(useCase).slice(0, 16);
  return `${safeUseCase}:${generationConfigHash}:${promptHash}`;
}
