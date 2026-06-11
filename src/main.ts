import { Array, Effect, Match as M, Option, Schema as S, Stream, String } from 'effect'
import { Command, Runtime, Subscription } from 'foldkit'
import { Document, Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import { ConvexTodos } from './convexTodos'

// MODEL

const Todo = S.Struct({
  id: S.String,
  text: S.String,
  createdAt: S.Number,
})
type Todo = typeof Todo.Type

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
export const LoadedTodos = m('LoadedTodos', { todos: S.Array(Todo) })
export const FailedLoadTodos = m('FailedLoadTodos', { error: S.String })

export const Message = S.Union([
  UpdatedNewTodo,
  AddedTodo,
  CreatedTodo,
  FailedCreateTodo,
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
  ReadonlyArray<Command.Command<Message, never, ConvexTodos>>,
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
    const todos = yield* ConvexTodos
    yield* todos.create(text)
    return CreatedTodo()
  }).pipe(
    Effect.catch(error => Effect.succeed(FailedCreateTodo({ error }))),
  ),
)

// SUBSCRIPTION

export const subscriptions = Subscription.make<
  Model,
  Message,
  ConvexTodos
>()(entry => ({
  todos: entry(
    {},
    {
      modelToDependencies: () => ({}),
      dependenciesToStream: () =>
        Stream.fromEffect(ConvexTodos).pipe(
          Stream.flatMap(todos => todos.subscribe),
          Stream.map(event =>
            M.value(event).pipe(
              M.tagsExhaustive({
                LoadedTodos: ({ todos }) =>
                  LoadedTodos({ todos: Array.map(todos, todo => todo) }),
                FailedLoadTodos: ({ error }) => FailedLoadTodos({ error }),
              }),
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
    todo.id,
    [h.Class('rounded-lg border border-gray-200 bg-white px-4 py-3')],
    [h.div([h.Class('text-gray-900')], [todo.text])],
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
