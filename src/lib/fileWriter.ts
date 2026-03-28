export function isFileSystemAccessSupported(): boolean {
  return 'showSaveFilePicker' in window
}

type ShowSaveFilePickerFn = (opts: unknown) => Promise<FileSystemFileHandle>

export async function openSaveFilePicker(
  fileName: string,
  contentType: string,
): Promise<FileSystemFileHandle> {
  return (window as unknown as { showSaveFilePicker: ShowSaveFilePickerFn }).showSaveFilePicker({
    suggestedName: fileName,
    types: [
      {
        description: 'File',
        accept: { [contentType || 'application/octet-stream']: [] },
      },
    ],
  })
}

// Streaming write queue for writing chunks directly to disk at specific offsets.
// Uses File System Access API with keepExistingData to support resume.
export class FileWriteQueue {
  private queue: Promise<void> = Promise.resolve()
  private writable: FileSystemWritableFileStream | null = null

  async init(handle: FileSystemFileHandle): Promise<void> {
    this.writable = await handle.createWritable({ keepExistingData: true })
  }

  writeAt(offset: number, data: BufferSource): Promise<void> {
    const promise = this.queue.then(async () => {
      if (!this.writable) throw new Error('FileWriteQueue not initialized')
      await this.writable.write({ type: 'write', position: offset, data })
    })
    // Keep queue advancing even if a write fails
    this.queue = promise.catch(() => {})
    return promise
  }

  async close(): Promise<void> {
    await this.queue
    if (this.writable) {
      await this.writable.close()
      this.writable = null
    }
  }
}

export async function saveWithPreOpenedHandle(
  chunks: ArrayBuffer[],
  handle: FileSystemFileHandle,
): Promise<void> {
  const writable = await handle.createWritable()
  for (const chunk of chunks) {
    await writable.write(chunk)
  }
  await writable.close()
}

export async function saveWithFileSystemAccess(
  chunks: ArrayBuffer[],
  fileName: string,
  contentType: string,
): Promise<void> {
  const handle = await openSaveFilePicker(fileName, contentType)
  await saveWithPreOpenedHandle(chunks, handle)
}

export function saveWithBlob(chunks: ArrayBuffer[], fileName: string, contentType: string): void {
  const blob = new Blob(chunks, { type: contentType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function saveFile(
  chunks: ArrayBuffer[],
  fileName: string,
  contentType: string,
  useFileSystemAccess: boolean,
  fileHandle?: FileSystemFileHandle,
): Promise<void> {
  if (fileHandle) {
    await saveWithPreOpenedHandle(chunks, fileHandle)
  } else if (useFileSystemAccess && isFileSystemAccessSupported()) {
    await saveWithFileSystemAccess(chunks, fileName, contentType)
  } else {
    saveWithBlob(chunks, fileName, contentType)
  }
}
