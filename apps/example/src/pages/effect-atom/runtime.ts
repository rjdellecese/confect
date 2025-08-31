import * as FetchHttpClient from '@effect/platform/FetchHttpClient'
import * as ConfigProvider from 'effect/ConfigProvider'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as LogLevel from 'effect/LogLevel'
import { ApiService } from './api-service'
import { ManagedRuntime } from 'effect'
import { Atom } from '@effect-atom/atom-react'

export const MainLayer = Logger.pretty.pipe(
  Layer.provideMerge(Layer.setConfigProvider(ConfigProvider.fromJson(import.meta.env))),
  Layer.provideMerge(Logger.minimumLogLevel(LogLevel.Debug)),
  Layer.provideMerge(ApiService.Default.pipe(Layer.provide(FetchHttpClient.layer))),
  Layer.tapErrorCause(Effect.logError),
)

const makeAtomRuntime = Atom.context({ memoMap: Atom.defaultMemoMap })
export const atomRuntime = makeAtomRuntime(MainLayer)
export const runtime = ManagedRuntime.make(MainLayer)

// export const { runtime, makeAtomRuntime, atomRuntime } = makeAtomRuntimeLayer(MainLayer)


makeAtomRuntime.addGlobalLayer(MainLayer)
