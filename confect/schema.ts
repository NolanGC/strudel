import { DatabaseSchema } from '@confect/server'
import { authTables } from '@convex-dev/auth/server'
import { defineSchema, type GenericSchema } from 'convex/server'

import { Todos } from './tables/todos'
import { ScheduledTodos } from './tables/scheduledTodos'

const schema = DatabaseSchema.make().addTable(Todos).addTable(ScheduledTodos)

export default Object.assign(
  Object.create(Object.getPrototypeOf(schema)),
  schema,
  {
    convexSchemaDefinition: defineSchema({
      // NOTE: Confect codegen loads this file from the nested confect package.
      // That gives Convex Auth and Confect separate private TableDefinition
      // declarations even though the runtime table definitions are compatible.
      // Keep the cast isolated to the external auth table boundary.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      ...(authTables as unknown as GenericSchema),
      todos: Todos.tableDefinition,
      scheduledTodos: ScheduledTodos.tableDefinition,
    }),
  },
)
