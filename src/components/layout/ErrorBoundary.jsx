import { Component } from 'react'
import styles from './ErrorBoundary.module.css'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          <div className={styles.content}>
            <div className={styles.logo}>S</div>
            <h1 className={styles.title}>ScholarLib</h1>
            <p className={styles.message}>
              Something went wrong. Your data is safe in Box.
            </p>
            {this.state.error && (
              <p className={styles.errorDetail}>
                {this.state.error.message || 'Unknown error'}
              </p>
            )}
            <div className={styles.actions}>
              <button
                className={styles.primaryBtn}
                onClick={this.handleReload}
              >
                Reload App
              </button>
              <button
                className={styles.secondaryBtn}
                onClick={this.handleReset}
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
