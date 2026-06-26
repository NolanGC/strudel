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

import refs from '../confect/_generated/refs'
import { CronExpression, TodoText } from '../confect/domain'
import {
  InvalidCronExpression,
  NotAuthenticated,
  ScheduledTodoStorageError,
} from '../confect/scheduledTodos.spec'
import { ScheduledTodos } from '../confect/tables/scheduledTodos'
import { AuthService } from './authService'
import { ErrorMessage, errorMessage } from './errorMessage'

export const ScheduledTodo = ScheduledTodos.Doc
export type ScheduledTodo = typeof ScheduledTodo.Type

export const ScheduledTodoId = GenericId.GenericId('scheduledTodos')
export type ScheduledTodoId = typeof ScheduledTodoId.Type

const ScheduledTodosBackendOperation = S.Literals([
  'ListScheduledTodos',
  'CreateScheduledTodo',
  'DeleteScheduledTodo',
])
type ScheduledTodosBackendOperation =
  typeof ScheduledTodosBackendOperation.Type

type ScheduledTodosBackendCause =
  | InvalidCronExpression
  | NotAuthenticated
  | ScheduledTodoStorageError
  | WebSocketClient.WebSocketClientError
  | S.SchemaError

export class ScheduledTodosBackendError extends S.TaggedErrorClass<ScheduledTodosBackendError>()(
  'ScheduledTodosBackendError',
  {
    operation: ScheduledTodosBackendOperation,
    message: ErrorMessage,
    cause: S.Unknown,
  },
) {}

const scheduledTodosBackendMessage = (
  error: ScheduledTodosBackendCause,
): ErrorMessage =>
  M.value(error).pipe(
    M.tags({
      InvalidCronExpression: ({ userMessage }) => errorMessage(userMessage),
      NotAuthenticated: ({ userMessage }) => errorMessage(userMessage),
      ScheduledTodoStorageError: ({ userMessage }) =>
        errorMessage(userMessage),
      WebSocketClientError: () => errorMessage('Could not schedule todos.'),
      SchemaError: () => errorMessage('Could not schedule todos.'),
    }),
    M.exhaustive,
  )

const toBackendError =
  (operation: ScheduledTodosBackendOperation) =>
  (cause: ScheduledTodosBackendCause): ScheduledTodosBackendError =>
    new ScheduledTodosBackendError({
      operation,
      message: scheduledTodosBackendMessage(cause),
      cause,
    })

export type ScheduledTodosBackendShape = {
  readonly scheduledTodos: Stream.Stream<
    ReadonlyArray<ScheduledTodo>,
    ScheduledTodosBackendError
  >
  readonly create: (args: {
    readonly text: TodoText
    readonly cron: CronExpression
  }) => Effect.Effect<ScheduledTodoId, ScheduledTodosBackendError>
  readonly delete: (
    id: ScheduledTodoId,
  ) => Effect.Effect<Option.Option<ScheduledTodoId>, ScheduledTodosBackendError>
}

export class ScheduledTodosBackend extends Context.Service<
  ScheduledTodosBackend,
  ScheduledTodosBackendShape
>()('strudel/ScheduledTodosBackend') {}

export const ScheduledTodosBackendLive = Layer.effect(
  ScheduledTodosBackend,
  Effect.gen(function* () {
    const confect = yield* WebSocketClient.WebSocketClient
    const auth = yield* AuthService

    const authenticate = confect.setAuth(args =>
      auth.fetchToken(args).pipe(Effect.orDie),
    )

    yield* authenticate

    return {
      scheduledTodos: Stream.fromEffect(authenticate).pipe(
        Stream.flatMap(() =>
          confect.reactiveQuery(refs.public.scheduledTodos.list),
        ),
        Stream.mapError(toBackendError('ListScheduledTodos')),
      ),
      create: Effect.fn('ScheduledTodosBackend.create')(({ text, cron }) =>
        authenticate.pipe(
          Effect.flatMap(() =>
            confect.mutation(refs.public.scheduledTodos.create, {
              text,
              cron,
            }),
          ),
          Effect.mapError(toBackendError('CreateScheduledTodo')),
        ),
      ),
      delete: Effect.fn('ScheduledTodosBackend.delete')(
        (id: ScheduledTodoId) =>
          authenticate.pipe(
            Effect.flatMap(() =>
              confect.mutation(refs.public.scheduledTodos.deleteScheduledTodo, {
                id,
              }),
            ),
            Effect.mapError(toBackendError('DeleteScheduledTodo')),
          ),
      ),
    } satisfies ScheduledTodosBackendShape
  }),
)

export const makeScheduledTodosBackendTestLayer = (
  backend: ScheduledTodosBackendShape,
): Layer.Layer<ScheduledTodosBackend> =>
  Layer.succeed(ScheduledTodosBackend, backend)
