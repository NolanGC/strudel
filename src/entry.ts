import { WebSocketClient } from '@confect/js'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { Flags, Message, Model, flags, init, subscriptions, update, view } from './main'
import { TodosBackend, TodosBackendLive } from './todosBackend'

const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!convexUrl) {
  throw new Error('VITE_CONVEX_URL is required to connect to Convex')
}

const program = Runtime.makeProgram<
  Model,
  Message,
  Flags,
  TodosBackend
>({
  Model,
  Flags,
  flags,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  resources: TodosBackendLive.pipe(
    Layer.provide(WebSocketClient.layer(convexUrl)),
  ),
  devTools: {
    Message,
  },
})

Runtime.run(program)
