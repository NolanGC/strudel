import {
  Document,
  FunctionImpl,
  GroupImpl,
  QueryInitializer,
} from '@confect/server'
import { Clock, Cron, DateTime, Effect, Layer, Option, Result } from 'effect'

import api from './_generated/api'
import refs from './_generated/refs'
import {
  Auth,
  DatabaseReader,
  DatabaseWriter,
  Scheduler,
} from './_generated/services'
import {
  InvalidCronExpression,
  NotAuthenticated,
  ScheduledTodoOperation,
  ScheduledTodoStorageError,
} from './scheduledTodos.spec'
import { ScheduledTodos } from './tables/scheduledTodos'

type DocumentDecodeError = Document.DocumentDecodeError
type DocumentEncodeError = Document.DocumentEncodeError
type GetByIdFailure = QueryInitializer.GetByIdFailure

const notAuthenticatedMessage = 'Sign in to schedule todos.'
const storageErrorMessage = 'Could not schedule todos.'
const invalidCronMessage = 'Enter a valid cron expression.'

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

const cronFromString = (cron: string) =>
  Result.match(Cron.parse(cron, 'UTC'), {
    onFailure: () =>
      Effect.fail(
        new InvalidCronExpression({
          cron,
          message: `Invalid cron expression: ${cron}`,
          userMessage: invalidCronMessage,
        }),
      ),
    onSuccess: parsed => Effect.succeed(parsed),
  })

const nextRunAtFromCron = (cron: Cron.Cron) =>
  Clock.currentTimeMillis.pipe(
    Effect.map(currentTimeMillis =>
      Cron.next(cron, new Date(currentTimeMillis)).getTime(),
    ),
  )

const dateTimeFromMillis = (
  operation: ScheduledTodoOperation,
  millis: number,
) =>
  DateTime.make(millis).pipe(
    Option.match({
      onNone: () =>
        Effect.fail(
          new ScheduledTodoStorageError({
            operation,
            message: `Invalid scheduled timestamp: ${millis}`,
            userMessage: storageErrorMessage,
          }),
        ),
      onSome: dateTime => Effect.succeed(dateTime),
    }),
  )

const scheduleRun = (
  operation: ScheduledTodoOperation,
  id: typeof ScheduledTodos.Doc.Type._id,
  nextRunAt: number,
) =>
  Effect.gen(function* () {
    const scheduler = yield* Scheduler
    const dateTime = yield* dateTimeFromMillis(operation, nextRunAt)

    yield* scheduler
      .runAt(dateTime, refs.internal.scheduledTodos.run, { id })
      .pipe(
        Effect.mapError(
          error =>
            new ScheduledTodoStorageError({
              operation,
              message: String(error),
              userMessage: storageErrorMessage,
            }),
        ),
      )
  })

const list = FunctionImpl.make(api, 'scheduledTodos', 'list', () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader
    const ownerUserId = yield* currentUserId

    return yield* reader
      .table('scheduledTodos')
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
              new ScheduledTodoStorageError({
                operation: 'ListScheduledTodos',
                message: error.message,
                userMessage: storageErrorMessage,
              }),
            ),
        }),
      )
  }),
)

const create = FunctionImpl.make(
  api,
  'scheduledTodos',
  'create',
  ({ text, cron }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter
      const ownerUserId = yield* currentUserId
      const parsedCron = yield* cronFromString(cron)
      const nextRunAt = yield* nextRunAtFromCron(parsedCron)
      const id = yield* writer
        .table('scheduledTodos')
        .insert({ ownerUserId, text, cron, nextRunAt })
        .pipe(
          Effect.catchTags({
            DocumentEncodeError: (error: DocumentEncodeError) =>
              Effect.fail(
                new ScheduledTodoStorageError({
                  operation: 'CreateScheduledTodo',
                  message: error.message,
                  userMessage: storageErrorMessage,
                }),
              ),
          }),
        )

      yield* scheduleRun('CreateScheduledTodo', id, nextRunAt)

      return id
    }),
)

