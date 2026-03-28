import { useState, useCallback } from 'react'
import { ModeSelector, CopyButton } from '@web-tools/ui'
import { generateCommands } from '../lib/cliGenerator'
import type { CliTool } from '../types/download'

interface CliCommandPanelProps {
  url: string
  fileName: string
  connections: number
}

const TOOL_INFO: Record<CliTool, { label: string; install: string }> = {
  aria2c: {
    label: 'aria2c',
    install: 'Fastest. Install: brew install aria2',
  },
  curl: {
    label: 'curl',
    install: 'Pre-installed on most systems.',
  },
  wget: {
    label: 'wget',
    install: 'Install: brew install wget',
  },
}

const TOOL_ORDER: CliTool[] = ['aria2c', 'curl', 'wget']

export function CliCommandPanel({ url, fileName, connections }: CliCommandPanelProps) {
  const [selectedTool, setSelectedTool] = useState<CliTool>('aria2c')

  const handleToolChange = useCallback((tool: string) => {
    setSelectedTool(tool as CliTool)
  }, [])

  const commands = generateCommands(url, fileName, connections)
  const selected = commands.find((c) => c.tool === selectedTool) ?? commands[0]

  const options = TOOL_ORDER.map((tool) => ({ id: tool, label: TOOL_INFO[tool].label }))

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-warning text-sm font-medium">⚠️ CORS blocked — use CLI instead</span>
      </div>

      <ModeSelector
        options={options}
        activeId={selectedTool}
        onChange={handleToolChange}
        variant="pill"
      />

      {selected && (
        <>
          <div className="relative">
            <pre className="bg-surface-900 border border-surface-600 rounded p-3 font-mono text-xs text-text-primary overflow-x-auto whitespace-pre-wrap break-all">
              {selected.command}
            </pre>
            <div className="absolute top-2 right-2">
              <CopyButton value={selected.command} />
            </div>
          </div>

          <p className="text-xs text-text-muted">
            {TOOL_INFO[selectedTool].install}
          </p>
        </>
      )}
    </div>
  )
}
