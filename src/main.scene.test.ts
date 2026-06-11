import { Option } from 'effect'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { CreateTodo, CreatedTodo, type Model, update, view } from './main'

const emptyModel: Model = {
  todos: [],
  newTodoText: '',
  loadState: 'Loading',
  maybeError: Option.none(),
}

const modelWithTodos: Model = {
  ...emptyModel,
  loadState: 'Loaded',
  todos: [
    { id: 'todo-1', text: 'Buy milk', createdAt: 1000 },
    { id: 'todo-2', text: 'Walk the dog', createdAt: 2000 },
  ],
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
      Scene.Command.resolve(CreateTodo, CreatedTodo()),
      Scene.expect(Scene.label('New todo')).toHaveValue(''),
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
        loadState: 'Failed',
        maybeError: Option.some('Convex unavailable'),
      }),
      Scene.expect(Scene.role('status')).toContainText('Could not load todos'),
      Scene.expect(Scene.text('Convex unavailable')).toExist(),
    )
  })
})
