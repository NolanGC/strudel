import { Option, Schema as S } from 'effect'
import { Scene } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { AuthSignedIn } from '../authService'
import * as AuthPanel from '../authPanel'
import {
  CreateTodo,
  CreatedTodo,
  DeleteTodo,
  DeletedTodo,
  AttachTodoImage,
  AttachedTodoImage,
  FailedCreateTodo,
  FailedDeleteTodo,
  GotTodosPageMessage,
  Model,
  update,
  view,
} from '../main'
import { TodosRoute } from '../route'
import { TodoId } from '../todosBackend'
import * as TodosPage from '../todosPage'
import * as ScheduledTodosPage from '../page/scheduledTodos'
import * as ImageUploadsPage from '../page/imageUploads'
import { errorMessage } from '../errorMessage'
import { ImageUrl, TodoText, UserId } from '../../confect/domain'

const emptyModel: Model = {
  route: TodosRoute(),
  authState: AuthSignedIn({ session: { displayName: 'Nolan' } }),
  authPanel: AuthPanel.init(),
  todosPage: TodosPage.init(),
  scheduledTodosPage: ScheduledTodosPage.init(),
  imageUploadsPage: ImageUploadsPage.init(),
  maybeError: Option.none(),
}

const todoId = S.decodeUnknownSync(TodoId)
const imageUrl = ImageUrl.make
const todoText = TodoText.make
const userId = UserId.make
const imageFile = new File(['image-bytes'], 'todo.png', { type: 'image/png' })

const modelWithTodos: Model = {
  ...emptyModel,
  todosPage: {
    ...emptyModel.todosPage,
    loadState: 'Loaded',
    todos: [
      {
        _id: todoId('todo-1'),
        _creationTime: 1000,
        ownerUserId: userId('user-1'),
        text: todoText('Buy milk'),
        maybeImageUrl: Option.some(imageUrl('https://example.com/milk.png')),
      },
      {
        _id: todoId('todo-2'),
        _creationTime: 2000,
        ownerUserId: userId('user-1'),
        text: todoText('Walk the dog'),
        maybeImageUrl: Option.none(),
      },
    ],
  },
}

describe('scene', () => {
  test('empty state shows loading status and placeholder message', () => {
    Scene.scene(
      { update, view },
      Scene.with(emptyModel),
      Scene.expect(Scene.role('heading', { name: 'Todo App' })).toExist(),
      Scene.expect(Scene.role('status')).toContainText(
        'Loading todos from Convex...',
      ),
      Scene.expect(Scene.text('No todos yet. Add one above.')).toExist(),
    )
  })

  test('renders todos loaded by the subscription', () => {
    Scene.scene(
      { update, view },
      Scene.with(modelWithTodos),
      Scene.expect(Scene.text('Buy milk')).toExist(),
      Scene.expect(Scene.text('Walk the dog')).toExist(),
      Scene.expect(Scene.altText('Image preview for Buy milk')).toHaveAttr(
        'src',
        'https://example.com/milk.png',
      ),
      Scene.expect(Scene.role('status')).toContainText('2 todos'),
    )
  })

  test('submitting creates through the Convex command', () => {
    Scene.scene(
      { update, view },
      Scene.with(emptyModel),
      Scene.type(Scene.label('New todo'), 'Write tests'),
      Scene.submit(Scene.selector('form')),
      Scene.Command.expectExact(CreateTodo),
      Scene.Command.resolve(
        CreateTodo,
        CreatedTodo(),
        message => GotTodosPageMessage({ message }),
      ),
      Scene.expect(Scene.label('New todo')).toHaveValue(''),
    )
  })

  test('clicking delete removes through the Convex command', () => {
    Scene.scene(
      { update, view },
      Scene.with(modelWithTodos),
      Scene.click(Scene.role('button', { name: 'Delete Buy milk' })),
      Scene.Command.expectExact(DeleteTodo),
      Scene.Command.resolve(
        DeleteTodo,
        DeletedTodo(),
        message => GotTodosPageMessage({ message }),
      ),
    )
  })

  test('choosing an image uploads through the Convex command', () => {
    Scene.scene(
      { update, view },
      Scene.with(modelWithTodos),
      Scene.changeFiles(Scene.label('Attach image to Walk the dog'), [
        imageFile,
      ]),
      Scene.Command.expectExact(AttachTodoImage),
      Scene.Command.resolve(
        AttachTodoImage,
        AttachedTodoImage(),
        message => GotTodosPageMessage({ message }),
      ),
    )
  })

  test('shows subscription errors', () => {
    Scene.scene(
      {
        update,
        view,
      },
      Scene.with({
        ...emptyModel,
        todosPage: {
          ...emptyModel.todosPage,
          loadState: 'Failed',
          maybeError: Option.some(errorMessage('Convex unavailable')),
        },
      }),
      Scene.expect(Scene.role('status')).toContainText('Could not load todos'),
      Scene.expect(Scene.text('Convex unavailable')).toExist(),
    )
  })

  test('rejects empty error text in the model schema', () => {
    expect(
      S.decodeUnknownOption(Model)({
        ...emptyModel,
        todosPage: {
          ...emptyModel.todosPage,
          loadState: 'Failed',
          maybeError: Option.some(''),
        },
      }),
    ).toStrictEqual(Option.none())
  })

  test('shows create errors after submit failure', () => {
    Scene.scene(
      { update, view },
      Scene.with(emptyModel),
      Scene.type(Scene.label('New todo'), 'Write tests'),
      Scene.submit(Scene.selector('form')),
      Scene.Command.expectExact(CreateTodo),
      Scene.Command.resolve(
        CreateTodo,
        FailedCreateTodo({
          error: errorMessage('Create unavailable'),
        }),
        message => GotTodosPageMessage({ message }),
      ),
      Scene.expect(Scene.text('Create unavailable')).toExist(),
    )
  })

  test('shows delete errors after delete failure', () => {
    Scene.scene(
      { update, view },
      Scene.with(modelWithTodos),
      Scene.click(Scene.role('button', { name: 'Delete Buy milk' })),
      Scene.Command.expectExact(DeleteTodo),
      Scene.Command.resolve(
        DeleteTodo,
        FailedDeleteTodo({
          error: errorMessage('Delete unavailable'),
        }),
        message => GotTodosPageMessage({ message }),
      ),
      Scene.expect(Scene.text('Delete unavailable')).toExist(),
    )
  })
})
