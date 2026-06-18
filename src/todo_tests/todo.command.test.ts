import { Effect, Option, Schema as S, Stream } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  CreateTodo,
  CreatedTodo,
  DeleteTodo,
  DeletedTodo,
  FailedCreateTodo,
  FailedDeleteTodo,
} from '../main'
import {
  TodoId,
  TodosBackendError,
  makeTodosBackendTestLayer,
} from '../todosBackend'
import { TodoStorageError } from '../../confect/todos.spec'
import { errorMessage } from '../errorMessage'

const todoId = S.decodeUnknownSync(TodoId)

describe('todo backend commands', () => {
  test('CreateTodo succeeds through the TodosBackend service', async () => {
    const layer = makeTodosBackendTestLayer({
      todos: Stream.empty,
      create: text =>
        text === 'Write tests'
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
      delete: () => Effect.succeed(Option.none()),
    })

    const message = await CreateTodo({ text: 'Write tests' }).effect.pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(message).toStrictEqual(CreatedTodo())
  })

  test('CreateTodo turns backend failures into FailedCreateTodo', async () => {
    const layer = makeTodosBackendTestLayer({
      todos: Stream.empty,
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
      delete: () => Effect.succeed(Option.none()),
    })

    const message = await CreateTodo({ text: 'Write tests' }).effect.pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(message).toStrictEqual(
      FailedCreateTodo({ error: errorMessage('Create unavailable') }),
    )
  })

  test('DeleteTodo succeeds through the TodosBackend service', async () => {
    const layer = makeTodosBackendTestLayer({
      todos: Stream.empty,
      create: () => Effect.succeed(todoId('todo-created')),
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

    const message = await DeleteTodo({ id: todoId('todo-1') }).effect.pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(message).toStrictEqual(DeletedTodo())
  })

  test('DeleteTodo turns backend failures into FailedDeleteTodo', async () => {
    const layer = makeTodosBackendTestLayer({
      todos: Stream.empty,
      create: () => Effect.succeed(todoId('todo-created')),
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

    const message = await DeleteTodo({ id: todoId('todo-1') }).effect.pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(message).toStrictEqual(
      FailedDeleteTodo({ error: errorMessage('Delete unavailable') }),
    )
  })
})
