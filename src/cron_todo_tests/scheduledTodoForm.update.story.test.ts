import { Option, Schema as S } from 'effect'
import { Story } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { errorMessage } from '../errorMessage'
import {
  CreateScheduledTodo,
  CreatedScheduledTodo,
  FailedCreateScheduledTodo,
  SubmittedScheduledTodo,
  UpdatedScheduledTodoCron,
  UpdatedScheduledTodoText,
  init,
  update,
} from '../scheduledTodoForm'
import { ScheduledTodoId } from '../scheduledTodosBackend'

const scheduledTodoId = S.decodeUnknownSync(ScheduledTodoId)('scheduled-todo-1')

describe('scheduled todo form update', () => {
  test('updates the scheduled todo text and cron fields independently', () => {
    Story.story(
      update,
      Story.with(init()),
      Story.message(UpdatedScheduledTodoText({ text: 'gym' })),
      Story.message(UpdatedScheduledTodoCron({ cron: '0 7 * * *' })),
      Story.model(model => {
        expect(model.text).toBe('gym')
        expect(model.cron).toBe('0 7 * * *')
        expect(model.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('submits trimmed text and cron through the backend command', () => {
    Story.story(
      update,
      Story.with({
        ...init(),
        text: '  gym  ',
        cron: '  0 7 * * *  ',
      }),
      Story.message(SubmittedScheduledTodo()),
      Story.Command.expectHas(CreateScheduledTodo),
      Story.Command.resolve(
        CreateScheduledTodo,
        CreatedScheduledTodo({ id: scheduledTodoId }),
      ),
      Story.model(model => {
        expect(model.text).toBe('')
        expect(model.cron).toBe('')
        expect(model.maybeNotice).toStrictEqual(
          Option.some('Scheduled "gym".'),
        )
        expect(model.maybeError).toStrictEqual(Option.none())
      }),
    )
  })

  test('rejects empty text before running a command', () => {
    Story.story(
      update,
      Story.with({ ...init(), text: '   ', cron: '0 7 * * *' }),
      Story.message(SubmittedScheduledTodo()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.maybeError).toStrictEqual(
          Option.some(errorMessage('Enter a todo to schedule.')),
        )
      }),
    )
  })

  test('rejects empty cron before running a command', () => {
    Story.story(
      update,
      Story.with({ ...init(), text: 'gym', cron: '   ' }),
      Story.message(SubmittedScheduledTodo()),
      Story.Command.expectNone(),
      Story.model(model => {
        expect(model.maybeError).toStrictEqual(
          Option.some(errorMessage('Enter a cron schedule.')),
        )
      }),
    )
  })

  test('shows typed backend failures without clearing user input', () => {
    Story.story(
      update,
      Story.with({ ...init(), text: 'gym', cron: 'not cron' }),
      Story.message(
        FailedCreateScheduledTodo({
          error: errorMessage('Enter a valid cron expression.'),
        }),
      ),
      Story.model(model => {
        expect(model.text).toBe('gym')
        expect(model.cron).toBe('not cron')
        expect(model.maybeNotice).toStrictEqual(Option.none())
        expect(model.maybeError).toStrictEqual(
          Option.some(errorMessage('Enter a valid cron expression.')),
        )
      }),
    )
  })
})
