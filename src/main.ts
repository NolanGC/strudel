import { Effect, Match as M, Option, Schema as S, Stream } from 'effect'
import { Command, Runtime, Subscription } from 'foldkit'
import { Document, Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { evo } from 'foldkit/struct'
import { Url, toString as urlToString } from 'foldkit/url'

import { AuthService, AuthSignedOut, AuthState } from './authService'
import * as AuthPanel from './authPanel'
import { ErrorMessage } from './errorMessage'
import * as ImageUploadsPage from './page/imageUploads'
import * as ScheduledTodosPage from './page/scheduledTodos'
import {
  AppRoute,
  homeRouter,
  imageUploadsRouter,
  scheduledTodosRouter,
  todosRouter,
  urlToAppRoute,
} from './route'
import { ScheduledTodosBackend } from './scheduledTodosBackend'
import { TodosBackend } from './todosBackend'
import * as TodosPage from './todosPage'

// MODEL

export const Model = S.Struct({
  route: AppRoute,
  authState: AuthState,
  authPanel: AuthPanel.Model,
  todosPage: TodosPage.Model,
  scheduledTodosPage: ScheduledTodosPage.Model,
  imageUploadsPage: ImageUploadsPage.Model,
  maybeError: S.Option(ErrorMessage),
})
export type Model = typeof Model.Type

// MESSAGE

export const CompletedNavigateInternal = m('CompletedNavigateInternal')
export const CompletedLoadExternal = m('CompletedLoadExternal')
export const ClickedLink = m('ClickedLink', { request: UrlRequest })
export const ChangedUrl = m('ChangedUrl', { url: Url })
export const UpdatedAuthState = m('UpdatedAuthState', { authState: AuthState })
export const FailedLoadAuthState = m('FailedLoadAuthState', {
  error: ErrorMessage,
})
export const ClickedSignOut = m('ClickedSignOut')
export const SucceededSignOut = m('SucceededSignOut')
export const FailedSignOut = m('FailedSignOut', { error: ErrorMessage })
export const GotAuthPanelMessage = m('GotAuthPanelMessage', {
  message: AuthPanel.Message,
})
export const GotTodosPageMessage = m('GotTodosPageMessage', {
  message: TodosPage.Message,
})
export const GotScheduledTodosPageMessage = m('GotScheduledTodosPageMessage', {
  message: ScheduledTodosPage.Message,
})
export const GotImageUploadsPageMessage = m('GotImageUploadsPageMessage', {
  message: ImageUploadsPage.Message,
})

export const Message = S.Union([
  CompletedNavigateInternal,
  CompletedLoadExternal,
  ClickedLink,
  ChangedUrl,
  UpdatedAuthState,
  FailedLoadAuthState,
  ClickedSignOut,
  SucceededSignOut,
  FailedSignOut,
  GotAuthPanelMessage,
  GotTodosPageMessage,
  GotScheduledTodosPageMessage,
  GotImageUploadsPageMessage,
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
    authPanel: AuthPanel.init(),
    todosPage: TodosPage.init(),
    scheduledTodosPage: ScheduledTodosPage.init(),
    imageUploadsPage: ImageUploadsPage.init(),
    maybeError: Option.none(),
  },
  [],
]

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<
    Command.Command<
      Message,
      never,
      TodosBackend | AuthService | ScheduledTodosBackend
    >
  >,
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

      UpdatedAuthState: ({ authState }) => [
        evo(model, {
          authState: () => authState,
          maybeError: () => Option.none(),
        }),
        [],
      ],

      FailedLoadAuthState: ({ error }) => {
        const [authPanel] = AuthPanel.update(
          model.authPanel,
          AuthPanel.FailedLoadAuthState({ error }),
        )

        return [
          evo(model, {
            authState: () => AuthSignedOut(),
            authPanel: () => authPanel,
            maybeError: () => Option.some(error),
          }),
          [],
        ]
      },

      ClickedSignOut: () => [
        evo(model, { maybeError: () => Option.none() }),
        [SignOut()],
      ],

      SucceededSignOut: () => [
        evo(model, {
          authState: () => AuthSignedOut(),
          todosPage: () => TodosPage.init(),
          maybeError: () => Option.none(),
        }),
        [],
      ],

      FailedSignOut: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
      ],

      GotAuthPanelMessage: ({ message }) =>
        handleGotAuthPanelMessage(model, message),

      GotTodosPageMessage: ({ message }) =>
        handleGotTodosPageMessage(model, message),
      GotScheduledTodosPageMessage: ({ message }) =>
        handleGotScheduledTodosPageMessage(model, message),
      GotImageUploadsPageMessage: ({ message }) =>
        handleGotImageUploadsPageMessage(model, message),
    }),
  )

