import { Option } from 'effect'
import { Scene } from 'foldkit'
import { describe, test } from 'vitest'

import { AuthSignedIn, AuthSignedOut } from '../authService'
import * as AuthPanel from '../authPanel'
import {
  type Model,
  SendMagicLink,
  SentMagicLink,
  SignInWithGitHub,
  SignOut,
  SucceededSignOut,
  SucceededStartedGitHubSignIn,
  GotAuthPanelMessage,
  update,
  view,
} from '../main'
import { HomeRoute, TodosRoute } from '../route'
import * as TodosPage from '../todosPage'
import * as ScheduledTodosPage from '../page/scheduledTodos'
import * as ImageUploadsPage from '../page/imageUploads'

const signedOutTodosModel: Model = {
  route: TodosRoute(),
  authState: AuthSignedOut(),
  authPanel: AuthPanel.init(),
  todosPage: TodosPage.init(),
  scheduledTodosPage: ScheduledTodosPage.init(),
  imageUploadsPage: ImageUploadsPage.init(),
  maybeError: Option.none(),
}

const signedInTodosModel: Model = {
  ...signedOutTodosModel,
  authState: AuthSignedIn({ session: { displayName: 'Nolan' } }),
}

describe('auth scene', () => {
  test('landing page is public', () => {
    Scene.scene(
      { update, view },
      Scene.with({ ...signedOutTodosModel, route: HomeRoute() }),
      Scene.expect(Scene.role('heading', { name: 'todo' })).toExist(),
      Scene.expect(Scene.role('link', { name: 'View todos' })).toExist(),
    )
  })

  test('signed-out users see auth options on the protected todos route', () => {
    Scene.scene(
      { update, view },
      Scene.with(signedOutTodosModel),
      Scene.expect(Scene.role('heading', { name: 'Todo App' })).toExist(),
      Scene.expect(Scene.text('Sign in to view todos.')).toExist(),
      Scene.expect(
        Scene.role('button', { name: 'Continue with GitHub' }),
      ).toExist(),
      Scene.expect(Scene.label('Email')).toExist(),
    )
  })

  test('clicking GitHub sign-in starts the auth command', () => {
    Scene.scene(
      { update, view },
      Scene.with(signedOutTodosModel),
      Scene.click(Scene.role('button', { name: 'Continue with GitHub' })),
      Scene.Command.expectExact(SignInWithGitHub),
      Scene.Command.resolve(
        SignInWithGitHub,
        SucceededStartedGitHubSignIn(),
        message => GotAuthPanelMessage({ message }),
      ),
    )
  })

  test('submitting an email sends a magic link', () => {
    Scene.scene(
      { update, view },
      Scene.with(signedOutTodosModel),
      Scene.type(Scene.label('Email'), 'nolan@example.com'),
      Scene.submit(Scene.selector('form')),
      Scene.Command.expectExact(SendMagicLink),
      Scene.Command.resolve(
        SendMagicLink,
        SentMagicLink(),
        message => GotAuthPanelMessage({ message }),
      ),
      Scene.expect(
        Scene.text('Check your email for a sign-in link.'),
      ).toExist(),
    )
  })

  test('clicking sign out clears the protected todo view', () => {
    Scene.scene(
      { update, view },
      Scene.with(signedInTodosModel),
      Scene.click(Scene.role('button', { name: 'Sign out' })),
      Scene.Command.expectExact(SignOut),
      Scene.Command.resolve(SignOut, SucceededSignOut()),
      Scene.expect(Scene.text('Sign in to view todos.')).toExist(),
    )
  })
})
