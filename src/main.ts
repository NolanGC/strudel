import {
  Array,
  Effect,
  Match as M,
  Option,
  Schema as S,
  Stream,
  String,
} from 'effect'
import { Command, Runtime, Subscription } from 'foldkit'
import { Document, Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'
import { Url, toString as urlToString } from 'foldkit/url'

import { AuthService, AuthSignedOut, AuthState } from './authService'
import { AppRoute, homeRouter, todosRouter, urlToAppRoute } from './route'
import { Todo, TodoId, TodosBackend } from './todosBackend'
import { ErrorMessage, errorMessage, toErrorMessage } from './userFacingError'

// MODEL

const LoadState = S.Literals(['Loading', 'Loaded', 'Failed'])
type LoadState = typeof LoadState.Type

export const Model = S.Struct({
  route: AppRoute,
  authState: AuthState,
  magicLinkEmail: S.String,
  todos: S.Array(Todo),
  newTodoText: S.String,
  loadState: LoadState,
  maybeNotice: S.Option(S.String),
  maybeError: S.Option(ErrorMessage),
})
export type Model = typeof Model.Type

// MESSAGE

export const CompletedNavigateInternal = m('CompletedNavigateInternal')
export const CompletedLoadExternal = m('CompletedLoadExternal')
export const ClickedLink = m('ClickedLink', { request: UrlRequest })
export const ChangedUrl = m('ChangedUrl', { url: Url })
export const UpdatedNewTodo = m('UpdatedNewTodo', { text: S.String })
export const UpdatedMagicLinkEmail = m('UpdatedMagicLinkEmail', {
  email: S.String,
})
export const ClickedSignInWithGitHub = m('ClickedSignInWithGitHub')
export const SucceededStartedGitHubSignIn = m('SucceededStartedGitHubSignIn')
export const SubmittedMagicLink = m('SubmittedMagicLink')
export const SentMagicLink = m('SentMagicLink')
export const FailedSignIn = m('FailedSignIn', { error: ErrorMessage })
export const ClickedSignOut = m('ClickedSignOut')
export const SucceededSignOut = m('SucceededSignOut')
export const FailedSignOut = m('FailedSignOut', { error: ErrorMessage })
export const UpdatedAuthState = m('UpdatedAuthState', { authState: AuthState })
export const FailedLoadAuthState = m('FailedLoadAuthState', {
  error: ErrorMessage,
})
export const AddedTodo = m('AddedTodo')
export const CreatedTodo = m('CreatedTodo')
export const FailedCreateTodo = m('FailedCreateTodo', { error: ErrorMessage })
export const ClickedDeleteTodo = m('ClickedDeleteTodo', { id: TodoId })
export const DeletedTodo = m('DeletedTodo')
export const FailedDeleteTodo = m('FailedDeleteTodo', { error: ErrorMessage })
export const LoadedTodos = m('LoadedTodos', { todos: S.Array(Todo) })
export const FailedLoadTodos = m('FailedLoadTodos', { error: ErrorMessage })

export const Message = S.Union([
  CompletedNavigateInternal,
  CompletedLoadExternal,
  ClickedLink,
  ChangedUrl,
  UpdatedNewTodo,
  UpdatedMagicLinkEmail,
  ClickedSignInWithGitHub,
  SucceededStartedGitHubSignIn,
  SubmittedMagicLink,
  SentMagicLink,
  FailedSignIn,
  ClickedSignOut,
  SucceededSignOut,
  FailedSignOut,
  UpdatedAuthState,
  FailedLoadAuthState,
  AddedTodo,
  CreatedTodo,
  FailedCreateTodo,
  ClickedDeleteTodo,
  DeletedTodo,
  FailedDeleteTodo,
  LoadedTodos,
  FailedLoadTodos,
])
export type Message = typeof Message.Type

// FLAGS

export const Flags = S.Struct({})
export type Flags = typeof Flags.Type

// INIT

export const init: Runtime.RoutingProgramInit<Model, Message, Flags> = (
  _flags,
  url,
) => [
  {
    route: urlToAppRoute(url),
    authState: { _tag: 'AuthChecking' },
    magicLinkEmail: '',
    todos: [],
    newTodoText: '',
    loadState: 'Loading',
    maybeNotice: Option.none(),
    maybeError: Option.none(),
  },
  [],
]

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, TodosBackend | AuthService>>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      CompletedNavigateInternal: () => [model, []],
      CompletedLoadExternal: () => [model, []],

      ClickedLink: ({ request }) =>
        M.value(request).pipe(
          withUpdateReturn,
          M.tagsExhaustive({
            Internal: ({ url }) => [
              model,
              [NavigateInternal({ url: urlToString(url) })],
            ],
            External: ({ href }) => [model, [LoadExternal({ href })]],
          }),
        ),

      ChangedUrl: ({ url }) => [
        evo(model, { route: () => urlToAppRoute(url) }),
        [],
      ],

      UpdatedNewTodo: ({ text }) => [
        evo(model, { newTodoText: () => text }),
        [],
      ],

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

      ClickedSignOut: () => [
        evo(model, { maybeError: () => Option.none() }),
        [SignOut()],
      ],

      SucceededSignOut: () => [
        evo(model, {
          authState: () => AuthSignedOut(),
          todos: () => [],
          loadState: () => 'Loading',
          maybeNotice: () => Option.none(),
          maybeError: () => Option.none(),
        }),
        [],
      ],

      FailedSignOut: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
      ],

      UpdatedAuthState: ({ authState }) => [
        evo(model, {
          authState: () => authState,
          maybeNotice: () => Option.none(),
          maybeError: () => Option.none(),
        }),
        [],
      ],

      FailedLoadAuthState: ({ error }) => [
        evo(model, {
          authState: () => AuthSignedOut(),
          maybeError: () => Option.some(error),
        }),
        [],
      ],

      AddedTodo: () => {
        if (model.authState._tag !== 'AuthSignedIn') {
          return [
            evo(model, {
              maybeError: () =>
                Option.some(errorMessage('Sign in before adding todos.')),
            }),
            [],
          ]
        }

        const text = String.trim(model.newTodoText)

        if (String.isEmpty(text)) {
          return [model, []]
        }

        return [
          evo(model, {
            newTodoText: () => '',
            maybeError: () => Option.none(),
          }),
          [CreateTodo({ text })],
        ]
      },

      CreatedTodo: () => [model, []],

      FailedCreateTodo: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
      ],

      ClickedDeleteTodo: ({ id }) => [
        evo(model, { maybeError: () => Option.none() }),
        model.authState._tag === 'AuthSignedIn' ? [DeleteTodo({ id })] : [],
      ],

      DeletedTodo: () => [model, []],

      FailedDeleteTodo: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
      ],

      LoadedTodos: ({ todos }) => [
        evo(model, {
          todos: () => todos,
          loadState: () => 'Loaded',
          maybeError: () => Option.none(),
        }),
        [],
      ],

      FailedLoadTodos: ({ error }) => [
        evo(model, {
          loadState: () => 'Failed',
          maybeError: () => Option.some(error),
        }),
        [],
      ],
    }),
  )