const handleGotAuthPanelMessage = (
  model: Model,
  message: AuthPanel.Message,
): UpdateReturn => {
  const [authPanel, commands] = AuthPanel.update(model.authPanel, message)
  const mappedCommands = Command.mapMessages(commands, message =>
    GotAuthPanelMessage({ message }),
  )

  return [
    evo(model, {
      authPanel: () => authPanel,
      maybeError: () => Option.none(),
    }),
    mappedCommands,
  ]
}

const handleGotScheduledTodosPageMessage = (
  model: Model,
  message: ScheduledTodosPage.Message,
): UpdateReturn => {
  const [scheduledTodosPage, commands] = ScheduledTodosPage.update(
    model.scheduledTodosPage,
    message,
  )
  return [
    evo(model, { scheduledTodosPage: () => scheduledTodosPage }),
    Command.mapMessages(commands, message =>
      GotScheduledTodosPageMessage({ message }),
    ),
  ]
}

const handleGotImageUploadsPageMessage = (
  model: Model,
  message: ImageUploadsPage.Message,
): UpdateReturn => {
  const [imageUploadsPage, commands] = ImageUploadsPage.update(
    model.imageUploadsPage,
    message,
  )
  return [
    evo(model, { imageUploadsPage: () => imageUploadsPage }),
    Command.mapMessages(commands, message => GotImageUploadsPageMessage({ message })),
  ]
}

const handleGotTodosPageMessage = (
  model: Model,
  message: TodosPage.Message,
): UpdateReturn => {
  const [todosPage, commands, maybeOutMessage] = TodosPage.update(
    model.todosPage,
    message,
  )
  const mappedCommands = Command.mapMessages(commands, message =>
    GotTodosPageMessage({ message }),
  )
  const nextModel = evo(model, {
    todosPage: () => todosPage,
    maybeError: () => Option.none(),
  })

  return Option.match(maybeOutMessage, {
    onNone: () => [nextModel, mappedCommands],
    onSome: outMessage =>
      M.value(outMessage).pipe(
        withUpdateReturn,
        M.tagsExhaustive({
          RequestedSignOut: () => [
            evo(nextModel, { maybeError: () => Option.none() }),
            [...mappedCommands, SignOut()],
          ],
        }),
      ),
  })
}

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
      Effect.succeed(FailedSignOut({ error: error.message })),
    ),
  ),
)

// SUBSCRIPTION

export const subscriptions = Subscription.make<
  Model,
  Message,
  TodosBackend | AuthService | ScheduledTodosBackend
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
                    error: error.message,
                  }),
                ),
              ),
            ),
          ),
        ),
    },
  ),
  todos: entry(
    { route: AppRoute, isSignedIn: S.Boolean },
    {
      modelToDependencies: model => ({
        route: model.route,
        isSignedIn: model.authState._tag === 'AuthSignedIn',
      }),
      dependenciesToStream: ({ route, isSignedIn }) =>
        Stream.when(
          Stream.fromEffect(TodosBackend).pipe(
            Stream.flatMap(backend =>
              backend.todos.pipe(
                Stream.map(todos => route._tag === 'ImageUploads'
                  ? GotImageUploadsPageMessage({ message: ImageUploadsPage.LoadedTodos({ todos }) })
                  : GotTodosPageMessage({ message: TodosPage.LoadedTodos({ todos }) }),
                ),
                Stream.catch(error =>
                  Stream.succeed(
                    route._tag === 'ImageUploads'
                      ? GotImageUploadsPageMessage({ message: ImageUploadsPage.FailedLoadTodos({ error: error.message }) })
                      : GotTodosPageMessage({ message: TodosPage.FailedLoadTodos({ error: error.message }) }),
                  ),
                ),
              ),
            ),
          ),
          Effect.sync(() => isSignedIn && (route._tag === 'Todos' || route._tag === 'ImageUploads')),
        ),
    },
  ),
  scheduledTodos: entry(
    { isScheduledTodosRoute: S.Boolean },
    {
      modelToDependencies: model => ({
        isScheduledTodosRoute:
          model.route._tag === 'ScheduledTodos' &&
          model.authState._tag === 'AuthSignedIn',
      }),
      dependenciesToStream: ({ isScheduledTodosRoute }) =>
        Stream.when(
          Stream.fromEffect(ScheduledTodosBackend).pipe(
            Stream.flatMap(backend =>
              backend.scheduledTodos.pipe(
                Stream.map(scheduledTodos =>
                  GotScheduledTodosPageMessage({
                    message: ScheduledTodosPage.LoadedScheduledTodos({
                      scheduledTodos,
                    }),
                  }),
                ),
                Stream.catch(error =>
                  Stream.succeed(
                    GotScheduledTodosPageMessage({
                      message: ScheduledTodosPage.FailedLoadScheduledTodos({
                        error: error.message,
                      }),
                    }),
                  ),
                ),
              ),
            ),
          ),
          Effect.sync(() => isScheduledTodosRoute),
        ),
    },
  ),
}))

