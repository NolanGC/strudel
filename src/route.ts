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
export const ScheduledTodosRoute = r('ScheduledTodos')
export const ImageUploadsRoute = r('ImageUploads')
export const NotFoundRoute = r('NotFound', { path: S.String })

export const AppRoute = S.Union([
  HomeRoute,
  TodosRoute,
  ScheduledTodosRoute,
  ImageUploadsRoute,
  NotFoundRoute,
])
export type AppRoute = typeof AppRoute.Type

export const homeRouter = pipe(root, mapTo(HomeRoute))
export const todosRouter = pipe(literal('todos'), mapTo(TodosRoute))
export const scheduledTodosRouter = pipe(
  literal('scheduled-todos'),
  mapTo(ScheduledTodosRoute),
)
export const imageUploadsRouter = pipe(
  literal('image-uploads'),
  mapTo(ImageUploadsRoute),
)

export const urlToAppRoute = parseUrlWithFallback(
  oneOf(todosRouter, scheduledTodosRouter, imageUploadsRouter, homeRouter),
  NotFoundRoute,
)
