import { Option } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { AuthSignedIn } from '../authService'
import {
  AddedTodo,
  ClickedDeleteTodo,
  CreateTodo,
  CreatedTodo,
  DeleteTodo,
  DeletedTodo,
  FailedCreateTodo,
  FailedDeleteTodo,
  FailedLoadTodos,
  LoadedTodos,
  type Model,
  UpdatedNewTodo,
  update,
} from '../main'
import { TodosRoute } from '../route'
import { errorMessage } from '../userFacingError'

const emptyModel: Model = {
  route: TodosRoute(),
  authState: AuthSignedIn({ session: { displayName: 'Nolan' } }),
  magicLinkEmail: '',
  todos: [],
  newTodoText: '',
  loadState: 'Loading',
  maybeNotice: Option.none(),
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
      {
        _id: 'todo-1',
        _creationTime: 1000,
        ownerUserId: 'user-1',
        text: 'Buy milk',
      },
      {
        _id: 'todo-2',
        _creationTime: 2000,
        ownerUserId: 'user-1',
        text: 'Walk',
      },
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

  test('ClickedDeleteTodo deletes through Convex', () => {
    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(ClickedDeleteTodo({ id: 'todo-1' })),
      Story.Command.expectHas(DeleteTodo),
      Story.Command.resolve(DeleteTodo, DeletedTodo()),
      Story.model(model => {
        expect(model.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('failures are stored for display', () => {
    Story.story(
      update,
      Story.with(emptyModel),
      Story.message(
        FailedLoadTodos({ error: errorMessage('Convex unavailable') }),
      ),
      Story.model(model => {
        expect(model.loadState).toBe('Failed')
        expect(model.maybeError).toStrictEqual(
          Option.some(errorMessage('Convex unavailable')),
        )
      }),
      Story.message(FailedCreateTodo({ error: errorMessage('Create failed') })),
      Story.model(model => {
        expect(model.maybeError).toStrictEqual(
          Option.some(errorMessage('Create failed')),
        )
      }),
      Story.message(FailedDeleteTodo({ error: errorMessage('Delete failed') })),
      Story.model(model => {
        expect(model.maybeError).toStrictEqual(
          Option.some(errorMessage('Delete failed')),
        )
      }),
    )
  })
})
