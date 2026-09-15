import { POW_WORKER_SOURCE } from "./powWorkerSource";

export interface PowRequest {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  durationMs: number;
}

export interface PowProgress {
  pow: number;
  hashes: number;
  elapsedMs: number;
}

export interface PowResult {
  nonce: number;
  pow: number;
  id: string;
  hashes: number;
}

type WorkerMessage = ({ type: "progress" } & PowProgress) | ({ type: "done" } & PowResult);

/**
 * Runs the PoW worker for `req.durationMs`, calling onProgress as it goes.
 * Resolves with the best (nonce, id, pow-bits) found.
 *
 * Spawns the worker from an in-memory Blob (see powWorkerSource.ts) rather
 * than a separate emitted file, so this keeps working in a build that's
 * been flattened into one standalone .html with no sibling files.
 */
export function runPow(req: PowRequest, onProgress?: (p: PowProgress) => void): Promise<PowResult> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    let blobUrl: string;
    try {
      const blob = new Blob([POW_WORKER_SOURCE], { type: "application/javascript" });
      blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl);
    } catch (e) {
      reject(new Error(`Web Worker unavailable: ${e instanceof Error ? e.message : String(e)}`));
      return;
    }

    const cleanup = () => {
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
    };

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      if (e.data.type === "progress") {
        onProgress?.(e.data);
      } else {
        const { nonce, pow, id, hashes } = e.data;
        resolve({ nonce, pow, id, hashes });
        cleanup();
      }
    };
    worker.onerror = (e) => {
      reject(new Error(`Worker error: ${e.message || "unknown"}`));
      cleanup();
    };
    worker.postMessage(req);
  });
}
