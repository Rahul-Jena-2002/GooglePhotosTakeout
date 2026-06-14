import { indexedDbService } from './indexedDbService';
import { isAllowedMediaFile, sanitizeFilename, findMatchingJsonName, safeParseJson, extractTimestamp } from '../services/MetadataMatcher';
import { ZipReader, BlobReader, TextWriter } from '@zip.js/zip.js';

export interface ActiveSession {
  id: string;
  uid: string;
  status: 'initializing' | 'scanning' | 'processing' | 'completed' | 'paused' | 'failed' | 'cancelled';
  takeoutName: string;
  takeoutHandle: FileSystemDirectoryHandle | null;
  zipFile: File | null;
  outputHandle: FileSystemDirectoryHandle | null;
  totalFiles: number;
  scannedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  errorCount: number;
  bytesProcessed: number;
  startedAt: number;
  lastUpdatedAt: number;
}

export interface FileRecord {
  id: string;
  sessionId: string;
  filename: string;
  relativePath: string[];
  fileHandle?: FileSystemFileHandle;
  dirHandle?: FileSystemDirectoryHandle;
  zipPath?: string;
  epochSec: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bytes: number;
  error?: string;
}

export class SessionManager {
  private currentSession: ActiveSession | null = null;

  public async getActiveSession(): Promise<ActiveSession | null> {
    try {
      const sessions = await indexedDbService.getAll('sessions') as ActiveSession[];
      const active = sessions.find(s => 
        s.status === 'initializing' || 
        s.status === 'scanning' || 
        s.status === 'processing' || 
        s.status === 'paused'
      );
      if (active) {
        this.currentSession = active;
        return active;
      }
    } catch (err) {
      console.error("Failed to retrieve active session from IndexedDB:", err);
    }
    return null;
  }

  public async startNewSession(
    sessionId: string,
    uid: string,
    takeoutName: string,
    takeoutHandleOrFile: FileSystemDirectoryHandle | File,
    outputHandle: FileSystemDirectoryHandle
  ): Promise<ActiveSession> {
    // Clean up any old files from previous runs to save space in IndexedDB
    await indexedDbService.clearStore('files');
    await indexedDbService.clearStore('sessions');

    const isZip = takeoutHandleOrFile instanceof File;

    const session: ActiveSession = {
      id: sessionId,
      uid,
      status: 'initializing',
      takeoutName,
      takeoutHandle: isZip ? null : (takeoutHandleOrFile as FileSystemDirectoryHandle),
      zipFile: isZip ? (takeoutHandleOrFile as File) : null,
      outputHandle,
      totalFiles: 0,
      scannedCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      errorCount: 0,
      bytesProcessed: 0,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now()
    };

    this.currentSession = session;
    await indexedDbService.set('sessions', sessionId, session);
    return session;
  }

  public async updateSession(fields: Partial<ActiveSession>): Promise<ActiveSession> {
    if (!this.currentSession) {
      throw new Error("No active session initialized.");
    }
    this.currentSession = {
      ...this.currentSession,
      ...fields,
      lastUpdatedAt: Date.now()
    };
    await indexedDbService.set('sessions', this.currentSession.id, this.currentSession);
    return this.currentSession;
  }

  public async scanAndRegister(onProgress: (count: number) => void): Promise<number> {
    if (!this.currentSession) throw new Error("No active session.");

    await this.updateSession({ status: 'scanning' });
    let totalCount = 0;
    
    if (this.currentSession.zipFile) {
      totalCount = await this.scanZipSource(this.currentSession.zipFile, onProgress);
    } else if (this.currentSession.takeoutHandle) {
      totalCount = await this.scanDirectorySource(this.currentSession.takeoutHandle, onProgress);
    }

    await this.updateSession({ 
      status: 'processing',
      totalFiles: totalCount
    });

    return totalCount;
  }

  private async scanDirectorySource(
    root: FileSystemDirectoryHandle,
    onProgress: (count: number) => void
  ): Promise<number> {
    const sessionId = this.currentSession!.id;
    let fileCount = 0;
    const batchSize = 100;
    let fileBatch: FileRecord[] = [];

    const flushBatch = async () => {
      if (fileBatch.length === 0) return;
      // Write batch to IndexedDB in a single transaction
      await indexedDbService.setAll('files', fileBatch.map(f => ({ key: f.id, value: f })));
      fileBatch = [];
    };

    const walk = async (handle: FileSystemDirectoryHandle, path: string[]) => {
      const currentFiles: FileSystemFileHandle[] = [];

      // @ts-ignore
      for await (const [name, entry] of handle) {
        const safeName = sanitizeFilename(name);
        if (!safeName) continue;
        if (entry.kind === 'file' && isAllowedMediaFile(safeName)) {
          currentFiles.push(entry as FileSystemFileHandle);
        } else if (entry.kind === 'directory') {
          await walk(entry as FileSystemDirectoryHandle, [...path, safeName]);
        }
      }

      for (const fileHandle of currentFiles) {
        const safeName = sanitizeFilename(fileHandle.name);
        const id = `${sessionId}:${path.join('/')}/${safeName}`;
        fileBatch.push({
          id,
          sessionId,
          filename: safeName,
          relativePath: path,
          fileHandle,
          dirHandle: handle,
          epochSec: null, // Defer sidecar/epoch resolution to processing phase
          status: 'pending',
          bytes: 0        // Defer size query to processing phase to avoid blocking directory scan
        });

        fileCount++;
        if (fileCount % batchSize === 0) {
          await flushBatch();
          onProgress(fileCount);
        }
      }
    };

    await walk(root, []);
    await flushBatch();
    onProgress(fileCount);
    return fileCount;
  }

