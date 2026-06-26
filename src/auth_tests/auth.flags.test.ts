import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'

import { AuthSignedIn, AuthSignedOut } from '../authService'
import {
  makeFlagsFromKeyValueStore,
  makeTemplateFlagsFromKeyValueStore,
} from '../main'

const storageNamespace = 'https://example.convex.cloud'
const jwtStorageKey = `__convexAuthJWT_${storageNamespace.replace(/[^a-zA-Z0-9]/g, '')}`

const jwtWithPayload = (payload: unknown): string =>
  ['header', btoa(JSON.stringify(payload)), 'signature'].join('.')

describe('auth flags', () => {
  it.effect('starts signed out when no cached JWT exists', () =>
    Effect.gen(function* () {
      const flags = yield* makeFlagsFromKeyValueStore({
        storageNamespace,
      }).pipe(Effect.provide(KeyValueStore.layerMemory))

      expect(flags.initialAuthState).toStrictEqual(AuthSignedOut())
    }),
  )

  it.effect('starts signed in from the cached JWT', () =>
    Effect.gen(function* () {
      const flags = yield* Effect.gen(function* () {
        const store = yield* KeyValueStore.KeyValueStore
        yield* store.set(jwtStorageKey, jwtWithPayload({ name: 'Nolan' }))

        return yield* makeFlagsFromKeyValueStore({ storageNamespace })
      }).pipe(Effect.provide(KeyValueStore.layerMemory))

      expect(flags.initialAuthState).toStrictEqual(
        AuthSignedIn({ session: { displayName: 'Nolan' } }),
      )
    }),
  )

  it.effect('template auth starts signed in by default', () =>
    Effect.gen(function* () {
      const flags = yield* makeTemplateFlagsFromKeyValueStore({
        displayName: 'Template Dev',
      }).pipe(Effect.provide(KeyValueStore.layerMemory))

      expect(flags.initialAuthState).toStrictEqual(
        AuthSignedIn({ session: { displayName: 'Template Dev' } }),
      )
    }),
  )

  it.effect('template auth respects a persisted signed-out state', () =>
    Effect.gen(function* () {
      const flags = yield* Effect.gen(function* () {
        const store = yield* KeyValueStore.KeyValueStore
        yield* store.set('strudel:template-auth-state', 'SignedOut')

        return yield* makeTemplateFlagsFromKeyValueStore({
          displayName: 'Template Dev',
        })
      }).pipe(Effect.provide(KeyValueStore.layerMemory))

      expect(flags.initialAuthState).toStrictEqual(AuthSignedOut())
    }),
  )
})
