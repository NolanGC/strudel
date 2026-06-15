import { Schema as S, pipe } from 'effect'
import {
  literal,
  mapTo,
  oneOf,
  parseUrlWithFallback,
  r,
  root,
} from 'foldkit/route'

export const HomeRoute = r('Home')
export const TodosRoute = r('Todos')
export const NotFoundRoute = r('NotFound', { path: S.String })

export const AppRoute = S.Union([HomeRoute, TodosRoute, NotFoundRoute])
export type AppRoute = typeof AppRoute.Type

export const homeRouter = pipe(root, mapTo(HomeRoute))
export const todosRouter = pipe(literal('todos'), mapTo(TodosRoute))

export const urlToAppRoute = parseUrlWithFallback(
  oneOf(todosRouter, homeRouter),
  NotFoundRoute,
)
