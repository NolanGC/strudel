import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { type Value } from 'convex/values'
import {
  Context,
  Data,
  Effect,
  Layer,
  Option,
  Schema as S,
  Stream,
} from 'effect'
import { ts } from 'foldkit/schema'

import { ErrorMessage, errorMessage, toErrorMessage } from './userFacingError'

export const AuthSession = S.Struct({
  displayName: S.String,
})
export type AuthSession = typeof AuthSession.Type

export const AuthChecking = ts('AuthChecking')
export const AuthSignedOut = ts('AuthSignedOut')
export const AuthSignedIn = ts('AuthSignedIn', {
  session: AuthSession,
})

export const AuthState = S.Union([AuthChecking, AuthSignedOut, AuthSignedIn])
export type AuthState = typeof AuthState.Type

const AuthOperation = S.Literals([
  'ReadAuthState',
  'SignIn',
  'SendMagicLink',
  'SignOut',
  'FetchToken',
])
type AuthOperation = typeof AuthOperation.Type

export class AuthServiceError extends Data.TaggedError('AuthServiceError')<{
  readonly operation: AuthOperation
  readonly message: ErrorMessage
  readonly cause: unknown
}> {}

const toAuthServiceError =
  (operation: AuthOperation) =>
  (cause: unknown): AuthServiceError =>
    new AuthServiceError({
      operation,
      message: toErrorMessage(errorMessage('Authentication failed.'))(cause),
      cause,
    })

type FetchTokenArgs = {
  readonly forceRefreshToken: boolean
}

type AuthServiceShape = {
  readonly authState: Stream.Stream<AuthState, AuthServiceError>
  readonly signInWithGitHub: Effect.Effect<void, AuthServiceError>
  readonly sendMagicLink: (
    email: string,
  ) => Effect.Effect<void, AuthServiceError>
  readonly signOut: Effect.Effect<void, AuthServiceError>
  readonly fetchToken: (
    args: FetchTokenArgs,
  ) => Effect.Effect<string | null | undefined, AuthServiceError>
}

export class AuthService extends Context.Service<
  AuthService,
  AuthServiceShape
>()('strudel/AuthService') {}

type ConvexAuthLayerOptions = {
  readonly convexUrl: string
  readonly storage?: Storage
  readonly storageNamespace?: string
}

type ConvexAuthTokens = {
  readonly token: string
  readonly refreshToken: string
}

type SignInResult = {
  readonly redirect?: string
  readonly verifier?: string
  readonly tokens?: ConvexAuthTokens | null
}

const signInReference = makeFunctionReference<
  'action',
  {
    readonly provider?: string
    readonly params?: Record<string, Value>
    readonly verifier?: string
    readonly refreshToken?: string
  },
  SignInResult
>('auth:signIn')

const signOutReference = makeFunctionReference<'action'>('auth:signOut')

const JWT_STORAGE_KEY = '__convexAuthJWT'
const REFRESH_TOKEN_STORAGE_KEY = '__convexAuthRefreshToken'
const VERIFIER_STORAGE_KEY = '__convexAuthOAuthVerifier'

const storageKey = (namespace: string, key: string): string =>
  `${key}_${namespace.replace(/[^a-zA-Z0-9]/g, '')}`

const JwtPayload = S.Struct({
  name: S.optional(S.Unknown),
  email: S.optional(S.Unknown),
})

const readJwtDisplayName = (token: string): string => {
  const parts = token.split('.')

  if (parts.length < 2) {
    return 'Authenticated user'
  }

  try {
    const maybePayload = S.decodeUnknownOption(JwtPayload)(
      JSON.parse(globalThis.atob(parts[1] ?? '')),
    )

    if (Option.isNone(maybePayload)) {
      return 'Authenticated user'
    }

    const payload = maybePayload.value

    if (typeof payload.name === 'string') {
      return payload.name
    }

    if (typeof payload.email === 'string') {
      return payload.email
    }
  } catch {
    return 'Authenticated user'
  }

  return 'Authenticated user'
}

const tokenToAuthState = (token: string | null): AuthState =>
  token === null
    ? AuthSignedOut()
    : AuthSignedIn({
        session: AuthSession.make({ displayName: readJwtDisplayName(token) }),
      })

