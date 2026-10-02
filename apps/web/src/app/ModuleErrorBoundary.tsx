import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  name: string;
  resetKey: string;
  onClearSelection: () => void;
}

interface State {
  error: Error | null;
}

/** Keep one malformed or oversized footage view from unmounting the workspace. */
export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Module ${this.props.name} failed to render`, error, info.componentStack);
  }

  componentDidUpdate(previous: Props) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <section aria-label={`Lỗi hiển thị ${this.props.name}`} className="module-render-error" role="alert">
      <strong>Không hiển thị được {this.props.name}</strong>
      <p>{this.state.error.message}</p>
      <button onClick={this.props.onClearSelection} type="button">Đóng footage</button>
      <button onClick={() => this.setState({ error: null })} type="button">Thử lại</button>
    </section>;
  }
}
