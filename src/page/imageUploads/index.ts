import { Array, Effect, Match as M, Option, Schema as S } from 'effect'
import { Command, File as FoldkitFile, Submodel } from 'foldkit'
import { html } from 'foldkit/html'
import { m } from 'foldkit/message'
import { evo } from 'foldkit/struct'

import { ErrorMessage, errorMessage } from '../../errorMessage'
import { Todo, TodoId, TodosBackend } from '../../todosBackend'

const LoadState = S.Literals(['Loading', 'Loaded', 'Failed'])
export const Model = S.Struct({ todos: S.Array(Todo), loadState: LoadState, maybeError: S.Option(ErrorMessage) })
export type Model = typeof Model.Type
export const init = (): Model => ({ todos: [], loadState: 'Loading', maybeError: Option.none() })

export const LoadedTodos = m('LoadedTodos', { todos: S.Array(Todo) })
export const FailedLoadTodos = m('FailedLoadTodos', { error: ErrorMessage })
export const SelectedTodoImage = m('SelectedTodoImage', { id: TodoId, files: S.Array(FoldkitFile.File) })
export const AttachedTodoImage = m('AttachedTodoImage')
export const FailedAttachTodoImage = m('FailedAttachTodoImage', { error: ErrorMessage })
export const Message = S.Union([LoadedTodos, FailedLoadTodos, SelectedTodoImage, AttachedTodoImage, FailedAttachTodoImage])
export type Message = typeof Message.Type

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message, never, TodosBackend>>]
const withUpdateReturn = M.withReturnType<UpdateReturn>()
export const update = (model: Model, message: Message): UpdateReturn => M.value(message).pipe(withUpdateReturn, M.tagsExhaustive({
  LoadedTodos: ({ todos }) => [evo(model, { todos: () => todos, loadState: () => 'Loaded', maybeError: () => Option.none() }), []],
  FailedLoadTodos: ({ error }) => [evo(model, { loadState: () => 'Failed', maybeError: () => Option.some(error) }), []],
  SelectedTodoImage: ({ id, files }) => Option.match(Array.head(files), {
    onNone: () => [model, []],
    onSome: file => FoldkitFile.mimeType(file).startsWith('image/')
      ? [evo(model, { maybeError: () => Option.none() }), [AttachTodoImage({ id, file })]]
      : [evo(model, { maybeError: () => Option.some(errorMessage('Choose a PNG, JPEG, GIF, or WebP image.')) }), []],
  }),
  AttachedTodoImage: () => [model, []],
  FailedAttachTodoImage: ({ error }) => [evo(model, { maybeError: () => Option.some(error) }), []],
}))

const AttachTodoImage = Command.define('AttachTodoImage', { id: TodoId, file: FoldkitFile.File }, AttachedTodoImage, FailedAttachTodoImage)(({ id, file }) => Effect.gen(function* () {
  const backend = yield* TodosBackend
  yield* backend.uploadImage(id, file)
  return AttachedTodoImage()
}).pipe(Effect.catch(error => Effect.succeed(FailedAttachTodoImage({ error: error.message })))))

export const view = Submodel.defineView<Model, Message>(model => {
  const h = html<Message>()
  const withImages = Array.filter(model.todos, todo => Option.isSome(todo.maybeImageUrl))
  return h.section([h.Class('mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-lg')], [
    h.h1([h.Class('text-3xl font-bold text-gray-800')], ['Image uploads']),
    h.p([h.Class('mt-1 text-sm text-gray-500')], ['Attach images to todos and review every uploaded image.']),
    Option.match(model.maybeError, { onNone: () => h.empty, onSome: error => h.div([h.Role('alert'), h.Class('mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700')], [error]) }),
    h.div([h.Class('mt-5 grid gap-4 sm:grid-cols-2')], Array.map(model.todos, todo => h.keyed('article')(todo._id, [h.Class('rounded-lg border border-gray-200 p-4')], [
      h.div([h.Class('font-medium text-gray-900')], [todo.text]),
      Option.match(todo.maybeImageUrl, { onNone: () => h.div([h.Class('mt-3 text-sm text-gray-500')], ['No image uploaded.']), onSome: url => h.img([h.Src(url), h.Alt(`Image preview for ${todo.text}`), h.Class('mt-3 h-40 w-full rounded object-cover')]) }),
      h.label([h.Class('mt-3 inline-block cursor-pointer rounded border border-gray-200 px-3 py-2 text-sm text-gray-700')], ['Choose image', h.input([h.Type('file'), h.Accept('image/*'), h.AriaLabel(`Attach image to ${todo.text}`), h.Class('sr-only'), h.OnFileChange(files => SelectedTodoImage({ id: todo._id, files }))])]),
    ]))),
    Array.match(withImages, {
      onEmpty: () => h.p([h.Class('mt-4 text-sm text-gray-500')], ['No images uploaded yet.']),
      onNonEmpty: () => h.empty,
    }),
  ])
})
