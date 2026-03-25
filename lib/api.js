// lib/api.js — Shared Anthropic API helper with retry, backoff, and circuit breaker
import { logError, logInfo } from './errors.js';

// Circuit breaker state (module-level, per-process)
let consecutiveFailures = 0;
let circuitOpenedAt = null;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

function isCircuitOpen() {
  if (consecutiveFailures < CIRCUIT_THRESHOLD) return false;
  if (!circuitOpenedAt) return false;
  if (Date.now() - circuitOpenedAt >= CIRCUIT_COOLDOWN_MS) return false; // cooldown expired
  return true;
}

function recordSuccess() {
  if (consecutiveFailures >= CIRCUIT_THRESHOLD) {
    logInfo('api-circuit', 'Circuit closed after successful request');
  }
  consecutiveFailures = 0;
  circuitOpenedAt = null;
}

function recordFailure() {
  consecutiveFailures++;
  if (consecutiveFailures >= CIRCUIT_THRESHOLD && !circuitOpenedAt) {
    circuitOpenedAt = Date.now();
    logError('api-circuit', `Circuit opened after ${CIRCUIT_THRESHOLD} consecutive failures`);
  }
}

export function _resetCircuit() {
  consecutiveFailures = 0;
  circuitOpenedAt = null;
}

export async function callHaiku(prompt, options = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'Missing ANTHROPIC_API_KEY', retryable: false };
  }

  if (isCircuitOpen()) {
    return { ok: false, error: 'circuit-open', retryable: true };
  }

  const maxTokens = options.max_tokens || 512;
  const retryDelays = options.retryDelays || DEFAULT_RETRY_DELAYS;
  const maxAttempts = retryDelays.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }]
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.content?.[0]?.text || '';
        recordSuccess();
        return { ok: true, text };
      }

      // 401 — fail fast
      if (res.status === 401) {
        logError('api-auth', 'Invalid ANTHROPIC_API_KEY');
        recordFailure();
        return { ok: false, error: 'Invalid ANTHROPIC_API_KEY', retryable: false };
      }

      // 429 or 5xx — retryable
      if (res.status === 429 || res.status >= 500) {
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, retryDelays[attempt - 1]));
          continue;
        }
        recordFailure();
        return { ok: false, error: `API returned ${res.status} after ${maxAttempts} attempts`, retryable: true };
      }

      // Other 4xx — fail fast
      recordFailure();
      return { ok: false, error: `API returned ${res.status}`, retryable: false };

    } catch (err) {
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, retryDelays[attempt - 1]));
        continue;
      }
      recordFailure();
      return { ok: false, error: err.message, retryable: true };
    }
  }
}
