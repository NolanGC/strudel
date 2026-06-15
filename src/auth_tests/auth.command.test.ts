import { Effect, Stream } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  AuthServiceError,
  AuthSignedOut,
  makeAuthServiceTestLayer,
} from '../authService'
import {
  FailedSignIn,
  FailedSignOut,
  SendMagicLink,
  SentMagicLink,
  SignInWithGitHub,
  SignOut,
  SucceededSignOut,
  SucceededStartedGitHubSignIn,
} from '../main'
import { errorMessage } from '../userFacingError'

const authLayer = makeAuthServiceTestLayer({
  authState: Stream.succeed(AuthSignedOut()),
  signInWithGitHub: Effect.void,
  sendMagicLink: () => Effect.void,
  signOut: Effect.void,
  fetchToken: () => Effect.succeed(null),
})

describe('auth commands', () => {
  test('SignInWithGitHub succeeds through the AuthService layer', async () => {
    const message = await SignInWithGitHub().effect.pipe(
      Effect.provide(authLayer),
      Effect.runPromise,
    )

    expect(message).toStrictEqual(SucceededStartedGitHubSignIn())
  })

  test('SendMagicLink succeeds through the AuthService layer', async () => {
    const message = await SendMagicLink({
      email: 'nolan@example.com',
    }).effect.pipe(Effect.provide(authLayer), Effect.runPromise)

    expect(message).toStrictEqual(SentMagicLink())
  })

  test('SignInWithGitHub turns service failures into FailedSignIn', async () => {
    const layer = makeAuthServiceTestLayer({
      authState: Stream.succeed(AuthSignedOut()),
      signInWithGitHub: Effect.fail(
        new AuthServiceError({
          operation: 'SignIn',
          message: errorMessage('Auth unavailable'),
          cause: 'offline',
        }),
      ),
      sendMagicLink: () => Effect.void,
      signOut: Effect.void,
      fetchToken: () => Effect.succeed(null),
    })

    const message = await SignInWithGitHub().effect.pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(message).toStrictEqual(
      FailedSignIn({ error: errorMessage('Auth unavailable') }),
    )
  })

  test('SignOut succeeds through the AuthService layer', async () => {
    const message = await SignOut().effect.pipe(
      Effect.provide(authLayer),
      Effect.runPromise,
    )

    expect(message).toStrictEqual(SucceededSignOut())
  })

  test('SignOut turns service failures into FailedSignOut', async () => {
    const layer = makeAuthServiceTestLayer({
      authState: Stream.succeed(AuthSignedOut()),
      signInWithGitHub: Effect.void,
      sendMagicLink: () => Effect.void,
      signOut: Effect.fail(
        new AuthServiceError({
          operation: 'SignOut',
          message: errorMessage('Sign out failed'),
          cause: 'offline',
        }),
      ),
      fetchToken: () => Effect.succeed(null),
    })

    const message = await SignOut().effect.pipe(
      Effect.provide(layer),
      Effect.runPromise,
    )

    expect(message).toStrictEqual(
      FailedSignOut({ error: errorMessage('Sign out failed') }),
    )
  })
})
