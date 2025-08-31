import { useConvexQuery, useConvexAction, useConvexMutation } from "@convex-dev/react-query";
import { Effect } from 'effect'
import * as Option from 'effect/Option'
import type {
  InferModuleFunctionErrors,
  InferFunctionArgs,
  InferFunctionReturns
} from './types'

export type { ConfectErrorTypes } from './types'



/**
 * Hook for reactive queries that return Effect. Use this for data fetching
 * operations that need reactive updates and Effect-based error handling.
 *
 * @example
 * ```tsx
 * import { api } from '@/convex/_generated/api'
 * import { useQuery } from '@monorepo/confect/react'
 * import { Effect } from 'effect'
 * import { runtime } from '@/lib/runtime'
 *
 * function TodosList() {
 *   const [todos, setTodos] = useState([])
 *   const todosEffect = useQuery(api, 'functions', 'listTodos')({})
 *   //        ^ Effect<Todo[], NotFoundError | ValidationError, never>
 *   // Success channel: Todo[] - Array of todo objects
 *   // Error channel: NotFoundError | ValidationError - Typed errors from Confect hooks
 *
 *   useEffect(() => {
 *     const program = todosEffect.pipe(
 *       Effect.catchAll(error => Effect.log(`Failed: ${error}`))
 *     )
 *     runtime.runPromise(program).then(setTodos)
 *   }, [todosEffect])
 *
 *   return <div>{todos.map(todo => <div key={todo._id}>{todo.text}</div>)}</div>
 * }
 * ```
 */
export function useQuery<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject & string,
  F extends keyof ApiObject[M] & string,
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
): (args: InferFunctionArgs<ApiObject[M][F]>) => Effect.Effect<
  InferFunctionReturns<ApiObject[M][F]>,
  InferModuleFunctionErrors<M, F>,
  never
>

export function useQuery(...args: any[]) {
  const [apiObject, moduleName, functionName] = args
  const fn = apiObject[moduleName][functionName]

  return (actualArgs: any) => {
    try {
      const convexResult = useConvexQuery(fn as any, actualArgs)

      const processResult = Effect.sync(() => {
        if (convexResult === undefined) {
          return Effect.never
        }

        if (convexResult && typeof convexResult === 'object') {
          if ('__convexError' in convexResult) {
            return Effect.fail((convexResult as any).__convexError)
          }

          if ('_tag' in convexResult && 'message' in convexResult) {
            return Effect.fail(convexResult)
          }

          if ('message' in convexResult) {
            const message = (convexResult as any).message
            if (typeof message === 'string' && message.includes('ConvexError:')) {
              const jsonMatch = message.match(/ConvexError: ({.*})/)
              if (jsonMatch) {
                try {
                  const parsed = JSON.parse(jsonMatch[1]!)
                  if (parsed && typeof parsed === 'object' && '_tag' in parsed) {
                    return Effect.fail(parsed)
                  }
                  return Effect.fail({ _tag: 'UnknownError', message: JSON.stringify(parsed) })
                } catch {
                  return Effect.fail({ _tag: 'ParseError', message: 'Failed to parse ConvexError' })
                }
              }
            }
          }

          if ('error' in convexResult && convexResult.error) {
            const error = (convexResult as any).error
            if (error && typeof error === 'object' && 'data' in error) {
              return Effect.fail(error.data)
            }
            return Effect.fail(error)
          }

          if ('data' in convexResult) {
            const data = (convexResult as any).data
            if (data === undefined) {
              return Effect.never
            }
            return Effect.succeed(data)
          }
        }

        return Effect.succeed(convexResult)
      }).pipe(
        Effect.flatMap((effect) => effect),
        Effect.catchAll((error) => Effect.fail(error))
      )

      return processResult

    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as any).message
        if (typeof message === 'string' && message.includes('ConvexError:')) {
          const jsonMatch = message.match(/ConvexError: ({.*})/)
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[1]!)
              if (parsed && typeof parsed === 'object' && '_tag' in parsed) {
                return Effect.fail(parsed)
              }
              return Effect.fail({ _tag: 'UnknownError', message: JSON.stringify(parsed) })
            } catch  {
              // Fall through
            }
          }
        }
      }
      return Effect.fail(error as any)
    }
  }
}

