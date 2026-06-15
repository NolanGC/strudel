import { FunctionSpec, GroupSpec } from '@confect/core'

import type { isAuthenticated, signIn, signOut, store } from './authProvider'

export const auth = GroupSpec.make('auth')
  .addFunction(FunctionSpec.convexPublicAction<typeof signIn>()('signIn'))
  .addFunction(FunctionSpec.convexPublicAction<typeof signOut>()('signOut'))
  .addFunction(
    FunctionSpec.convexPublicQuery<typeof isAuthenticated>()('isAuthenticated'),
  )
  .addFunction(FunctionSpec.convexInternalMutation<typeof store>()('store'))
