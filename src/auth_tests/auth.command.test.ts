import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'

import { AuthServiceError } from '../authService'
import { errorMessage } from '../errorMessage'
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
import { makeAuthServiceTestHarness } from '../test_support/serviceLayers'

describe('auth commands', () => {
  it.effect('SignInWithGitHub succeeds through the AuthService layer', () =>
    Effect.gen(function* () {
      const auth = makeAuthServiceTestHarness({
        signInWithGitHub: Effect.void,
      })

      const message = yield* SignInWithGitHub().effect.pipe(
        Effect.provide(auth.layer),
      )

      expect(message).toStrictEqual(SucceededStartedGitHubSignIn())
      expect(yield* auth.calls).toStrictEqual([{ _tag: 'SignInWithGitHub' }])
    }),
  )

  it.effect('SendMagicLink succeeds through the AuthService layer', () =>
    Effect.gen(function* () {
      const auth = makeAuthServiceTestHarness({
        sendMagicLink: () => Effect.void,
      })

      const message = yield* SendMagicLink({
        email: 'nolan@example.com',
      }).effect.pipe(Effect.provide(auth.layer))

      expect(message).toStrictEqual(SentMagicLink())
      expect(yield* auth.calls).toStrictEqual([
        { _tag: 'SendMagicLink', email: 'nolan@example.com' },
      ])
    }),
  )

  it.effect('SignInWithGitHub turns service failures into FailedSignIn', () =>
    Effect.gen(function* () {
      const auth = makeAuthServiceTestHarness({
        signInWithGitHub: Effect.fail(
          new AuthServiceError({
            operation: 'SignIn',
            message: errorMessage('Auth unavailable'),
            cause: 'offline',
          }),
        ),
      })

      const message = yield* SignInWithGitHub().effect.pipe(
        Effect.provide(auth.layer),
      )

      expect(message).toStrictEqual(
        FailedSignIn({ error: errorMessage('Auth unavailable') }),
      )
      expect(yield* auth.calls).toStrictEqual([{ _tag: 'SignInWithGitHub' }])
    }),
  )

  it.effect('SendMagicLink turns service failures into FailedSignIn', () =>
    Effect.gen(function* () {
      const auth = makeAuthServiceTestHarness({
        sendMagicLink: () =>
          Effect.fail(
            new AuthServiceError({
              operation: 'SendMagicLink',
              message: errorMessage('Magic link failed'),
              cause: 'offline',
            }),
          ),
      })

      const message = yield* SendMagicLink({
        email: 'nolan@example.com',
      }).effect.pipe(Effect.provide(auth.layer))

      expect(message).toStrictEqual(
        FailedSignIn({ error: errorMessage('Magic link failed') }),
      )
      expect(yield* auth.calls).toStrictEqual([
        { _tag: 'SendMagicLink', email: 'nolan@example.com' },
      ])
    }),
  )

  it.effect('SignOut succeeds through the AuthService layer', () =>
    Effect.gen(function* () {
      const auth = makeAuthServiceTestHarness({
        signOut: Effect.void,
      })

      const message = yield* SignOut().effect.pipe(Effect.provide(auth.layer))

      expect(message).toStrictEqual(SucceededSignOut())
      expect(yield* auth.calls).toStrictEqual([{ _tag: 'SignOut' }])
    }),
  )

  it.effect('SignOut turns service failures into FailedSignOut', () =>
    Effect.gen(function* () {
      const auth = makeAuthServiceTestHarness({
        signOut: Effect.fail(
          new AuthServiceError({
            operation: 'SignOut',
            message: errorMessage('Sign out failed'),
            cause: 'offline',
          }),
        ),
      })

      const message = yield* SignOut().effect.pipe(Effect.provide(auth.layer))

      expect(message).toStrictEqual(
        FailedSignOut({ error: errorMessage('Sign out failed') }),
      )
      expect(yield* auth.calls).toStrictEqual([{ _tag: 'SignOut' }])
    }),
  )
})
