# TODO

## Retest: dragging files of the Drive without tricks

Today a file of the Drive (Drivemu, Gallemu) dragged to the drop area of another app works only through two tricks:

- **Images:** an invisible `<img>` lies over the element (`assets/js/shared.js`). A drag of a real `<img>` is the only drag where Chrome gave the drop area a file.
- **Every other file, and the apps of other people** (such as EffectCraft and PhotoCraft in `artcraft/`): the main website (`app.js`, "a file of the Drive dragged to any app") gets the address of the file by a message from the app that drags, and gives every drag event that goes into a frame again with a real file in a new `DataTransfer`.

Why: in the test of 2026-11-20 (Chrome, real mouse drags), `dataTransfer.items.add(new File(...))` in `dragstart` did not reach the drop area; only `text/plain` came. MDN lists it as supported, and no source was found that says Chrome blocks it, so this is a result of a test and not a known fact.

To retest (a real drag with the mouse, from an item of the Drive to a drop area, with the file ready before the drag starts):

1. `items.add(File)` in `dragstart`, with `effectAllowed = "copy"` and with `"copyMove"`, and with the drop area setting `dropEffect`.
2. A `File` that comes from a handle of the File System Access API.
3. A newer Chrome, and the Chromium issue tracker for the cause.

If a file arrives at the drop area, delete the invisible `<img>` and the bridge in `app.js`, and let `transfer.drag` only add the file.