/**
 * Hook for mutations that return Effect. Use this for data modification
 * operations that need Effect-based error handling and composition.
 *
 * @example
 * ```tsx
 * import { api } from '@/convex/_generated/api'
 * import { useMutation } from '@monorepo/confect/react'
 * import { Effect } from 'effect'
 * import { runtime } from '@/lib/runtime'
 *
 * function AddTodoForm() {
 *   const [text, setText] = useState('')
 *   const addTodoEffect = useMutation(api, 'functions', 'insertTodo')
 *   //        ^ (args: {text: string}) => Effect<Id<"todos">, ValidationError | NetworkError, never>
 *   // Success channel: Id<"todos"> - The created todo ID
 *   // Error channel: ValidationError | NetworkError - Typed errors from Confect hooks
 *
 *   const handleSubmit = () => {
 *     const program = addTodoEffect({ text }).pipe(
 *       Effect.catchTags({
 *         ValidationError: () => Effect.log('Invalid input'),
 *         NetworkError: () => Effect.log('Network failed')
 *       }),
 *       Effect.tap(() => Effect.sync(() => setText('')))
 *     )
 *     runtime.runPromise(program)
 *   }
 *
 *   return (
 *     <form onSubmit={handleSubmit}>
 *       <input value={text} onChange={(e) => setText(e.target.value)} />
 *       <button type="submit">Add Todo</button>
 *     </form>
 *   )
 * }
 * ```
 */
export function useMutation<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject & string,
  F extends keyof ApiObject[M] & string,
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
): (args: InferFunctionArgs<ApiObject[M][F]>) => Effect.Effect<InferFunctionReturns<ApiObject[M][F]>, InferModuleFunctionErrors<M, F>, never>

export function useMutation(...args: any[]) {
  const [apiObject, moduleName, functionName] = args
  const fn = apiObject[moduleName][functionName]
  const convexMutation = useConvexMutation(fn as any)

  return (actualArgs: any) =>
    Effect.tryPromise({
      try: () => convexMutation(actualArgs),
      catch: (error) => {
        if (error && typeof error === 'object' && 'message' in error) {
          const message = (error as any).message

          if (message && message.includes('ConvexError:')) {
            const jsonMatch = message.match(/ConvexError: ({.*})/)
            if (jsonMatch) {
              try {
                const parsed = JSON.parse(jsonMatch[1])

                if (parsed && typeof parsed === 'object' && '_tag' in parsed) {
                  return parsed
                } else {
                  return { _tag: 'UnknownError', message: JSON.stringify(parsed) }
                }
              } catch  {
                // Fall through to return raw error
              }
            }
          }
        }

        return error as any
      },
    })
}

/**
 * Hook for actions that return Effect. Use this for operations that need
 * to run in the background without blocking the UI.
 *
 * @example
 * ```tsx
 * import { api } from '@/convex/_generated/api'
 * import { useAction } from '@monorepo/confect/react'
 * import { Effect } from 'effect'
 * import { runtime } from '@/lib/runtime'
 *
 * function TodoItem({ todo }) {
 *   const toggleTodoEffect = useAction(api, 'functions', 'toggleTodo')
 *   //        ^ (args: {id: Id<"todos">}) => Effect<void, NotFoundError | ValidationError, never>
 *   // Success channel: void - No return value for toggle action
 *   // Error channel: NotFoundError | ValidationError - Typed errors from Confect hooks
 *
 *   const handleToggle = () => {
 *     const program = toggleTodoEffect({ id: todo._id }).pipe(
 *       Effect.catchAll(error =>
 *         Effect.log(`Failed to toggle todo: ${error}`)
 *       )
 *     )
 *     runtime.runPromise(program)
 *   }
 *
 *   return (
 *     <div>
 *       <input
 *         type="checkbox"
 *         checked={todo.completed}
 *         onChange={handleToggle}
 *       />
 *       {todo.text}
 *     </div>
 *   )
 * }
 * ```
 */
export function useAction<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject & string,
  F extends keyof ApiObject[M] & string,
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
): (args: InferFunctionArgs<ApiObject[M][F]>) => Effect.Effect<InferFunctionReturns<ApiObject[M][F]>, InferModuleFunctionErrors<M, F>, never>

// Implementation that handles the API
export function useAction(...args: any[]) {
  // Extract arguments
  const [apiObject, moduleName, functionName] = args
  const fn = apiObject[moduleName][functionName]
  const convexAction = useConvexAction(fn as any)

  return (actualArgs: any) =>
    Effect.tryPromise({
      try: () => convexAction(actualArgs),
      catch: (error) => {
        if (error && typeof error === 'object' && 'message' in error) {
          const message = (error as any).message
          if (message && message.includes('ConvexError:')) {
            const jsonMatch = message.match(/ConvexError: ({.*})/)
            if (jsonMatch) {
              try {
                return JSON.parse(jsonMatch[1])
              } catch {
                return {
                  _tag: 'ParseError',
                  message: 'Failed to parse ConvexError',
                }
              }
            }
          }
        }
        return error as any
      },
    })
}

