import { Effect, Layer, Option, PubSub, Ref, Schema as S, Stream } from 'effect'
import { File as FoldkitFile } from 'foldkit'

import { EpochMillis, ImageUrl, TodoText, UserId } from '../confect/domain'
import {
  ScheduledTodo,
  ScheduledTodoId,
  ScheduledTodosBackend,
  ScheduledTodosBackendShape,
} from './scheduledTodosBackend'
import { Todo, TodoId, TodosBackend, TodosBackendShape } from './todosBackend'

const templateUserId = UserId.make('template-user')
const makeTodoId = S.decodeUnknownSync(TodoId)
const makeScheduledTodoId = S.decodeUnknownSync(ScheduledTodoId)
const makeEpochMillis = S.decodeUnknownSync(EpochMillis)
const makeImageUrl = S.decodeUnknownSync(ImageUrl)

const initialTodos: ReadonlyArray<Todo> = [
  {
    _id: makeTodoId('template-todo-1'),
    _creationTime: 1,
    ownerUserId: templateUserId,
    text: TodoText.make('Explore the starter app'),
    maybeImageUrl: Option.none(),
  },
  {
    _id: makeTodoId('template-todo-2'),
    _creationTime: 2,
    ownerUserId: templateUserId,
    text: TodoText.make('Replace template auth when deploying'),
    maybeImageUrl: Option.none(),
  },
]

const initialScheduledTodos: ReadonlyArray<ScheduledTodo> = []

const streamRefUpdates = <Value>(
  ref: Ref.Ref<ReadonlyArray<Value>>,
  pubsub: PubSub.PubSub<ReadonlyArray<Value>>,
): Stream.Stream<ReadonlyArray<Value>> =>
  Stream.concat(Stream.fromEffect(Ref.get(ref)), Stream.fromPubSub(pubsub))

const publish = <Value>(
  pubsub: PubSub.PubSub<ReadonlyArray<Value>>,
  values: ReadonlyArray<Value>,
): Effect.Effect<void> => PubSub.publish(pubsub, values).pipe(Effect.asVoid)

const localImageUrl = (file: FoldkitFile.File): ImageUrl =>
  makeImageUrl(globalThis.URL.createObjectURL(file))

export const TodosBackendTemplateLive = Layer.effect(
  TodosBackend,
  Effect.gen(function* () {
    const todosRef = yield* Ref.make(initialTodos)
    const todosPubSub = yield* PubSub.unbounded<ReadonlyArray<Todo>>()
    let nextId = initialTodos.length + 1

    const backend: TodosBackendShape = {
      todos: streamRefUpdates(todosRef, todosPubSub),
      create: Effect.fn('TodosBackend.templateCreate')((text: TodoText) =>
        Effect.gen(function* () {
          const id = makeTodoId(`template-todo-${nextId}`)
          nextId += 1

          const nextTodos = yield* Ref.updateAndGet(todosRef, todos => [
            ...todos,
            {
              _id: id,
              _creationTime: Date.now(),
              ownerUserId: templateUserId,
              text,
              maybeImageUrl: Option.none(),
            },
          ])

          yield* publish(todosPubSub, nextTodos)
          return id
        }),
      ),
      delete: Effect.fn('TodosBackend.templateDelete')((id: TodoId) =>
        Effect.gen(function* () {
          const todos = yield* Ref.get(todosRef)
          const exists = todos.some(todo => todo._id === id)

          if (!exists) {
            return Option.none()
          }

          const nextTodos = yield* Ref.updateAndGet(todosRef, todos =>
            todos.filter(todo => todo._id !== id),
          )

          yield* publish(todosPubSub, nextTodos)
          return Option.some(id)
        }),
      ),
      uploadImage: Effect.fn('TodosBackend.templateUploadImage')(
        (id: TodoId, file: FoldkitFile.File) =>
          Effect.gen(function* () {
            const todos = yield* Ref.get(todosRef)
            const exists = todos.some(todo => todo._id === id)

            if (!exists) {
              return Option.none()
            }

            const imageUrl = localImageUrl(file)
            const nextTodos = yield* Ref.updateAndGet(todosRef, todos =>
              todos.map(todo =>
                todo._id === id
                  ? { ...todo, maybeImageUrl: Option.some(imageUrl) }
                  : todo,
              ),
            )

            yield* publish(todosPubSub, nextTodos)
            return Option.some(id)
          }),
      ),
    }

    return backend
  }),
)

export const ScheduledTodosBackendTemplateLive = Layer.effect(
  ScheduledTodosBackend,
  Effect.gen(function* () {
    const scheduledTodosRef = yield* Ref.make(initialScheduledTodos)
    const scheduledTodosPubSub =
      yield* PubSub.unbounded<ReadonlyArray<ScheduledTodo>>()
    let nextId = initialScheduledTodos.length + 1

    const backend: ScheduledTodosBackendShape = {
      scheduledTodos: streamRefUpdates(scheduledTodosRef, scheduledTodosPubSub),
      create: Effect.fn('ScheduledTodosBackend.templateCreate')(
        ({ text, cron }) =>
          Effect.gen(function* () {
            const id = makeScheduledTodoId(`template-scheduled-todo-${nextId}`)
            nextId += 1

            const nextScheduledTodos = yield* Ref.updateAndGet(
              scheduledTodosRef,
              scheduledTodos => [
                ...scheduledTodos,
                {
                  _id: id,
                  _creationTime: Date.now(),
                  ownerUserId: templateUserId,
                  text,
                  cron,
                  nextRunAt: makeEpochMillis(Date.now()),
                },
              ],
            )

            yield* publish(scheduledTodosPubSub, nextScheduledTodos)
            return id
          }),
      ),
      delete: Effect.fn('ScheduledTodosBackend.templateDelete')(
        (id: ScheduledTodoId) =>
          Effect.gen(function* () {
            const scheduledTodos = yield* Ref.get(scheduledTodosRef)
            const exists = scheduledTodos.some(todo => todo._id === id)

            if (!exists) {
              return Option.none()
            }

            const nextScheduledTodos = yield* Ref.updateAndGet(
              scheduledTodosRef,
              scheduledTodos => scheduledTodos.filter(todo => todo._id !== id),
            )

            yield* publish(scheduledTodosPubSub, nextScheduledTodos)
            return Option.some(id)
          }),
      ),
    }

    return backend
  }),
)
