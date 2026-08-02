import { Component, type ReactNode } from 'react'

/**
 * Перехватчик ошибок отрисовки. Без него любая исключительная ситуация
 * в компоненте гасит всё приложение до белого экрана, и человек не понимает,
 * сломалось приложение или просто нет данных.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="screen">
        <div className="header">
          <h1 style={{ fontSize: 22 }}>Что-то сломалось</h1>
        </div>
        <div className="card">
          <div className="muted">
            Экран не удалось построить. Данные на устройстве не пострадали.
          </div>
          <div
            className="mute-sm"
            style={{ marginTop: 10, wordBreak: 'break-word', fontFamily: 'var(--font-num)' }}
          >
            {error.message}
          </div>
        </div>
        <button
          className="btn primary block"
          style={{ marginTop: 14 }}
          onClick={() => this.setState({ error: null })}
        >
          Попробовать снова
        </button>
        <button
          className="btn block"
          style={{ marginTop: 8 }}
          onClick={() => location.reload()}
        >
          Перезагрузить приложение
        </button>
      </div>
    )
  }
}
