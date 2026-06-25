import { Array, Effect, Match as M, Option, Schema as S, String } from 'effect'
import { Command, Submodel } from 'foldkit'
import { File as FoldkitFile } from 'foldkit'
import { Html, html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import { AuthService } from './authService'
import { TodoText } from '../confect/domain'
import { ErrorMessage, errorMessage } from './errorMessage'
import {
  ScheduledTodo,
  ScheduledTodoId,
  ScheduledTodosBackend,
} from './scheduledTodosBackend'
import * as ScheduledTodoForm from './scheduledTodoForm'
import { Todo, TodoId, TodosBackend } from './todosBackend'

// MODEL

const LoadState = S.Literals(['Loading', 'Loaded', 'Failed'])
type LoadState = typeof LoadState.Type

export const Model = S.Struct({
  todos: S.Array(Todo),
  newTodoText: S.String,
  loadState: LoadState,
  maybeError: S.Option(ErrorMessage),
  scheduledTodoForm: ScheduledTodoForm.Model,
  scheduledTodos: S.Array(ScheduledTodo),
  scheduledTodosLoadState: LoadState,
})
export type Model = typeof Model.Type

export const init = (): Model =>
  ({
    todos: [],
    newTodoText: '',
    loadState: 'Loading',
    maybeError: Option.none(),
    scheduledTodoForm: ScheduledTodoForm.init(),
    scheduledTodos: [],
    scheduledTodosLoadState: 'Loading',
  })

// MESSAGE

export const UpdatedNewTodo = m('UpdatedNewTodo', { text: S.String })
export const AddedTodo = m('AddedTodo')
export const CreatedTodo = m('CreatedTodo')
export const FailedCreateTodo = m('FailedCreateTodo', { error: ErrorMessage })
export const ClickedDeleteTodo = m('ClickedDeleteTodo', { id: TodoId })
export const DeletedTodo = m('DeletedTodo')
export const FailedDeleteTodo = m('FailedDeleteTodo', { error: ErrorMessage })
export const SelectedTodoImage = m('SelectedTodoImage', {
  id: TodoId,
  files: S.Array(FoldkitFile.File),
})
export const AttachedTodoImage = m('AttachedTodoImage')
export const FailedAttachTodoImage = m('FailedAttachTodoImage', {
  error: ErrorMessage,
})
export const LoadedTodos = m('LoadedTodos', { todos: S.Array(Todo) })
export const FailedLoadTodos = m('FailedLoadTodos', { error: ErrorMessage })
export const LoadedScheduledTodos = m('LoadedScheduledTodos', {
  scheduledTodos: S.Array(ScheduledTodo),
})
export const FailedLoadScheduledTodos = m('FailedLoadScheduledTodos', {
  error: ErrorMessage,
})
export const ClickedSignOut = m('ClickedSignOut')
export const ClickedDeleteScheduledTodo = m('ClickedDeleteScheduledTodo', {
  id: ScheduledTodoId,
})
export const DeletedScheduledTodo = m('DeletedScheduledTodo')
export const FailedDeleteScheduledTodo = m('FailedDeleteScheduledTodo', {
  error: ErrorMessage,
})
export const GotScheduledTodoFormMessage = m('GotScheduledTodoFormMessage', {
  message: ScheduledTodoForm.Message,
})

export const Message = S.Union([
  UpdatedNewTodo,
  AddedTodo,
  CreatedTodo,
  FailedCreateTodo,
  ClickedDeleteTodo,
  DeletedTodo,
  FailedDeleteTodo,
  SelectedTodoImage,
  AttachedTodoImage,
  FailedAttachTodoImage,
  LoadedTodos,
  FailedLoadTodos,
  LoadedScheduledTodos,
  FailedLoadScheduledTodos,
  ClickedSignOut,
  ClickedDeleteScheduledTodo,
  DeletedScheduledTodo,
  FailedDeleteScheduledTodo,
  GotScheduledTodoFormMessage,
])
export type Message = typeof Message.Type

// OUT MESSAGE

export const RequestedSignOut = m('RequestedSignOut')
export const OutMessage = S.Union([RequestedSignOut])
export type OutMessage = typeof OutMessage.Type

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
  Option.Option<OutMessage>,
]
const withUpdateReturn = M.withReturnType<UpdateReturn>()

