import { Effect, Option, Schema as S, Stream } from 'effect'
import { describe, expect, test } from 'vitest'

import { errorMessage } from '../errorMessage'
import { CronExpression, TodoText } from '../../confect/domain'
import { DeleteScheduledTodo, DeletedScheduledTodo } from '../main'
import {
  CreateScheduledTodo,
  CreatedScheduledTodo,
  FailedCreateScheduledTodo,
} from '../scheduledTodoForm'
import {
  ScheduledTodosBackendError,
  ScheduledTodoId,
  makeScheduledTodosBackendTestLayer,
} from '../scheduledTodosBackend'

const scheduledTodoId = S.decodeUnknownSync(ScheduledTodoId)('scheduled-todo-1')
const cronExpression = CronExpression.make
const todoText = TodoText.make

describe('scheduled todo form commands', () => {
  test('CreateScheduledTodo calls the scheduled todos backend with text and cron', async () => {
    const layer = makeScheduledTodosBackendTestLayer({
      scheduledTodos: Stream.empty,
      create: ({ text, cron }) =>
        text === todoText('gym') && cron === cronExpression('0 7 * * *')
          ? Effect.succeed(scheduledTodoId)
          : Effect.fail(
              new ScheduledTodosBackendError({
                operation: 'CreateScheduledTodo',
                message: errorMessage('Unexpected schedule args'),
                cause: { text, cron },
              }),
            ),
      delete: () => Effect.succeed(Option.none()),
    })

    const message = await CreateScheduledTodo({
      text: todoText('gym'),
      cron: cronExpression('0 7 * * *'),
    }).effect.pipe(Effect.provide(layer), Effect.runPromise)

    expect(message).toStrictEqual(
      CreatedScheduledTodo({ id: scheduledTodoId }),
    )
  })

  test('CreateScheduledTodo returns typed user-facing backend failures', async () => {
    const layer = makeScheduledTodosBackendTestLayer({
      scheduledTodos: Stream.empty,
      create: () =>
        Effect.fail(
          new ScheduledTodosBackendError({
            operation: 'CreateScheduledTodo',
            message: errorMessage('Enter a valid cron expression.'),
            cause: 'invalid cron',
          }),
        ),
      delete: () => Effect.succeed(Option.none()),
    })

    const message = await CreateScheduledTodo({
      text: todoText('gym'),
      cron: cronExpression('not cron'),
    }).effect.pipe(Effect.provide(layer), Effect.runPromise)

    expect(message).toStrictEqual(
      FailedCreateScheduledTodo({
        error: errorMessage('Enter a valid cron expression.'),
      }),
    )
  })

  test('DeleteScheduledTodo calls the scheduled todos backend', async () => {
    const layer = makeScheduledTodosBackendTestLayer({
      scheduledTodos: Stream.empty,
      create: () => Effect.succeed(scheduledTodoId),
      delete: id =>
        id === scheduledTodoId
          ? Effect.succeed(Option.some(id))
          : Effect.fail(
              new ScheduledTodosBackendError({
                operation: 'DeleteScheduledTodo',
                message: errorMessage('Unexpected scheduled todo id'),
                cause: id,
              }),
            ),
    })

    const message = await DeleteScheduledTodo({
      id: scheduledTodoId,
    }).effect.pipe(Effect.provide(layer), Effect.runPromise)

    expect(message).toStrictEqual(DeletedScheduledTodo())
  })
})
