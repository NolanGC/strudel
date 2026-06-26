import { describe, expect, it } from '@effect/vitest'
import { Effect, Option, Schema as S } from 'effect'

import { CronExpression, TodoText } from '../../confect/domain'
import { errorMessage } from '../errorMessage'
import { DeleteScheduledTodo, DeletedScheduledTodo } from '../main'
import {
  CreateScheduledTodo,
  CreatedScheduledTodo,
  FailedCreateScheduledTodo,
} from '../scheduledTodoForm'
import {
  ScheduledTodoId,
  ScheduledTodosBackendError,
} from '../scheduledTodosBackend'
import { makeScheduledTodosBackendTestHarness } from '../test_support/serviceLayers'
import { FailedDeleteScheduledTodo } from '../todosPage'

const scheduledTodoId = S.decodeUnknownSync(ScheduledTodoId)('scheduled-todo-1')
const cronExpression = CronExpression.make
const todoText = TodoText.make

describe('scheduled todo form commands', () => {
  it.effect('CreateScheduledTodo calls the scheduled todos backend with text and cron', () =>
    Effect.gen(function* () {
      const scheduledTodos = makeScheduledTodosBackendTestHarness({
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
      })

      const message = yield* CreateScheduledTodo({
        text: todoText('gym'),
        cron: cronExpression('0 7 * * *'),
      }).effect.pipe(Effect.provide(scheduledTodos.layer))

      expect(message).toStrictEqual(
        CreatedScheduledTodo({ id: scheduledTodoId }),
      )
      expect(yield* scheduledTodos.calls).toStrictEqual([
        {
          _tag: 'CreateScheduledTodo',
          text: todoText('gym'),
          cron: cronExpression('0 7 * * *'),
        },
      ])
    }),
  )

  it.effect('CreateScheduledTodo returns typed user-facing backend failures', () =>
    Effect.gen(function* () {
      const scheduledTodos = makeScheduledTodosBackendTestHarness({
        create: () =>
          Effect.fail(
            new ScheduledTodosBackendError({
              operation: 'CreateScheduledTodo',
              message: errorMessage('Enter a valid cron expression.'),
              cause: 'invalid cron',
            }),
          ),
      })

      const message = yield* CreateScheduledTodo({
        text: todoText('gym'),
        cron: cronExpression('not cron'),
      }).effect.pipe(Effect.provide(scheduledTodos.layer))

      expect(message).toStrictEqual(
        FailedCreateScheduledTodo({
          error: errorMessage('Enter a valid cron expression.'),
        }),
      )
      expect(yield* scheduledTodos.calls).toStrictEqual([
        {
          _tag: 'CreateScheduledTodo',
          text: todoText('gym'),
          cron: cronExpression('not cron'),
        },
      ])
    }),
  )

  it.effect('DeleteScheduledTodo calls the scheduled todos backend', () =>
    Effect.gen(function* () {
      const scheduledTodos = makeScheduledTodosBackendTestHarness({
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

      const message = yield* DeleteScheduledTodo({
        id: scheduledTodoId,
      }).effect.pipe(Effect.provide(scheduledTodos.layer))

      expect(message).toStrictEqual(DeletedScheduledTodo())
      expect(yield* scheduledTodos.calls).toStrictEqual([
        { _tag: 'DeleteScheduledTodo', id: scheduledTodoId },
      ])
    }),
  )

  it.effect('DeleteScheduledTodo turns backend failures into FailedDeleteScheduledTodo', () =>
    Effect.gen(function* () {
      const scheduledTodos = makeScheduledTodosBackendTestHarness({
        delete: () =>
          Effect.fail(
            new ScheduledTodosBackendError({
              operation: 'DeleteScheduledTodo',
              message: errorMessage('Delete scheduled failed'),
              cause: 'offline',
            }),
          ),
      })

      const message = yield* DeleteScheduledTodo({
        id: scheduledTodoId,
      }).effect.pipe(Effect.provide(scheduledTodos.layer))

      expect(message).toStrictEqual(
        FailedDeleteScheduledTodo({
          error: errorMessage('Delete scheduled failed'),
        }),
      )
      expect(yield* scheduledTodos.calls).toStrictEqual([
        { _tag: 'DeleteScheduledTodo', id: scheduledTodoId },
      ])
    }),
  )
})
