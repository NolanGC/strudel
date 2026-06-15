import { Table } from '@confect/server'
import { Schema } from 'effect'

export const Todos = Table.make(
  'todos',
  Schema.Struct({
    ownerUserId: Schema.String,
    text: Schema.String,
  }),
).index('by_ownerUserId', ['ownerUserId'])