// COMMAND

const NavigateInternal = Command.define(
  'NavigateInternal',
  { url: S.String },
  CompletedNavigateInternal,
)(({ url }) => pushUrl(url).pipe(Effect.as(CompletedNavigateInternal())))

const LoadExternal = Command.define(
  'LoadExternal',
  { href: S.String },
  CompletedLoadExternal,
)(({ href }) => load(href).pipe(Effect.as(CompletedLoadExternal())))

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
      Effect.succeed(
        FailedSignIn({
          error: toErrorMessage(errorMessage('Could not start sign-in.'))(
            error,
          ),
        }),
      ),
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
      Effect.succeed(
        FailedSignIn({
          error: toErrorMessage(errorMessage('Could not send sign-in link.'))(
            error,
          ),
        }),
      ),
    ),
  ),
)

export const SignOut = Command.define(
  'SignOut',
  SucceededSignOut,
  FailedSignOut,
)(
  Effect.gen(function* () {
    const auth = yield* AuthService
    yield* auth.signOut
    return SucceededSignOut()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedSignOut({
          error: toErrorMessage(errorMessage('Could not sign out.'))(error),
        }),
      ),
    ),
  ),
)

export const CreateTodo = Command.define(
  'CreateTodo',
  { text: S.String },
  CreatedTodo,
  FailedCreateTodo,
)(({ text }) =>
  Effect.gen(function* () {
    const backend = yield* TodosBackend
    yield* backend.create(text)
    return CreatedTodo()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedCreateTodo({
          error: toErrorMessage(errorMessage('Could not create todo.'))(error),
        }),
      ),
    ),
  ),
)

