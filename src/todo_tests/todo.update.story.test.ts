import { Option, Schema as S } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { AuthSignedIn } from '../authService'
import * as AuthPanel from '../authPanel'
import {
  AddedTodo,
  AttachedTodoImage,
  AttachTodoImage,
  ClickedDeleteTodo,
  CreateTodo,
  CreatedTodo,
  DeleteTodo,
  DeletedTodo,
  FailedCreateTodo,
  FailedDeleteTodo,
  FailedLoadTodos,
  GotTodosPageMessage,
  LoadedTodos,
  type Model,
  UpdatedNewTodo,
  update,
} from '../main'
import { TodosRoute } from '../route'
import { TodoId } from '../todosBackend'
import * as TodosPage from '../todosPage'
import { errorMessage } from '../errorMessage'

const todoId = S.decodeUnknownSync(TodoId)
const imageFile = new File(['image-bytes'], 'todo.png', { type: 'image/png' })

const emptyModel: Model = {
  route: TodosRoute(),
  authState: AuthSignedIn({ session: { displayName: 'Nolan' } }),
  authPanel: AuthPanel.init(),
  todosPage: TodosPage.init(),
  maybeError: Option.none(),
}

describe('update', () => {
  test('UpdatedNewTodo updates the input text', () => {
    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(
        GotTodosPageMessage({ message: UpdatedNewTodo({ text: 'Buy milk' }) }),
      ),
      Story.model(model => {
        expect(model.todosPage.newTodoText).toBe('Buy milk')
      }),
    )
  })

  test('AddedTodo trims text and creates a Convex todo', () => {
    Story.story(
      update,
      Story.with({
        ...emptyModel,
        todosPage: {
          ...emptyModel.todosPage,
          newTodoText: '  Buy milk  ',
        },
      }),
      Story.message(GotTodosPageMessage({ message: AddedTodo() })),
      Story.Command.expectHas(CreateTodo),
      Story.Command.resolve(
        CreateTodo,
        CreatedTodo(),
        message => GotTodosPageMessage({ message }),
      ),
      Story.model(model => {
        expect(model.todosPage.newTodoText).toBe('')
        expect(model.todosPage.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('AddedTodo ignores empty text', () => {
    Story.story(
      update,
      Story.with({
        ...emptyModel,
        todosPage: { ...emptyModel.todosPage, newTodoText: '   ' },
      }),
      Story.message(GotTodosPageMessage({ message: AddedTodo() })),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.todosPage.newTodoText).toBe('   ')
      }),
    )
  })

  test('LoadedTodos replaces todos from the subscription', () => {
    const todos = [
      {
        _id: todoId('todo-1'),
        _creationTime: 1000,
        ownerUserId: 'user-1',
        text: 'Buy milk',
        maybeImageUrl: Option.none(),
      },
      {
        _id: todoId('todo-2'),
        _creationTime: 2000,
        ownerUserId: 'user-1',
        text: 'Walk',
        maybeImageUrl: Option.none(),
      },
    ]

    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(GotTodosPageMessage({ message: LoadedTodos({ todos }) })),
      Story.model(model => {
        expect(model.todosPage.todos).toStrictEqual(todos)
        expect(model.todosPage.loadState).toBe('Loaded')
        expect(model.todosPage.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('ClickedDeleteTodo deletes through Convex', () => {
    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(
        GotTodosPageMessage({
          message: ClickedDeleteTodo({ id: todoId('todo-1') }),
        }),
      ),
      Story.Command.expectHas(DeleteTodo),
      Story.Command.resolve(
        DeleteTodo,
        DeletedTodo(),
        message => GotTodosPageMessage({ message }),
      ),
      Story.model(model => {
        expect(model.todosPage.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('SelectedTodoImage uploads the first image file through a command', () => {
    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(
        GotTodosPageMessage({
          message: TodosPage.SelectedTodoImage({
            id: todoId('todo-1'),
            files: [imageFile],
          }),
        }),
      ),
      Story.Command.expectHas(AttachTodoImage),
      Story.Command.resolve(
        AttachTodoImage,
        AttachedTodoImage(),
        message => GotTodosPageMessage({ message }),
      ),
      Story.model(model => {
        expect(model.todosPage.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('SelectedTodoImage rejects non-image files before running a command', () => {
    const textFile = new File(['text'], 'notes.txt', { type: 'text/plain' })

    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(
        GotTodosPageMessage({
          message: TodosPage.SelectedTodoImage({
            id: todoId('todo-1'),
            files: [textFile],
          }),
        }),
      ),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.todosPage.maybeError).toStrictEqual(
          Option.some(errorMessage('Choose a PNG, JPEG, GIF, or WebP image.')),
        )
      }),
    )
  })

  test('failures are stored for display', () => {
    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(
        GotTodosPageMessage({
          message: FailedLoadTodos({
            error: errorMessage('Convex unavailable'),
          }),
        }),
      ),
      Story.model(model => {
        expect(model.todosPage.loadState).toBe('Failed')
        expect(model.todosPage.maybeError).toStrictEqual(
          Option.some(errorMessage('Convex unavailable')),
        )
      }),
      Story.message(
        GotTodosPageMessage({
          message: FailedCreateTodo({ error: errorMessage('Create failed') }),
        }),
      ),
      Story.model(model => {
        expect(model.todosPage.maybeError).toStrictEqual(
          Option.some(errorMessage('Create failed')),
        )
      }),
      Story.message(
        GotTodosPageMessage({
          message: FailedDeleteTodo({ error: errorMessage('Delete failed') }),
        }),
      ),
      Story.model(model => {
        expect(model.todosPage.maybeError).toStrictEqual(
          Option.some(errorMessage('Delete failed')),
        )
      }),
    )
  })
})
