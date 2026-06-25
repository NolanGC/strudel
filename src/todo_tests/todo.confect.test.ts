import { GenericId } from '@confect/core'
import { describe, it } from '@effect/vitest'
import {
  assertEquals,
  assertFailure,
  assertNone,
  assertSome,
} from '@effect/vitest/utils'
import { Effect, Option, Schema as S } from 'effect'

import refs from '../../confect/_generated/refs'
import { DatabaseWriter } from '../../confect/_generated/services'
import { TodoText, UserId } from '../../confect/domain'
import { NotAuthenticated } from '../../confect/todos.spec'
import { StorageId } from '../todosBackend'
import * as TestConfect from './TestConfect'

const TodoId = GenericId.GenericId('todos')
const storageId = S.decodeUnknownSync(StorageId)('10000_storage')
const todoText = TodoText.make
const userId = UserId.make

const userA = {
  subject: 'user-a|session-a-1',
  tokenIdentifier: 'https://issuer.example|user-a|session-a-1',
  userId: 'user-a',
  email: 'a@example.com',
}

const userASecondSession = {
  subject: 'user-a|session-a-2',
  tokenIdentifier: 'https://issuer.example|user-a|session-a-2',
  userId: 'user-a',
  email: 'a@example.com',
}

const userB = {
  subject: 'user-b|session-b-1',
  tokenIdentifier: 'https://issuer.example|user-b|session-b-1',
  userId: 'user-b',
  email: 'b@example.com',
}

