import { isFunction } from 'lodash'
import { Constructor, isPromise } from 'ytil'

import { AsyncDependencyError, DependencyNotFoundError } from './errors'
import { Dependency, DependencyProviderOptions } from './types'

export default class DependencyProvider {

  constructor(
    private readonly options: DependencyProviderOptions = {},
  ) {}

  private deps = new Map<any, Dependency<any>>()
  private cache = new Map<any, any | Promise<any>>()

  public provide<Ctor extends Constructor<any>>(key: Ctor, dep: Dependency<InstanceType<Ctor>>): void
  public provide<T, K>(key: K, dep: Dependency<T>): void
  public provide<T, K>(key: K, dep: Dependency<T>) {
    this.deps.set(key, dep)
  }

  public get<Ctor extends Constructor<any>>(key: Ctor): InstanceType<Ctor>
  public get<T>(key: any): T
  public get(key: any) {
    const value = this._get(key)
    if (isPromise(value)) {
      const name = isFunction(key) ? key.name : key
      throw new AsyncDependencyError(`Dependency '${name}' is async, use getAsync instead`)
    }

    return value
  }

  public async getAsync<Ctor extends Constructor<any>>(key: Ctor): Promise<InstanceType<Ctor>>
  public async getAsync<T>(key: any): Promise<T>
  public async getAsync(key: any) {
    return Promise.resolve(this._get(key))
  }

  private _get<T>(key: any): T | Promise<T> {
    const cached = this.cache.get(key)
    if (cached != null) { return cached }

    // Try to see if we have the dependency.
    const dep = this.deps.get(key)
    if (dep != null) {
      return this._cacheAndReturn(key, dep())
    }

    // Otherwise, try the fallback.
    const fallback = this.options.fallback?.(key)
    if (fallback != null) {
      return this._cacheAndReturn(key, fallback)
    }

    // If this provider cannot obtain the dependency, try the upstream provider.
    // In this case, we expect the upstream provider to manage caching.
    if (this.options.upstream != null) {
      return this.options.upstream._get(key)
    }

    // Finally, we cannot obtain the dependency.
    const name = isFunction(key) ? key.name : key
    throw new DependencyNotFoundError(`Dependency '${name}' not provided`)
  }

  private _cacheAndReturn<T>(key: any, value: T | Promise<T>): T | Promise<T> {
    this.cache.set(key, value)
    return value
  }

}
