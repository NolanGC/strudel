import { Option, Schema as S } from 'effect'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { AuthSignedIn } from '../authService'
import * as AuthPanel from '../authPanel'
import {
  GotTodosPageMessage,
  Model,
  DeleteScheduledTodo,
  DeletedScheduledTodo,
  update,
  view,
} from '../main'
import { TodosRoute } from '../route'
import {
  CreateScheduledTodo,
  CreatedScheduledTodo,
} from '../scheduledTodoForm'
import { ScheduledTodoId } from '../scheduledTodosBackend'
import * as TodosPage from '../todosPage'
import { errorMessage } from '../errorMessage'

const scheduledTodoId = S.decodeUnknownSync(ScheduledTodoId)('scheduled-todo-1')

const signedInModel: Model = {
  route: TodosRoute(),
  authState: AuthSignedIn({ session: { displayName: 'Nolan' } }),
  authPanel: AuthPanel.init(),
  todosPage: TodosPage.init(),
  maybeError: Option.none(),
}

describe('scheduled todo form scene', () => {
  test('the todos page renders a scheduled todo submodel form', () => {
    Scene.scene(
      { update, view },
      Scene.with(signedInModel),
      Scene.expect(Scene.role('heading', { name: 'Scheduled todos' })).toExist(),
      Scene.expect(Scene.label('Scheduled todo')).toExist(),
      Scene.expect(Scene.label('Cron schedule')).toExist(),
      Scene.expect(Scene.role('button', { name: 'Schedule todo' })).toExist(),
    )
  })

  test('the todos page renders scheduled todos loaded by subscription', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...signedInModel,
        todosPage: {
          ...signedInModel.todosPage,
          scheduledTodosLoadState: 'Loaded',
          scheduledTodos: [
            {
              _id: scheduledTodoId,
              _creationTime: 1000,
              ownerUserId: 'user-a',
              text: 'gym',
              cron: '0 7 * * *',
              nextRunAt: new Date('2026-06-18T07:00:00.000Z').getTime(),
            },
          ],
        },
      }),
      Scene.expect(Scene.text('gym')).toExist(),
      Scene.expect(Scene.text('0 7 * * *')).toExist(),
      Scene.expect(
        Scene.role('button', { name: 'Delete scheduled gym' }),
      ).toExist(),
    )
  })

  test('clicking scheduled delete removes through the scheduled backend command', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...signedInModel,
        todosPage: {
          ...signedInModel.todosPage,
          scheduledTodosLoadState: 'Loaded',
          scheduledTodos: [
            {
              _id: scheduledTodoId,
              _creationTime: 1000,
              ownerUserId: 'user-a',
              text: 'gym',
              cron: '0 7 * * *',
              nextRunAt: new Date('2026-06-18T07:00:00.000Z').getTime(),
            },
          ],
        },
      }),
      Scene.click(Scene.role('button', { name: 'Delete scheduled gym' })),
      Scene.Command.expectExact(DeleteScheduledTodo),
      Scene.Command.resolve(
        DeleteScheduledTodo,
        DeletedScheduledTodo(),
        message => GotTodosPageMessage({ message }),
      ),
    )
  })

  test('shows scheduled todo subscription failures', () => {
    Scene.scene(
      { update, view },
      Scene.with({
        ...signedInModel,
        todosPage: {
          ...signedInModel.todosPage,
          scheduledTodosLoadState: 'Failed',
          maybeError: Option.some(errorMessage('Could not schedule todos.')),
        },
      }),
      Scene.expect(Scene.text('Could not schedule todos.')).toExist(),
    )
  })

  test('submitting a scheduled todo creates through the scheduled backend command', () => {
    Scene.scene(
      { update, view },
      Scene.with(signedInModel),
      Scene.type(Scene.label('Scheduled todo'), 'gym'),
      Scene.type(Scene.label('Cron schedule'), '0 7 * * *'),
      Scene.click(Scene.role('button', { name: 'Schedule todo' })),
      Scene.Command.expectExact(CreateScheduledTodo),
      Scene.Command.resolve(
        CreateScheduledTodo,
        CreatedScheduledTodo({ id: scheduledTodoId }),
        message =>
          GotTodosPageMessage({
            message: TodosPage.GotScheduledTodoFormMessage({ message }),
          }),
      ),
      Scene.expect(Scene.text('Scheduled "gym".')).toExist(),
    )
  })
})
