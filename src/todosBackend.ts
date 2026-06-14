import { GenericId } from '@confect/core'
import { WebSocketClient } from '@confect/js'
import { Context, Data, Effect, Layer, Schema as S, Stream } from 'effect'

import refs from '../confect/_generated/refs'
import { Todos } from '../confect/tables/todos'

export const Todo = Todos.Doc
export type Todo = typeof Todo.Type

export const TodoId = GenericId.GenericId('todos')
export type TodoId = typeof TodoId.Type

const BackendOperation = S.Literals(['ListTodos', 'CreateTodo', 'DeleteTodo'])
type BackendOperation = typeof BackendOperation.Type

const errorDisplayText = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && '_tag' in error) {
    return globalThis.String(error._tag)
  }

  return globalThis.String(error)
}

export class TodosBackendError extends Data.TaggedError(
  'TodosBackendError',
)<{
  readonly operation: BackendOperation
  readonly message: string
  readonly cause: unknown
}> {}

const toBackendError =
  (operation: BackendOperation) =>
  (cause: unknown): TodosBackendError =>
    new TodosBackendError({
      operation,
      message: errorDisplayText(cause),
      cause,
    })

type TodosBackendShape = {
  readonly todos: Stream.Stream<ReadonlyArray<Todo>, TodosBackendError>
  readonly create: (
    text: string,
  ) => Effect.Effect<TodoId, TodosBackendError>
  readonly delete: (
    id: TodoId,
  ) => Effect.Effect<null, TodosBackendError>
}

export class TodosBackend extends Context.Service<
  TodosBackend,
  TodosBackendShape
>()('strudel/TodosBackend') {}

export const TodosBackendLive = Layer.effect(
  TodosBackend,
  Effect.gen(function* () {
    const confect = yield* WebSocketClient.WebSocketClient

    return {
      todos: confect.reactiveQuery(refs.public.todos.list).pipe(
        Stream.mapError(toBackendError('ListTodos')),
      ),
      create: (text: string) =>
        confect.mutation(refs.public.todos.create, { text }).pipe(
          Effect.mapError(toBackendError('CreateTodo')),
        ),
      delete: (id: TodoId) =>
        confect.mutation(refs.public.todos.deleteTodo, { id }).pipe(
          Effect.mapError(toBackendError('DeleteTodo')),
        ),
    } satisfies TodosBackendShape
  }),
)

export const makeTodosBackendTestLayer = (
  backend: TodosBackendShape,
): Layer.Layer<TodosBackend> => Layer.succeed(TodosBackend, backend)
