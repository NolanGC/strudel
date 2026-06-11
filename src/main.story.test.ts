import { Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import {
  AddedTodo,
  CreateTodo,
  CreatedTodo,
  FailedCreateTodo,
  FailedLoadTodos,
  LoadedTodos,
  type Model,
  UpdatedNewTodo,
  update,
} from './main'

const emptyModel: Model = {
  todos: [],
  newTodoText: '',
  loadState: 'Loading',
  maybeError: Option.none(),
}

describe('update', () => {
  test('UpdatedNewTodo updates the input text', () => {
    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(UpdatedNewTodo({ text: 'Buy milk' })),
      Story.model(model => {
        expect(model.newTodoText).toBe('Buy milk')
      }),
    )
  })

  test('AddedTodo trims text and creates a Convex todo', () => {
    Story.story(
      update,
      Story.with({ ...emptyModel, newTodoText: '  Buy milk  ' }),
      Story.message(AddedTodo()),
      Story.Command.expectHas(CreateTodo),
      Story.Command.resolve(CreateTodo, CreatedTodo()),
      Story.model(model => {
        expect(model.newTodoText).toBe('')
        expect(model.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('AddedTodo ignores empty text', () => {
    Story.story(
      update,
      Story.with({ ...emptyModel, newTodoText: '   ' }),
      Story.message(AddedTodo()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.newTodoText).toBe('   ')
      }),
    )
  })

  test('LoadedTodos replaces todos from the subscription', () => {
    const todos = [
      { id: 'todo-1', text: 'Buy milk', createdAt: 1000 },
      { id: 'todo-2', text: 'Walk', createdAt: 2000 },
    ]

    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(LoadedTodos({ todos })),
      Story.model(model => {
        expect(model.todos).toStrictEqual(todos)
        expect(model.loadState).toBe('Loaded')
        expect(model.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('failures are stored for display', () => {
    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(FailedLoadTodos({ error: 'Convex unavailable' })),
      Story.model(model => {
        expect(model.loadState).toBe('Failed')
        expect(model.maybeError).toStrictEqual(
          Option.some('Convex unavailable'),
        )
      }),
      Story.message(FailedCreateTodo({ error: 'Create failed' })),
      Story.model(model => {
        expect(model.maybeError).toStrictEqual(Option.some('Create failed'))
      }),
    )
  })
})
