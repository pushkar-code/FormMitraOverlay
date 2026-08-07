const API_BASE_URL = 'https://api.formmitra.example.com';
const LLM_CAPTURE_URL = 'https://llm.formmitra.example.com/v1/capture';
const VLM_EXTRACT_URL = 'https://vlm.formmitra.example.com/v1/extract';
const API_TIMEOUT_MS = 30000;

export interface SubmissionPayload {
  blobId: string;
  fields: Array<{ label: string; value: string; source: string; sensitive: boolean }>;
}

export interface SubmissionResult {
  success: boolean;
  error?: string;
  submittedIds: string[];
  serverResponse?: any;
}

export interface ApiConfig {
  baseUrl: string;
  timeoutMs: number;
  headers: Record<string, string>;
}

const defaultConfig: ApiConfig = {
  baseUrl: API_BASE_URL,
  timeoutMs: API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Version': '1.0.0',
    'X-Payload-Encryption': 'aes-256-gcm',
  },
};

let currentConfig = { ...defaultConfig };

export function configureApi(config: Partial<ApiConfig>): void {
  currentConfig = { ...currentConfig, ...config };
}

export function getApiConfig(): ApiConfig {
  return { ...currentConfig };
}

export function getLlmCaptureUrl(): string {
  return LLM_CAPTURE_URL;
}

export function getVlmExtractUrl(): string {
  return VLM_EXTRACT_URL;
}

export async function submitPayload(
  payloads: SubmissionPayload[]
): Promise<SubmissionResult> {
  const submittedIds: string[] = [];

  try {
    const response = await fetchWithTimeout(
      `${currentConfig.baseUrl}/v1/submissions/batch`,
      {
        method: 'POST',
        headers: currentConfig.headers,
        body: JSON.stringify({
          payloads: payloads.map((p) => ({
            id: p.blobId,
            data: p.fields,
            encrypted: false,
            clientTimestamp: Date.now(),
          })),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const serverResponse = await response.json();
    submittedIds.push(...payloads.map((p) => p.blobId));

    return {
      success: true,
      submittedIds,
      serverResponse,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network submission failed',
      submittedIds,
    };
  }
}

export async function submitSingle(
  payload: SubmissionPayload
): Promise<SubmissionResult> {
  return submitPayload([payload]);
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${currentConfig.baseUrl}/health`,
      { method: 'GET', headers: currentConfig.headers }
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), currentConfig.timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
