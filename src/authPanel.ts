import { Effect, Match as M, Option, Schema as S, String } from 'effect'
import { Command, Submodel } from 'foldkit'
import { Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import { AuthService } from './authService'
import { ErrorMessage, errorMessage } from './errorMessage'

// MODEL

export const Model = S.Struct({
  magicLinkEmail: S.String,
  maybeNotice: S.Option(S.String),
  maybeError: S.Option(ErrorMessage),
})
export type Model = typeof Model.Type

export const init = (): Model =>
  ({
    magicLinkEmail: '',
    maybeNotice: Option.none(),
    maybeError: Option.none(),
  })

// MESSAGE

export const UpdatedMagicLinkEmail = m('UpdatedMagicLinkEmail', {
  email: S.String,
})
export const ClickedSignInWithGitHub = m('ClickedSignInWithGitHub')
export const SucceededStartedGitHubSignIn = m('SucceededStartedGitHubSignIn')
export const SubmittedMagicLink = m('SubmittedMagicLink')
export const SentMagicLink = m('SentMagicLink')
export const FailedSignIn = m('FailedSignIn', { error: ErrorMessage })
export const FailedLoadAuthState = m('FailedLoadAuthState', {
  error: ErrorMessage,
})

export const Message = S.Union([
  UpdatedMagicLinkEmail,
  ClickedSignInWithGitHub,
  SucceededStartedGitHubSignIn,
  SubmittedMagicLink,
  SentMagicLink,
  FailedSignIn,
  FailedLoadAuthState,
])
export type Message = typeof Message.Type

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, AuthService>>,
]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      UpdatedMagicLinkEmail: ({ email }) => [
        evo(model, { magicLinkEmail: () => email }),
        [],
      ],

      ClickedSignInWithGitHub: () => [
        evo(model, {
          maybeNotice: () => Option.none(),
          maybeError: () => Option.none(),
        }),
        [SignInWithGitHub()],
      ],

      SucceededStartedGitHubSignIn: () => [model, []],

      SubmittedMagicLink: () => {
        const email = String.trim(model.magicLinkEmail)

        if (String.isEmpty(email)) {
          return [
            evo(model, {
              maybeError: () =>
                Option.some(errorMessage('Enter an email address.')),
            }),
            [],
          ]
        }

        return [
          evo(model, {
            maybeNotice: () => Option.none(),
            maybeError: () => Option.none(),
          }),
          [SendMagicLink({ email })],
        ]
      },

      SentMagicLink: () => [
        evo(model, {
          maybeNotice: () =>
            Option.some('Check your email for a sign-in link.'),
          maybeError: () => Option.none(),
        }),
        [],
      ],

      FailedSignIn: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
      ],

      FailedLoadAuthState: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
      ],
    }),
  )

// COMMAND

export const SignInWithGitHub = Command.define(
  'SignInWithGitHub',
  SucceededStartedGitHubSignIn,
  FailedSignIn,
)(
  Effect.gen(function* () {
    const auth = yield* AuthService
    yield* auth.signInWithGitHub
    return SucceededStartedGitHubSignIn()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSignIn({ error: error.message })),
    ),
  ),
)

export const SendMagicLink = Command.define(
  'SendMagicLink',
  { email: S.String },
  SentMagicLink,
  FailedSignIn,
)(({ email }) =>
  Effect.gen(function* () {
    const auth = yield* AuthService
    yield* auth.sendMagicLink(email)
    return SentMagicLink()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedSignIn({ error: error.message })),
    ),
  ),
)

// VIEW

const noticeView = (model: Model): Html => {
  const h = html<Message>()

  return Option.match(model.maybeNotice, {
    onNone: () => h.empty,
    onSome: notice =>
      h.div(
        [
          h.Class(
            'rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700',
          ),
        ],
        [notice],
      ),
  })
}

export const errorView = (model: Model): Html => {
  const h = html<Message>()

  return Option.match(model.maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.div(
        [
          h.Role('alert'),
          h.Class(
            'rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700',
          ),
        ],
        [error],
      ),
  })
}

export const view = Submodel.defineView<Model, Message>((model): Html => {
  const h = html<Message>()

  return h.div(
    [h.Class('mx-auto max-w-md rounded-xl bg-white p-6 shadow-lg')],
    [
      h.h1(
        [h.Class('mb-2 text-center text-3xl font-bold text-gray-800')],
        ['Todo App'],
      ),
      h.p(
        [h.Class('mb-6 text-center text-sm text-gray-500')],
        ['Sign in to view todos.'],
      ),
      h.button(
        [
          h.Type('button'),
          h.Class(
            'mb-3 w-full rounded-lg bg-gray-900 px-5 py-2 text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-700',
          ),
          h.OnClick(ClickedSignInWithGitHub()),
        ],
        ['Continue with GitHub'],
      ),
      h.form(
        [h.Class('space-y-3'), h.OnSubmit(SubmittedMagicLink())],
        [
          h.label([h.For('magic-link-email'), h.Class('sr-only')], ['Email']),
          h.input([
            h.Id('magic-link-email'),
            h.Value(model.magicLinkEmail),
            h.Placeholder('Email address'),
            h.Class(
              'w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500',
            ),
            h.OnInput(email => UpdatedMagicLinkEmail({ email })),
          ]),
          h.button(
            [
              h.Type('submit'),
              h.Class(
                'w-full rounded-lg border border-blue-200 px-5 py-2 text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500',
              ),
            ],
            ['Email me a link'],
          ),
        ],
      ),
      h.div([h.Class('mt-4 space-y-2')], [noticeView(model), errorView(model)]),
    ],
  )
})
