/**
 * MemoryGuard: Elastic RAM scaling controller (20% - 80% dynamic buffer)
 * Controls concurrent file processing tasks based on live browser heap metrics.
 */

interface PerformanceMemory {
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
}

declare global {
  interface Performance {
    memory?: PerformanceMemory;
  }
}

export class MemoryGuard {
  private static instance: MemoryGuard;
  private currentConcurrency: number = 2; // Default baseline
  private readonly minConcurrency: number = 1;
  private readonly maxConcurrency: number = 8;
  private lastCheckTime: number = 0;

  private constructor() {}

  public static getInstance(): MemoryGuard {
    if (!MemoryGuard.instance) {
      MemoryGuard.instance = new MemoryGuard();
    }
    return MemoryGuard.instance;
  }

  /**
   * Calculates optimal concurrency based on live performance.memory telemetry.
   * On non-Chromium browsers (Firefox/Safari), gracefully defaults to 2 concurrent workers.
   */
  public getOptimalConcurrency(): number {
    const now = Date.now();
    // Throttle check frequency to once every 1.5 seconds
    if (now - this.lastCheckTime < 1500) {
      return this.currentConcurrency;
    }
    this.lastCheckTime = now;

    if (typeof window === 'undefined' || !window.performance || !window.performance.memory) {
      // Firefox / Safari fallback
      this.currentConcurrency = 2;
      return this.currentConcurrency;
    }

    const memory = window.performance.memory;
    const usedRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;

    // Elastic scaling algorithm (20% to 80% range)
    if (usedRatio < 0.35 && this.currentConcurrency < this.maxConcurrency) {
      // System RAM is under low pressure - scale UP concurrency
      this.currentConcurrency += 1;
    } else if (usedRatio > 0.65 && this.currentConcurrency > this.minConcurrency) {
      // Memory pressure rising - scale DOWN concurrency
      this.currentConcurrency -= 1;
    }

    return this.currentConcurrency;
  }

  /**
   * Triggers manual garbage collection hint by yielding control back to browser event loop
   */
  public async yieldForGC(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}

export const memoryGuard = MemoryGuard.getInstance();
