import { getVlmExtractUrl } from './apiClient';

const VLM_TIMEOUT_MS = 60000;

export interface VlmExtractRequest {
  document: {
    fileName: string;
    mimeType: string;
    pages: string[];
  };
}

export interface VlmField {
  label: string;
  value: string;
  source: string;
  sensitive: boolean;
}

export interface VlmExtractResponse {
  fields: VlmField[];
}

export interface VlmExtractResult {
  success: boolean;
  fields: VlmField[];
  error?: string;
}

export async function extractFields(
  payload: VlmExtractRequest
): Promise<VlmExtractResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VLM_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(getVlmExtractUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return {
        success: false,
        fields: [],
        error: `VLM HTTP ${response.status}`,
      };
    }

    const data: VlmExtractResponse = await response.json();
    if (!Array.isArray(data.fields)) {
      return { success: false, fields: [], error: 'VLM response missing fields array' };
    }

    return { success: true, fields: data.fields };
  } catch (error) {
    return {
      success: false,
      fields: [],
      error: error instanceof Error ? error.message : 'VLM extraction failed',
    };
  }
}
