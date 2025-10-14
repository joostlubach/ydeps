import { Deps } from './Deps'

export interface DepsOptions {
  upstream?: Deps
  fallback?: DependencyFallback
}

export type DependencyFallback = (deps: Deps, key: any) => any | undefined
export type Dependency<T> = (deps: Deps) => T | Promise<T>
