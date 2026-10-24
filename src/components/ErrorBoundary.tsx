import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Without this, any error thrown while rendering unmounts the whole tree and
 * leaves a blank page.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error while rendering:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div className="max-w-md">
          <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 font-mono text-xs break-words text-ink-muted">{error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-sm border border-line px-3 py-1.5 font-mono text-[10px] tracking-widest text-ink-muted uppercase transition hover:border-leaf/40 hover:text-leaf"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
