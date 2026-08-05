import {
  storeEncryptedFields,
  getPendingBlobs,
  markBlobsSubmitted,
  retrieveAndDecryptBlob,
  StoredEncryptedBlob,
} from '../storage/encryptedStore';
import { submitPayload, SubmissionResult } from '../network/apiClient';
import { clearArray } from '../utils/sanitizer';

type QueueListener = (pendingCount: number) => void;

class SecureFlushQueue {
  private queue: StoredEncryptedBlob[] = [];
  private flushing = false;
  private listeners: QueueListener[] = [];
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.queue = await getPendingBlobs();
    this.initialized = true;
  }

  async enqueue(
    fields: Array<{ label: string; value: string; source: string; sensitive: boolean }>
  ): Promise<StoredEncryptedBlob> {
    const blob = await storeEncryptedFields(fields);
    this.queue.push(blob);
    this.notifyListeners();
    return blob;
  }

  async flush(): Promise<SubmissionResult[]> {
    if (this.flushing) return [];
    this.flushing = true;

    const results: SubmissionResult[] = [];
    const pending = this.queue.filter((b) => !b.submitted);

    if (pending.length === 0) {
      this.flushing = false;
      return results;
    }

    const batches = this.chunkArray(pending, 10);

    for (const batch of batches) {
      try {
        const decryptedFields = await Promise.all(
          batch.map(async (blob) => {
            const fields = await retrieveAndDecryptBlob(blob);
            return { blobId: blob.id, fields };
          })
        );

        const result = await submitPayload(decryptedFields);
        results.push(result);

        if (result.success) {
          const ids = batch.map((b) => b.id);
          await markBlobsSubmitted(ids);
          this.queue = this.queue.map((b) =>
            ids.includes(b.id) ? { ...b, submitted: true } : b
          );
        }
      } catch (error) {
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          submittedIds: [],
        });
      }
    }

    this.flushing = false;
    this.notifyListeners();
    return results;
  }

  async flushOne(blobId: string): Promise<SubmissionResult> {
    const blob = this.queue.find((b) => b.id === blobId && !b.submitted);
    if (!blob) {
      return { success: false, error: 'Blob not found or already submitted', submittedIds: [] };
    }

    try {
      const fields = await retrieveAndDecryptBlob(blob);
      const result = await submitPayload([{ blobId: blob.id, fields }]);

      if (result.success) {
        await markBlobsSubmitted([blob.id]);
        this.queue = this.queue.map((b) =>
          b.id === blobId ? { ...b, submitted: true } : b
        );
        this.notifyListeners();
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        submittedIds: [],
      };
    }
  }

  getPendingCount(): number {
    return this.queue.filter((b) => !b.submitted).length;
  }

  getPending(): StoredEncryptedBlob[] {
    return this.queue.filter((b) => !b.submitted);
  }

  isFlushing(): boolean {
    return this.flushing;
  }

  subscribe(listener: QueueListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(): void {
    const count = this.getPendingCount();
    this.listeners.forEach((l) => l(count));
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

export const secureQueue = new SecureFlushQueue();
