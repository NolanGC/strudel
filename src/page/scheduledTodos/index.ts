import { Array, Effect, Match as M, Option, Schema as S } from 'effect'
import { Command, Submodel } from 'foldkit'
import { Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import { ErrorMessage } from '../../errorMessage'
import {
  ScheduledTodo,
  ScheduledTodoId,
  ScheduledTodosBackend,
} from '../../scheduledTodosBackend'
import * as ScheduledTodoForm from '../../scheduledTodoForm'

const LoadState = S.Literals(['Loading', 'Loaded', 'Failed'])

export const Model = S.Struct({
  scheduledTodos: S.Array(ScheduledTodo),
  loadState: LoadState,
  maybeError: S.Option(ErrorMessage),
  form: ScheduledTodoForm.Model,
})
export type Model = typeof Model.Type

export const init = (): Model => ({
  scheduledTodos: [],
  loadState: 'Loading',
  maybeError: Option.none(),
  form: ScheduledTodoForm.init(),
})

export const LoadedScheduledTodos = m('LoadedScheduledTodos', {
  scheduledTodos: S.Array(ScheduledTodo),
})
export const FailedLoadScheduledTodos = m('FailedLoadScheduledTodos', {
  error: ErrorMessage,
})
export const ClickedDeleteScheduledTodo = m('ClickedDeleteScheduledTodo', {
  id: ScheduledTodoId,
})
export const DeletedScheduledTodo = m('DeletedScheduledTodo')
export const FailedDeleteScheduledTodo = m('FailedDeleteScheduledTodo', {
  error: ErrorMessage,
})
export const GotFormMessage = m('GotFormMessage', {
  message: ScheduledTodoForm.Message,
})

export const Message = S.Union([
  LoadedScheduledTodos,
  FailedLoadScheduledTodos,
  ClickedDeleteScheduledTodo,
  DeletedScheduledTodo,
  FailedDeleteScheduledTodo,
  GotFormMessage,
])
export type Message = typeof Message.Type

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, ScheduledTodosBackend>>,
]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      LoadedScheduledTodos: ({ scheduledTodos }) => [
        evo(model, {
          scheduledTodos: () => scheduledTodos,
          loadState: () => 'Loaded',
          maybeError: () => Option.none(),
        }),
        [],
      ],
      FailedLoadScheduledTodos: ({ error }) => [
        evo(model, { loadState: () => 'Failed', maybeError: () => Option.some(error) }),
        [],
      ],
      ClickedDeleteScheduledTodo: ({ id }) => [
        evo(model, { maybeError: () => Option.none() }),
        [DeleteScheduledTodo({ id })],
      ],
      DeletedScheduledTodo: () => [model, []],
      FailedDeleteScheduledTodo: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
      ],
      GotFormMessage: ({ message }) => {
        const [form, commands] = ScheduledTodoForm.update(model.form, message)
        return [
          evo(model, { form: () => form, maybeError: () => Option.none() }),
          Command.mapMessages(commands, message => GotFormMessage({ message })),
        ]
      },
    }),
  )

const DeleteScheduledTodo = Command.define(
  'DeleteScheduledTodo',
  { id: ScheduledTodoId },
  DeletedScheduledTodo,
  FailedDeleteScheduledTodo,
)(({ id }) =>
  Effect.gen(function* () {
    const backend = yield* ScheduledTodosBackend
    yield* backend.delete(id)
    return DeletedScheduledTodo()
  }).pipe(Effect.catch(error => Effect.succeed(FailedDeleteScheduledTodo({ error: error.message })))),
)

const errorView = (maybeError: Option.Option<ErrorMessage>): Html => {
  const h = html<Message>()
  return Option.match(maybeError, {
    onNone: () => h.empty,
    onSome: error => h.div([h.Role('alert'), h.Class('rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700')], [error]),
  })
}

export const view = Submodel.defineView<Model, Message>(model => {
  const h = html<Message>()
  return h.section([h.Class('mx-auto max-w-md rounded-xl bg-white p-6 shadow-lg')], [
    h.h1([h.Class('text-3xl font-bold text-gray-800')], ['Scheduled todos']),
    h.p([h.Class('mt-1 text-sm text-gray-500')], ['Create and manage cron-based todos.']),
    h.submodel({ slotId: 'scheduled-todo-form', model: model.form, view: ScheduledTodoForm.view, toParentMessage: message => GotFormMessage({ message }) }),
    errorView(model.maybeError),
    Array.match(model.scheduledTodos, {
      onEmpty: () => h.div([h.Class('mt-4 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500')], ['No scheduled todos yet.']),
      onNonEmpty: todos => h.ul([h.Class('mt-4 space-y-2')], Array.map(todos, todo => h.keyed('li')(todo._id, [h.Class('rounded-lg border border-gray-200 px-4 py-3')], [
        h.div([h.Class('flex items-start justify-between gap-3')], [
          h.div([], [h.div([h.Class('font-medium')], [todo.text]), h.div([h.Class('text-sm text-gray-500')], [todo.cron])]),
          h.button([h.Type('button'), h.AriaLabel(`Delete scheduled ${todo.text}`), h.Class('rounded border border-red-200 px-2 py-1 text-sm text-red-700'), h.OnClick(ClickedDeleteScheduledTodo({ id: todo._id }))], ['Delete']),
        ]),
      ]))),
    }),
  ])
})
