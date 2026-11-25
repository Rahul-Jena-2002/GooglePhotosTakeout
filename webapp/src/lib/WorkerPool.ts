export interface WorkerTask {
  action: string;
  payload: any;
  transferables?: Transferable[];
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

interface WorkerInstance {
  worker: Worker;
  busy: boolean;
  task?: WorkerTask;
  timeout?: ReturnType<typeof setTimeout>;
}

const TASK_TIMEOUT_MS = 120_000;

function createProcessingWorker() {
  // Vite recognizes the worker entry only when the URL is constructed inline.
  return new Worker(new URL('../workers/WasmProcessWorker.ts', import.meta.url), { type: 'module' });
}

export class WorkerPool {
  private instances: WorkerInstance[] = [];
  private taskQueue: WorkerTask[] = [];
  private maxWorkers: number;
  private terminated = false;

  constructor(maxWorkers: number) {
    this.maxWorkers = Math.max(1, maxWorkers);
    this.initPool();
  }

  private initPool() {
    for (let i = 0; i < this.maxWorkers; i++) {
      try {
        const worker = createProcessingWorker();
        const instance = { worker, busy: false };
        this.instances.push(instance);
        this.monitorIdleWorker(instance);
      } catch (err) {
        console.error("Failed to initialize Web Worker thread:", err);
      }
    }
  }

  private monitorIdleWorker(instance: WorkerInstance) {
    const worker = instance.worker;
    const fail = () => {
      if (this.terminated || instance.busy || instance.worker !== worker) return;
      worker.onerror = null;
      worker.onmessageerror = null;
      try { worker.terminate(); }
      catch (error) { console.warn('Could not terminate an idle worker:', error); }
      this.instances = this.instances.filter(item => item !== instance);
      if (this.instances.length === 0) {
        for (const pending of this.taskQueue) pending.reject(new Error("No processing workers are available. Try reloading the page."));
        this.taskQueue = [];
      }
      this.dispatch();
    };
    worker.onerror = fail;
    worker.onmessageerror = fail;
  }

  public runTask(action: string, payload: any, transferables?: Transferable[]): Promise<any> {
    if (this.terminated) {
      return Promise.reject(new Error("Worker pool has been terminated."));
    }
    if (this.instances.length === 0) {
      return Promise.reject(new Error("No processing workers could be started. Try reloading the page."));
    }

    return new Promise((resolve, reject) => {
      this.taskQueue.push({ action, payload, transferables, resolve, reject });
      this.dispatch();
    });
  }

  private dispatch() {
    if (this.terminated || this.taskQueue.length === 0) return;

    // Find first idle worker
    const idleInstance = this.instances.find(inst => !inst.busy);
    if (!idleInstance) return; // All workers are currently busy

    const task = this.taskQueue.shift();
    if (!task) return;

    idleInstance.busy = true;
    idleInstance.task = task;

    const { worker } = idleInstance;

    worker.onmessage = (e: MessageEvent) => {
      if (this.terminated || idleInstance.task !== task || idleInstance.worker !== worker) return;
      clearTimeout(idleInstance.timeout);
      idleInstance.timeout = undefined;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      idleInstance.busy = false;
      idleInstance.task = undefined;
      this.monitorIdleWorker(idleInstance);

      task.resolve(e.data);
      this.dispatch();
    };

    const handleWorkerFailure = (err: ErrorEvent | Error) => {
      if (this.terminated || idleInstance.task !== task || idleInstance.worker !== worker) return;
      clearTimeout(idleInstance.timeout);
      idleInstance.timeout = undefined;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      idleInstance.busy = false;
      idleInstance.task = undefined;

      // Recycle crashed worker
      try {
        worker.terminate();
      } catch {}

      try {
        idleInstance.worker = createProcessingWorker();
        this.monitorIdleWorker(idleInstance);
      } catch (e) {
        console.error("Failed to recycle worker after crash:", e);
        this.instances = this.instances.filter(instance => instance !== idleInstance);
      }

      task.reject(err);
      if (this.instances.length === 0) {
        for (const pending of this.taskQueue) {
          pending.reject(new Error("No processing workers are available. Try reloading the page."));
        }
        this.taskQueue = [];
      }
      this.dispatch();
    };
    worker.onerror = handleWorkerFailure;
    worker.onmessageerror = () => handleWorkerFailure(new Error('Could not read the worker response.'));
    idleInstance.timeout = setTimeout(() => {
      handleWorkerFailure(new Error('The metadata worker stopped responding. This file could not be restored.'));
    }, TASK_TIMEOUT_MS);

    // Send task with transferable buffers if provided
    try {
      if (task.transferables && task.transferables.length > 0) {
        worker.postMessage({ action: task.action, payload: task.payload }, task.transferables);
      } else {
        worker.postMessage({ action: task.action, payload: task.payload });
      }
    } catch (err) {
      clearTimeout(idleInstance.timeout);
      idleInstance.timeout = undefined;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      idleInstance.busy = false;
      idleInstance.task = undefined;
      this.monitorIdleWorker(idleInstance);
      task.reject(err);
      this.dispatch();
    }
  }

  public getActiveWorkersCount(): number {
    return this.instances.filter(inst => inst.busy).length;
  }

  public terminate() {
    this.terminated = true;
    for (const inst of this.instances) {
      clearTimeout(inst.timeout);
      inst.task?.reject(new Error("Worker pool was terminated."));
      try {
        inst.worker.terminate();
      } catch {}
    }
    this.instances = [];
    
    // Reject any pending tasks remaining in the queue
    for (const task of this.taskQueue) {
      task.reject(new Error("Worker pool was terminated."));
    }
    this.taskQueue = [];
  }
}