const deleteScheduledTodo = FunctionImpl.make(
  api,
  'scheduledTodos',
  'deleteScheduledTodo',
  ({ id }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader
      const writer = yield* DatabaseWriter
      const ownerUserId = yield* currentUserId
      const maybeScheduledTodo = yield* reader
        .table('scheduledTodos')
        .get(id)
        .pipe(
          Effect.map(Option.some),
          Effect.catchTags({
            GetByIdFailure: (_error: GetByIdFailure) =>
              Effect.succeed(Option.none()),
            DocumentDecodeError: (error: DocumentDecodeError) =>
              Effect.fail(
                new ScheduledTodoStorageError({
                  operation: 'DeleteScheduledTodo',
                  message: error.message,
                  userMessage: storageErrorMessage,
                }),
              ),
          }),
        )

      return yield* Option.match(maybeScheduledTodo, {
        onNone: () => Effect.succeed(Option.none()),
        onSome: scheduledTodo =>
          scheduledTodo.ownerUserId !== ownerUserId
            ? Effect.succeed(Option.none())
            : Effect.gen(function* () {
                yield* writer.table('scheduledTodos').delete(id)
                return Option.some(id)
              }),
      })
    }),
)

const run = FunctionImpl.make(api, 'scheduledTodos', 'run', ({ id }) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader
    const writer = yield* DatabaseWriter
    const maybeScheduledTodo = yield* reader
      .table('scheduledTodos')
      .get(id)
      .pipe(
        Effect.map(Option.some),
        Effect.catchTags({
          GetByIdFailure: (_error: GetByIdFailure) =>
            Effect.succeed(Option.none()),
          DocumentDecodeError: (error: DocumentDecodeError) =>
            Effect.fail(
              new ScheduledTodoStorageError({
                operation: 'RunScheduledTodo',
                message: error.message,
                userMessage: storageErrorMessage,
              }),
            ),
        }),
      )

    return yield* Option.match(maybeScheduledTodo, {
      onNone: () => Effect.succeed(null),
      onSome: scheduledTodo =>
        Effect.gen(function* () {
          yield* writer
            .table('todos')
            .insert({
              ownerUserId: scheduledTodo.ownerUserId,
              text: scheduledTodo.text,
            })
            .pipe(
              Effect.catchTags({
                DocumentEncodeError: (error: DocumentEncodeError) =>
                  Effect.fail(
                    new ScheduledTodoStorageError({
                      operation: 'RunScheduledTodo',
                      message: error.message,
                      userMessage: storageErrorMessage,
                    }),
                  ),
              }),
            )

          const parsedCron = yield* cronFromString(scheduledTodo.cron)
          const nextRunAt = yield* nextRunAtFromCron(parsedCron)

          yield* writer
            .table('scheduledTodos')
            .patch(id, { nextRunAt })
            .pipe(
              Effect.catchTags({
                GetByIdFailure: (error: GetByIdFailure) =>
                  Effect.fail(
                    new ScheduledTodoStorageError({
                      operation: 'RunScheduledTodo',
                      message: error.message,
                      userMessage: storageErrorMessage,
                    }),
                  ),
                DocumentDecodeError: (error: DocumentDecodeError) =>
                  Effect.fail(
                    new ScheduledTodoStorageError({
                      operation: 'RunScheduledTodo',
                      message: error.message,
                      userMessage: storageErrorMessage,
                    }),
                  ),
                DocumentEncodeError: (error: DocumentEncodeError) =>
                  Effect.fail(
                    new ScheduledTodoStorageError({
                      operation: 'RunScheduledTodo',
                      message: error.message,
                      userMessage: storageErrorMessage,
                    }),
                  ),
              }),
            )

          yield* scheduleRun('RunScheduledTodo', id, nextRunAt)

          return null
        }),
    })
  }),
)

export const scheduledTodos = GroupImpl.make(api, 'scheduledTodos').pipe(
  Layer.provide(list),
  Layer.provide(create),
  Layer.provide(deleteScheduledTodo),
  Layer.provide(run),
)
