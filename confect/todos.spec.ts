import { FunctionSpec, GenericId, GroupSpec } from '@confect/core'
import { Schema } from 'effect'

import { Todos } from './tables/todos'

const TodoOperation = Schema.Literals(['ListTodos', 'CreateTodo', 'DeleteTodo'])

export class NotAuthenticated extends Schema.TaggedErrorClass<NotAuthenticated>()(
  'NotAuthenticated',
  { message: Schema.String, userMessage: Schema.String },
) {}

export class TodoStorageError extends Schema.TaggedErrorClass<TodoStorageError>()(
  'TodoStorageError',
  {
    operation: TodoOperation,
    message: Schema.String,
    userMessage: Schema.String,
  },
) {}

const TodoError = Schema.Union([NotAuthenticated, TodoStorageError])

export const todos = GroupSpec.make('todos')
  .addFunction(
    FunctionSpec.publicQuery({
      name: 'list',
      args: Schema.Struct({}),
      returns: Schema.Array(Todos.Doc),
      error: TodoError,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'create',
      args: Schema.Struct({ text: Schema.String }),
      returns: GenericId.GenericId('todos'),
      error: TodoError,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'deleteTodo',
      args: Schema.Struct({ id: GenericId.GenericId('todos') }),
      returns: Schema.OptionFromNullOr(GenericId.GenericId('todos')),
      error: TodoError,
    }),
  )
