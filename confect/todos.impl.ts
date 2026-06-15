import { FunctionImpl, GroupImpl } from '@confect/server'
import { Effect, Layer } from 'effect'

import api from './_generated/api'
import { Auth, DatabaseReader, DatabaseWriter } from './_generated/services'
import { NotAuthenticated } from './todos.spec'

const currentOwnerUserId = Effect.gen(function* () {
  const auth = yield* Auth
  const identity = yield* auth.getUserIdentity
  const ownerUserId = identity.subject.split('|')[0]

  if (ownerUserId === undefined || ownerUserId === '') {
    return yield* Effect.fail(new NotAuthenticated())
  }

  return ownerUserId
}).pipe(Effect.mapError(() => new NotAuthenticated()))

const list = FunctionImpl.make(api, 'todos', 'list', () =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader
    const ownerUserId = yield* currentOwnerUserId

    const ownedTodos = yield* reader
      .table('todos')
      .index('by_ownerUserId', q => q.eq('ownerUserId', ownerUserId), 'desc')
      .collect()
      .pipe(Effect.orDie)

    return ownedTodos
  }),
)

const create = FunctionImpl.make(api, 'todos', 'create', ({ text }) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter
    const ownerUserId = yield* currentOwnerUserId

    return yield* writer
      .table('todos')
      .insert({ ownerUserId, text })
      .pipe(Effect.orDie)
  }),
)

const deleteTodo = FunctionImpl.make(api, 'todos', 'deleteTodo', ({ id }) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader
    const writer = yield* DatabaseWriter
    const ownerUserId = yield* currentOwnerUserId

    const maybeTodo = yield* reader.table('todos').get(id).pipe(Effect.option)

    if (
      maybeTodo._tag === 'None' ||
      maybeTodo.value.ownerUserId !== ownerUserId
    ) {
      return null
    }

    yield* writer.table('todos').delete(id).pipe(Effect.orDie)
    return null
  }),
)

export const todos = GroupImpl.make(api, 'todos').pipe(
  Layer.provide(list),
  Layer.provide(create),
  Layer.provide(deleteTodo),
)