// VIEW

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

const rootErrorView = (model: Model): Html => {
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
      h.div([h.Class('mt-4')], [rootErrorView(model)]),
    ],
  )
}

const protectedTodosView = (model: Model): Html => {
  const h = html<Message>()

  return M.value(model.authState).pipe(
    M.tagsExhaustive({
      AuthChecking: () => checkingAuthView(model),
      AuthSignedOut: () =>
        h.submodel({
          slotId: 'auth-panel',
          model: model.authPanel,
          view: AuthPanel.view,
          toParentMessage: message => GotAuthPanelMessage({ message }),
        }),
      AuthSignedIn: () =>
        h.div(
          [],
          [
            rootErrorView(model),
            h.submodel({
              slotId: 'todos-page',
              model: model.todosPage,
              view: TodosPage.view,
              toParentMessage: message => GotTodosPageMessage({ message }),
            }),
          ],
        ),
    }),
  )
}

const protectedPageView = (model: Model): Html => {
  const h = html<Message>()

  return M.value(model.authState).pipe(
    M.tagsExhaustive({
      AuthChecking: () => checkingAuthView(model),
      AuthSignedOut: () =>
        h.submodel({
          slotId: 'auth-panel',
          model: model.authPanel,
          view: AuthPanel.view,
          toParentMessage: message => GotAuthPanelMessage({ message }),
        }),
      AuthSignedIn: () =>
        M.value(model.route).pipe(
          M.tagsExhaustive({
            Todos: () => protectedTodosView(model),
            ScheduledTodos: () =>
              h.submodel({
                slotId: 'scheduled-todos-page',
                model: model.scheduledTodosPage,
                view: ScheduledTodosPage.view,
                toParentMessage: message =>
                  GotScheduledTodosPageMessage({ message }),
              }),
            ImageUploads: () =>
              h.submodel({
                slotId: 'image-uploads-page',
                model: model.imageUploadsPage,
                view: ImageUploadsPage.view,
                toParentMessage: message => GotImageUploadsPageMessage({ message }),
              }),
            Home: () => h.empty,
            NotFound: () => h.empty,
          }),
        ),
    }),
  )
}

const authenticatedNavigationView = (): Html => {
  const h = html<Message>()
  return h.nav([h.Class('mx-auto mb-4 flex max-w-3xl gap-4 text-sm')], [
    h.a([h.Href(todosRouter({})), h.Class('text-blue-700 underline')], ['Todos']),
    h.a([h.Href(scheduledTodosRouter({})), h.Class('text-blue-700 underline')], ['Scheduled todos']),
    h.a([h.Href(imageUploadsRouter({})), h.Class('text-blue-700 underline')], ['Image uploads']),
  ])
}

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
          [authenticatedNavigationView(), protectedPageView(model)],
        ),
      ScheduledTodos: () =>
        h.main(
          [h.Class('min-h-screen bg-gray-100 py-8')],
          [authenticatedNavigationView(), protectedPageView(model)],
        ),
      ImageUploads: () =>
        h.main(
          [h.Class('min-h-screen bg-gray-100 py-8')],
          [authenticatedNavigationView(), protectedPageView(model)],
        ),
      NotFound: () => notFoundView(),
    }),
  )

  return { title: 'Todo', body }
}

// FLAG

export const flags: Effect.Effect<Flags> = Effect.succeed({})

export {
  ClickedSignInWithGitHub,
  FailedLoadAuthState as FailedAuthPanelLoadAuthState,
  FailedSignIn,
  SendMagicLink,
  SentMagicLink,
  SignInWithGitHub,
  SubmittedMagicLink,
  SucceededStartedGitHubSignIn,
  UpdatedMagicLinkEmail,
} from './authPanel'
export {
  AddedTodo,
  AttachedTodoImage,
  AttachTodoImage,
  ClickedDeleteTodo,
  ClickedDeleteScheduledTodo,
  CreateTodo,
  CreatedTodo,
  DeleteTodo,
  DeletedScheduledTodo,
  DeletedTodo,
  DeleteScheduledTodo,
  FailedAttachTodoImage,
  FailedCreateTodo,
  FailedDeleteScheduledTodo,
  FailedDeleteTodo,
  FailedLoadScheduledTodos,
  FailedLoadTodos,
  GotScheduledTodoFormMessage,
  LoadedScheduledTodos,
  LoadedTodos,
  SelectedTodoImage,
  UpdatedNewTodo,
} from './todosPage'
