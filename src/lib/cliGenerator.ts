import type { CliCommand, CliTool } from '../types/download'

export function generateCommands(
  url: string,
  fileName: string,
  connections: number,
): CliCommand[] {
  const safeFileName = fileName.replace(/"/g, '\\"')
  const safeUrl = url.replace(/"/g, '\\"')
  const conns = Math.min(Math.max(1, connections), 16)

  const commands: CliCommand[] = [
    {
      tool: 'aria2c' as CliTool,
      command: `aria2c -x ${conns} -s ${conns} -k 1M --file-allocation=none -o "${safeFileName}" "${safeUrl}"`,
      description: 'Fastest. Supports parallel segments natively.',
    },
    {
      tool: 'curl' as CliTool,
      command: `curl -L -o "${safeFileName}" "${safeUrl}"`,
      description: 'Pre-installed on most systems. Single connection.',
    },
    {
      tool: 'wget' as CliTool,
      command: `wget -c -O "${safeFileName}" "${safeUrl}"`,
      description: 'Supports resume. Install: brew install wget',
    },
  ]

  return commands
}
