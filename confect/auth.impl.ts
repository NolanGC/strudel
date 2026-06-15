import { FunctionImpl, GroupImpl } from '@confect/server'
import { Layer } from 'effect'

import api from './_generated/api'
import { isAuthenticated, signIn, signOut, store } from './authProvider'

const signInImpl = FunctionImpl.make(api, 'auth', 'signIn', signIn)
const signOutImpl = FunctionImpl.make(api, 'auth', 'signOut', signOut)
const isAuthenticatedImpl = FunctionImpl.make(
  api,
  'auth',
  'isAuthenticated',
  isAuthenticated,
)
const storeImpl = FunctionImpl.make(api, 'auth', 'store', store)

export const auth = GroupImpl.make(api, 'auth').pipe(
  Layer.provide(signInImpl),
  Layer.provide(signOutImpl),
  Layer.provide(isAuthenticatedImpl),
  Layer.provide(storeImpl),
)
