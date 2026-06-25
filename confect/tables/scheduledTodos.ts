import { Table } from '@confect/server'
import { Schema } from 'effect'

import { CronExpression, EpochMillis, TodoText, UserId } from '../domain'

export const ScheduledTodos = Table.make(
  'scheduledTodos',
  Schema.Struct({
    ownerUserId: UserId,
    text: TodoText,
    cron: CronExpression,
    nextRunAt: EpochMillis,
  }),
).index('by_ownerUserId', ['ownerUserId'])
