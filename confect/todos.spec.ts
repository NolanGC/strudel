import { FunctionSpec, GenericId, GroupSpec } from '@confect/core'
import { Schema } from 'effect'

import { Todos } from './tables/todos'

export class NotAuthenticated extends Schema.TaggedErrorClass<NotAuthenticated>()(
  'NotAuthenticated',
  {},
) {}

export const todos = GroupSpec.make('todos')
  .addFunction(
    FunctionSpec.publicQuery({
      name: 'list',
      args: Schema.Struct({}),
      returns: Schema.Array(Todos.Doc),
      error: NotAuthenticated,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'create',
      args: Schema.Struct({ text: Schema.String }),
      returns: GenericId.GenericId('todos'),
      error: NotAuthenticated,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'deleteTodo',
      args: Schema.Struct({ id: GenericId.GenericId('todos') }),
      returns: Schema.Null,
      error: NotAuthenticated,
    }),
  )
