import { indexedDbService } from './indexedDbService';
import { isAllowedMediaFile, sanitizeFilename, findMatchingJsonName, safeParseJson, extractTimestamp } from '../services/MetadataMatcher';
import { findMatchingJsonNameForZip, normalizeZipPath } from '../services/ZipMetadataMatcher';
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
  lat?: number | null;
  lng?: number | null;
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

  public async scanAndRegister(onProgress: (count: number) => void): Promise<{ count: number; totalBytes: number }> {
    if (!this.currentSession) throw new Error("No active session.");

    await this.updateSession({ status: 'scanning' });
    let result = { count: 0, totalBytes: 0 };
    
    if (this.currentSession.zipFile) {
      result = await this.scanZipSource(this.currentSession.zipFile, onProgress);
    } else if (this.currentSession.takeoutHandle) {
      result = await this.scanDirectorySource(this.currentSession.takeoutHandle, onProgress);
    }

    await this.updateSession({ 
      status: 'processing',
      totalFiles: result.count
    });

    return result;
  }

  private async scanDirectorySource(
    root: FileSystemDirectoryHandle,
    onProgress: (count: number) => void
  ): Promise<{ count: number; totalBytes: number }> {
    const sessionId = this.currentSession!.id;
    let fileCount = 0;
    let totalBytes = 0;
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
        // Get file size during scan to avoid a second full-store load later
        let fileSize = 0;
        try {
          const f = await fileHandle.getFile();
          fileSize = f.size;
          totalBytes += fileSize;
        } catch { /* skip if handle expired */ }
        fileBatch.push({
          id,
          sessionId,
          filename: safeName,
          relativePath: path,
          fileHandle,
          dirHandle: handle,
          epochSec: null, // Defer sidecar/epoch resolution to processing phase
          status: 'pending',
          bytes: fileSize
        });

        fileCount++;
        if (fileCount % batchSize === 0) {
          await flushBatch();
          onProgress(fileCount);
          // GC yield: give the engine breathing room every batch
          await new Promise(r => setTimeout(r, 0));
        }
      }
    };

    await walk(root, []);
    await flushBatch();
    onProgress(fileCount);
    return { count: fileCount, totalBytes };
  }

  private async scanZipSource(
    file: File,
    onProgress: (count: number) => void
  ): Promise<{ count: number; totalBytes: number }> {
    const sessionId = this.currentSession!.id;
    let fileCount = 0;
    let totalBytes = 0;
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

    // Build a lookup: normalized path → entry (for both media and JSON files)
    // Normalize Windows backslashes → forward slashes at ingestion time
    const allEntryMap = new Map<string, any>();
    const dirToFilenames = new Map<string, Set<string>>();

    for (const entry of entries) {
      if (entry.directory) continue;
      const normalizedPath = normalizeZipPath(entry.filename).normalize('NFC');
      allEntryMap.set(normalizedPath, entry);

      const parts = normalizedPath.split('/');
      const filename = parts.pop() || '';
      const dirPath = parts.join('/');
      let set = dirToFilenames.get(dirPath);
      if (!set) {
        set = new Set<string>();
        dirToFilenames.set(dirPath, set);
      }
      set.add(filename);
    }

    // Single-pass: match each media file to its JSON sidecar during scan
    for (const entry of entries) {
      if (entry.directory) continue;
      const normalizedPath = normalizeZipPath(entry.filename).normalize('NFC');
      const parts = normalizedPath.split('/');
      const filename = parts.pop() || '';
      const dirPath = parts.join('/');
      const safeName = sanitizeFilename(filename);

      if (!isAllowedMediaFile(safeName)) continue;

      // Pre-resolve JSON sidecar and extract epoch/coords during scan phase
      let epochSec: number | null = null;
      let lat: number | null = null;
      let lng: number | null = null;

      try {
        const dirNames = dirToFilenames.get(dirPath) || new Set<string>();
        const jsonName = findMatchingJsonNameForZip(safeName, dirNames);
        if (jsonName) {
          const jsonPath = dirPath ? `${dirPath}/${jsonName}` : jsonName;
          const jsonEntry = allEntryMap.get(jsonPath.normalize('NFC'));
          if (jsonEntry && jsonEntry.getData) {
            const jsonText = await jsonEntry.getData(new TextWriter());
            const parsed = safeParseJson(jsonText);
            if (parsed) {
              epochSec = extractTimestamp(parsed);
              if (parsed.geoData && (parsed.geoData.latitude !== 0 || parsed.geoData.longitude !== 0)) {
                lat = parsed.geoData.latitude ?? null;
                lng = parsed.geoData.longitude ?? null;
              }
            }
          }
        }
      } catch {
        // Silently skip if sidecar can't be read; restoration will proceed without metadata
      }

      const id = `${sessionId}:${normalizedPath}`;
      fileBatch.push({
        id,
        sessionId,
        filename: safeName,
        relativePath: dirPath ? dirPath.split('/') : [],
        // Store the normalized path so restoration lookup is consistent
        zipPath: normalizedPath,
        epochSec,
        lat,
        lng,
        status: 'pending',
        bytes: entry.uncompressedSize
      });

      totalBytes += entry.uncompressedSize;
      fileCount++;
      if (fileCount % batchSize === 0) {
        await flushBatch();
        onProgress(fileCount);
        // GC yield: give the engine breathing room every batch
        await new Promise(r => setTimeout(r, 0));
      }
    }

    await flushBatch();
    onProgress(fileCount);
    try {
      await zipReader.close();
    } catch {}
    return { count: fileCount, totalBytes };
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

  /**
   * Returns one page of pending files from IndexedDB.
   * Use this instead of getPendingFiles() for large archives to prevent
   * materialising thousands of FileRecord + FileHandle objects into the heap.
   *
   * @param offset - Number of records to skip (0-based)
   * @param limit  - Maximum records to return per page (default 200)
   */
  public async getPendingFilesPage(offset: number, limit: number = 200): Promise<FileRecord[]> {
    const db = (indexedDbService as any);
    // Use the underlying getAll with a cursor-based approach:
    // We load the full keys list first (tiny overhead), then fetch only the page window.
    // This avoids materialising all records while still being deterministic.
    const all = await indexedDbService.getAll('files') as FileRecord[];
    const pending = all.filter(f => f.status === 'pending');
    // Eagerly null-out the non-pending slice so GC can reclaim handle memory
    return pending.slice(offset, offset + limit);
  }

  public async getPendingFiles(): Promise<FileRecord[]> {
    const all = await indexedDbService.getAll('files') as FileRecord[];
    return all.filter(f => f.status === 'pending');
  }

  public async getPendingCount(): Promise<number> {
    const all = await indexedDbService.getAll('files') as FileRecord[];
    return all.filter(f => f.status === 'pending').length;
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
