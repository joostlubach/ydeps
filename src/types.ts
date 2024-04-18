import DependencyContainer from './DependencyContainer'

export interface DependencyContainerOptions {
  upstream?: DependencyContainer
  fallback?: DependencyFallback
}

export type DependencyFallback = (key: any) => any | undefined
export type Dependency<T> = () => T | Promise<T>
