import { useState, useCallback } from 'react'
import { analyzeUrl } from '../lib/urlAnalyzer'
import type { FileAnalysis } from '../types/download'

interface UseUrlAnalyzerResult {
  analysis: FileAnalysis | null
  isAnalyzing: boolean
  error: string | null
  analyze: (url: string) => Promise<void>
  reset: () => void
}

export function useUrlAnalyzer(): UseUrlAnalyzerResult {
  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback(async (url: string) => {
    setIsAnalyzing(true)
    setError(null)
    setAnalysis(null)
    try {
      const result = await analyzeUrl(url)
      setAnalysis(result)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsAnalyzing(false)
    }
  }, [])

  const reset = useCallback(() => {
    setAnalysis(null)
    setError(null)
    setIsAnalyzing(false)
  }, [])

  return { analysis, isAnalyzing, error, analyze, reset }
}
