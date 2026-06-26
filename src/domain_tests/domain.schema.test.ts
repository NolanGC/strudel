import { Option, Schema as S } from 'effect'
import { describe, expect, test } from 'vitest'

import {
  AuthEmail,
  CronExpression,
  DisplayName,
  EpochMillis,
  ImageUrl,
  TodoText,
  UploadUrl,
  UserId,
} from '../../confect/domain'
import { Todo } from '../../confect/todos.spec'
import { ErrorMessage, errorMessage } from '../errorMessage'

describe('domain schemas', () => {
  test('branded non-empty strings reject empty input at runtime', () => {
    for (const schema of [
      AuthEmail,
      CronExpression,
      DisplayName,
      ImageUrl,
      TodoText,
      UploadUrl,
      UserId,
    ]) {
      expect(S.decodeUnknownOption(schema)('')).toStrictEqual(Option.none())
    }
  })

  test('domain constructors validate before producing branded values', () => {
    expect(() => TodoText.make('')).toThrow(
      'Expected a value with a length of at least 1',
    )
    expect(() => UserId.make('')).toThrow(
      'Expected a value with a length of at least 1',
    )
  })

  test('error messages trim display text and reject blank messages', () => {
    expect(errorMessage('  Could not sync todos.  ')).toBe(
      'Could not sync todos.',
    )
    expect(S.decodeUnknownOption(ErrorMessage)('   ')).toStrictEqual(
      Option.none(),
    )
  })

  test('todo documents reject invalid branded domain fields', () => {
    const decodeTodo = S.decodeUnknownOption(Todo)

    expect(
      decodeTodo({
        _id: 'todo-1',
        _creationTime: 1000,
        ownerUserId: '',
        text: TodoText.make('Buy milk'),
        maybeImageUrl: Option.none(),
      }),
    ).toStrictEqual(Option.none())

    expect(
      decodeTodo({
        _id: 'todo-1',
        _creationTime: 1000,
        ownerUserId: UserId.make('user-1'),
        text: '',
        maybeImageUrl: Option.none(),
      }),
    ).toStrictEqual(Option.none())
  })

  test('epoch millis is a distinct domain value even though it stores a number', () => {
    const millis = EpochMillis.make(1_797_484_400_000)

    expect(millis).toBe(1_797_484_400_000)
  })
})
