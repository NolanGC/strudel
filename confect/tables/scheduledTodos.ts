import { Table } from '@confect/server'
import { Schema } from 'effect'

export const ScheduledTodos = Table.make(
  'scheduledTodos',
  Schema.Struct({
    ownerUserId: Schema.String,
    text: Schema.String,
    cron: Schema.String,
    nextRunAt: Schema.Number,
  }),
).index('by_ownerUserId', ['ownerUserId'])
