import type { Geometry } from "geojson";
import {
  prepareCountryLabelGeometryInput,
  prepareStableBaseGeometryInput,
  type CountryGeometryResult,
  type CountryGeometryTask,
  type CountryGeometryWorkerRequest,
  type CountryGeometryWorkerResponse,
  type CountryLabelGeometryWorkerInput,
  type StableBaseGeometryWorkerInput,
} from "./countryGeometryTasks";

type PendingJob = {
  id: number;
  task: CountryGeometryTask;
  resolve: (result: CountryGeometryResult) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort: () => void;
};

/** One reusable worker; cancelled geometry never blocks a newer map state. */
export class CountryGeometryWorkerClient {
  private worker: Worker | null = null;
  private active: PendingJob | null = null;
  private queue: PendingJob[] = [];
  private nextId = 0;
  private disposed = false;

  constructor(private readonly createWorker: () => Worker = () =>
    new Worker(new URL("./countryGeometryWorker.ts", import.meta.url), { type: "module" })) {}

  unionOwned(geometries: Geometry[], signal?: AbortSignal): Promise<Geometry | null> {
    return this.enqueue({ kind: "union-owned", geometries }, signal) as Promise<Geometry | null>;
  }

  union(geometries: Geometry[], gapTolerance?: number, signal?: AbortSignal): Promise<Geometry | null> {
    return this.enqueue({ kind: "union", geometries, gapTolerance }, signal) as Promise<Geometry | null>;
  }

  stableBase(input: StableBaseGeometryWorkerInput, signal?: AbortSignal): Promise<Geometry | null> {
    if (signal?.aborted) return Promise.reject(abortError());
    return this.enqueue({ kind: "stable-base", input: prepareStableBaseGeometryInput(input) }, signal) as Promise<Geometry | null>;
  }

  labelGeometry(input: CountryLabelGeometryWorkerInput, signal?: AbortSignal): Promise<Geometry[]> {
    if (signal?.aborted) return Promise.reject(abortError());
    return this.enqueue({ kind: "label-geometry", input: prepareCountryLabelGeometryInput(input) }, signal) as Promise<Geometry[]>;
  }

  dispose(): void {
    this.disposed = true;
    this.stopWorker();
    const pending = [...(this.active ? [this.active] : []), ...this.queue];
    this.active = null;
    this.queue = [];
    for (const job of pending) {
      this.removeAbortListener(job);
      job.reject(abortError());
    }
  }

  private enqueue(task: CountryGeometryTask, signal?: AbortSignal): Promise<CountryGeometryResult> {
    if (this.disposed || signal?.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const job: PendingJob = {
        id: ++this.nextId,
        task,
        resolve,
        reject,
        signal,
        onAbort: () => this.cancel(job),
      };
      signal?.addEventListener("abort", job.onAbort, { once: true });
      this.queue.push(job);
      this.startNext();
    });
  }

  private cancel(job: PendingJob): void {
    this.removeAbortListener(job);
    if (this.active === job) {
      // A synchronous polygon overlay cannot read an abort message. Terminate
      // it, then start remaining jobs in a fresh worker rather than queue them.
      this.stopWorker();
      this.active = null;
    } else {
      this.queue = this.queue.filter((pending) => pending !== job);
    }
    job.reject(abortError());
    this.startNext();
  }

  private startNext(): void {
    if (this.disposed || this.active || this.queue.length === 0) return;
    while (this.queue[0]?.signal?.aborted) {
      const cancelled = this.queue.shift()!;
      this.removeAbortListener(cancelled);
      cancelled.reject(abortError());
    }
    if (this.queue.length === 0) return;
    const job = this.queue.shift()!;
    this.active = job;
    try {
      if (!this.worker) {
        this.worker = this.createWorker();
        this.worker.addEventListener("message", this.handleMessage);
        this.worker.addEventListener("error", this.handleError);
        this.worker.addEventListener("messageerror", this.handleMessageError);
      }
      const request: CountryGeometryWorkerRequest = { id: job.id, task: job.task };
      this.worker.postMessage(request);
    } catch (error) {
      this.failActive(error instanceof Error ? error : new Error("Could not start country geometry work."));
    }
  }

  private handleMessage = (event: MessageEvent<CountryGeometryWorkerResponse>): void => {
    const job = this.active;
    if (!job || event.data.id !== job.id) return;
    this.active = null;
    this.removeAbortListener(job);
    if ("error" in event.data) job.reject(new Error(event.data.error));
    else job.resolve(event.data.result);
    this.startNext();
  };

  private handleError = (event: ErrorEvent): void => {
    this.failActive(new Error(event.message || "Country geometry worker failed."));
  };

  private handleMessageError = (): void => {
    this.failActive(new Error("Could not read country geometry worker result."));
  };

  private failActive(error: Error): void {
    this.stopWorker();
    const job = this.active;
    this.active = null;
    if (job) {
      this.removeAbortListener(job);
      job.reject(error);
    }
    this.startNext();
  }

  private removeAbortListener(job: PendingJob): void {
    job.signal?.removeEventListener("abort", job.onAbort);
  }

  private stopWorker(): void {
    if (!this.worker) return;
    this.worker.removeEventListener("message", this.handleMessage);
    this.worker.removeEventListener("error", this.handleError);
    this.worker.removeEventListener("messageerror", this.handleMessageError);
    this.worker.terminate();
    this.worker = null;
  }
}

function abortError(): Error {
  return new DOMException("Country geometry work was cancelled.", "AbortError");
}
