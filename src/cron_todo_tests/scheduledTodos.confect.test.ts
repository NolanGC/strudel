import { describe, it } from '@effect/vitest'
import {
  assertEquals,
  assertFailure,
  assertNone,
  assertSome,
} from '@effect/vitest/utils'
import { Effect } from 'effect'
import { vi } from 'vitest'

import refs from '../../confect/_generated/refs'
import {
  InvalidCronExpression,
  NotAuthenticated,
} from '../../confect/scheduledTodos.spec'
import * as TestConfect from '../todo_tests/TestConfect'

const userA = {
  subject: 'user-a|session-a-1',
  tokenIdentifier: 'https://issuer.example|user-a|session-a-1',
  userId: 'user-a',
  email: 'a@example.com',
}

const userB = {
  subject: 'user-b|session-b-1',
  tokenIdentifier: 'https://issuer.example|user-b|session-b-1',
  userId: 'user-b',
  email: 'b@example.com',
}

describe('scheduled todo Confect functions', () => {
  it.effect('requires identity to create a scheduled todo', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect

      const result = yield* c
        .mutation(refs.public.scheduledTodos.create, {
          text: 'gym',
          cron: '0 7 * * *',
        })
        .pipe(Effect.result)

      assertFailure(
        result,
        new NotAuthenticated({
          message: 'No user identity found',
          userMessage: 'Sign in to schedule todos.',
        }),
      )
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('rejects invalid cron expressions as typed errors', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect

      const result = yield* c
        .withIdentity(userA)
        .mutation(refs.public.scheduledTodos.create, {
          text: 'gym',
          cron: 'not cron',
        })
        .pipe(Effect.result)

      assertFailure(
        result,
        new InvalidCronExpression({
          cron: 'not cron',
          message: 'Invalid cron expression: not cron',
          userMessage: 'Enter a valid cron expression.',
        }),
      )
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('creates a schedule owned by the current auth user', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect

      const scheduledTodoId = yield* c
        .withIdentity(userA)
        .mutation(refs.public.scheduledTodos.create, {
          text: 'gym',
          cron: '0 7 * * *',
        })

      const schedules = yield* c
        .withIdentity(userA)
        .query(refs.public.scheduledTodos.list, {})

      assertEquals(schedules.length, 1)
      assertEquals(schedules[0]?._id, scheduledTodoId)
      assertEquals(schedules[0]?.ownerUserId, userA.userId)
      assertEquals(schedules[0]?.text, 'gym')
      assertEquals(schedules[0]?.cron, '0 7 * * *')
      assertEquals(typeof schedules[0]?.nextRunAt, 'number')
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('lists only schedules owned by the current auth user', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect

      yield* c.withIdentity(userA).mutation(refs.public.scheduledTodos.create, {
        text: 'gym',
        cron: '0 7 * * *',
      })
      yield* c.withIdentity(userB).mutation(refs.public.scheduledTodos.create, {
        text: 'water plants',
        cron: '0 9 * * *',
      })

      const userASchedules = yield* c
        .withIdentity(userA)
        .query(refs.public.scheduledTodos.list, {})
      const userBSchedules = yield* c
        .withIdentity(userB)
        .query(refs.public.scheduledTodos.list, {})

      assertEquals(
        userASchedules.map(schedule => schedule.text),
        ['gym'],
      )
      assertEquals(
        userBSchedules.map(schedule => schedule.text),
        ['water plants'],
      )
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('deletes owned schedules and returns the deleted id', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const asUserA = c.withIdentity(userA)

      const scheduledTodoId = yield* asUserA.mutation(
        refs.public.scheduledTodos.create,
        {
          text: 'gym',
          cron: '0 7 * * *',
        },
      )

      const maybeDeletedId = yield* asUserA.mutation(
        refs.public.scheduledTodos.deleteScheduledTodo,
        { id: scheduledTodoId },
      )
      const schedules = yield* asUserA.query(refs.public.scheduledTodos.list, {})

      assertSome(maybeDeletedId, scheduledTodoId)
      assertEquals(schedules, [])
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('returns none for missing or non-owned scheduled deletes', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const scheduledTodoId = yield* c
        .withIdentity(userA)
        .mutation(refs.public.scheduledTodos.create, {
          text: 'gym',
          cron: '0 7 * * *',
        })

      const nonOwnedDelete = yield* c
        .withIdentity(userB)
        .mutation(refs.public.scheduledTodos.deleteScheduledTodo, {
          id: scheduledTodoId,
        })
      yield* c
        .withIdentity(userA)
        .mutation(refs.public.scheduledTodos.deleteScheduledTodo, {
          id: scheduledTodoId,
        })
      const missingDelete = yield* c
        .withIdentity(userA)
        .mutation(refs.public.scheduledTodos.deleteScheduledTodo, {
          id: scheduledTodoId,
        })

      assertNone(nonOwnedDelete)
      assertNone(missingDelete)
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('deleted schedules do not create todos when their queued run fires', () =>
    Effect.gen(function* () {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-17T06:59:00.000Z'))

      const c = yield* TestConfect.TestConfect
      const asUserA = c.withIdentity(userA)

      const scheduledTodoId = yield* asUserA.mutation(
        refs.public.scheduledTodos.create,
        {
          text: 'gym',
          cron: '0 7 * * *',
        },
      )

      yield* asUserA.mutation(refs.public.scheduledTodos.deleteScheduledTodo, {
        id: scheduledTodoId,
      })
      yield* c.finishAllScheduledFunctions(() => {
        vi.advanceTimersByTime(60_000)
      })

      const todos = yield* asUserA.query(refs.public.todos.list, {})

      assertEquals(todos, [])
      vi.useRealTimers()
    }).pipe(
      Effect.ensuring(Effect.sync(() => vi.useRealTimers())),
      Effect.provide(TestConfect.layer()),
    ),
  )

  it.effect('runs due schedules, creates todos, and reschedules the next run', () =>
    Effect.gen(function* () {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-17T06:59:00.000Z'))

      const c = yield* TestConfect.TestConfect
      const asUserA = c.withIdentity(userA)

      const scheduledTodoId = yield* asUserA.mutation(
        refs.public.scheduledTodos.create,
        {
          text: 'gym',
          cron: '0 7 * * *',
        },
      )

      yield* c.finishAllScheduledFunctions(() => {
        vi.advanceTimersByTime(60_000)
      })

      const todos = yield* asUserA.query(refs.public.todos.list, {})
      const schedules = yield* asUserA.query(refs.public.scheduledTodos.list, {})

      assertEquals(
        todos.map(todo => todo.text),
        ['gym'],
      )
      assertEquals(schedules.length, 1)
      assertEquals(schedules[0]?._id, scheduledTodoId)
      assertEquals(
        schedules[0]?.nextRunAt,
        new Date('2026-06-18T07:00:00.000Z').getTime(),
      )

      vi.useRealTimers()
    }).pipe(
      Effect.ensuring(Effect.sync(() => vi.useRealTimers())),
      Effect.provide(TestConfect.layer()),
    ),
  )
})