export const update = (model: Model, message: Message): UpdateReturn =>
  M.value(message).pipe(
    withUpdateReturn,
    M.tagsExhaustive({
      UpdatedNewTodo: ({ text }) => [
        evo(model, { newTodoText: () => text }),
        [],
        Option.none(),
      ],

      AddedTodo: () => {
        const text = String.trim(model.newTodoText)

        if (String.isEmpty(text)) {
          return [model, [], Option.none()]
        }

        const todoText = TodoText.make(text)

        return [
          evo(model, {
            newTodoText: () => '',
            maybeError: () => Option.none(),
          }),
          [CreateTodo({ text: todoText })],
          Option.none(),
        ]
      },

      CreatedTodo: () => [model, [], Option.none()],

      FailedCreateTodo: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
        Option.none(),
      ],

      ClickedDeleteTodo: ({ id }) => [
        evo(model, { maybeError: () => Option.none() }),
        [DeleteTodo({ id })],
        Option.none(),
      ],

      DeletedTodo: () => [model, [], Option.none()],

      FailedDeleteTodo: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
        Option.none(),
      ],

      SelectedTodoImage: ({ id, files }) =>
        Option.match(Array.head(files), {
          onNone: () => [model, [], Option.none()],
          onSome: file =>
            FoldkitFile.mimeType(file).startsWith('image/')
              ? [
                  evo(model, { maybeError: () => Option.none() }),
                  [AttachTodoImage({ id, file })],
                  Option.none(),
                ]
              : [
                  evo(model, {
                    maybeError: () =>
                      Option.some(
                        errorMessage(
                          'Choose a PNG, JPEG, GIF, or WebP image.',
                        ),
                      ),
                  }),
                  [],
                  Option.none(),
                ],
        }),

      AttachedTodoImage: () => [model, [], Option.none()],

      FailedAttachTodoImage: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
        Option.none(),
      ],

      LoadedTodos: ({ todos }) => [
        evo(model, {
          todos: () => todos,
          loadState: () => 'Loaded',
          maybeError: () => Option.none(),
        }),
        [],
        Option.none(),
      ],

      FailedLoadTodos: ({ error }) => [
        evo(model, {
          loadState: () => 'Failed',
          maybeError: () => Option.some(error),
        }),
        [],
        Option.none(),
      ],

      LoadedScheduledTodos: ({ scheduledTodos }) => [
        evo(model, {
          scheduledTodos: () => scheduledTodos,
          scheduledTodosLoadState: () => 'Loaded',
          maybeError: () => Option.none(),
        }),
        [],
        Option.none(),
      ],

      FailedLoadScheduledTodos: ({ error }) => [
        evo(model, {
          scheduledTodosLoadState: () => 'Failed',
          maybeError: () => Option.some(error),
        }),
        [],
        Option.none(),
      ],

      ClickedSignOut: () => [model, [], Option.some(RequestedSignOut())],

      ClickedDeleteScheduledTodo: ({ id }) => [
        evo(model, { maybeError: () => Option.none() }),
        [DeleteScheduledTodo({ id })],
        Option.none(),
      ],

      DeletedScheduledTodo: () => [model, [], Option.none()],

      FailedDeleteScheduledTodo: ({ error }) => [
        evo(model, { maybeError: () => Option.some(error) }),
        [],
        Option.none(),
      ],

      GotScheduledTodoFormMessage: ({ message }) =>
        handleGotScheduledTodoFormMessage(model, message),
    }),
  )

const handleGotScheduledTodoFormMessage = (
  model: Model,
  message: ScheduledTodoForm.Message,
): UpdateReturn => {
  const [scheduledTodoForm, commands] = ScheduledTodoForm.update(
    model.scheduledTodoForm,
    message,
  )
  const mappedCommands = Command.mapMessages(commands, message =>
    GotScheduledTodoFormMessage({ message }),
  )

  return [
    evo(model, {
      scheduledTodoForm: () => scheduledTodoForm,
      maybeError: () => Option.none(),
    }),
    mappedCommands,
    Option.none(),
  ]
}

// COMMAND

export const CreateTodo = Command.define(
  'CreateTodo',
  { text: TodoText },
  CreatedTodo,
  FailedCreateTodo,
)(({ text }) =>
  Effect.gen(function* () {
    const backend = yield* TodosBackend
    yield* backend.create(text)
    return CreatedTodo()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedCreateTodo({ error: error.message })),
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
      Effect.succeed(FailedDeleteTodo({ error: error.message })),
    ),
  ),
)

export const AttachTodoImage = Command.define(
  'AttachTodoImage',
  { id: TodoId, file: FoldkitFile.File },
  AttachedTodoImage,
  FailedAttachTodoImage,
)(({ id, file }) =>
  Effect.gen(function* () {
    const backend = yield* TodosBackend
    yield* backend.uploadImage(id, file)
    return AttachedTodoImage()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedAttachTodoImage({ error: error.message })),
    ),
  ),
)

