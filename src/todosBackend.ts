import { GenericId } from '@confect/core'
import { WebSocketClient } from '@confect/js'
import {
  Context,
  Data,
  Effect,
  Layer,
  Match as M,
  Option,
  Schema as S,
  Stream,
} from 'effect'

import refs from '../confect/_generated/refs'
import { Todos } from '../confect/tables/todos'
import { NotAuthenticated, TodoStorageError } from '../confect/todos.spec'
import { AuthService } from './authService'
import { ErrorMessage, errorMessage } from './errorMessage'

export const Todo = Todos.Doc
export type Todo = typeof Todo.Type

export const TodoId = GenericId.GenericId('todos')
export type TodoId = typeof TodoId.Type

const BackendOperation = S.Literals(['ListTodos', 'CreateTodo', 'DeleteTodo'])
type BackendOperation = typeof BackendOperation.Type

export class TodosBackendError extends Data.TaggedError('TodosBackendError')<{
  readonly operation: BackendOperation
  readonly message: ErrorMessage
  readonly cause: TodoBackendCause
}> {}

type TodoBackendCause =
  | NotAuthenticated
  | TodoStorageError
  | WebSocketClient.WebSocketClientError
  | S.SchemaError

const todoBackendMessage = (error: TodoBackendCause): ErrorMessage =>
  M.value(error).pipe(
    M.tags({
      NotAuthenticated: ({ userMessage }) => errorMessage(userMessage),
      TodoStorageError: ({ userMessage }) => errorMessage(userMessage),
      WebSocketClientError: () => errorMessage('Could not sync todos.'),
      SchemaError: () => errorMessage('Could not sync todos.'),
    }),
    M.exhaustive,
  )

const toBackendError =
  (operation: BackendOperation) =>
  (cause: TodoBackendCause): TodosBackendError =>
    new TodosBackendError({
      operation,
      message: todoBackendMessage(cause),
      cause,
    })

type TodosBackendShape = {
  readonly todos: Stream.Stream<ReadonlyArray<Todo>, TodosBackendError>
  readonly create: (text: string) => Effect.Effect<TodoId, TodosBackendError>
  readonly delete: (
    id: TodoId,
  ) => Effect.Effect<Option.Option<TodoId>, TodosBackendError>
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
