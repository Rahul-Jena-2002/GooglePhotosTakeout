import { indexedDbService } from './indexedDbService.ts';
import { isAllowedMediaFile, sanitizeFilename, findMatchingJsonName, safeParseJson, extractTimestamp, extractCoordinates, MAX_RESTORE_SIDECAR_BYTES } from '../services/restoration/MetadataMatcher.ts';
import { findMatchingJsonNameForZip, normalizeZipPath } from '../services/restoration/ZipMetadataMatcher.ts';
import { isSafeZipPath } from '../services/restoration/zipPathSafety.ts';

export interface ActiveSession {
  id: string;
  uid: string;
  status: 'initializing' | 'scanning' | 'processing' | 'completed' | 'paused' | 'failed' | 'cancelled';
  takeoutName: string;
  takeoutHandle: FileSystemDirectoryHandle | null;
  zipFile: File | null;
  outputHandle: FileSystemDirectoryHandle | null;
  outputMode?: 'folder' | 'zip';
  totalFiles: number;
  scannedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  errorCount: number;
  bytesProcessed: number;
  totalSourceBytes?: number;
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
  description?: string;
  people?: string[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bytes: number;
  error?: string;
}

export function canManageSession(session: ActiveSession, uid: string | null): boolean {
  return session.uid === 'guest' || (!!uid && session.uid === uid);
}

export function hasCompleteSessionScan(session: ActiveSession): boolean {
  return session.status === 'processing' || session.status === 'paused';
}

export class SessionManager {
  private currentSession: ActiveSession | null = null;
  private confirmationQueue: Promise<void> = Promise.resolve();