export const DeleteScheduledTodo = Command.define(
  'DeleteScheduledTodo',
  { id: ScheduledTodoId },
  DeletedScheduledTodo,
  FailedDeleteScheduledTodo,
)(({ id }) =>
  Effect.gen(function* () {
    const backend = yield* ScheduledTodosBackend
    yield* backend.delete(id)
    return DeletedScheduledTodo()
  }).pipe(
    Effect.catch(error =>
      Effect.succeed(FailedDeleteScheduledTodo({ error: error.message })),
    ),
  ),
)

// VIEW

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

const statusText = (model: Model): string =>
  M.value(model.loadState).pipe(
    M.when('Loading', () => 'Loading todos from Convex...'),
    M.when('Loaded', () => `${Array.length(model.todos)} todos`),
    M.when('Failed', () => 'Could not load todos'),
    M.exhaustive,
  )

const todoItemView = (todo: Todo): Html => {
  const h = html<Message>()
  const imagePreview = Option.match(todo.maybeImageUrl, {
    onNone: () => h.empty,
    onSome: imageUrl =>
      h.img([
        h.Src(imageUrl),
        h.Alt(`Image preview for ${todo.text}`),
        h.Class('h-12 w-12 rounded object-cover ring-1 ring-gray-200'),
      ]),
  })

  return h.keyed('li')(
    todo._id,
    [h.Class('rounded-lg border border-gray-200 bg-white px-4 py-3')],
    [
      h.div(
        [h.Class('flex items-center justify-between gap-3')],
        [
          h.div(
            [h.Class('flex min-w-0 flex-1 items-center gap-3')],
            [
              imagePreview,
              h.div([h.Class('min-w-0 flex-1 text-gray-900')], [todo.text]),
            ],
          ),
          h.div(
            [h.Class('flex shrink-0 items-center gap-2')],
            [
              h.label(
                [
                  h.Class(
                    'cursor-pointer rounded border border-gray-200 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50 focus-within:ring-2 focus-within:ring-blue-500',
                  ),
                ],
                [
                  'Image',
                  h.input([
                    h.Type('file'),
                    h.Accept('image/*'),
                    h.AriaLabel(`Attach image to ${todo.text}`),
                    h.Class('sr-only'),
                    h.OnFileChange(files =>
                      SelectedTodoImage({ id: todo._id, files }),
                    ),
                  ]),
                ],
              ),
              h.button(
                [
                  h.Type('button'),
                  h.AriaLabel(`Delete ${todo.text}`),
                  h.Class(
                    'rounded border border-red-200 px-2 py-1 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500',
                  ),
                  h.OnClick(ClickedDeleteTodo({ id: todo._id })),
                ],
                ['Delete'],
              ),
            ],
          ),
        ],
      ),
    ],
  )
}

const scheduledTodoItemView = (scheduledTodo: ScheduledTodo): Html => {
  const h = html<Message>()

  return h.keyed('li')(
    scheduledTodo._id,
    [h.Class('rounded-lg border border-gray-200 bg-white px-4 py-3')],
    [
      h.div(
        [h.Class('flex items-start justify-between gap-3')],
        [
          h.div(
            [h.Class('min-w-0 flex-1')],
            [
              h.div([h.Class('font-medium text-gray-900')], [
                scheduledTodo.text,
              ]),
              h.div([h.Class('mt-1 text-sm text-gray-500')], [
                scheduledTodo.cron,
              ]),
            ],
          ),
          h.button(
            [
              h.Type('button'),
              h.AriaLabel(`Delete scheduled ${scheduledTodo.text}`),
              h.Class(
                'shrink-0 rounded border border-red-200 px-2 py-1 text-sm text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500',
              ),
              h.OnClick(ClickedDeleteScheduledTodo({ id: scheduledTodo._id })),
            ],
            ['Delete'],
          ),
        ],
      ),
    ],
  )
}

const scheduledTodosListView = (model: Model): Html => {
  const h = html<Message>()

  return Array.match(model.scheduledTodos, {
    onEmpty: () =>
      h.div(
        [h.Class('mt-3 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500')],
        ['No scheduled todos yet.'],
      ),
    onNonEmpty: scheduledTodos =>
      h.ul(
        [h.Class('mt-3 space-y-2')],
        Array.map(scheduledTodos, scheduledTodoItemView),
      ),
  })
}

export const view = Submodel.defineView<Model, Message>((model): Html => {
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

      h.submodel({
        slotId: 'scheduled-todo-form',
        model: model.scheduledTodoForm,
        view: ScheduledTodoForm.view,
        toParentMessage: message => GotScheduledTodoFormMessage({ message }),
      }),

      scheduledTodosListView(model),
    ],
  )
})