  private async scanZipSource(
    file: File,
    onProgress: (count: number) => void
  ): Promise<number> {
    const sessionId = this.currentSession!.id;
    let fileCount = 0;
    const batchSize = 100;
    let fileBatch: FileRecord[] = [];

    const flushBatch = async () => {
      if (fileBatch.length === 0) return;
      await indexedDbService.setAll('files', fileBatch.map(f => ({ key: f.id, value: f })));
      fileBatch = [];
    };

    // Instantiate zip.js reader
    const zipReader = new ZipReader(new BlobReader(file));
    const entries = await zipReader.getEntries();

    // Pair media files with sidecars (defer JSON sidecar/epoch lookup to processing phase)
    for (const entry of entries) {
      if (entry.directory) continue;
      const parts = entry.filename.split('/');
      const filename = parts.pop() || '';
      const dirPath = parts.join('/');
      const safeName = sanitizeFilename(filename);

      if (!isAllowedMediaFile(safeName)) continue;

      const id = `${sessionId}:${entry.filename}`;
      fileBatch.push({
        id,
        sessionId,
        filename: safeName,
        relativePath: dirPath ? dirPath.split('/') : [],
        zipPath: entry.filename,
        epochSec: null, // Defer to processing phase
        status: 'pending',
        bytes: entry.uncompressedSize
      });

      fileCount++;
      if (fileCount % batchSize === 0) {
        await flushBatch();
        onProgress(fileCount);
      }
    }

    await flushBatch();
    onProgress(fileCount);
    try {
      await zipReader.close();
    } catch {}
    return fileCount;
  }

  public async claimFile(fileId: string): Promise<void> {
    const file = await indexedDbService.get('files', fileId) as FileRecord;
    if (file) {
      file.status = 'processing';
      await indexedDbService.set('files', fileId, file);
    }
  }

  public async confirmFile(
    fileId: string,
    status: 'completed' | 'failed',
    bytes: number,
    epochSec?: number | null,
    error?: string
  ): Promise<void> {
    const file = await indexedDbService.get('files', fileId) as FileRecord;
    if (!file) return;

    file.status = status;
    file.bytes = bytes;
    if (epochSec !== undefined) {
      file.epochSec = epochSec;
    }
    if (error) file.error = error;
    await indexedDbService.set('files', fileId, file);

    if (this.currentSession) {
      const updates: Partial<ActiveSession> = {
        scannedCount: this.currentSession.scannedCount + 1,
        bytesProcessed: this.currentSession.bytesProcessed + bytes
      };

      if (status === 'completed') {
        const hasEpoch = epochSec !== undefined ? (epochSec !== null) : (file.epochSec !== null);
        if (hasEpoch) {
          updates.matchedCount = this.currentSession.matchedCount + 1;
        } else {
          updates.unmatchedCount = this.currentSession.unmatchedCount + 1;
        }
      } else {
        updates.errorCount = this.currentSession.errorCount + 1;
      }

      await this.updateSession(updates);
    }
  }

  public async getPendingFiles(): Promise<FileRecord[]> {
    const all = await indexedDbService.getAll('files') as FileRecord[];
    return all.filter(f => f.status === 'pending');
  }

  public async getInFlightFiles(): Promise<FileRecord[]> {
    const all = await indexedDbService.getAll('files') as FileRecord[];
    return all.filter(f => f.status === 'processing');
  }

  public async revertInFlightFiles(): Promise<void> {
    if (!this.currentSession || !this.currentSession.outputHandle) return;

    const inFlight = await this.getInFlightFiles();
    if (inFlight.length === 0) return;

    console.log(`Reverting ${inFlight.length} in-flight file operations...`);

    const outputFolder = this.currentSession.outputHandle;

    const cleanPromises = inFlight.map(async (file) => {
      // 1. Delete output file to avoid partial/corrupted writes
      const hasMetadata = file.epochSec !== null;
      const baseSub = hasMetadata ? 'restored' : 'unmatched';
      try {
        let currentDir = outputFolder;
        for (const part of [baseSub, ...file.relativePath]) {
          currentDir = await currentDir.getDirectoryHandle(part, { create: false });
        }
        await currentDir.removeEntry(file.filename);
      } catch {}

      // 2. Revert state in DB to pending
      file.status = 'pending';
      file.error = undefined;
      await indexedDbService.set('files', file.id, file);
    });

    await Promise.all(cleanPromises);
  }

  public async getStats() {
    if (!this.currentSession) {
      return { scanned: 0, matched: 0, unmatched: 0, errors: 0, total: 0 };
    }
    return {
      scanned: this.currentSession.scannedCount,
      matched: this.currentSession.matchedCount,
      unmatched: this.currentSession.unmatchedCount,
      errors: this.currentSession.errorCount,
      total: this.currentSession.totalFiles
    };
  }

  public async terminateSession(status: 'completed' | 'failed' | 'cancelled') {
    if (this.currentSession) {
      await this.updateSession({ status });
      this.currentSession = null;
    }
  }
}
