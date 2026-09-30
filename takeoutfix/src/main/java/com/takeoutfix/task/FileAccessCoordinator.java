package com.takeoutfix.task;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantReadWriteLock;

/**
 * Coordinates file and directory access across concurrent background tasks.
 * Prevents conflicting write-write and read-write collisions (e.g. Metadata Sync writing
 * to an image while Edit Metadata or Duplicate Finder processes that same file).
 *
 * Implements shared-read / exclusive-write semantics keyed by canonical path.
 */
public class FileAccessCoordinator {

    private final ConcurrentHashMap<String, ReentrantReadWriteLock> pathLocks = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> writeOwners = new ConcurrentHashMap<>();

    private String normalizePath(Path path) {
        if (path == null) {
            throw new IllegalArgumentException("Path cannot be null");
        }
        try {
            File f = path.toFile();
            return f.getCanonicalPath().toLowerCase(Locale.ROOT);
        } catch (IOException e) {
            return path.toAbsolutePath().normalize().toString().toLowerCase(Locale.ROOT);
        }
    }

    private ReentrantReadWriteLock getLockForPath(String key) {
        return pathLocks.computeIfAbsent(key, k -> new ReentrantReadWriteLock(true));
    }

    /**
     * Acquires a shared read lock for the given path.
     * Multiple tasks can read the same file concurrently.
     */
    public boolean tryAcquireSharedRead(Path path, String taskId) {
        String key = normalizePath(path);
        String currentWriter = writeOwners.get(key);
        if (currentWriter != null && !currentWriter.equals(taskId)) {
            return false;
        }
        ReentrantReadWriteLock rwLock = getLockForPath(key);
        return rwLock.readLock().tryLock();
    }

    public void acquireSharedRead(Path path, String taskId) {
        String key = normalizePath(path);
        ReentrantReadWriteLock rwLock = getLockForPath(key);
        rwLock.readLock().lock();
    }

    public void releaseSharedRead(Path path, String taskId) {
        String key = normalizePath(path);
        ReentrantReadWriteLock rwLock = pathLocks.get(key);
        if (rwLock != null) {
            try {
                rwLock.readLock().unlock();
            } catch (IllegalMonitorStateException ignored) {}
        }
    }

    /**
     * Acquires an exclusive write lock for the given path.
     * Prevents other tasks from writing to or reading from this file until released.
     */
    public boolean tryAcquireExclusiveWrite(Path path, String taskId) {
        String key = normalizePath(path);
        ReentrantReadWriteLock rwLock = getLockForPath(key);
        boolean locked = rwLock.writeLock().tryLock();
        if (locked) {
            writeOwners.put(key, taskId);
        }
        return locked;
    }

    public void acquireExclusiveWrite(Path path, String taskId) {
        String key = normalizePath(path);
        ReentrantReadWriteLock rwLock = getLockForPath(key);
        rwLock.writeLock().lock();
        writeOwners.put(key, taskId);
    }

    public void releaseExclusiveWrite(Path path, String taskId) {
        String key = normalizePath(path);
        writeOwners.remove(key);
        ReentrantReadWriteLock rwLock = pathLocks.get(key);
        if (rwLock != null) {
            try {
                rwLock.writeLock().unlock();
            } catch (IllegalMonitorStateException ignored) {}
        }
    }

    public boolean isWriteLocked(Path path) {
        String key = normalizePath(path);
        ReentrantReadWriteLock rwLock = pathLocks.get(key);
        return rwLock != null && rwLock.isWriteLocked();
    }

    public String getWriteOwner(Path path) {
        String key = normalizePath(path);
        return writeOwners.get(key);
    }

    public void clear() {
        pathLocks.clear();
        writeOwners.clear();
    }
}
