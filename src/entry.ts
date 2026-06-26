import { WebSocketClient } from '@confect/js'
import { Resource as OtelResource } from '@effect/opentelemetry/Resource'
import { BrowserKeyValueStore } from '@effect/platform-browser'
import { Layer } from 'effect'
import { Runtime } from 'foldkit'

import {
  AuthService,
  AuthServiceConvexAuthLive,
  AuthServiceTemplateLive,
} from './authService'
import {
  ChangedUrl,
  ClickedLink,
  Flags,
  Message,
  Model,
  init,
  makeFlags,
  makeTemplateFlags,
  subscriptions,
  update,
  view,
} from './main'
import {
  ScheduledTodosBackend,
  ScheduledTodosBackendLive,
} from './scheduledTodosBackend'
import { TelemetryLive, TelemetryStartupLive } from './telemetry'
import {
  ScheduledTodosBackendTemplateLive,
  TodosBackendTemplateLive,
} from './templateBackend'
import { TodosBackend, TodosBackendLive } from './todosBackend'

const convexUrl = import.meta.env.VITE_CONVEX_URL
const authMode =
  import.meta.env.VITE_AUTH_MODE ?? (convexUrl ? 'convex' : 'template')
const isTemplateAuthMode = authMode === 'template'

const requireConvexUrl = (): string => {
  if (!convexUrl) {
    throw new Error('VITE_CONVEX_URL is required to connect to Convex')
  }

  return convexUrl
}

const AuthLive = isTemplateAuthMode
  ? AuthServiceTemplateLive().pipe(
      Layer.provide(BrowserKeyValueStore.layerLocalStorage),
    )
  : AuthServiceConvexAuthLive({ convexUrl: requireConvexUrl() }).pipe(
      Layer.provide(BrowserKeyValueStore.layerLocalStorage),
    )
const InstrumentationLive = Layer.merge(TelemetryLive, TelemetryStartupLive)
const BackendLive = isTemplateAuthMode
  ? Layer.merge(TodosBackendTemplateLive, ScheduledTodosBackendTemplateLive)
  : Layer.merge(TodosBackendLive, ScheduledTodosBackendLive).pipe(
      Layer.provide(
        Layer.merge(AuthLive, WebSocketClient.layer(requireConvexUrl())),
      ),
    )

const program = Runtime.makeProgram<
  Model,
  Message,
  Flags,
  TodosBackend | AuthService | ScheduledTodosBackend | OtelResource
>({
  Model,
  Flags,
  flags: isTemplateAuthMode
    ? makeTemplateFlags()
    : makeFlags({ storageNamespace: requireConvexUrl() }),
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
    InstrumentationLive,
    Layer.merge(AuthLive, BackendLive),
  ),
  devTools: {
    Message,
  },
})

Runtime.run(program)
