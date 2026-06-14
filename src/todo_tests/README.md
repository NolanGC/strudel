# Todo Tests

This folder groups the todo feature tests by Foldkit testing layer:

- `todo.update.story.test.ts` covers the pure `update` state machine with
  `Story.story`.
- `todo.scene.test.ts` covers rendered UI, user paths, and visible error states
  with `Scene.scene`.
- `todo.command.test.ts` covers command execution against a mocked
  `TodosBackend` Effect layer.

Use this pattern for new app-builder features: keep the feature implementation
in the normal source modules, then create a sibling `*_tests` folder that names
tests by behavior layer rather than by implementation file.