export const AuthServiceConvexAuthLive = ({
  convexUrl,
  storage = globalThis.window.localStorage,
  storageNamespace = convexUrl,
}: ConvexAuthLayerOptions): Layer.Layer<AuthService> =>
  Layer.effect(
    AuthService,
    Effect.sync(() => {
      const client = new ConvexHttpClient(convexUrl)
      let token: string | null = null

      const jwtKey = storageKey(storageNamespace, JWT_STORAGE_KEY)
      const refreshTokenKey = storageKey(
        storageNamespace,
        REFRESH_TOKEN_STORAGE_KEY,
      )
      const verifierKey = storageKey(storageNamespace, VERIFIER_STORAGE_KEY)

      const setTokens = (tokens: ConvexAuthTokens | null) => {
        token = tokens?.token ?? null

        if (tokens === null) {
          storage.removeItem(jwtKey)
          storage.removeItem(refreshTokenKey)
          return
        }

        storage.setItem(jwtKey, tokens.token)
        storage.setItem(refreshTokenKey, tokens.refreshToken)
      }

      const action = (args: (typeof signInReference)['_args']) =>
        client.action(signInReference, args)

      const actionWithCurrentToken = (
        args: (typeof signInReference)['_args'],
      ) => {
        if (token !== null) {
          client.setAuth(token)
        }

        return action(args)
      }

      const handleSignInResult = (result: SignInResult) => {
        if (result.redirect !== undefined) {
          if (result.verifier !== undefined) {
            storage.setItem(verifierKey, result.verifier)
          }

          globalThis.window.location.href = result.redirect
          return
        }

        if ('tokens' in result) {
          setTokens(result.tokens ?? null)
        }
      }

      const refreshToken = Effect.tryPromise({
        try: async () => {
          const storedRefreshToken = storage.getItem(refreshTokenKey)

          if (storedRefreshToken === null) {
            setTokens(null)
            return null
          }

          const result = await action({ refreshToken: storedRefreshToken })
          setTokens(result.tokens ?? null)
          return token
        },
        catch: toAuthServiceError('FetchToken'),
      })

      const handleRedirectCode = Effect.tryPromise({
        try: async () => {
          const code = new URLSearchParams(
            globalThis.window.location.search,
          ).get('code')

          if (code === null) {
            token = storage.getItem(jwtKey)
            return tokenToAuthState(token)
          }

          const url = new URL(globalThis.window.location.href)
          url.searchParams.delete('code')
          globalThis.window.history.replaceState(
            {},
            '',
            url.pathname + url.search + url.hash,
          )

          const verifier = storage.getItem(verifierKey) ?? undefined
          storage.removeItem(verifierKey)
          const result = await action({
            params: { code },
            ...(verifier === undefined ? {} : { verifier }),
          })
          setTokens(result.tokens ?? null)

          return tokenToAuthState(token)
        },
        catch: toAuthServiceError('ReadAuthState'),
      })

      return {
        authState: Stream.fromEffect(handleRedirectCode),
        signInWithGitHub: Effect.tryPromise({
          try: async () => {
            const result = await actionWithCurrentToken({
              provider: 'github',
              params: { redirectTo: '/todos' },
            })
            handleSignInResult(result)
          },
          catch: toAuthServiceError('SignIn'),
        }),
        sendMagicLink: (email: string) =>
          Effect.tryPromise({
            try: async () => {
              const result = await actionWithCurrentToken({
                provider: 'resend',
                params: { email, redirectTo: '/todos' },
              })
              handleSignInResult(result)
            },
            catch: toAuthServiceError('SendMagicLink'),
          }),
        signOut: Effect.tryPromise({
          try: async () => {
            try {
              if (token !== null) {
                client.setAuth(token)
              }
              await client.action(signOutReference, {})
            } finally {
              setTokens(null)
            }
          },
          catch: toAuthServiceError('SignOut'),
        }),
        fetchToken: ({ forceRefreshToken }) =>
          forceRefreshToken
            ? refreshToken
            : Effect.sync(() => {
                token = token ?? storage.getItem(jwtKey)
                return token
              }),
      } satisfies AuthServiceShape
    }),
  )

export const makeAuthServiceTestLayer = (
  service: AuthServiceShape,
): Layer.Layer<AuthService> => Layer.succeed(AuthService, service)
