import { isFunction } from 'lodash'
import { Constructor, isPromise } from 'ytil'

import { AsyncDependencyError, DependencyNotFoundError } from './errors'
import { Dependency, DependencyContainerOptions } from './types'

export default class DependencyContainer {

  constructor(
    private readonly options: DependencyContainerOptions = {},
  ) {}

  public disposeAll() {
    for (const instance of this.allUsed()) {
      if ('dispose' in instance && isFunction(instance.dispose)) {
        instance.dispose()
      }
    }
    this.keyedCache.clear()
    this.unkeyedCache.clear()
  }

  private deps = new Map<any, Dependency<any>>()
  private keyedCache = new Map<any, any>()
  private unkeyedCache = new Set<any>()

  public static create(init: (deps: DependencyContainer) => void = () => {}, options: DependencyContainerOptions = {}) {
    const deps = new DependencyContainer(options)
    init(deps)
    return deps
  }

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

  public create<Ctor extends Constructor<any>>(Ctor: Ctor, ...args: RestArgsOf<Ctor>): InstanceType<Ctor> {
    return new Ctor(this, ...args)
  }

  public async using<Ctor extends Constructor<any, []>, T>(Ctor: Ctor, fn: (instance: InstanceType<Ctor>) => T | Promise<T>): Promise<T>
  public async using<Ctor extends Constructor<any>, T>(Ctor: Ctor, args: RestArgsOf<Ctor>, fn: (instance: InstanceType<Ctor>) => T | Promise<T>): Promise<T>
  public async using<Ctor extends Constructor<any>, T>(Ctor: Ctor, ...args: any[]): Promise<T> {
    const fn = args.pop()
    const instance = this.create(Ctor, ...args as any)

    const retval = await fn(instance)
    if ('dispose' in instance && isFunction(instance.dispose)) {
      await instance.dispose()
    }
    return retval
  }

  public async getAsync<Ctor extends Constructor<any>>(key: Ctor): Promise<InstanceType<Ctor>>
  public async getAsync<T>(key: any): Promise<T>
  public async getAsync(key: any) {
    return Promise.resolve(this._get(key))
  }

  public used(key: any) {
    return this.keyedCache.has(key)
  }

  public allUsed() {
    return [
      ...this.keyedCache.values(),
      ...this.unkeyedCache.values(),
    ]
  }

  private _get<T>(key: any): T | Promise<T> {
    const cached = this.keyedCache.get(key)
    if (cached != null) { return cached }

    // Try to see if we have the dependency.
    const dep = this.deps.get(key)
    if (dep != null) {
      return this._cacheAndReturn(key, dep(this))
    }

    // Otherwise, try the fallback.
    const fallback = this.options.fallback?.(this, key)
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
    this.keyedCache.set(key, value)
    return value
  }

}

type RestArgsOf<Ctor extends Constructor<any>> =
  Ctor extends new (deps: DependencyContainer, ...args: infer A) => any
    ? A : never