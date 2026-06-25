import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { type Value } from 'convex/values'
import {
  Context,
  Effect,
  Layer,
  Match as M,
  Option,
  Ref,
  Schema as S,
  Stream,
} from 'effect'
import { ts } from 'foldkit/schema'

import { ErrorMessage, errorMessage } from './errorMessage'

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

export class AuthServiceError extends S.TaggedErrorClass<AuthServiceError>()(
  'AuthServiceError',
  {
    operation: AuthOperation,
    message: ErrorMessage,
    cause: S.Defect(),
  },
) {}

const authErrorMessage = (operation: AuthOperation): ErrorMessage =>
  M.value(operation).pipe(
    M.when('ReadAuthState', () => errorMessage('Could not load auth state.')),
    M.when('SignIn', () => errorMessage('Could not start sign-in.')),
    M.when('SendMagicLink', () =>
      errorMessage('Could not send sign-in link.'),
    ),
    M.when('SignOut', () => errorMessage('Could not sign out.')),
    M.when('FetchToken', () => errorMessage('Authentication failed.')),
    M.exhaustive,
  )

const toAuthServiceError =
  (operation: AuthOperation) =>
  (cause: unknown): AuthServiceError =>
    new AuthServiceError({
      operation,
      message: authErrorMessage(operation),
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
  name: S.optional(S.String),
  email: S.optional(S.String),
})
type JwtPayload = typeof JwtPayload.Type

const authenticatedUserDisplayName = 'Authenticated user'

const jwtPayloadSegment = (token: string): Effect.Effect<string, unknown> =>
  Effect.fromOption(Option.fromNullishOr(token.split('.')[1]))

const decodeJwtPayloadJson = (
  payloadSegment: string,
): Effect.Effect<unknown, unknown> =>
  Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(globalThis.atob(payloadSegment))
      return parsed
    },
    catch: error => error,
  })

const payloadDisplayName = (
  payload: JwtPayload,
): Effect.Effect<string, unknown> =>
  Effect.fromOption(
    Option.fromNullishOr(payload.name).pipe(
      Option.orElse(() => Option.fromNullishOr(payload.email)),
    ),
  )

const readJwtDisplayName = (token: string): Effect.Effect<string> =>
  jwtPayloadSegment(token).pipe(
    Effect.flatMap(decodeJwtPayloadJson),
    Effect.flatMap(S.decodeUnknownEffect(JwtPayload)),
    Effect.flatMap(payloadDisplayName),
    Effect.catch(() => Effect.succeed(authenticatedUserDisplayName)),
  )

const tokenToAuthState = (
  token: string | null,
): Effect.Effect<AuthState, never> =>
  Effect.gen(function* () {
    const maybeToken = Option.fromNullishOr(token)

    return yield* Option.match(maybeToken, {
      onNone: () => Effect.succeed(AuthSignedOut()),
      onSome: token =>
        readJwtDisplayName(token).pipe(
          Effect.map(displayName =>
            AuthSignedIn({
              session: AuthSession.make({ displayName }),
            }),
          ),
        ),
    })
  })

