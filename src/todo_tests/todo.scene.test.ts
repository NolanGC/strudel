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
import { errorMessage } from '../errorMessage'

const emptyModel: Model = {
  route: TodosRoute(),
  authState: AuthSignedIn({ session: { displayName: 'Nolan' } }),
  authPanel: AuthPanel.init(),
  todosPage: TodosPage.init(),
  maybeError: Option.none(),
}

const todoId = S.decodeUnknownSync(TodoId)

const modelWithTodos: Model = {
  ...emptyModel,
  todosPage: {
    ...emptyModel.todosPage,
    loadState: 'Loaded',
    todos: [
      {
        _id: todoId('todo-1'),
        _creationTime: 1000,
        ownerUserId: 'user-1',
        text: 'Buy milk',
      },
      {
        _id: todoId('todo-2'),
        _creationTime: 2000,
        ownerUserId: 'user-1',
        text: 'Walk the dog',
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
