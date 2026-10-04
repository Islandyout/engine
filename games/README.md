# Games

Every folder here is one game. The build (`tools/build_editor.sh`, which runs
`tools/build_games.mjs`) publishes each one as `<folder>.html` next to the
editor and lists it in the editor's **Games** library.

## Adding your own game

1. In the editor, build your scene and press **Save** (or use **Games → Save
   current scene to My games**, then **Download**). You get a `scene.json`.
2. Make a folder here, e.g. `games/my-games/star-runner/` or `games/star-runner/`.
3. Put `scene.json` in it with a `game.json` next to it:

```json
{
  "name": "Star Runner",
  "genre": "Arcade",
  "description": "One line about the game.",
  "scene": "scene.json",
  "accent": "#8ab4ff"
}
```

`scene` is a path relative to the `game.json`. `accent` (card colour),
`genre` and `description` are optional. Folders are found at any depth, so
`games/my-games/` is a good place to keep the ones you make yourself; the
library groups them under **My games**.

Games you save from the editor without committing them stay in your browser
(the library's **In this browser** section) until you download them.
