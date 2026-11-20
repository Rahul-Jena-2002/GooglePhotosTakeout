export async function getUniqueFileHandle(dir: FileSystemDirectoryHandle, filename: string): Promise<FileSystemFileHandle> {
  const dot = filename.lastIndexOf('.');
  const base = dot > 0 ? filename.substring(0, dot) : filename;
  const ext = dot > 0 ? filename.substring(dot) : '';
  let count = 0;
  while (true) {
    const candidate = count === 0 ? filename : `${base} (${count})${ext}`;
    try {
      await dir.getFileHandle(candidate);
    } catch (err) {
      if (!(err instanceof DOMException) || err.name !== 'NotFoundError') throw err;
      return dir.getFileHandle(candidate, { create: true });
    }
    count++;
  }
}