export const DeleteTodo = Command.define(
  'DeleteTodo',
  { id: TodoId },
  DeletedTodo,
  FailedDeleteTodo,
)(({ id }) =>
  Effect.gen(function* () {
    const backend = yield* TodosBackend
    yield* backend.delete(id)
    return DeletedTodo()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(
        FailedDeleteTodo({
          error: toErrorMessage(errorMessage('Could not delete todo.'))(error),
        }),
      ),
    ),
  ),
)

// SUBSCRIPTION

export const subscriptions = Subscription.make<
  Model,
  Message,
  TodosBackend | AuthService
>()(entry => ({
  authState: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Stream.fromEffect(AuthService).pipe(
          Stream.flatMap(auth =>
            auth.authState.pipe(
              Stream.map(authState => UpdatedAuthState({ authState })),
              Stream.catch(error =>
                Stream.succeed(
                  FailedLoadAuthState({
                    error: toErrorMessage(
                      errorMessage('Could not load auth state.'),
                    )(error),
                  }),
                ),
              ),
            ),
          ),
        ),
    },
  ),
  todos: entry(
    { isProtectedTodosRoute: S.Boolean },
    {
      modelToDependencies: model => ({
        isProtectedTodosRoute:
          model.route._tag === 'Todos' &&
          model.authState._tag === 'AuthSignedIn',
      }),
      dependenciesToStream: ({ isProtectedTodosRoute }) =>
        Stream.when(
          Stream.fromEffect(TodosBackend).pipe(
            Stream.flatMap(backend =>
              backend.todos.pipe(
                Stream.map(todos => LoadedTodos({ todos })),
                Stream.catch(error =>
                  Stream.succeed(
                    FailedLoadTodos({
                      error: toErrorMessage(
                        errorMessage('Could not load todos.'),
                      )(error),
                    }),
                  ),
                ),
              ),
            ),
          ),
          Effect.sync(() => isProtectedTodosRoute),
        ),
    },
  ),
}))

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

const errorView = (model: Model): Html => {
  const h = html<Message>()

  return Option.match(model.maybeError, {
    onNone: () => h.empty,
    onSome: error => {
      const text = String.trim(error)

      if (String.isEmpty(text)) {
        return h.empty
      }

      return h.div(
        [
          h.Role('alert'),
          h.Class(
            'rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700',
          ),
        ],
        [text],
      )
    },
  })
}

const landingView = (): Html => {
  const h = html<Message>()

  return h.main(
    [h.Class('flex min-h-screen items-center justify-center bg-gray-100')],
    [
      h.div(
        [h.Class('text-center')],
        [
          h.h1(
            [h.Class('mb-6 text-5xl font-bold tracking-normal text-gray-900')],
            ['todo'],
          ),
          h.a(
            [
              h.Href(todosRouter({})),
              h.Class(
                'inline-flex rounded-lg bg-blue-600 px-5 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500',
              ),
            ],
            ['View todos'],
          ),
        ],
      ),
    ],
  )
}

const authView = (model: Model): Html => {
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
}

const checkingAuthView = (model: Model): Html => {
  const h = html<Message>()

  return h.div(
    [h.Class('mx-auto max-w-md rounded-xl bg-white p-6 text-center shadow-lg')],
    [
      h.h1([h.Class('mb-2 text-3xl font-bold text-gray-800')], ['Todo App']),
      h.div(
        [h.Role('status'), h.Class('text-sm text-gray-500')],
        ['Checking auth...'],
      ),
      h.div([h.Class('mt-4')], [errorView(model)]),
    ],
  )
}

