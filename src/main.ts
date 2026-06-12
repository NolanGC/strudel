import { Array, Effect, Match as M, Option, Queue, Schema as S, Stream, String } from 'effect'
import { Command, Runtime, Subscription } from 'foldkit'
import { Document, Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import todosTable from '../confect/_generated/tables/todos'
import { api } from '../convex/_generated/api'
import { confectTableFieldsToFoldkitDocSchema } from './confectSchemaCompat'
import { ConvexClient } from './convexClient'

// MODEL

const Todo = confectTableFieldsToFoldkitDocSchema(
  todosTable.tableName,
  todosTable.Fields,
)
type Todo = typeof Todo.Type

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : globalThis.String(error)

const LoadState = S.Literals(['Loading', 'Loaded', 'Failed'])
type LoadState = typeof LoadState.Type

export const Model = S.Struct({
  todos: S.Array(Todo),
  newTodoText: S.String,
  loadState: LoadState,
  maybeError: S.Option(S.String),
})
export type Model = typeof Model.Type

// MESSAGE

export const UpdatedNewTodo = m('UpdatedNewTodo', { text: S.String })
export const AddedTodo = m('AddedTodo')
export const CreatedTodo = m('CreatedTodo')
export const FailedCreateTodo = m('FailedCreateTodo', { error: S.String })
export const ClickedDeleteTodo = m('ClickedDeleteTodo', { id: S.String })
export const DeletedTodo = m('DeletedTodo')
export const FailedDeleteTodo = m('FailedDeleteTodo', { error: S.String })
export const LoadedTodos = m('LoadedTodos', { todos: S.Array(Todo) })
export const FailedLoadTodos = m('FailedLoadTodos', { error: S.String })

export const Message = S.Union([
  UpdatedNewTodo,
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

export const init: Runtime.ProgramInit<Model, Message, Flags> = () => [
  {
    todos: [],
    newTodoText: '',
    loadState: 'Loading',
    maybeError: Option.none(),
  },
  [],
]

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, ConvexClient>>,
]

const withUpdateReturn = M.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      UpdatedNewTodo: ({ text }) => [
        evo(model, { newTodoText: () => text }),
        [],
      ],

      AddedTodo: () => {
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
        [DeleteTodo({ id })],
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

export const CreateTodo = Command.define(
  'CreateTodo',
  { text: S.String },
  CreatedTodo,
  FailedCreateTodo,
)(({ text }) =>
  Effect.gen(function* () {
    const convex = yield* ConvexClient
    yield* Effect.tryPromise({
      try: () => convex.mutation(api.todos.create, { text }),
      catch: errorMessage,
    })
    return CreatedTodo()
  }).pipe(
    Effect.catch(error => Effect.succeed(FailedCreateTodo({ error }))),
  ),
)

export const DeleteTodo = Command.define(
  'DeleteTodo',
  { id: S.String },
  DeletedTodo,
  FailedDeleteTodo,
)(({ id }) =>
  Effect.gen(function* () {
    const convex = yield* ConvexClient
    yield* Effect.tryPromise({
      try: () => convex.mutation(api.todos.deleteTodo, { id }),
      catch: errorMessage,
    })
    return DeletedTodo()
  }).pipe(
    Effect.catch(error => Effect.succeed(FailedDeleteTodo({ error }))),
  ),
)

// SUBSCRIPTION

export const subscriptions = Subscription.make<
  Model,
  Message,
  ConvexClient
>()(entry => ({
  todos: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Stream.fromEffect(ConvexClient).pipe(
          Stream.flatMap(convex =>
            Stream.callback<Message>(queue =>
              Effect.acquireRelease(
                Effect.sync(() =>
                  convex.onUpdate(
                    api.todos.list,
                    {},
                    todos => {
                      void Effect.runPromise(
                        Queue.offer(
                          queue,
                          LoadedTodos({
                            // Confect validates api.todos.list against
                            // Schema.Array(todosTable.Doc) on the backend.
                            // Convex's frontend FunctionReturnType currently
                            // resolves to unknown for Confect registered
                            // functions, so this cast bridges that type gap.
                            todos: todos as ReadonlyArray<Todo>,
                          }),
                        ).pipe(Effect.catch(() => Effect.void)),
                      )
                    },
                    error => {
                      void Effect.runPromise(
                        Queue.offer(
                          queue,
                          FailedLoadTodos({ error: errorMessage(error) }),
                        ).pipe(Effect.catch(() => Effect.void)),
                      )
                    },
                  ),
                ),
                unsubscribe => Effect.sync(() => unsubscribe()),
              ),
            ),
          ),
        ),
    },
  ),
}))

// VIEW

const errorView = (model: Model): Html => {
  const h = html<Message>()

  return Option.match(model.maybeError, {
    onNone: () => h.empty,
    onSome: error =>
      h.div(
        [h.Class('rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700')],
        [error],
      ),
  })
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

export const view = (model: Model): Document => {
  const h = html<Message>()

  const body = h.div(
    [h.Class('min-h-screen bg-gray-100 py-8')],
    [
      h.div(
        [h.Class('mx-auto max-w-md rounded-xl bg-white p-6 shadow-lg')],
        [
          h.h1(
            [h.Class('mb-2 text-center text-3xl font-bold text-gray-800')],
            ['Todo App'],
          ),
          h.div(
            [h.Class('mb-6 text-center text-sm text-gray-500'), h.Role('status')],
            [statusText(model)],
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
              h.ul(
                [h.Class('mt-4 space-y-2')],
                Array.map(todos, todoItemView),
              ),
          }),
        ],
      ),
    ],
  )

  return { title: `Todos (${Array.length(model.todos)})`, body }
}

// FLAG

export const flags: Effect.Effect<Flags> = Effect.succeed({})
