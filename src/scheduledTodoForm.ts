import { Effect, Match as M, Option, Schema as S, String } from 'effect'
import { Command, Submodel } from 'foldkit'
import { Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import { ErrorMessage, errorMessage } from './errorMessage'
import { CronExpression, TodoText } from '../confect/domain'
import {
  ScheduledTodoId,
  ScheduledTodosBackend,
} from './scheduledTodosBackend'

// MODEL

const PendingSubmission = S.Struct({
  text: TodoText,
  cron: CronExpression,
})
type PendingSubmission = typeof PendingSubmission.Type

export const Model = S.Struct({
  text: S.String,
  cron: S.String,
  maybeNotice: S.Option(S.String),
  maybeError: S.Option(ErrorMessage),
  maybePendingSubmission: S.Option(PendingSubmission),
})
export type Model = typeof Model.Type

export const init = (): Model => ({
  text: '',
  cron: '',
  maybeNotice: Option.none(),
  maybeError: Option.none(),
  maybePendingSubmission: Option.none(),
})

// MESSAGE

export const UpdatedScheduledTodoText = m('UpdatedScheduledTodoText', {
  text: S.String,
})
export const UpdatedScheduledTodoCron = m('UpdatedScheduledTodoCron', {
  cron: S.String,
})
export const SubmittedScheduledTodo = m('SubmittedScheduledTodo')
export const CreatedScheduledTodo = m('CreatedScheduledTodo', {
  id: ScheduledTodoId,
})
export const FailedCreateScheduledTodo = m('FailedCreateScheduledTodo', {
  error: ErrorMessage,
})

export const Message = S.Union([
  UpdatedScheduledTodoText,
  UpdatedScheduledTodoCron,
  SubmittedScheduledTodo,
  CreatedScheduledTodo,
  FailedCreateScheduledTodo,
])
export type Message = typeof Message.Type

// UPDATE

type UpdateReturn = readonly [
  Model,
  ReadonlyArray<Command.Command<Message, never, ScheduledTodosBackend>>,
]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      UpdatedScheduledTodoText: ({ text }) => [
        evo(model, {
          text: () => text,
          maybeNotice: () => Option.none(),
          maybeError: () => Option.none(),
        }),
        [],
      ],

      UpdatedScheduledTodoCron: ({ cron }) => [
        evo(model, {
          cron: () => cron,
          maybeNotice: () => Option.none(),
          maybeError: () => Option.none(),
        }),
        [],
      ],

      SubmittedScheduledTodo: () => {
        const text = String.trim(model.text)
        const cron = String.trim(model.cron)

        if (String.isEmpty(text)) {
          return [
            evo(model, {
              maybeNotice: () => Option.none(),
              maybeError: () =>
                Option.some(errorMessage('Enter a todo to schedule.')),
            }),
            [],
          ]
        }

        if (String.isEmpty(cron)) {
          return [
            evo(model, {
              maybeNotice: () => Option.none(),
              maybeError: () =>
                Option.some(errorMessage('Enter a cron schedule.')),
            }),
            [],
          ]
        }

        const todoText = TodoText.make(text)
        const cronExpression = CronExpression.make(cron)

        return [
          evo(model, {
            text: () => '',
            cron: () => '',
            maybeNotice: () => Option.none(),
            maybeError: () => Option.none(),
            maybePendingSubmission: () =>
              Option.some({ text: todoText, cron: cronExpression }),
          }),
          [CreateScheduledTodo({ text: todoText, cron: cronExpression })],
        ]
      },

      CreatedScheduledTodo: () =>
        Option.match(model.maybePendingSubmission, {
          onNone: () => [
            evo(model, {
              maybeNotice: () => Option.some('Scheduled todo.'),
              maybeError: () => Option.none(),
            }),
            [],
          ],
          onSome: pendingSubmission => [
            evo(model, {
              maybeNotice: () =>
                Option.some(`Scheduled "${pendingSubmission.text}".`),
              maybeError: () => Option.none(),
              maybePendingSubmission: () => Option.none(),
            }),
            [],
          ],
        }),

      FailedCreateScheduledTodo: ({ error }) =>
        Option.match(model.maybePendingSubmission, {
          onNone: () => [
            evo(model, {
              maybeNotice: () => Option.none(),
              maybeError: () => Option.some(error),
            }),
            [],
          ],
          onSome: pendingSubmission => [
            evo(model, {
              text: () => pendingSubmission.text,
              cron: () => pendingSubmission.cron,
              maybeNotice: () => Option.none(),
              maybeError: () => Option.some(error),
              maybePendingSubmission: () => Option.none(),
            }),
            [],
          ],
        }),
    }),
  )

// COMMAND

export const CreateScheduledTodo = Command.define(
  'CreateScheduledTodo',
  { text: TodoText, cron: CronExpression },
  CreatedScheduledTodo,
  FailedCreateScheduledTodo,
)(({ text, cron }) =>
  Effect.gen(function* () {
    const backend = yield* ScheduledTodosBackend
    const id = yield* backend.create({ text, cron })
    return CreatedScheduledTodo({ id })
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedCreateScheduledTodo({ error: error.message })),
    ),
  ),
)

// VIEW

const maybeNoticeView = (model: Model): Html => {
  const h = html<Message>()

  return Option.match(model.maybeNotice, {
    onNone: () => h.empty,
    onSome: notice =>
      h.div(
        [
          h.Role('status'),
          h.Class(
            'rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700',
          ),
        ],
        [notice],
      ),
  })
}

const maybeErrorView = (model: Model): Html => {
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

  return h.section(
    [h.Class('mt-6 border-t border-gray-200 pt-5')],
    [
      h.h2([h.Class('text-lg font-semibold text-gray-800')], [
        'Scheduled todos',
      ]),
      h.form(
        [h.Class('mt-3 space-y-3'), h.OnSubmit(SubmittedScheduledTodo())],
        [
          h.div(
            [h.Class('space-y-1')],
            [
              h.label(
                [h.For('scheduled-todo-text'), h.Class('text-sm text-gray-700')],
                ['Scheduled todo'],
              ),
              h.input([
                h.Id('scheduled-todo-text'),
                h.Value(model.text),
                h.Placeholder('gym'),
                h.Class(
                  'w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500',
                ),
                h.OnInput(text => UpdatedScheduledTodoText({ text })),
              ]),
            ],
          ),
          h.div(
            [h.Class('space-y-1')],
            [
              h.label(
                [h.For('scheduled-todo-cron'), h.Class('text-sm text-gray-700')],
                ['Cron schedule'],
              ),
              h.input([
                h.Id('scheduled-todo-cron'),
                h.Value(model.cron),
                h.Placeholder('0 7 * * *'),
                h.Class(
                  'w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500',
                ),
                h.OnInput(cron => UpdatedScheduledTodoCron({ cron })),
              ]),
            ],
          ),
          h.button(
            [
              h.Type('submit'),
              h.Class(
                'w-full rounded-lg bg-gray-900 px-5 py-2 text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-700',
              ),
            ],
            ['Schedule todo'],
          ),
        ],
      ),
      h.div([h.Class('mt-3 space-y-2')], [
        maybeNoticeView(model),
        maybeErrorView(model),
      ]),
    ],
  )
})