export const AuthServiceConvexAuthLive = ({
  convexUrl,
  storage = globalThis.window.localStorage,
  storageNamespace = convexUrl,
}: ConvexAuthLayerOptions): Layer.Layer<AuthService> =>
  Layer.effect(
    AuthService,
    Effect.gen(function* () {
      const client = new ConvexHttpClient(convexUrl)
      const tokenRef = yield* Ref.make<string | null>(null)

      const jwtKey = storageKey(storageNamespace, JWT_STORAGE_KEY)
      const refreshTokenKey = storageKey(
        storageNamespace,
        REFRESH_TOKEN_STORAGE_KEY,
      )
      const verifierKey = storageKey(storageNamespace, VERIFIER_STORAGE_KEY)

      const storageGet = (
        operation: AuthOperation,
        key: string,
      ): Effect.Effect<string | null, AuthServiceError> =>
        Effect.try({
          try: () => storage.getItem(key),
          catch: toAuthServiceError(operation),
        })

      const storageSet = (
        operation: AuthOperation,
        key: string,
        value: string,
      ): Effect.Effect<void, AuthServiceError> =>
        Effect.try({
          try: () => storage.setItem(key, value),
          catch: toAuthServiceError(operation),
        })

      const storageRemove = (
        operation: AuthOperation,
        key: string,
      ): Effect.Effect<void, AuthServiceError> =>
        Effect.try({
          try: () => storage.removeItem(key),
          catch: toAuthServiceError(operation),
        })

      const setTokens = (
        operation: AuthOperation,
        tokens: ConvexAuthTokens | null,
      ): Effect.Effect<void, AuthServiceError> =>
        Effect.gen(function* () {
          yield* Ref.set(tokenRef, tokens?.token ?? null)

          if (tokens === null) {
            yield* storageRemove(operation, jwtKey)
            yield* storageRemove(operation, refreshTokenKey)
            return
          }

          yield* storageSet(operation, jwtKey, tokens.token)
          yield* storageSet(operation, refreshTokenKey, tokens.refreshToken)
        })

      const readStoredJwtIntoRef = (
        operation: AuthOperation,
      ): Effect.Effect<string | null, AuthServiceError> =>
        Effect.gen(function* () {
          const storedToken = yield* storageGet(operation, jwtKey)
          yield* Ref.set(tokenRef, storedToken)
          return storedToken
        })

      const setClientAuthFromCurrentToken = (
        operation: AuthOperation,
      ): Effect.Effect<void, AuthServiceError> =>
        Effect.gen(function* () {
          const token = yield* Ref.get(tokenRef)

          if (token === null) {
            return
          }

          yield* Effect.try({
            try: () => client.setAuth(token),
            catch: toAuthServiceError(operation),
          })
        })

      const authAction = (
        operation: AuthOperation,
        args: (typeof signInReference)['_args'],
      ): Effect.Effect<SignInResult, AuthServiceError> =>
        Effect.tryPromise({
          try: () => client.action(signInReference, args),
          catch: toAuthServiceError(operation),
        })

      const authActionWithCurrentToken = (
        operation: AuthOperation,
        args: (typeof signInReference)['_args'],
      ): Effect.Effect<SignInResult, AuthServiceError> =>
        Effect.gen(function* () {
          yield* setClientAuthFromCurrentToken(operation)
          return yield* authAction(operation, args)
        })

      const signOutAction: Effect.Effect<unknown, AuthServiceError> =
        Effect.tryPromise({
          try: () => client.action(signOutReference, {}),
          catch: toAuthServiceError('SignOut'),
        })

      const redirectTo = (
        operation: AuthOperation,
        href: string,
      ): Effect.Effect<void, AuthServiceError> =>
        Effect.try({
          try: () => {
            globalThis.window.location.href = href
          },
          catch: toAuthServiceError(operation),
        })

      const removeOAuthCodeFromCurrentUrl: Effect.Effect<
        void,
        AuthServiceError
      > = Effect.try({
        try: () => {
          const url = new URL(globalThis.window.location.href)
          url.searchParams.delete('code')
          globalThis.window.history.replaceState(
            {},
            '',
            url.pathname + url.search + url.hash,
          )
        },
        catch: toAuthServiceError('ReadAuthState'),
      })

      const readOAuthCodeFromCurrentUrl: Effect.Effect<
        string | null,
        AuthServiceError
      > = Effect.try({
        try: () =>
          new URLSearchParams(globalThis.window.location.search).get('code'),
        catch: toAuthServiceError('ReadAuthState'),
      })

      const handleSignInResult = (
        operation: AuthOperation,
        result: SignInResult,
      ): Effect.Effect<void, AuthServiceError> =>
        Effect.gen(function* () {
          if (result.redirect !== undefined) {
            if (result.verifier !== undefined) {
              yield* storageSet(operation, verifierKey, result.verifier)
            }

            yield* redirectTo(operation, result.redirect)
            return
          }

          if ('tokens' in result) {
            yield* setTokens(operation, result.tokens ?? null)
          }
        })

      const refreshToken: Effect.Effect<string | null, AuthServiceError> =
        Effect.gen(function* () {
          const storedRefreshToken = yield* storageGet(
            'FetchToken',
            refreshTokenKey,
          )

          if (storedRefreshToken === null) {
            yield* setTokens('FetchToken', null)
            return null
          }

          const result = yield* authAction('FetchToken', {
            refreshToken: storedRefreshToken,
          })

          yield* setTokens('FetchToken', result.tokens ?? null)

          return yield* Ref.get(tokenRef)
        })

      const handleRedirectCode: Effect.Effect<AuthState, AuthServiceError> =
        Effect.gen(function* () {
          const code = yield* readOAuthCodeFromCurrentUrl

          if (code === null) {
            const storedToken = yield* readStoredJwtIntoRef('ReadAuthState')
            return yield* tokenToAuthState(storedToken)
          }

          yield* removeOAuthCodeFromCurrentUrl

          const verifier = yield* storageGet('ReadAuthState', verifierKey)
          yield* storageRemove('ReadAuthState', verifierKey)

          const result = yield* authAction('ReadAuthState', {
            params: { code },
            ...(verifier === null ? {} : { verifier }),
          })

          yield* setTokens('ReadAuthState', result.tokens ?? null)

          const token = yield* Ref.get(tokenRef)
          return yield* tokenToAuthState(token)
        })

      const loadAuthState = yield* Effect.cached(handleRedirectCode)

      const readCurrentToken: Effect.Effect<string | null, AuthServiceError> =
        loadAuthState.pipe(
          Effect.flatMap(() =>
            Effect.gen(function* () {
              const currentToken = yield* Ref.get(tokenRef)

              if (currentToken !== null) {
                return currentToken
              }

              return yield* readStoredJwtIntoRef('FetchToken')
            }),
          ),
        )

      const signInWithGitHub: Effect.Effect<void, AuthServiceError> = Effect.fn(
        'AuthService.signInWithGitHub',
      )(function* () {
          const result = yield* authActionWithCurrentToken('SignIn', {
            provider: 'github',
            params: { redirectTo: '/todos' },
          })

          yield* handleSignInResult('SignIn', result)
        })()

      const sendMagicLink = (
        email: string,
      ): Effect.Effect<void, AuthServiceError> =>
        Effect.fn('AuthService.sendMagicLink')(function* (email: string) {
          const result = yield* authActionWithCurrentToken('SendMagicLink', {
            provider: 'resend',
            params: { email, redirectTo: '/todos' },
          })

          yield* handleSignInResult('SendMagicLink', result)
        })(email)

      const signOut: Effect.Effect<void, AuthServiceError> = Effect.fn(
        'AuthService.signOut',
      )(function* () {
          const revokeRemoteSessionIfPossible = Effect.gen(function* () {
            yield* setClientAuthFromCurrentToken('SignOut')
            yield* signOutAction
          }).pipe(Effect.ignore)

          yield* revokeRemoteSessionIfPossible
          yield* setTokens('SignOut', null)
        })()

      const fetchToken = ({
        forceRefreshToken,
      }: FetchTokenArgs): Effect.Effect<
        string | null | undefined,
        AuthServiceError
      > =>
        Effect.fn('AuthService.fetchToken')(
          function* ({ forceRefreshToken }: FetchTokenArgs) {
            if (forceRefreshToken) {
              return yield* loadAuthState.pipe(Effect.andThen(refreshToken))
            }

            return yield* readCurrentToken
          },
        )({ forceRefreshToken })

      return {
        authState: Stream.fromEffect(loadAuthState),
        signInWithGitHub,
        sendMagicLink,
        signOut,
        fetchToken,
      } satisfies AuthServiceShape
    }),
  )

export const makeAuthServiceTestLayer = (
  service: AuthServiceShape,
): Layer.Layer<AuthService> => Layer.succeed(AuthService, service)
