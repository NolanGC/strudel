import { Table } from '@confect/server'
import { GenericId } from '@confect/core'
import { Schema } from 'effect'

import { TodoText, UserId } from '../domain'

export const Todos = Table.make(
  'todos',
  Schema.Struct({
    ownerUserId: UserId,
    text: TodoText,
    imageStorageId: Schema.optional(GenericId.GenericId('_storage')),
  }),
).index('by_ownerUserId', ['ownerUserId'])
