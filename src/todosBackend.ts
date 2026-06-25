import { GenericId } from '@confect/core'
import { WebSocketClient } from '@confect/js'
import {
  Context,
  Effect,
  Layer,
  Match as M,
  Option,
  Schema as S,
  Stream,
} from 'effect'
import { File as FoldkitFile } from 'foldkit'

import refs from '../confect/_generated/refs'
import { TodoText, UploadUrl } from '../confect/domain'
import {
  NotAuthenticated,
  Todo as TodoSchema,
  TodoStorageError,
} from '../confect/todos.spec'
import { AuthService } from './authService'
import { ErrorMessage, errorMessage } from './errorMessage'

export const Todo = TodoSchema
export type Todo = typeof Todo.Type

export const TodoId = GenericId.GenericId('todos')
export type TodoId = typeof TodoId.Type

export const StorageId = GenericId.GenericId('_storage')
export type StorageId = typeof StorageId.Type

const StorageUploadResponse = S.Struct({ storageId: StorageId })

const BackendOperation = S.Literals([
  'ListTodos',
  'CreateTodo',
  'DeleteTodo',
  'GenerateTodoImageUploadUrl',
  'UploadTodoImage',
  'AttachTodoImage',
])
type BackendOperation = typeof BackendOperation.Type

export class TodoImageUploadError extends S.TaggedErrorClass<TodoImageUploadError>()(
  'TodoImageUploadError',
  {
    message: S.String,
    cause: S.Defect(),
  },
) {}

export class TodosBackendError extends S.TaggedErrorClass<TodosBackendError>()(
  'TodosBackendError',
  {
    operation: BackendOperation,
    message: ErrorMessage,
    cause: S.Unknown,
  },
) {}

type TodoBackendCause =
  | NotAuthenticated
  | TodoStorageError
  | TodoImageUploadError
  | WebSocketClient.WebSocketClientError
  | S.SchemaError

const todoBackendMessage = (error: TodoBackendCause): ErrorMessage =>
  M.value(error).pipe(
    M.tags({
      NotAuthenticated: ({ userMessage }) => errorMessage(userMessage),
      TodoStorageError: ({ userMessage }) => errorMessage(userMessage),
      TodoImageUploadError: () => errorMessage('Could not upload image.'),
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
  readonly create: (
    text: TodoText,
  ) => Effect.Effect<TodoId, TodosBackendError>
  readonly delete: (
    id: TodoId,
  ) => Effect.Effect<Option.Option<TodoId>, TodosBackendError>
  readonly uploadImage: (
    id: TodoId,
    file: FoldkitFile.File,
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
      auth.fetchToken(args).pipe(Effect.orDie),
    )

    yield* authenticate

    const uploadFile = (
      uploadUrl: UploadUrl,
      file: FoldkitFile.File,
    ): Effect.Effect<
      typeof StorageUploadResponse.Type,
      TodoImageUploadError | S.SchemaError
    > =>
      Effect.tryPromise({
        try: async () => {
          const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'Content-Type':
                FoldkitFile.mimeType(file) || 'application/octet-stream',
            },
            body: file,
          })

          if (!response.ok) {
            throw new Error(`Upload failed with status ${response.status}`)
          }

          return await response.json()
        },
        catch: error =>
          new TodoImageUploadError({
            message: error instanceof Error ? error.message : String(error),
            cause: error,
          }),
      }).pipe(Effect.flatMap(S.decodeUnknownEffect(StorageUploadResponse)))

    return {
      todos: Stream.fromEffect(authenticate).pipe(
        Stream.flatMap(() => confect.reactiveQuery(refs.public.todos.list)),
        Stream.mapError(toBackendError('ListTodos')),
      ),
      create: Effect.fn('TodosBackend.create')((text: TodoText) =>
        authenticate.pipe(
          Effect.flatMap(() =>
            confect.mutation(refs.public.todos.create, { text }),
          ),
          Effect.mapError(toBackendError('CreateTodo')),
        ),
      ),
      delete: Effect.fn('TodosBackend.delete')((id: TodoId) =>
        authenticate.pipe(
          Effect.flatMap(() =>
            confect.mutation(refs.public.todos.deleteTodo, { id }),
          ),
          Effect.mapError(toBackendError('DeleteTodo')),
        ),
      ),
      uploadImage: Effect.fn('TodosBackend.uploadImage')(
        (id: TodoId, file: FoldkitFile.File) =>
          authenticate.pipe(
            Effect.flatMap(() =>
              confect.mutation(refs.public.todos.generateImageUploadUrl, {}),
            ),
            Effect.mapError(toBackendError('GenerateTodoImageUploadUrl')),
            Effect.flatMap(uploadUrl =>
              uploadFile(uploadUrl, file).pipe(
                Effect.mapError(toBackendError('UploadTodoImage')),
              ),
            ),
            Effect.flatMap(({ storageId }) =>
              authenticate.pipe(
                Effect.flatMap(() =>
                  confect.mutation(refs.public.todos.attachImage, {
                    id,
                    storageId,
                  }),
                ),
                Effect.mapError(toBackendError('AttachTodoImage')),
              ),
            ),
          ),
      ),
    } satisfies TodosBackendShape
  }),
)

export const makeTodosBackendTestLayer = (
  backend: TodosBackendShape,
): Layer.Layer<TodosBackend> => Layer.succeed(TodosBackend, backend)
