import { AppHeader } from '@web-tools/ui'

function TurboIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

export function Header() {
  return <AppHeader toolName="TurboDownload" toolIcon={<TurboIcon />} />
}
