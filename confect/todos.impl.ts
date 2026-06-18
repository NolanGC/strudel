import {
  BlobNotFoundError,
  Document,
  FunctionImpl,
  GroupImpl,
  QueryInitializer,
} from '@confect/server'
import { Effect, Layer, Option } from 'effect'

import api from './_generated/api'
import {
  Auth,
  DatabaseReader,
  DatabaseWriter,
  StorageReader,
  StorageWriter,
} from './_generated/services'
import { NotAuthenticated, TodoStorageError } from './todos.spec'

type DocumentDecodeError = Document.DocumentDecodeError
type DocumentEncodeError = Document.DocumentEncodeError
type GetByIdFailure = QueryInitializer.GetByIdFailure
type BlobNotFoundError = BlobNotFoundError.BlobNotFoundError

const notAuthenticatedMessage = 'Sign in to sync todos.'
const storageErrorMessage = 'Could not sync todos.'

const currentUserId = Effect.gen(function* () {
  const auth = yield* Auth
  const identity = yield* auth.getUserIdentity.pipe(
    Effect.catchTags({
      NoUserIdentityFoundError: error =>
        Effect.fail(
          new NotAuthenticated({
            message: error.message,
            userMessage: notAuthenticatedMessage,
          }),
        ),
    }),
  )
  return identity.subject.split('|')[0] ?? identity.subject
})

const list = FunctionImpl.make(api, 'todos', 'list', () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader
    const storage = yield* StorageReader
    const ownerUserId = yield* currentUserId
    const ownedTodos = yield* reader
      .table('todos')
      .index(
        'by_ownerUserId',
        q => q.eq('ownerUserId', ownerUserId),
        'desc',
      )
      .collect()
      .pipe(
        Effect.catchTags({
          DocumentDecodeError: (error: DocumentDecodeError) =>
            Effect.fail(
              new TodoStorageError({
                operation: 'ListTodos',
                message: error.message,
                userMessage: storageErrorMessage,
              }),
            ),
        }),
      )

    return yield* Effect.forEach(ownedTodos, todo =>
      Effect.gen(function* () {
        const maybeImageUrl =
          todo.imageStorageId === undefined
            ? Option.none<string>()
            : yield* storage.getUrl(todo.imageStorageId).pipe(
                Effect.map(url => Option.some(url.toString())),
                Effect.catchTags({
                  BlobNotFoundError: (_error: BlobNotFoundError) =>
                    Effect.succeed(Option.none<string>()),
                }),
              )

        return { ...todo, maybeImageUrl }
      }),
    )
  }),
)

const create = FunctionImpl.make(api, 'todos', 'create', ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter
    const ownerUserId = yield* currentUserId
    return yield* writer
      .table('todos')
      .insert({ ownerUserId, text })
      .pipe(
        Effect.catchTags({
          DocumentEncodeError: (error: DocumentEncodeError) =>
            Effect.fail(
              new TodoStorageError({
                operation: 'CreateTodo',
                message: error.message,
                userMessage: storageErrorMessage,
              }),
            ),
        }),
      )
  }),
)

const deleteTodo = FunctionImpl.make(api, 'todos', 'deleteTodo', ({ id }) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader
    const writer = yield* DatabaseWriter
    const ownerUserId = yield* currentUserId
    const maybeTodo = yield* reader
      .table('todos')
      .get(id)
      .pipe(
        Effect.map(Option.some),
        Effect.catchTags({
          GetByIdFailure: (_error: GetByIdFailure) =>
            Effect.succeed(Option.none()),
          DocumentDecodeError: (error: DocumentDecodeError) =>
            Effect.fail(
              new TodoStorageError({
                operation: 'DeleteTodo',
                message: error.message,
                userMessage: storageErrorMessage,
              }),
            ),
        }),
      )

    return yield* Option.match(maybeTodo, {
      onNone: () => Effect.succeed(Option.none()),
      onSome: todo =>
        todo.ownerUserId !== ownerUserId
          ? Effect.succeed(Option.none())
          : Effect.gen(function* () {
              const storage = yield* StorageWriter
              if (todo.imageStorageId !== undefined) {
                yield* storage.delete(todo.imageStorageId).pipe(
                  Effect.catchTags({
                    BlobNotFoundError: (_error: BlobNotFoundError) =>
                      Effect.void,
                  }),
                )
              }
              yield* writer.table('todos').delete(id)
              return Option.some(id)
            }),
    })
  }),
)

const generateImageUploadUrl = FunctionImpl.make(
  api,
  'todos',
  'generateImageUploadUrl',
  () =>
    Effect.gen(function* () {
      yield* currentUserId
      const storage = yield* StorageWriter

      return yield* storage.generateUploadUrl().pipe(
        Effect.map(url => url.toString()),
        Effect.mapError(
          error =>
            new TodoStorageError({
              operation: 'GenerateTodoImageUploadUrl',
              message: String(error),
              userMessage: storageErrorMessage,
            }),
        ),
      )
    }),
)

const attachImage = FunctionImpl.make(
  api,
  'todos',
  'attachImage',
  ({ id, storageId }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader
      const writer = yield* DatabaseWriter
      const storage = yield* StorageWriter
      const ownerUserId = yield* currentUserId
      const maybeTodo = yield* reader
        .table('todos')
        .get(id)
        .pipe(
          Effect.map(Option.some),
          Effect.catchTags({
            GetByIdFailure: (_error: GetByIdFailure) =>
              Effect.succeed(Option.none()),
            DocumentDecodeError: (error: DocumentDecodeError) =>
              Effect.fail(
                new TodoStorageError({
                  operation: 'AttachTodoImage',
                  message: error.message,
                  userMessage: storageErrorMessage,
                }),
              ),
          }),
        )

      return yield* Option.match(maybeTodo, {
        onNone: () => Effect.succeed(Option.none()),
        onSome: todo =>
          todo.ownerUserId !== ownerUserId
            ? Effect.succeed(Option.none())
            : Effect.gen(function* () {
                if (todo.imageStorageId !== undefined) {
                  yield* storage.delete(todo.imageStorageId).pipe(
                    Effect.catchTags({
                      BlobNotFoundError: (_error: BlobNotFoundError) =>
                        Effect.void,
                    }),
                  )
                }

                yield* writer
                  .table('todos')
                  .patch(id, { imageStorageId: storageId })
                  .pipe(
                    Effect.catchTags({
                      GetByIdFailure: (error: GetByIdFailure) =>
                        Effect.fail(
                          new TodoStorageError({
                            operation: 'AttachTodoImage',
                            message: error.message,
                            userMessage: storageErrorMessage,
                          }),
                        ),
                      DocumentDecodeError: (error: DocumentDecodeError) =>
                        Effect.fail(
                          new TodoStorageError({
                            operation: 'AttachTodoImage',
                            message: error.message,
                            userMessage: storageErrorMessage,
                          }),
                        ),
                      DocumentEncodeError: (error: DocumentEncodeError) =>
                        Effect.fail(
                          new TodoStorageError({
                            operation: 'AttachTodoImage',
                            message: error.message,
                            userMessage: storageErrorMessage,
                          }),
                        ),
                    }),
                  )

                return Option.some(id)
              }),
      })
    }),
)

export const todos = GroupImpl.make(api, 'todos').pipe(
  Layer.provide(list),
  Layer.provide(create),
  Layer.provide(deleteTodo),
  Layer.provide(generateImageUploadUrl),
  Layer.provide(attachImage),
)
