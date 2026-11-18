/**
 * What the apps must be told when the disk changed. `change` is the event of
 * the real disk ({ paths, trash, external }); the result is what a remote copy
 * (system/sdk/remote-fs.js) takes with `apply()`: the changed folders with
 * everything below them, the folders that are gone, the Recycle Bin when it
 * changed, and the space used.
 */
export function updateFor(fs, change) {
  const update = { paths: change.paths ?? null, external: !!change.external, usage: fs.usage(), persistent: fs.persistent };
  if (!change.paths) {
    update.full = fs.snapshot();
    return update;
  }
  update.subtrees = [];
  update.removed = [];
  for (const path of new Set(change.paths)) {
    const tree = fs.subtree(path);
    if (tree) update.subtrees.push(tree);
    else update.removed.push(path);
  }
  if (change.trash) update.trash = fs.trashList(true);
  return update;
}
