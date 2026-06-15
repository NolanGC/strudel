import { WebSocketClient } from '@confect/js'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import { AuthService, AuthServiceConvexAuthLive } from './authService'
import {
  ChangedUrl,
  ClickedLink,
  Flags,
  Message,
  Model,
  flags,
  init,
  subscriptions,
  update,
  view,
} from './main'
import { TodosBackend, TodosBackendLive } from './todosBackend'

const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!convexUrl) {
  throw new Error('VITE_CONVEX_URL is required to connect to Convex')
}

const AuthLive = AuthServiceConvexAuthLive({ convexUrl })

const program = Runtime.makeProgram<
  Model,
  Message,
  Flags,
  TodosBackend | AuthService
>({
  Model,
  Flags,
  flags,
  init,
  update,
  view,
  subscriptions,
  container: document.getElementById('root'),
  routing: {
    onUrlRequest: request => ClickedLink({ request }),
    onUrlChange: url => ChangedUrl({ url }),
  },
  resources: Layer.merge(
    AuthLive,
    TodosBackendLive.pipe(
      Layer.provide(Layer.merge(AuthLive, WebSocketClient.layer(convexUrl))),
    ),
  ),
  devTools: {
    Message,
  },
})

Runtime.run(program)
