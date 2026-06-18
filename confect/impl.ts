import { Impl } from '@confect/server'
import { Layer } from 'effect'

import api from './_generated/api'
import { auth } from './auth.impl'
import { scheduledTodos } from './scheduledTodos.impl'
import { todos } from './todos.impl'

export default Impl.make(api).pipe(
  Layer.provide(auth),
  Layer.provide(todos),
  Layer.provide(scheduledTodos),
  Impl.finalize,
)