/**
 * Hook for queries that return Option<data | error>.
 * Uses Effect internally instead of try-catch for better error handling.
 *
 * Returns:
 * - Option.none() = loading state
 * - Option.some(data) = success with data
 * - Option.some(error) = error state (typed as InferFunctionErrors<F>)
 *
 * @example
 * ```tsx
 * import { api } from '@/convex/_generated/api'
 * import { useQueryOption } from '@monorepo/confect/react'
 * import * as Option from 'effect/Option'
 *
 * function TodosList() {
 *   const todosResult = useQueryOption(api, 'functions', 'listTodos')({})
 *   //        ^ Option<Todo[] | NotFoundError | ValidationError>
 *   // Option.none() = Loading state
 *   // Success channel: Todo[] - Array of todo objects
 *   // Error channel: NotFoundError | ValidationError - Typed errors from Confect hooks
 *
 *   return Option.match(todosResult, {
 *     onNone: () => <div>Loading...</div>,
 *     onSome: (result) => {
 *       // Check if result is an error (has _tag property)
 *       if (result && typeof result === 'object' && '_tag' in result) {
 *         return <div>Error ({result._tag}): {result.message}</div>
 *       }
 *
 *       // Success case - result is the todos array
 *       const todos = result as Todo[]
 *       return (
 *         <ul>
 *           {todos.map(todo => <li key={todo._id}>{todo.text}</li>)}
 *         </ul>
 *       )
 *     }
 *   })
 * }
 * ```
 */
export function useQueryOption<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject & string,
  F extends keyof ApiObject[M] & string,
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
): (args: InferFunctionArgs<ApiObject[M][F]>) => Option.Option<
  InferFunctionReturns<ApiObject[M][F]> | InferModuleFunctionErrors<M, F>
>

// Implementation that handles the API using Effect instead of try-catch
export function useQueryOption(...args: any[]) {
  // Extract arguments
  const [apiObject, moduleName, functionName] = args
  const fn = apiObject[moduleName][functionName]

  return (actualArgs: any) => {
    try {
      const convexResult = useConvexQuery(fn, actualArgs)

      const processResult = Effect.sync(() => {
        if (convexResult === undefined) {
          return Option.none()
        }

        if (convexResult && typeof convexResult === 'object') {
          if ('__convexError' in convexResult) {
            const error = (convexResult as any).__convexError
            return Option.some({
              _tag: error._tag || 'ConvexError',
              message: error.message || String(error)
            })
          }

          if ('_tag' in convexResult && 'message' in convexResult) {
            return Option.some(convexResult)
          }

          if ('message' in convexResult) {
            const message = (convexResult as any).message
            if (typeof message === 'string' && message.includes('ConvexError:')) {
              const jsonMatch = message.match(/ConvexError: ({.*})/)
              if (jsonMatch) {
                try {
                  const parsed = JSON.parse(jsonMatch[1]!)
                  if (parsed && typeof parsed === 'object' && '_tag' in parsed) {
                    return Option.some(parsed)
                  }
                } catch  {
                  return Option.some({
                    _tag: 'ParseError',
                    message: 'Failed to parse ConvexError'
                  })
                }
              }
            }
          }

          if ('error' in convexResult && convexResult.error) {
            const error = (convexResult as any).error
            return Option.some({
              _tag: error._tag || 'QueryError',
              message: error.message || String(error)
            })
          }

          if ('data' in convexResult) {
            const data = (convexResult as any).data
            if (data === undefined) {
              return Option.none()
            }
            return Option.some(data)
          }
        }

        return Option.some(convexResult)
      }).pipe(
        Effect.catchAll((error) => {
          return Effect.succeed(Option.some({
            _tag: 'UnknownError',
            message: String(error)
          }))
        })
      )

      return Effect.runSync(processResult)

    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error) {
        const message = (error as any).message
        if (typeof message === 'string' && message.includes('ConvexError:')) {
          const jsonMatch = message.match(/ConvexError: ({.*})/)
          if (jsonMatch) {
            try {
              const parsed = JSON.parse(jsonMatch[1]!)
              if (parsed && typeof parsed === 'object' && '_tag' in parsed) {
                return Option.some(parsed)
              }
            } catch {
              // Fall through
            }
          }
        }
      }

      return Option.some({
        _tag: 'UnknownError',
        message: String(error)
      })
    }
  }
}
