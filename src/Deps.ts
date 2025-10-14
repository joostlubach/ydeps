import { AsyncLocalStorage } from 'async_hooks'
import { AbstractConstructor, Constructor, hasFunction, isFunction, isPromise } from 'ytil'

import { AsyncDependencyError, DependencyNotFoundError } from './errors'
import { Dependency, DepsOptions } from './types'

export class Deps {

  // #region Lifecycle

  constructor(
    private readonly options: DepsOptions = {},
  ) {}

  public disposeAll() {
    for (const instance of this.allUsed()) {
      if (hasFunction(instance, 'dispose')) {
        instance.dispose()
      }
    }
    this.keyedCache.clear()
    this.unkeyedCache.clear()
  }

  private deps = new Map<any, Dependency<any>>()
  private keyedCache = new Map<any, any>()
  private unkeyedCache = new Set<any>()

  public static create(init: (deps: Deps) => void = () => {}, options: DepsOptions = {}) {
    const deps = new Deps(options)
    init(deps)
    return deps
  }

  // #endregion

  // #region Async singleton

  public static child(options: Omit<DepsOptions, 'upstream'> = {}) {
    return new Deps({
      ...options,
      upstream: Deps.current(),
    })
  }

  public static current() {
    return context.getStore() ?? new Deps()
  }

  // #region Factory

  // #endregion
  
  // #region Run

  public run<R>(callback: (deps: Deps) => R): R {
    return context.run(this, () => callback(this))
  }

  // #endregion


  // #endregion

  public provide<Ctor extends Constructor<any>>(key: Ctor, dep: Dependency<InstanceType<Ctor>>): void
  public provide<T, K>(key: K, dep: Dependency<T>): void
  public provide<T, K>(key: K, dep: Dependency<T>) {
    this.deps.set(key, dep)
  }

  public has(key: any) {
    return this.deps.has(key)
  }

  public get<Ctor extends Constructor<any> | AbstractConstructor<any>>(key: Ctor): InstanceType<Ctor>
  public get<T>(key: any): T
  public get(key: any) {
    const value = this.getSyncOrAsync(key)
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
    if (hasFunction(instance, 'dispose')) {
      await instance.dispose()
    }
    return retval
  }

  public async getAsync<Ctor extends Constructor<any>>(key: Ctor): Promise<InstanceType<Ctor>>
  public async getAsync<T>(key: any): Promise<T>
  public async getAsync(key: any) {
    return Promise.resolve(this.getSyncOrAsync(key))
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

  public getSyncOrAsync<T>(key: any): T | Promise<T> {
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
      return this.options.upstream.getSyncOrAsync(key)
    }

    // Finally, we cannot obtain the dependency.
    const name = 'name' in key && typeof key.name === 'string' ? key.name : key
    const error = new DependencyNotFoundError(`Dependency '${name}' not provided`)
    Error.captureStackTrace(error, this.get)
    throw error
  }

  private _cacheAndReturn<T>(key: any, value: T | Promise<T>): T | Promise<T> {
    this.keyedCache.set(key, value)
    return value
  }

}

const context = new AsyncLocalStorage<Deps>()

type RestArgsOf<Ctor extends Constructor<any> | AbstractConstructor<any>> =
  Ctor extends new (deps: Deps, ...args: infer A) => any ? A :
  Ctor extends abstract new (deps: Deps, ...args: infer A) => any ? A :
  never