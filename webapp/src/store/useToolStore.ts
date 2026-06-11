import { create } from 'zustand'

export type LogEntry = {
  level: string;
  msg?: string;
  path?: string[];
  filename?: string;
  action?: string;
}

interface ToolState {
  takeoutFolder: FileSystemDirectoryHandle | null;
  outputFolder: FileSystemDirectoryHandle | null;
  isProcessing: boolean;
  progress: number;
  currentFile: string;
  stats: { scanned: number; matched: number; unmatched: number; errors: number; total: number };
  logs: LogEntry[];
  quotaAlert: { open: boolean; message: string } | null;
  
  setTakeoutFolder: (folder: FileSystemDirectoryHandle | null) => void;
  setOutputFolder: (folder: FileSystemDirectoryHandle | null) => void;
  setIsProcessing: (val: boolean) => void;
  setProgress: (val: number) => void;
  setCurrentFile: (file: string) => void;
  setStats: (stats: { scanned: number; matched: number; unmatched: number; errors: number; total: number }) => void;
  addLog: (log: LogEntry) => void;
  setLogs: (logs: LogEntry[] | ((prev: LogEntry[]) => LogEntry[])) => void;
  setQuotaAlert: (alert: { open: boolean; message: string } | null) => void;
  resetRun: () => void;
}

export const useToolStore = create<ToolState>((set) => ({
  takeoutFolder: null,
  outputFolder: null,
  isProcessing: false,
  progress: 0,
  currentFile: "Waiting to start...",
  stats: { scanned: 0, matched: 0, unmatched: 0, errors: 0, total: 0 },
  logs: [],
  quotaAlert: null,

  setTakeoutFolder: (folder) => set({ takeoutFolder: folder }),
  setOutputFolder: (folder) => set({ outputFolder: folder }),
  setIsProcessing: (val) => set({ isProcessing: val }),
  setProgress: (val) => set({ progress: val }),
  setCurrentFile: (file) => set({ currentFile: file }),
  setStats: (stats) => set({ stats }),
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
  setLogs: (updater) => set((state) => ({
    logs: typeof updater === 'function' ? updater(state.logs) : updater
  })),
  setQuotaAlert: (alert) => set({ quotaAlert: alert }),
  resetRun: () => set({
    progress: 0,
    currentFile: "Ready",
    stats: { scanned: 0, matched: 0, unmatched: 0, errors: 0, total: 0 },
    logs: [],
    quotaAlert: null
  })
}))
