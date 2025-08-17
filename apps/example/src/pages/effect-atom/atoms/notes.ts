import { Atom } from '@effect-atom/atom-react'
import * as Effect from 'effect/Effect'
import { atomRuntime } from '../runtime'
import { ApiService } from '../api-service'

// ✅ Atoms defined outside components - no performance issues
// ✅ No recreation on every render
// ✅ Better memoization and optimization

/**
 * Simple text atom for todo input
 */
export const todoTextAtom = Atom.make('')

/**
 * Custom atom for getting first todo using ApiService (HTTP API)
 * This demonstrates mixing both approaches
 */
export const getFirstTodoAtom = atomRuntime.fn(
  Effect.fnUntraced(function* () {
    const client = yield* ApiService
    return yield* client.notes.getFirst()
  }),
)
