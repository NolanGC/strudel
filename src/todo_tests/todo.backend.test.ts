import { WebSocketClient } from '@confect/js'
import { Effect, Layer, Schema as S, Stream } from 'effect'
import { describe, expect, test } from 'vitest'

import { AuthSignedIn, makeAuthServiceTestLayer } from '../authService'
import {
  TodoId as TodoIdSchema,
  TodosBackend,
  TodosBackendLive,
} from '../todosBackend'

const todoId = S.decodeUnknownSync(TodoIdSchema)

const makeTestLayer = (calls: Array<string>) => {
  const authLayer = makeAuthServiceTestLayer({
    authState: Stream.succeed(
      AuthSignedIn({ session: { displayName: 'Nolan' } }),
    ),
    signInWithGitHub: Effect.void,
    sendMagicLink: () => Effect.void,
    signOut: Effect.void,
    fetchToken: () =>
      Effect.sync(() => {
        calls.push('fetchToken')
        return 'test-token'
      }),
  })

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const websocketClient = {
    url: 'test',
    setAuth: (
      fetchToken: (args: {
        readonly forceRefreshToken: boolean
      }) => Effect.Effect<string | null | undefined>,
    ) =>
      fetchToken({ forceRefreshToken: false }).pipe(
        Effect.map(token => {
          calls.push(`setAuth:${token ?? 'none'}`)
        }),
      ),
    query: () => Effect.succeed(null),
    mutation: () =>
      Effect.sync(() => {
        calls.push('mutation')
        return todoId('todo-created')
      }),
    action: () => Effect.succeed(null),
    reactiveQuery: () =>
      Stream.sync(() => {
        calls.push('reactiveQuery')
        return []
      }),
  } as WebSocketClient.WebSocketClient

  const websocketLayer = Layer.succeed(
    WebSocketClient.WebSocketClient,
    websocketClient,
  )

  return TodosBackendLive.pipe(
    Layer.provide(Layer.merge(authLayer, websocketLayer)),
  )
}

describe('todo backend service', () => {
  test('installs current auth before creating todos', async () => {
    const calls: Array<string> = []
    const backend = await TodosBackend.pipe(
      Effect.provide(makeTestLayer(calls)),
      Effect.runPromise,
    )

    await backend.create('Write tests').pipe(Effect.runPromise)

    expect(calls).toStrictEqual([
      'fetchToken',
      'setAuth:test-token',
      'fetchToken',
      'setAuth:test-token',
      'mutation',
    ])
  })

  test('installs current auth before starting the todos subscription', async () => {
    const calls: Array<string> = []
    const backend = await TodosBackend.pipe(
      Effect.provide(makeTestLayer(calls)),
      Effect.runPromise,
    )

    await backend.todos.pipe(Stream.take(1), Stream.runCollect, Effect.runPromise)

    expect(calls).toStrictEqual([
      'fetchToken',
      'setAuth:test-token',
      'fetchToken',
      'setAuth:test-token',
      'reactiveQuery',
    ])
  })
})