  public setCurrentSession(session: ActiveSession | null) {
    this.currentSession = session;
  }

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
      throw err;
    }
    return null;
  }

  public async startNewSession(
    sessionId: string,
    uid: string,
    takeoutName: string,
    takeoutHandleOrFile: FileSystemDirectoryHandle | File,
    outputHandle: FileSystemDirectoryHandle | null,
    outputMode: 'folder' | 'zip'
  ): Promise<ActiveSession> {
    const isZip = takeoutHandleOrFile instanceof File;

    const session: ActiveSession = {
      id: sessionId,
      uid,
      status: 'initializing',
      takeoutName,
      takeoutHandle: isZip ? null : (takeoutHandleOrFile as FileSystemDirectoryHandle),
      zipFile: isZip ? (takeoutHandleOrFile as File) : null,
      outputHandle,
      outputMode,
      totalFiles: 0,
      scannedCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      errorCount: 0,
      bytesProcessed: 0,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now()
    };

    await indexedDbService.startRestoreSession(sessionId, session);
    this.currentSession = session;
    return session;
  }

  public async updateSession(fields: Partial<ActiveSession>): Promise<ActiveSession> {
    if (!this.currentSession) {
      throw new Error("No active session initialized.");
    }
    const updatedSession = {
      ...this.currentSession,
      ...fields,
      lastUpdatedAt: Date.now()
    };
    await indexedDbService.set('sessions', updatedSession.id, updatedSession);
    this.currentSession = updatedSession;
    return updatedSession;
  }

  public async scanAndRegister(onProgress: (count: number) => void, isCancelled: () => boolean): Promise<{ count: number; totalBytes: number }> {
    if (!this.currentSession) throw new Error("No active session.");

    const checkCancelled = () => {
      if (isCancelled()) throw new DOMException('Restore scan cancelled.', 'AbortError');
    };

    checkCancelled();
    await this.updateSession({ status: 'scanning' });
    let result = { count: 0, totalBytes: 0 };
    
    if (this.currentSession.zipFile) {
      result = await this.scanZipSource(this.currentSession.zipFile, onProgress, checkCancelled);
    } else if (this.currentSession.takeoutHandle) {
      result = await this.scanDirectorySource(this.currentSession.takeoutHandle, onProgress, checkCancelled);
    }

    checkCancelled();
    await this.updateSession({ 
      status: 'processing',
      totalFiles: result.count,
      totalSourceBytes: result.totalBytes
    });

    return result;
  }

  private async scanDirectorySource(
    root: FileSystemDirectoryHandle,
    onProgress: (count: number) => void,
    checkCancelled: () => void
  ): Promise<{ count: number; totalBytes: number }> {
    const sessionId = this.currentSession!.id;
    let fileCount = 0;
    let totalBytes = 0;
    const batchSize = 100;
    let fileBatch: FileRecord[] = [];
    const fileIds = new Set<string>();

    const flushBatch = async () => {
      checkCancelled();
      if (fileBatch.length === 0) return;
      // Write batch to IndexedDB in a single transaction
      await indexedDbService.setAll('files', fileBatch.map(f => ({ key: f.id, value: f })));
      fileBatch = [];
    };

    const walk = async (handle: FileSystemDirectoryHandle, path: string[]) => {
      const currentFiles: FileSystemFileHandle[] = [];
      const subDirs: [string, FileSystemDirectoryHandle][] = [];

      // @ts-ignore
      for await (const [name, entry] of handle) {
        checkCancelled();
        const safeName = sanitizeFilename(name);
        if (entry.kind === 'directory' && safeName !== name) {
          throw new Error(`The folder name cannot be preserved safely: ${name}. Rename it in a copy of your export and try again.`);
        }
        if (entry.kind === 'file' && isAllowedMediaFile(safeName)) {
          if (safeName !== name) throw new Error(`The file name cannot be preserved safely: ${name}. Rename it in a copy of your export and try again.`);
          currentFiles.push(entry as FileSystemFileHandle);
        } else if (entry.kind === 'directory') {
          subDirs.push([safeName, entry as FileSystemDirectoryHandle]);
        }
      }

      // Canonical sorting for deterministic serial order
      currentFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      subDirs.sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }));

      for (const fileHandle of currentFiles) {
        checkCancelled();
        const safeName = sanitizeFilename(fileHandle.name);
        const id = `${sessionId}:${path.join('/')}/${safeName}`;
        if (fileIds.has(id)) {
          throw new Error(`Multiple source files map to the same output name: ${[...path, safeName].join('/')}. Rename the conflicting files before restoring.`);
        }
        fileIds.add(id);
        // Get file size during scan to avoid a second full-store load later
        let fileSize: number;
        try {
          const f = await fileHandle.getFile();
          fileSize = f.size;
          totalBytes += fileSize;
        } catch (error) {
          throw new Error(`Could not read ${[...path, safeName].join('/')}. Check access to the source folder and try again.`, { cause: error });
        }
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

      for (const [subName, subHandle] of subDirs) {
        checkCancelled();
        await walk(subHandle, [...path, subName]);
      }
    };

    await walk(root, []);
    await flushBatch();
    onProgress(fileCount);
    return { count: fileCount, totalBytes };
  }

  private async scanZipSource(
    file: File,
    onProgress: (count: number) => void,
    checkCancelled: () => void
  ): Promise<{ count: number; totalBytes: number }> {
    const sessionId = this.currentSession!.id;
    let fileCount = 0;
    let totalBytes = 0;
    const batchSize = 100;
    let fileBatch: FileRecord[] = [];

    const flushBatch = async () => {
      checkCancelled();
      if (fileBatch.length === 0) return;
      await indexedDbService.setAll('files', fileBatch.map(f => ({ key: f.id, value: f })));
      fileBatch = [];
    };

    const { ZipReader, BlobReader, TextWriter } = await import('@zip.js/zip.js');
    checkCancelled();
    const zipReader = new ZipReader(new BlobReader(file));
    try {
      const entries = await zipReader.getEntries();
      checkCancelled();

      // Canonical sorting of entries for deterministic serial ordering
      entries.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' }));

      // Build a lookup: normalized path → entry (for both media and JSON files)
      // Normalize Windows backslashes → forward slashes at ingestion time
      const allEntryMap = new Map<string, any>();
      const dirToFilenames = new Map<string, Set<string>>();

      for (const entry of entries) {
        checkCancelled();
        if (entry.directory) continue;
        const normalizedPath = normalizeZipPath(entry.filename).normalize('NFC');
        if (!isSafeZipPath(normalizedPath)) {
          throw new Error(`The ZIP contains an unsafe path: ${normalizedPath}. Extract and inspect the archive before restoring.`);
        }
        if (allEntryMap.has(normalizedPath)) {
          throw new Error(`The ZIP contains multiple entries with the same normalized path: ${normalizedPath}. Extract and inspect the archive before restoring.`);
        }
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
        checkCancelled();
        if (entry.directory) continue;
        const normalizedPath = normalizeZipPath(entry.filename).normalize('NFC');
        const parts = normalizedPath.split('/');
        const filename = parts.pop() || '';
        const dirPath = parts.join('/');
        const safeName = sanitizeFilename(filename);

        if (!isAllowedMediaFile(safeName)) continue;
        if (safeName !== filename || parts.some(part => sanitizeFilename(part) !== part)) {
          throw new Error(`The ZIP path cannot be preserved safely: ${normalizedPath}. Extract it and rename the affected files in a copy before restoring.`);
        }

        // Pre-resolve JSON sidecar and extract epoch/coords/description/people during scan phase
        let epochSec: number | null = null;
        let lat: number | null = null;
        let lng: number | null = null;
        let description: string | undefined = undefined;
        let people: string[] | undefined = undefined;

        try {
          const dirNames = dirToFilenames.get(dirPath) || new Set<string>();
          const jsonName = findMatchingJsonNameForZip(safeName, dirNames);
          if (jsonName) {
            const jsonPath = dirPath ? `${dirPath}/${jsonName}` : jsonName;
            const jsonEntry = allEntryMap.get(jsonPath.normalize('NFC'));
            if (jsonEntry?.getData && jsonEntry.uncompressedSize <= MAX_RESTORE_SIDECAR_BYTES) {
              const jsonText = await jsonEntry.getData(new TextWriter());
              const parsed = safeParseJson(jsonText);
              if (parsed) {
                epochSec = extractTimestamp(parsed);
                const coordinates = extractCoordinates(parsed);
                lat = coordinates?.lat ?? null;
                lng = coordinates?.lng ?? null;
                if (typeof parsed.description === 'string') description = parsed.description;
                if (Array.isArray(parsed.people)) {
                  people = parsed.people.map((p: any) => typeof p === 'string' ? p : p?.name).filter((name: unknown): name is string => typeof name === 'string' && !!name.trim());
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
          description,
          people,
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
      return { count: fileCount, totalBytes };
    } finally {
      await zipReader.close().catch(error => console.warn('Could not close source ZIP after scan:', error));
    }
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
    error?: string,
    metadataRestored?: boolean
  ): Promise<void> {
    const confirm = () => this.confirmFileNow(fileId, status, bytes, epochSec, error, metadataRestored);
    const result = this.confirmationQueue.then(confirm, confirm);
    this.confirmationQueue = result;
    return result;
  }

  private async confirmFileNow(
    fileId: string,
    status: 'completed' | 'failed',
    bytes: number,
    epochSec?: number | null,
    error?: string,
    metadataRestored?: boolean
  ): Promise<void> {
    const file = await indexedDbService.get('files', fileId) as FileRecord;
    if (!file || !this.currentSession || file.sessionId !== this.currentSession.id) {
      throw new Error('The saved file or its restore session is no longer available.');
    }

    file.status = status;
    file.bytes = bytes;
    if (epochSec !== undefined) {
      file.epochSec = epochSec;
    }
    if (error) file.error = error;
    const updates: Partial<ActiveSession> = {
      scannedCount: this.currentSession.scannedCount + 1,
      bytesProcessed: this.currentSession.bytesProcessed + (status === 'completed' ? bytes : 0)
    };

    if (status === 'completed') {
      const hasEpoch = epochSec !== undefined ? (epochSec !== null) : (file.epochSec !== null);
      if (metadataRestored ?? hasEpoch) {
        updates.matchedCount = this.currentSession.matchedCount + 1;
      } else {
        updates.unmatchedCount = this.currentSession.unmatchedCount + 1;
      }
    } else {
      updates.errorCount = this.currentSession.errorCount + 1;
    }

    const updatedSession = { ...this.currentSession, ...updates, lastUpdatedAt: Date.now() };
    await indexedDbService.setFileAndSession(fileId, file, updatedSession.id, updatedSession);
    this.currentSession = updatedSession;
  }

  /**
   * Returns one page of pending files from IndexedDB.
   * Use this instead of getPendingFiles() for large archives to prevent
   * materialising thousands of FileRecord + FileHandle objects into the heap.
   *
   * @param lastId - Last returned record ID; subsequent pages start after it
   * @param limit  - Maximum records to return per page (default 200)
   */
  public async getPendingFilesPage(lastId?: string | null, limit: number = 200): Promise<FileRecord[]> {
    return indexedDbService.getPendingFilesPage(lastId ?? null, limit) as Promise<FileRecord[]>;
  }

  public async getPendingFiles(): Promise<FileRecord[]> {
    return indexedDbService.getAllByIndex('files', 'status', 'pending') as Promise<FileRecord[]>;
  }

  public async getPendingCount(): Promise<number> {
    return indexedDbService.countByIndex('files', 'status', 'pending');
  }

  public async getInFlightFiles(): Promise<FileRecord[]> {
    return indexedDbService.getAllByIndex('files', 'status', 'processing') as Promise<FileRecord[]>;
  }

  public async revertInFlightFiles(): Promise<void> {
    if (!this.currentSession) return;

    const inFlight = await this.getInFlightFiles();
    if (inFlight.length === 0) return;

    console.log(`Reverting ${inFlight.length} in-flight file operations...`);

    const cleanPromises = inFlight.map(async (file) => {
      // The output may predate this session; retry without deleting it.
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
