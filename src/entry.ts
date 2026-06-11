import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { ConvexTodos, makeConvexTodos } from './convexTodos'
import { Flags, Message, Model, flags, init, subscriptions, update, view } from './main'

const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!convexUrl) {
  throw new Error('VITE_CONVEX_URL is required to connect to Convex')
}

const program = Runtime.makeProgram<
  Model,
  Message,
  Flags,
  ConvexTodos
>({
  Model,
  Flags,
  flags,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  resources: Layer.succeed(ConvexTodos)(makeConvexTodos(convexUrl)),
  devTools: {
    Message,
  },
})

Runtime.run(program)
