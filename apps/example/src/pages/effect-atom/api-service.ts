import * as HttpApiClient from '@effect/platform/HttpApiClient'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import { Api } from '../../../convex/http/api'

export class ApiService extends Effect.Service<ApiService>()('ApiService', {
  effect: Effect.gen(function* () {
    return yield* HttpApiClient.make(Api, {
      baseUrl: yield* Config.url('VITE_CONVEX_API_URL').pipe(Config.withDefault('http://localhost:3211')),
    })
  }),
}) {}
