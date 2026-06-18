import { FunctionSpec, GenericId, GroupSpec } from '@confect/core'
import { Schema } from 'effect'

import { ScheduledTodos } from './tables/scheduledTodos'

export const ScheduledTodoOperation = Schema.Literals([
  'ListScheduledTodos',
  'CreateScheduledTodo',
  'DeleteScheduledTodo',
  'RunScheduledTodo',
])
export type ScheduledTodoOperation = typeof ScheduledTodoOperation.Type

export class NotAuthenticated extends Schema.TaggedErrorClass<NotAuthenticated>()(
  'NotAuthenticated',
  { message: Schema.String, userMessage: Schema.String },
) {}

export class InvalidCronExpression extends Schema.TaggedErrorClass<InvalidCronExpression>()(
  'InvalidCronExpression',
  {
    cron: Schema.String,
    message: Schema.String,
    userMessage: Schema.String,
  },
) {}

export class ScheduledTodoStorageError extends Schema.TaggedErrorClass<ScheduledTodoStorageError>()(
  'ScheduledTodoStorageError',
  {
    operation: ScheduledTodoOperation,
    message: Schema.String,
    userMessage: Schema.String,
  },
) {}

const ScheduledTodoError = Schema.Union([
  NotAuthenticated,
  InvalidCronExpression,
  ScheduledTodoStorageError,
])

export const scheduledTodos = GroupSpec.make('scheduledTodos')
  .addFunction(
    FunctionSpec.publicQuery({
      name: 'list',
      args: Schema.Struct({}),
      returns: Schema.Array(ScheduledTodos.Doc),
      error: ScheduledTodoError,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'create',
      args: Schema.Struct({ text: Schema.String, cron: Schema.String }),
      returns: GenericId.GenericId('scheduledTodos'),
      error: ScheduledTodoError,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'deleteScheduledTodo',
      args: Schema.Struct({ id: GenericId.GenericId('scheduledTodos') }),
      returns: Schema.OptionFromNullOr(GenericId.GenericId('scheduledTodos')),
      error: ScheduledTodoError,
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: 'run',
      args: Schema.Struct({ id: GenericId.GenericId('scheduledTodos') }),
      returns: Schema.Null,
      error: ScheduledTodoError,
    }),
  )
