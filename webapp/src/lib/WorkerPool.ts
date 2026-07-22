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
}

export class WorkerPool {
  private instances: WorkerInstance[] = [];
  private taskQueue: WorkerTask[] = [];
  private maxWorkers: number;
  private terminated = false;

  private workerType: 'piexifjs' | 'wasm';

  constructor(maxWorkers: number, workerType: 'piexifjs' | 'wasm' = 'piexifjs') {
    this.maxWorkers = maxWorkers;
    this.workerType = workerType;
    this.initPool();
  }

  private initPool() {
    for (let i = 0; i < this.maxWorkers; i++) {
      try {
        // Vite and Astro support relative URL resolution for module workers
        const workerUrl = this.workerType === 'wasm' 
          ? new URL('../workers/WasmProcessWorker.ts', import.meta.url)
          : new URL('../workers/ProcessWorker.ts', import.meta.url);
          
        const worker = new Worker(workerUrl, { type: 'module' });
        this.instances.push({ worker, busy: false });
      } catch (err) {
        console.error("Failed to initialize Web Worker thread:", err);
      }
    }
  }

  public runTask(action: string, payload: any, transferables?: Transferable[]): Promise<any> {
    if (this.terminated) {
      return Promise.reject(new Error("Worker pool has been terminated."));
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

    const { worker } = idleInstance;

    worker.onmessage = (e: MessageEvent) => {
      // Clear event listeners to prevent memory retention
      worker.onmessage = null;
      worker.onerror = null;
      idleInstance.busy = false;

      task.resolve(e.data);
      
      // Attempt to dispatch next queued task
      this.dispatch();
    };

    worker.onerror = (err: ErrorEvent) => {
      worker.onmessage = null;
      worker.onerror = null;
      idleInstance.busy = false;

      // Recycle the crashed worker to ensure future tasks run correctly
      try {
        worker.terminate();
      } catch {}

      try {
        const workerUrl = this.workerType === 'wasm' 
          ? new URL('../workers/WasmProcessWorker.ts', import.meta.url)
          : new URL('../workers/ProcessWorker.ts', import.meta.url);
        idleInstance.worker = new Worker(workerUrl, { type: 'module' });
      } catch (e) {
        console.error("Failed to recycle worker after crash:", e);
      }

      task.reject(err);
      
      this.dispatch();
    };

    // Send task with transferable buffers if provided
    if (task.transferables && task.transferables.length > 0) {
      worker.postMessage({ action: task.action, payload: task.payload }, task.transferables);
    } else {
      worker.postMessage({ action: task.action, payload: task.payload });
    }
  }

  public getActiveWorkersCount(): number {
    return this.instances.filter(inst => inst.busy).length;
  }

  public terminate() {
    this.terminated = true;
    for (const inst of this.instances) {
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
