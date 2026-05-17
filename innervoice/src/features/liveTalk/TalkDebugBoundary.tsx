import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string | null
}

export class TalkDebugBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // #region agent log
    fetch('http://127.0.0.1:7557/ingest/69d83c9c-05f0-432b-b66d-2c89382c215d', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0d719b' },
      body: JSON.stringify({
        sessionId: '0d719b',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'TalkDebugBoundary.tsx:componentDidCatch',
        message: 'Talk page render error',
        data: {
          errorMessage: error.message,
          stackHead: error.stack?.split('\n').slice(0, 3).join(' | ') ?? null,
          componentStackHead: info.componentStack?.split('\n').slice(0, 4).join(' | ') ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-sm text-red-200">Talk failed to load.</p>
          <p className="max-w-md text-xs text-text-tertiary">{this.state.errorMessage}</p>
        </div>
      )
    }
    return this.props.children
  }
}