const statusText = (model: Model): string =>
  M.value(model.loadState).pipe(
    M.when('Loading', () => 'Loading todos from Convex...'),
    M.when('Loaded', () => `${Array.length(model.todos)} todos`),
    M.when('Failed', () => 'Could not load todos'),
    M.exhaustive,
  )

const todoItemView = (todo: Todo): Html => {
  const h = html<Message>()

  return h.keyed('li')(
    todo._id,
    [h.Class('rounded-lg border border-gray-200 bg-white px-4 py-3')],
    [
      h.div(
        [h.Class('flex items-center justify-between gap-3')],
        [
          h.div([h.Class('min-w-0 flex-1 text-gray-900')], [todo.text]),
          h.button(
            [
              h.Type('button'),
              h.AriaLabel(`Delete ${todo.text}`),
              h.Class(
                'shrink-0 rounded border border-red-200 px-2 py-1 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500',
              ),
              h.OnClick(ClickedDeleteTodo({ id: todo._id })),
            ],
            ['Delete'],
          ),
        ],
      ),
    ],
  )
}

const todosView = (model: Model): Html => {
  const h = html<Message>()

  return h.div(
    [h.Class('mx-auto max-w-md rounded-xl bg-white p-6 shadow-lg')],
    [
      h.div(
        [h.Class('mb-4 flex items-start justify-between gap-3')],
        [
          h.div(
            [],
            [
              h.h1([h.Class('text-3xl font-bold text-gray-800')], ['Todo App']),
              h.div(
                [h.Class('mt-1 text-sm text-gray-500'), h.Role('status')],
                [statusText(model)],
              ),
            ],
          ),
          h.button(
            [
              h.Type('button'),
              h.Class(
                'shrink-0 rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500',
              ),
              h.OnClick(ClickedSignOut()),
            ],
            ['Sign out'],
          ),
        ],
      ),

      h.form(
        [h.Class('mb-4'), h.OnSubmit(AddedTodo())],
        [
          h.label([h.For('new-todo'), h.Class('sr-only')], ['New todo']),
          h.div(
            [h.Class('flex gap-3')],
            [
              h.input([
                h.Id('new-todo'),
                h.Value(model.newTodoText),
                h.Placeholder('What needs to be done?'),
                h.Class(
                  'min-w-0 flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500',
                ),
                h.OnInput(text => UpdatedNewTodo({ text })),
              ]),
              h.button(
                [
                  h.Type('submit'),
                  h.Class(
                    'rounded-lg bg-blue-500 px-5 py-2 text-white hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500',
                  ),
                ],
                ['Add'],
              ),
            ],
          ),
        ],
      ),

      errorView(model),

      Array.match(model.todos, {
        onEmpty: () =>
          h.div(
            [h.Class('py-8 text-center text-gray-500')],
            ['No todos yet. Add one above.'],
          ),
        onNonEmpty: todos =>
          h.ul([h.Class('mt-4 space-y-2')], Array.map(todos, todoItemView)),
      }),
    ],
  )
}

const protectedTodosView = (model: Model): Html =>
  M.value(model.authState).pipe(
    M.tagsExhaustive({
      AuthChecking: () => checkingAuthView(model),
      AuthSignedOut: () => authView(model),
      AuthSignedIn: () => todosView(model),
    }),
  )

const notFoundView = (): Html => {
  const h = html<Message>()

  return h.main(
    [h.Class('flex min-h-screen items-center justify-center bg-gray-100')],
    [
      h.div(
        [h.Class('text-center')],
        [
          h.h1(
            [h.Class('mb-4 text-3xl font-bold text-gray-900')],
            ['Not found'],
          ),
          h.a(
            [h.Href(homeRouter({})), h.Class('text-blue-700 underline')],
            ['Go home'],
          ),
        ],
      ),
    ],
  )
}

export const view = (model: Model): Document => {
  const h = html<Message>()

  const body = M.value(model.route).pipe(
    M.tagsExhaustive({
      Home: () => landingView(),
      Todos: () =>
        h.main(
          [h.Class('min-h-screen bg-gray-100 py-8')],
          [protectedTodosView(model)],
        ),
      NotFound: () => notFoundView(),
    }),
  )

  return { title: 'Todo', body }
}

// FLAG

export const flags: Effect.Effect<Flags> = Effect.succeed({})
