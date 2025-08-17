import { useAtomValue, useAtomSet } from "@effect-atom/atom-react";
import { Result } from "@effect-atom/atom";
import * as Effect from "effect/Effect";
import React, { createContext, useContext, useMemo } from "react";
import { useQuery, useMutation, useAction } from "./index";
import type {
  InferModuleFunctionErrors,
  InferFunctionArgs,
  InferFunctionReturns,
} from "./types";

export type { ConfectErrorTypes } from "./types";

const ConfectContext = createContext<any>(null);

/**
 * Provider component that provides atom runtime context for Confect hooks.
 *
 * @example
 * ```tsx
 * import { atomRuntime } from '@/lib/runtime'
 *
 * function App() {
 *   return (
 *     <ConfectProvider atomRuntime={atomRuntime}>
 *       <TodosComponent />
 *     </ConfectProvider>
 *   )
 * }
 * ```
 */
export function ConfectProvider({
  children,
  atomRuntime,
}: {
  children: React.ReactNode;
  atomRuntime: any;
}) {
  return (
    <ConfectContext.Provider value={atomRuntime}>
      {children}
    </ConfectContext.Provider>
  );
}

function useAtomRuntime() {
  const atomRuntime = useContext(ConfectContext);
  if (!atomRuntime) {
    throw new Error("useAtomRuntime must be used within a ConfectProvider");
  }
  return atomRuntime;
}

/**
 * Hook for reactive queries using effect-atom. Returns a Result that automatically
 * updates when the query data changes.
 *
 * @example
 * ```tsx
 * import { api } from '@/convex/_generated/api'
 * import { useAtomValueConfect } from '@monorepo/confect/react/effect-atom'
 * import { Result } from '@effect-atom/atom-react'
 *
 * function TodosList() {
 *   const todosResult = useAtomValueConfect(api, 'functions', 'listTodos', {})
 *   //        ^ Result<Todo[], NotFoundError | ValidationError>
 *   // Success channel: Todo[] - Array of todo objects
 *   // Error channel: NotFoundError | ValidationError - Typed errors from Confect hooks
 *
 *   return (
 *     <div>
 *       {Result.builder(todosResult)
 *         .onWaiting(() => <div>Loading...</div>)
 *         .onSuccess((todos) => (
 *           <ul>
 *             {todos.map(todo => <li key={todo._id}>{todo.text}</li>)}
 *           </ul>
 *         ))
 *         .onFailure((error) => <div>Error loading todos: {error.message}</div>)
 *         .render()}
 *     </div>
 *   )
 * }
 * ```
 */
export function useAtomValueConfect<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject & string,
  F extends keyof ApiObject[M] & string,
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
  args: InferFunctionArgs<ApiObject[M][F]>,
): Result.Result<
  InferFunctionReturns<ApiObject[M][F]>,
  InferModuleFunctionErrors<M, F>
> {
  const atomRuntime = useAtomRuntime();
  const queryEffect = useQuery(apiObject, moduleName, functionName)(args);

  const queryAtom = useMemo(
    () => atomRuntime.atom(queryEffect),
    [queryEffect, atomRuntime],
  );

  return useAtomValue(queryAtom);
}

