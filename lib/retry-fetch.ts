/**
 * Enhanced fetch utility with retry logic and error handling for production
 */

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  timeout?: number;
  retryCondition?: (error: Error, response?: Response) => boolean;
}

interface FetchWithRetryOptions extends RetryOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  timeout: 30000,
  retryCondition: (error: Error, response?: Response) => {
    // Retry on network errors or 5xx status codes
    if (!response) return true;
    return response.status >= 500 || response.status === 429;
  },
};

/**
 * Sleep utility for delays
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay
 */
const calculateDelay = (
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  backoffFactor: number
): number => {
  const delay = baseDelay * Math.pow(backoffFactor, attempt);
  return Math.min(delay, maxDelay);
};

/**
 * Enhanced fetch with retry logic and timeout
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries,
    baseDelay,
    maxDelay,
    backoffFactor,
    timeout,
    retryCondition,
    method = "GET",
    headers = {},
    body,
    ...fetchOptions
  } = { ...DEFAULT_RETRY_OPTIONS, ...options };

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Declare timeoutId outside try block so it's accessible in catch
    let timeoutId: NodeJS.Timeout | null = null;

    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeout);

      const fetchPromise = fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        ...fetchOptions,
      });

      const response = await fetchPromise;
      if (timeoutId) clearTimeout(timeoutId);

      // If response is ok, return it
      if (response.ok) {
        return response;
      }

      // Store response for potential retry decision
      lastResponse = response;
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

      // Check if we should retry
      if (attempt < maxRetries && retryCondition(lastError, response)) {
        const delay = calculateDelay(
          attempt,
          baseDelay,
          maxDelay,
          backoffFactor
        );
        console.warn(
          `Request failed (attempt ${attempt + 1}/${
            maxRetries + 1
          }). Retrying in ${delay}ms...`,
          {
            url,
            status: response.status,
            statusText: response.statusText,
          }
        );
        await sleep(delay);
        continue;
      }

      // If we shouldn't retry or max retries reached, throw error
      throw lastError;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      // Handle timeout errors
      if (lastError.name === "AbortError") {
        lastError = new Error(`Request timeout after ${timeout}ms`);
      }

      // Check if we should retry
      if (
        attempt < maxRetries &&
        retryCondition(lastError, lastResponse || undefined)
      ) {
        const delay = calculateDelay(
          attempt,
          baseDelay,
          maxDelay,
          backoffFactor
        );
        console.warn(
          `Request failed (attempt ${attempt + 1}/${
            maxRetries + 1
          }). Retrying in ${delay}ms...`,
          {
            url,
            error: lastError.message,
          }
        );
        await sleep(delay);
        continue;
      }

      // If we shouldn't retry or max retries reached, throw error
      throw lastError;
    }
  }

  // This should never be reached, but just in case
  throw lastError || new Error("Unknown error occurred");
}

/**
 * Convenience method for JSON requests
 */
export async function fetchJsonWithRetry<T = any>(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<T> {
  const response = await fetchWithRetry(url, options);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error("Response is not JSON");
  }

  return response.json();
}

/**
 * Specialized retry for Supabase operations
 */
export async function supabaseRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const {
    maxRetries = 2,
    baseDelay = 500,
    maxDelay = 5000,
    backoffFactor = 2,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on authentication errors
      if (
        lastError.message.includes("auth") ||
        lastError.message.includes("unauthorized")
      ) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delay = calculateDelay(
          attempt,
          baseDelay,
          maxDelay,
          backoffFactor
        );
        console.warn(
          `Supabase operation failed (attempt ${attempt + 1}/${
            maxRetries + 1
          }). Retrying in ${delay}ms...`,
          {
            error: lastError.message,
          }
        );
        await sleep(delay);
        continue;
      }

      throw lastError;
    }
  }

  throw lastError || new Error("Unknown error occurred");
}
