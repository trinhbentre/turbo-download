export interface ChunkRange {
  start: number
  end: number
}

export function calculateChunks(
  fileSize: number,
  connections: number,
  minChunkSize: number,
): ChunkRange[] {
  const chunkSize = Math.max(minChunkSize, Math.ceil(fileSize / connections))
  const chunks: ChunkRange[] = []
  let offset = 0

  while (offset < fileSize) {
    const end = Math.min(offset + chunkSize - 1, fileSize - 1)
    chunks.push({ start: offset, end })
    offset = end + 1
  }

  return chunks
}

export function suggestConnections(fileSize: number): number {
  if (fileSize < 1_048_576) return 1            // < 1 MB
  if (fileSize < 10_485_760) return 4           // 1-10 MB
  if (fileSize < 104_857_600) return 8          // 10-100 MB
  if (fileSize < 1_073_741_824) return 12       // 100 MB - 1 GB
  return 16                                     // > 1 GB
}
