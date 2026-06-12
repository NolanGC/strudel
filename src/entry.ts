import { Runtime } from 'foldkit'

import { ConvexClient, makeConvexClientLayer } from './convexClient'
import { Flags, Message, Model, flags, init, subscriptions, update, view } from './main'

const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!convexUrl) {
  throw new Error('VITE_CONVEX_URL is required to connect to Convex')
}

const program = Runtime.makeProgram<
  Model,
  Message,
  Flags,
  ConvexClient
>({
  Model,
  Flags,
  flags,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  resources: makeConvexClientLayer(convexUrl),
  devTools: {
    Message,
  },
})

Runtime.run(program)
