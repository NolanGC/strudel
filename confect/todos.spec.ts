import { FunctionSpec, GenericId, GroupSpec } from '@confect/core'
import { Schema } from 'effect'

import { ImageUrl, TodoText, UploadUrl, UserId } from './domain'

const TodoId = GenericId.GenericId('todos')
const StorageId = GenericId.GenericId('_storage')

const TodoOperation = Schema.Literals([
  'ListTodos',
  'CreateTodo',
  'DeleteTodo',
  'GenerateTodoImageUploadUrl',
  'AttachTodoImage',
])

export const Todo = Schema.Struct({
  _id: TodoId,
  _creationTime: Schema.Number,
  ownerUserId: UserId,
  text: TodoText,
  imageStorageId: Schema.optional(StorageId),
  maybeImageUrl: Schema.OptionFromNullOr(ImageUrl),
})
export type Todo = typeof Todo.Type

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
      returns: Schema.Array(Todo),
      error: TodoError,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'create',
      args: Schema.Struct({ text: TodoText }),
      returns: TodoId,
      error: TodoError,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'deleteTodo',
      args: Schema.Struct({ id: TodoId }),
      returns: Schema.OptionFromNullOr(TodoId),
      error: TodoError,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'generateImageUploadUrl',
      args: Schema.Struct({}),
      returns: UploadUrl,
      error: TodoError,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: 'attachImage',
      args: Schema.Struct({ id: TodoId, storageId: StorageId }),
      returns: Schema.OptionFromNullOr(TodoId),
      error: TodoError,
    }),
  )
