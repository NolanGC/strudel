import { GenericId } from '@confect/core'
import { WebSocketClient } from '@confect/js'
import { Context, Data, Effect, Layer, Schema as S, Stream } from 'effect'

import refs from '../confect/_generated/refs'
import { Todos } from '../confect/tables/todos'
import { AuthService } from './authService'
import { ErrorMessage, errorMessage, toErrorMessage } from './userFacingError'

export const Todo = Todos.Doc
export type Todo = typeof Todo.Type

export const TodoId = GenericId.GenericId('todos')
export type TodoId = typeof TodoId.Type

const BackendOperation = S.Literals(['ListTodos', 'CreateTodo', 'DeleteTodo'])
type BackendOperation = typeof BackendOperation.Type

const errorDisplayText = (error: unknown): ErrorMessage => {
  if (typeof error === 'object' && error !== null && '_tag' in error) {
    const tag = globalThis.String(error._tag)
    return tag === 'NotAuthenticated'
      ? errorMessage('Sign in to sync todos.')
      : toErrorMessage(errorMessage('Could not sync todos.'))(tag)
  }

  return toErrorMessage(errorMessage('Could not sync todos.'))(error)
}

export class TodosBackendError extends Data.TaggedError('TodosBackendError')<{
  readonly operation: BackendOperation
  readonly message: ErrorMessage
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
  readonly create: (text: string) => Effect.Effect<TodoId, TodosBackendError>
  readonly delete: (id: TodoId) => Effect.Effect<null, TodosBackendError>
}

export class TodosBackend extends Context.Service<
  TodosBackend,
  TodosBackendShape
>()('strudel/TodosBackend') {}

export const TodosBackendLive = Layer.effect(
  TodosBackend,
  Effect.gen(function* () {
    const confect = yield* WebSocketClient.WebSocketClient
    const auth = yield* AuthService

    const authenticate = confect.setAuth(args =>
      auth.fetchToken(args).pipe(Effect.catch(() => Effect.succeed(null))),
    )

    yield* authenticate

    return {
      todos: Stream.fromEffect(authenticate).pipe(
        Stream.flatMap(() => confect.reactiveQuery(refs.public.todos.list)),
        Stream.mapError(toBackendError('ListTodos')),
      ),
      create: (text: string) =>
        authenticate.pipe(
          Effect.flatMap(() =>
            confect.mutation(refs.public.todos.create, { text }),
          ),
          Effect.mapError(toBackendError('CreateTodo')),
        ),
      delete: (id: TodoId) =>
        authenticate.pipe(
          Effect.flatMap(() =>
            confect.mutation(refs.public.todos.deleteTodo, { id }),
          ),
          Effect.mapError(toBackendError('DeleteTodo')),
        ),
    } satisfies TodosBackendShape
  }),
)

export const makeTodosBackendTestLayer = (
  backend: TodosBackendShape,
): Layer.Layer<TodosBackend> => Layer.succeed(TodosBackend, backend)