describe('todos Confect functions', () => {
  it.effect('requires identity for list, create, and delete', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const existingTodoId = yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter

          return yield* writer.table('todos').insert({
            ownerUserId: userId(userA.userId),
            text: todoText('Seeded todo'),
          })
        }),
        TodoId,
      )

      const listResult = yield* c
        .query(refs.public.todos.list, {})
        .pipe(Effect.result)
      const createResult = yield* c
        .mutation(refs.public.todos.create, { text: todoText('Write tests') })
        .pipe(Effect.result)
      const deleteResult = yield* c
        .mutation(refs.public.todos.deleteTodo, { id: existingTodoId })
        .pipe(Effect.result)
      const uploadUrlResult = yield* c
        .mutation(refs.public.todos.generateImageUploadUrl, {})
        .pipe(Effect.result)

      assertFailure(
        listResult,
        new NotAuthenticated({
          message: 'No user identity found',
          userMessage: 'Sign in to sync todos.',
        }),
      )
      assertFailure(
        createResult,
        new NotAuthenticated({
          message: 'No user identity found',
          userMessage: 'Sign in to sync todos.',
        }),
      )
      assertFailure(
        deleteResult,
        new NotAuthenticated({
          message: 'No user identity found',
          userMessage: 'Sign in to sync todos.',
        }),
      )
      assertFailure(
        uploadUrlResult,
        new NotAuthenticated({
          message: 'No user identity found',
          userMessage: 'Sign in to sync todos.',
        }),
      )
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('creates todos owned by the current auth user id', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const asUserA = c.withIdentity(userA)

      const todoId = yield* asUserA.mutation(refs.public.todos.create, {
        text: todoText('Write tests'),
      })

      const todos = yield* asUserA.query(refs.public.todos.list, {})

      assertEquals(todos.length, 1)
      assertEquals(todos[0]?._id, todoId)
      assertEquals(todos[0]?.text, 'Write tests')
      assertEquals(todos[0]?.ownerUserId, userA.userId)
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('lists todos across sessions for the same auth user', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect

      yield* c.withIdentity(userA).mutation(refs.public.todos.create, {
        text: todoText('Persistent todo'),
      })

      const todos = yield* c
        .withIdentity(userASecondSession)
        .query(refs.public.todos.list, {})

      assertEquals(
        todos.map(todo => todo.text),
        ['Persistent todo'],
      )
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('lists only todos for the current identity', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect

      yield* c.withIdentity(userA).mutation(refs.public.todos.create, {
        text: todoText('A todo'),
      })
      yield* c.withIdentity(userB).mutation(refs.public.todos.create, {
        text: todoText('B todo'),
      })

      const userATodos = yield* c
        .withIdentity(userA)
        .query(refs.public.todos.list, {})
      const userBTodos = yield* c
        .withIdentity(userB)
        .query(refs.public.todos.list, {})

      assertEquals(
        userATodos.map(todo => todo.text),
        ['A todo'],
      )
      assertEquals(
        userBTodos.map(todo => todo.text),
        ['B todo'],
      )
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('deletes owned todos and returns the deleted id', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const asUserA = c.withIdentity(userA)

      const todoId = yield* asUserA.mutation(refs.public.todos.create, {
        text: todoText('Delete me'),
      })

      const maybeDeletedId = yield* asUserA.mutation(
        refs.public.todos.deleteTodo,
        { id: todoId },
      )
      const todos = yield* asUserA.query(refs.public.todos.list, {})

      assertSome(maybeDeletedId, todoId)
      assertEquals(todos, [])
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('attaches image storage ids to owned todos', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const asUserA = c.withIdentity(userA)
      const todoId = yield* asUserA.mutation(refs.public.todos.create, {
        text: todoText('Photo todo'),
      })

      const maybeAttachedTodoId = yield* asUserA.mutation(
        refs.public.todos.attachImage,
        { id: todoId, storageId },
      )
      const todos = yield* asUserA.query(refs.public.todos.list, {})

      assertSome(maybeAttachedTodoId, todoId)
      assertEquals(todos.length, 1)
      assertEquals(todos[0]?.imageStorageId, storageId)
      assertEquals(Option.isNone(todos[0]?.maybeImageUrl ?? Option.none()), true)
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('returns none when attaching an image to a non-owned todo', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect
      const todoId = yield* c.withIdentity(userA).mutation(refs.public.todos.create, {
        text: todoText('Private photo todo'),
      })

      const maybeAttachedTodoId = yield* c
        .withIdentity(userB)
        .mutation(refs.public.todos.attachImage, { id: todoId, storageId })

      assertNone(maybeAttachedTodoId)
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('returns none for missing or non-owned deletes', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect

      const deletedTodoId = yield* c
        .withIdentity(userA)
        .mutation(refs.public.todos.create, { text: todoText('Deleted todo') })
      yield* c
        .withIdentity(userA)
        .mutation(refs.public.todos.deleteTodo, { id: deletedTodoId })
      const userATodoId = yield* c
        .withIdentity(userA)
        .mutation(refs.public.todos.create, { text: todoText('A todo') })

      const missingDelete = yield* c
        .withIdentity(userA)
        .mutation(refs.public.todos.deleteTodo, { id: deletedTodoId })
      const nonOwnedDelete = yield* c
        .withIdentity(userB)
        .mutation(refs.public.todos.deleteTodo, { id: userATodoId })
      const userATodos = yield* c
        .withIdentity(userA)
        .query(refs.public.todos.list, {})

      assertNone(missingDelete)
      assertNone(nonOwnedDelete)
      assertEquals(userATodos.length, 1)
      assertEquals(userATodos[0]?._id, userATodoId)
    }).pipe(Effect.provide(TestConfect.layer())),
  )

  it.effect('supports setup through mutation-context services', () =>
    Effect.gen(function* () {
      const c = yield* TestConfect.TestConfect

      const seededId = yield* c.run(
        Effect.gen(function* () {
          const writer = yield* DatabaseWriter

          return yield* writer.table('todos').insert({
            ownerUserId: userId(userA.userId),
            text: todoText('Seeded todo'),
          })
        }),
        TodoId,
      )

      const todos = yield* c
        .withIdentity(userA)
        .query(refs.public.todos.list, {})

      assertEquals(todos.length, 1)
      assertEquals(todos[0]?._id, seededId)
      assertEquals(todos[0]?.text, 'Seeded todo')
    }).pipe(Effect.provide(TestConfect.layer())),
  )
})
