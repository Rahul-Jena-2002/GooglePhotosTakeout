import { findMatchingJsonName, safeParseJson, extractTimestamp, sanitizeFilename, isAllowedMediaFile } from '../services/MetadataMatcher';
import { injectExifDate, isJpeg } from '../services/ExifRestorer';

// Internal memory-efficient cache for directory contents
const dirNamesCache = new Map<string, Set<string>>();

// Note: FileSystemDirectoryHandle can be passed via postMessage in Chrome.
self.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  if (!data) return;

  if (data.type === 'scan') {
    const { inputHandle } = data;
    try {
      dirNamesCache.clear();
      const allFiles: { fileHandle: FileSystemFileHandle, dirHandle: FileSystemDirectoryHandle, relativePath: string[] }[] = [];
      
      async function walk(handle: FileSystemDirectoryHandle, path: string[]) {
        const currentFiles: FileSystemFileHandle[] = [];

        // @ts-ignore - TS doesn't have async iterators for FileSystemDirectoryHandle by default
        for await (const [name, entry] of handle) {
          const safeName = sanitizeFilename(name);
          if (!safeName) continue;
          if (entry.kind === 'file' && isAllowedMediaFile(safeName)) {
            currentFiles.push(entry as FileSystemFileHandle);
          } else if (entry.kind === 'directory') {
            await walk(entry as FileSystemDirectoryHandle, [...path, safeName]);
          }
        }
        
        for (const f of currentFiles) {
          allFiles.push({ fileHandle: f, dirHandle: handle, relativePath: path });
          
          if (allFiles.length % 50 === 0) {
            self.postMessage({ type: 'scan_progress', count: allFiles.length });
          }
        }
      }

      await walk(inputHandle, []);
      self.postMessage({ type: 'scan_done', files: allFiles });

    } catch (err: any) {
      self.postMessage({ type: 'scan_error', msg: err.message || 'Error scanning directory.' });
    }
  }

  else if (data.type === 'process_file') {
    const { fileHandle, dirHandle, relativePath, outputHandle, injectExif } = data;
    const safeName = sanitizeFilename(fileHandle.name);
    let fileSize = 0;
    
    try {
      // Try getting file directly to bypass slow disk lookup IPC call
      let file;
      try {
        file = await fileHandle.getFile();
      } catch (err) {
        // Query fresh handle from parent directory only if stale state exception is thrown
        const freshHandle = await dirHandle.getFileHandle(fileHandle.name);
        file = await freshHandle.getFile();
      }

      fileSize = file.size;

      // Efficiently fetch parent directory entries from local cache, populating on demand
      const cacheKey = relativePath.join('/');
      let allNamesSet = dirNamesCache.get(cacheKey);
      if (!allNamesSet) {
        // Enforce cache size limit (max 5 directories per worker to prevent memory leak)
        if (dirNamesCache.size >= 5) {
          const firstKey = dirNamesCache.keys().next().value;
          if (firstKey !== undefined) {
            dirNamesCache.delete(firstKey);
          }
        }

        allNamesSet = new Set<string>();
        // @ts-ignore
        for await (const [name] of dirHandle) {
          const safe = sanitizeFilename(name);
          if (safe) allNamesSet.add(safe);
        }
        dirNamesCache.set(cacheKey, allNamesSet);
      }

      const jsonName = findMatchingJsonName(safeName, allNamesSet);
      
      let epochSec: number | null = null;
      if (jsonName) {
        try {
          const jsonHandle = await dirHandle.getFileHandle(jsonName);
          const jsonFile = await jsonHandle.getFile();
          const parsed = safeParseJson(await jsonFile.text());
          if (parsed) epochSec = extractTimestamp(parsed);
        } catch {}
      }

      const baseFolder = (jsonName && epochSec) ? 'restored' : 'unmatched';
      
      async function getOrCreateDir(root: FileSystemDirectoryHandle, parts: string[]): Promise<FileSystemDirectoryHandle> {
        let current = root;
        for (const part of parts) {
          const safe = sanitizeFilename(part);
          if (!safe) continue;
          current = await current.getDirectoryHandle(safe, { create: true });
        }
        return current;
      }

      // Create directories on demand
      const outSubDir = await getOrCreateDir(outputHandle, [baseFolder, ...relativePath]);
      const outHandle = await outSubDir.getFileHandle(safeName, { create: true });
      
      // @ts-ignore
      const writable = await outHandle.createWritable();

      // OPTIMIZATION: Zero-RAM copying for non-JPEGs or if EXIF injection is disabled/unavailable
      if (injectExif && epochSec && isJpeg(safeName)) {
        // Read buffer to inject EXIF date
        const rawBuffer = await file.arrayBuffer();
        let mediaBytes: Uint8Array | null = null;
        try { 
          mediaBytes = injectExifDate(rawBuffer, epochSec); 
        } catch (err) {
          console.error('EXIF fail on', safeName, err);
          mediaBytes = new Uint8Array(rawBuffer);
        }
        await writable.write(mediaBytes as any);
        // Eager deallocation
        mediaBytes = null;
      } else {
        // Stream the File/Blob directly without loading its bytes into the JavaScript heap!
        await writable.write(file);
      }

      await writable.close();
      
      // Eager deallocation of file references to free up memory immediately
      file = null;

      if (jsonName && epochSec) {
        self.postMessage({
          type: 'file_processed',
          success: true,
          level: 'success',
          path: relativePath,
          filename: safeName,
          action: 'Restored & Injected',
          bytes: fileSize
        });
      } else {
        self.postMessage({
          type: 'file_processed',
          success: true,
          level: 'warn',
          path: relativePath,
          filename: safeName,
          action: 'No Metadata Found',
          bytes: fileSize
        });
      }

    } catch (err: any) {
      let errMsg = err.message || '';
      if (errMsg.includes("state cached") || errMsg.includes("changed since it was read")) {
        errMsg = "File modification conflict. Ensure you are not writing output files directly inside your source folder.";
      }
      self.postMessage({
        type: 'file_processed',
        success: false,
        level: 'error',
        path: relativePath,
        filename: safeName,
        action: `Error: ${errMsg}`,
        bytes: fileSize
      });
    }
  }
};