/**
 * Hook for mutations using effect-atom. Returns a function that executes
 * the mutation and returns a Promise.
 *
 * @example
 * ```tsx
 * import { api } from '@/convex/_generated/api'
 * import { useAtomSetConfect } from '@monorepo/confect/react/effect-atom'
 *
 * function AddTodoForm() {
 *   const [text, setText] = useState('')
 *   const addTodo = useAtomSetConfect(api, 'functions', 'insertTodo')
 *   //      ^ (args: {text: string}) => Promise<Id<"todos">>
 *   // Success channel: Id<"todos"> - The created todo ID
 *   // Error channel: ValidationError | NetworkError - Typed errors from Confect hooks
 *
 *   const handleSubmit = async () => {
 *     try {
 *       await addTodo({ text })
 *       setText('')
 *     } catch (error) {
 *       console.error('Failed to add todo:', error)
 *     }
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
export function useAtomSetConfect<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject & string,
  F extends keyof ApiObject[M] & string,
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
): (
  args: InferFunctionArgs<ApiObject[M][F]>,
) => Promise<InferFunctionReturns<ApiObject[M][F]>> {
  const atomRuntime = useAtomRuntime();
  const mutationEffect = useMutation(apiObject, moduleName, functionName);

  const mutationAtom = useMemo(
    () =>
      atomRuntime.fn(
        Effect.fn(function* (args: InferFunctionArgs<ApiObject[M][F]>) {
          const mutationId = Math.random().toString(36).substring(2, 11);
          const mutationKey = `mutation`;

          yield* Effect.log(
            `[${mutationKey}] Starting mutation #${mutationId}`,
          );
          const result = yield* mutationEffect(args);
          yield* Effect.log(
            `[${mutationKey}] Completed mutation #${mutationId}`,
          );

          return result;
        }),
      ),
    [mutationEffect, atomRuntime],
  );

  return useAtomSet(mutationAtom, { mode: "promise" } as any) as any;
}

/**
 * Hook for actions using effect-atom. Returns a function that executes
 * the action and returns a Promise.
 *
 * @example
 * ```tsx
 * import { api } from '@/convex/_generated/api'
 * import { useAtomSetConfectAction } from '@monorepo/confect/react/effect-atom'
 *
 * function TodoItem({ todo }) {
 *   const toggleTodo = useAtomSetConfectAction(api, 'functions', 'toggleTodo')
 *   //        ^ (args: {id: Id<"todos">}) => Promise<void>
 *   // Success channel: void - No return value for toggle action
 *   // Error channel: NotFoundError | ValidationError - Typed errors from Confect hooks
 *
 *   const handleToggle = async () => {
 *     try {
 *       await toggleTodo({ id: todo._id })
 *     } catch (error) {
 *       console.error('Failed to toggle todo:', error)
 *     }
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
export function useAtomSetConfectAction<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject & string,
  F extends keyof ApiObject[M] & string,
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
): (
  args: InferFunctionArgs<ApiObject[M][F]>,
) => Promise<InferFunctionReturns<ApiObject[M][F]>> {
  const atomRuntime = useAtomRuntime();
  const actionEffect = useAction(apiObject, moduleName, functionName);

  const actionAtom = useMemo(
    () =>
      atomRuntime.fn(
        Effect.fn(function* (args: InferFunctionArgs<ApiObject[M][F]>) {
          const actionId = Math.random().toString(36).substring(2, 11);
          const actionKey = `action`;

          yield* Effect.log(`[${actionKey}] Starting action #${actionId}`);
          const result = yield* actionEffect(args);
          yield* Effect.log(`[${actionKey}] Completed action #${actionId}`);

          return result;
        }),
      ),
    [actionEffect, atomRuntime],
  );

  return useAtomSet(actionAtom, { mode: "promise" } as any) as any;
}

/**
 * Hook that combines query and mutation functionality. Returns both the
 * reactive query result and a mutation function.
 *
 * @example
 * ```tsx
 * import { api } from '@/convex/_generated/api'
 * import { useAtomConfect } from '@monorepo/confect/react/effect-atom'
 * import { Result } from '@effect-atom/atom-react'
 *
 * function TodosWithAdd() {
 *   const [todosResult, addTodo] = useAtomConfect(api, 'functions', 'listTodos', {})
 *   //      ^ [Result<Todo[], NotFoundError | ValidationError>, (args: {text: string}) => Promise<Id<"todos">>]
 *   // Query Success channel: Todo[] - Array of todo objects
 *   // Query Error channel: NotFoundError | ValidationError - Typed errors from Confect hooks
 *   // Mutation Success channel: Id<"todos"> - The created todo ID
 *   // Mutation Error channel: ValidationError | NetworkError - Typed errors from Confect hooks
 *
 *   const handleAdd = async (text: string) => {
 *     await addTodo({ text })
 *   }
 *
 *   return (
 *     <div>
 *       {Result.builder(todosResult)
 *         .onSuccess((todos) => (
 *           <div>
 *             {todos.map(todo => <div key={todo._id}>{todo.text}</div>)}
 *             <button onClick={() => handleAdd('New todo')}>Add Todo</button>
 *           </div>
 *         ))
 *         .onFailure((error) => <div>Error: {error.message}</div>)
 *         .render()}
 *     </div>
 *   )
 * }
 * ```
 */
export function useAtomConfect<
  ApiObject extends Record<string, any>,
  M extends keyof ApiObject & string,
  F extends keyof ApiObject[M] & string,
>(
  apiObject: ApiObject,
  moduleName: M,
  functionName: F,
  args: InferFunctionArgs<ApiObject[M][F]>,
) {
  const value = useAtomValueConfect(apiObject, moduleName, functionName, args);
  const setter = useAtomSetConfect(apiObject, moduleName, functionName);

  return [value, setter] as const;
}
