import { describe, expect, it } from '@effect/vitest'
import { Effect, Option, Schema as S } from 'effect'

import { TodoText } from '../../confect/domain'
import { TodoStorageError } from '../../confect/todos.spec'
import { errorMessage } from '../errorMessage'
import {
  AttachTodoImage,
  AttachedTodoImage,
  CreateTodo,
  CreatedTodo,
  DeleteTodo,
  DeletedTodo,
  FailedAttachTodoImage,
  FailedCreateTodo,
  FailedDeleteTodo,
} from '../main'
import {
  TodoId,
  TodosBackendError,
} from '../todosBackend'
import { makeTodosBackendTestHarness } from '../test_support/serviceLayers'

const todoId = S.decodeUnknownSync(TodoId)
const todoText = TodoText.make
const imageFile = new File(['image-bytes'], 'todo.png', { type: 'image/png' })

describe('todo backend commands', () => {
  it.effect('CreateTodo succeeds through the TodosBackend service', () =>
    Effect.gen(function* () {
      const todos = makeTodosBackendTestHarness({
        create: text =>
          text === todoText('Write tests')
            ? Effect.succeed(todoId('todo-created'))
            : Effect.fail(
                new TodosBackendError({
                  operation: 'CreateTodo',
                  message: errorMessage('Unexpected text'),
                  cause: new TodoStorageError({
                    operation: 'CreateTodo',
                    message: `Unexpected text: ${text}`,
                    userMessage: 'Unexpected text',
                  }),
                }),
              ),
      })

      const message = yield* CreateTodo({
        text: todoText('Write tests'),
      }).effect.pipe(Effect.provide(todos.layer))

      expect(message).toStrictEqual(CreatedTodo())
      expect(yield* todos.calls).toStrictEqual([
        { _tag: 'CreateTodo', text: todoText('Write tests') },
      ])
    }),
  )

  it.effect('CreateTodo turns backend failures into FailedCreateTodo', () =>
    Effect.gen(function* () {
      const todos = makeTodosBackendTestHarness({
        create: () =>
          Effect.fail(
            new TodosBackendError({
              operation: 'CreateTodo',
              message: errorMessage('Create unavailable'),
              cause: new TodoStorageError({
                operation: 'CreateTodo',
                message: 'offline',
                userMessage: 'Create unavailable',
              }),
            }),
          ),
      })

      const message = yield* CreateTodo({
        text: todoText('Write tests'),
      }).effect.pipe(Effect.provide(todos.layer))

      expect(message).toStrictEqual(
        FailedCreateTodo({ error: errorMessage('Create unavailable') }),
      )
      expect(yield* todos.calls).toStrictEqual([
        { _tag: 'CreateTodo', text: todoText('Write tests') },
      ])
    }),
  )

  it.effect('DeleteTodo succeeds through the TodosBackend service', () =>
    Effect.gen(function* () {
      const todos = makeTodosBackendTestHarness({
        delete: id =>
          id === todoId('todo-1')
            ? Effect.succeed(Option.some(id))
            : Effect.fail(
                new TodosBackendError({
                  operation: 'DeleteTodo',
                  message: errorMessage('Unexpected id'),
                  cause: new TodoStorageError({
                    operation: 'DeleteTodo',
                    message: `Unexpected id: ${id}`,
                    userMessage: 'Unexpected id',
                  }),
                }),
              ),
      })

      const message = yield* DeleteTodo({ id: todoId('todo-1') }).effect.pipe(
        Effect.provide(todos.layer),
      )

      expect(message).toStrictEqual(DeletedTodo())
      expect(yield* todos.calls).toStrictEqual([
        { _tag: 'DeleteTodo', id: todoId('todo-1') },
      ])
    }),
  )

  it.effect('DeleteTodo turns backend failures into FailedDeleteTodo', () =>
    Effect.gen(function* () {
      const todos = makeTodosBackendTestHarness({
        delete: () =>
          Effect.fail(
            new TodosBackendError({
              operation: 'DeleteTodo',
              message: errorMessage('Delete unavailable'),
              cause: new TodoStorageError({
                operation: 'DeleteTodo',
                message: 'offline',
                userMessage: 'Delete unavailable',
              }),
            }),
          ),
      })

      const message = yield* DeleteTodo({ id: todoId('todo-1') }).effect.pipe(
        Effect.provide(todos.layer),
      )

      expect(message).toStrictEqual(
        FailedDeleteTodo({ error: errorMessage('Delete unavailable') }),
      )
      expect(yield* todos.calls).toStrictEqual([
        { _tag: 'DeleteTodo', id: todoId('todo-1') },
      ])
    }),
  )

  it.effect('AttachTodoImage succeeds through the TodosBackend service', () =>
    Effect.gen(function* () {
      const todos = makeTodosBackendTestHarness({
        uploadImage: (id, file) =>
          id === todoId('todo-1') && file.name === 'todo.png'
            ? Effect.succeed(Option.some(id))
            : Effect.fail(
                new TodosBackendError({
                  operation: 'AttachTodoImage',
                  message: errorMessage('Unexpected image upload'),
                  cause: new TodoStorageError({
                    operation: 'AttachTodoImage',
                    message: 'unexpected image upload',
                    userMessage: 'Unexpected image upload',
                  }),
                }),
              ),
      })

      const message = yield* AttachTodoImage({
        id: todoId('todo-1'),
        file: imageFile,
      }).effect.pipe(Effect.provide(todos.layer))

      expect(message).toStrictEqual(AttachedTodoImage())
      expect(yield* todos.calls).toStrictEqual([
        { _tag: 'UploadImage', id: todoId('todo-1'), file: imageFile },
      ])
    }),
  )

  it.effect('AttachTodoImage turns backend failures into FailedAttachTodoImage', () =>
    Effect.gen(function* () {
      const todos = makeTodosBackendTestHarness({
        uploadImage: () =>
          Effect.fail(
            new TodosBackendError({
              operation: 'UploadTodoImage',
              message: errorMessage('Could not upload image.'),
              cause: new TodoStorageError({
                operation: 'AttachTodoImage',
                message: 'offline',
                userMessage: 'Could not upload image.',
              }),
            }),
          ),
      })

      const message = yield* AttachTodoImage({
        id: todoId('todo-1'),
        file: imageFile,
      }).effect.pipe(Effect.provide(todos.layer))

      expect(message).toStrictEqual(
        FailedAttachTodoImage({
          error: errorMessage('Could not upload image.'),
        }),
      )
      expect(yield* todos.calls).toStrictEqual([
        { _tag: 'UploadImage', id: todoId('todo-1'), file: imageFile },
      ])
    }),
  )
})
