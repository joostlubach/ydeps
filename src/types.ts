import DependencyProvider from './DependencyProvider'

export interface DependencyProviderOptions {
  upstream?: DependencyProvider
  fallback?: DependencyFallback
}

export type DependencyFallback = (key: any) => any | undefined
export type Dependency<T> = () => T | Promise<T>
