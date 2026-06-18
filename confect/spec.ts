import { Spec } from '@confect/core'

import { auth } from './auth.spec'
import { scheduledTodos } from './scheduledTodos.spec'
import { todos } from './todos.spec'

export default Spec.make().add(auth).add(todos).add(scheduledTodos)
