import { ConvexClient } from 'convex/browser'
import { Context, Effect, Queue, Stream } from 'effect'

import { api } from '../convex/_generated/api'

export const Todo = {
  fromConvex: (todo: {
    readonly _id: string
    readonly _creationTime: number
    readonly text: string
  }) => ({
    id: todo._id,
    text: todo.text,
    createdAt: todo._creationTime,
  }),
}

export type Todo = ReturnType<typeof Todo.fromConvex>

export type TodosEvent =
  | { readonly _tag: 'LoadedTodos'; readonly todos: ReadonlyArray<Todo> }
  | { readonly _tag: 'FailedLoadTodos'; readonly error: string }

export type ConvexTodosShape = {
  readonly create: (text: string) => Effect.Effect<void, string>
  readonly subscribe: Stream.Stream<TodosEvent>
}

type ConvexTodo = Parameters<typeof Todo.fromConvex>[0]

export class ConvexTodos extends Context.Service<
  ConvexTodos,
  ConvexTodosShape
>()('strudel/ConvexTodos') {}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const makeConvexTodos = (url: string): ConvexTodosShape => {
  const client = new ConvexClient(url)

  return {
    create: text =>
      Effect.tryPromise({
        try: () => client.mutation(api.todos.create, { text }),
        catch: errorMessage,
      }).pipe(Effect.asVoid),

    subscribe: Stream.callback<TodosEvent>(queue =>
      Effect.acquireRelease(
        Effect.sync(() =>
          client.onUpdate(
            api.todos.list,
            {},
            todos => {
              void Effect.runPromise(
                Queue.offer(queue, {
                  _tag: 'LoadedTodos',
                  todos: (todos as ReadonlyArray<ConvexTodo>).map(
                    Todo.fromConvex,
                  ),
                }).pipe(Effect.catch(() => Effect.void)),
              )
            },
            error => {
              void Effect.runPromise(
                Queue.offer(queue, {
                  _tag: 'FailedLoadTodos',
                  error: errorMessage(error),
                }).pipe(Effect.catch(() => Effect.void)),
              )
            },
          ),
        ),
        unsubscribe => Effect.sync(() => unsubscribe()),
      ),
    ),
  }
}
