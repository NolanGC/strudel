import { Effect, Layer, Option, Stream } from 'effect'
import { File as FoldkitFile } from 'foldkit'

import {
  AuthService,
  AuthServiceError,
  AuthServiceShape,
  AuthSignedOut,
} from '../authService'
import { errorMessage } from '../errorMessage'
import {
  ScheduledTodo,
  ScheduledTodoId,
  ScheduledTodosBackend,
  ScheduledTodosBackendError,
  ScheduledTodosBackendShape,
} from '../scheduledTodosBackend'
import {
  Todo,
  TodoId,
  TodosBackend,
  TodosBackendError,
  TodosBackendShape,
} from '../todosBackend'
import { CronExpression, TodoText } from '../../confect/domain'

type AuthCall =
  | { readonly _tag: 'SignInWithGitHub' }
  | { readonly _tag: 'SendMagicLink'; readonly email: string }
  | { readonly _tag: 'SignOut' }
  | {
      readonly _tag: 'FetchToken'
      readonly forceRefreshToken: boolean
    }

type TodosBackendCall =
  | { readonly _tag: 'CreateTodo'; readonly text: TodoText }
  | { readonly _tag: 'DeleteTodo'; readonly id: TodoId }
  | {
      readonly _tag: 'UploadImage'
      readonly id: TodoId
      readonly file: FoldkitFile.File
    }

type ScheduledTodosBackendCall =
  | {
      readonly _tag: 'CreateScheduledTodo'
      readonly text: TodoText
      readonly cron: CronExpression
    }
  | { readonly _tag: 'DeleteScheduledTodo'; readonly id: ScheduledTodoId }

const unexpectedAuthCall = (
  operation: AuthServiceError['operation'],
  call: string,
): AuthServiceError =>
  new AuthServiceError({
    operation,
    message: errorMessage(`Unexpected auth service call: ${call}`),
    cause: call,
  })

const unexpectedTodosCall = (
  operation: TodosBackendError['operation'],
  call: string,
): TodosBackendError =>
  new TodosBackendError({
    operation,
    message: errorMessage(`Unexpected todos backend call: ${call}`),
    cause: call,
  })

const unexpectedScheduledTodosCall = (
  operation: ScheduledTodosBackendError['operation'],
  call: string,
): ScheduledTodosBackendError =>
  new ScheduledTodosBackendError({
    operation,
    message: errorMessage(`Unexpected scheduled todos backend call: ${call}`),
    cause: call,
  })

export const makeAuthServiceTestHarness = (
  overrides: Partial<AuthServiceShape> = {},
): {
  readonly layer: Layer.Layer<AuthService>
  readonly calls: Effect.Effect<ReadonlyArray<AuthCall>>
} => {
  const calls: Array<AuthCall> = []

  return {
    layer: Layer.sync(AuthService)(() => ({
      authState: overrides.authState ?? Stream.succeed(AuthSignedOut()),
      signInWithGitHub: Effect.sync(() =>
        calls.push({ _tag: 'SignInWithGitHub' }),
      ).pipe(
        Effect.andThen(
          overrides.signInWithGitHub ??
            Effect.fail(unexpectedAuthCall('SignIn', 'signInWithGitHub')),
        ),
      ),
      sendMagicLink: email =>
        Effect.sync(() => calls.push({ _tag: 'SendMagicLink', email })).pipe(
          Effect.andThen(
            overrides.sendMagicLink?.(email) ??
              Effect.fail(unexpectedAuthCall('SendMagicLink', 'sendMagicLink')),
          ),
        ),
      signOut: Effect.sync(() => calls.push({ _tag: 'SignOut' })).pipe(
        Effect.andThen(
          overrides.signOut ??
            Effect.fail(unexpectedAuthCall('SignOut', 'signOut')),
        ),
      ),
      fetchToken: args =>
        Effect.sync(() => calls.push({ _tag: 'FetchToken', ...args })).pipe(
          Effect.andThen(
            overrides.fetchToken?.(args) ??
              Effect.fail(unexpectedAuthCall('FetchToken', 'fetchToken')),
          ),
        ),
    })),
    calls: Effect.sync(() => [...calls]),
  }
}

export const makeTodosBackendTestHarness = (
  overrides: Partial<TodosBackendShape> = {},
): {
  readonly layer: Layer.Layer<TodosBackend>
  readonly calls: Effect.Effect<ReadonlyArray<TodosBackendCall>>
} => {
  const calls: Array<TodosBackendCall> = []

  return {
    layer: Layer.sync(TodosBackend)(() => ({
      todos: overrides.todos ?? Stream.empty,
      create: text =>
        Effect.sync(() => calls.push({ _tag: 'CreateTodo', text })).pipe(
          Effect.andThen(
            overrides.create?.(text) ??
              Effect.fail(unexpectedTodosCall('CreateTodo', 'create')),
          ),
        ),
      delete: id =>
        Effect.sync(() => calls.push({ _tag: 'DeleteTodo', id })).pipe(
          Effect.andThen(
            overrides.delete?.(id) ??
              Effect.fail(unexpectedTodosCall('DeleteTodo', 'delete')),
          ),
        ),
      uploadImage: (id, file) =>
        Effect.sync(() => calls.push({ _tag: 'UploadImage', id, file })).pipe(
          Effect.andThen(
            overrides.uploadImage?.(id, file) ??
              Effect.fail(
                unexpectedTodosCall('UploadTodoImage', 'uploadImage'),
              ),
          ),
        ),
    })),
    calls: Effect.sync(() => [...calls]),
  }
}

export const makeScheduledTodosBackendTestHarness = (
  overrides: Partial<ScheduledTodosBackendShape> = {},
): {
  readonly layer: Layer.Layer<ScheduledTodosBackend>
  readonly calls: Effect.Effect<ReadonlyArray<ScheduledTodosBackendCall>>
} => {
  const calls: Array<ScheduledTodosBackendCall> = []

  return {
    layer: Layer.sync(ScheduledTodosBackend)(() => ({
      scheduledTodos: overrides.scheduledTodos ?? Stream.empty,
      create: ({ text, cron }) =>
        Effect.sync(() =>
          calls.push({ _tag: 'CreateScheduledTodo', text, cron }),
        ).pipe(
          Effect.andThen(
            overrides.create?.({ text, cron }) ??
              Effect.fail(
                unexpectedScheduledTodosCall(
                  'CreateScheduledTodo',
                  'create',
                ),
              ),
          ),
        ),
      delete: id =>
        Effect.sync(() =>
          calls.push({ _tag: 'DeleteScheduledTodo', id }),
        ).pipe(
          Effect.andThen(
            overrides.delete?.(id) ??
              Effect.fail(
                unexpectedScheduledTodosCall(
                  'DeleteScheduledTodo',
                  'delete',
                ),
              ),
          ),
        ),
    })),
    calls: Effect.sync(() => [...calls]),
  }
}

export const todoStream = (
  todos: ReadonlyArray<Todo>,
): Stream.Stream<ReadonlyArray<Todo>, TodosBackendError> =>
  Stream.succeed(todos)

export const scheduledTodoStream = (
  scheduledTodos: ReadonlyArray<ScheduledTodo>,
): Stream.Stream<
  ReadonlyArray<ScheduledTodo>,
  ScheduledTodosBackendError
> => Stream.succeed(scheduledTodos)

export const deletedTodo = (id: TodoId): Option.Option<TodoId> =>
  Option.some(id)

export const deletedScheduledTodo = (
  id: ScheduledTodoId,
): Option.Option<ScheduledTodoId> => Option.some(id)
