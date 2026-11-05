# Image library

TamperSloth can keep images in the browser under a name, so the agent, saved scripts and pages on any site can use them later. Nothing is written to the device's file system as a file the user manages. Images live in the `tampersloth-images` IndexedDB database in the extension's origin (`src/storage/imageLibrary.ts`), which `unlimitedStorage` exempts from quota.

Not `chrome.storage`: storage listeners receive old and new values, which is what caused the out-of-memory crashes in [chat-storage.md](chat-storage.md). Not `@resource`: that inlines base64 into every injection. It is a database of its own so that its upgrades never wait on an open chat panel.

A name is up to 80 letters, numbers, dots, dashes or underscores; `My Cursor` becomes `my-cursor`. An image can be up to 20 MB once stored, and a source up to 64 MB if `maxSize` shrinks it.

## The agent's tool

`imageLibrary` loads when a request mentions an image, picture, photo, logo, icon, cursor, wallpaper or avatar, or through `enableTools` with `images`.

| Action | Does |
| --- | --- |
| `save` | Takes `name` and one source: `url` (http, https, blob, data), `selector` or `ref` of an element, `attachment` (a file sent in this chat), or `screenshot` (optionally cropped to `selector`). Optional `maxSize`, `format`, `description`, `replace`. |
| `list` | Metadata of everything saved. |
| `view` | Shows one image to the model (up to 1024 px), or an SVG's markup. |
| `rename`, `delete` | Manage names, and report which saved scripts ask for the old one. |
| `upload` | Hands an image to a page's file field, or drops it on an element, as a named file. |
| `copy` | Puts an image on the clipboard as a PNG. |

The extension reads the bytes itself and the model gets back a name and a small preview, so an image never travels through the model as text. The tool's schema has no way to pass bytes in; `dataUrl` exists only between the panel and the background.

Saving an element picks the best route it can:

1. `img`, `picture`, `input[type=image]` and CSS backgrounds give a URL. The background fetches it with cookies; if that fails, the page fetches it, which reaches what's tied to the page's own session.
2. `canvas`, `video` frames and inline `svg` are read in the page. `blob:` URLs are too, since they exist nowhere else.
3. A wrapper around exactly one of those means that one.
4. Anything else, or anything unreadable (a canvas with another site's pixels), is saved as a screenshot of the element, and the result says so.

The type comes from the bytes, not the server's label, so a sign-in page served in place of an image is refused. A saved `source` drops its query string, because signed URLs carry secrets.

## Scripts

```js
const image = await MH_getImage('logo'); // null if it's missing
image.dataUrl       // for cursor: url(), and CSS on sites without a strict policy
image.objectUrl()   // for <img> and JS: the safest way to show a picture
image.blob
await image.bitmap() // for <canvas>; not SVGs
image.file('logo.png') // for uploads
await MH_listImages() // metadata only
```

Also on the handle: `name`, `mimeType`, `width`, `height`, `size`, `description`. Each call transfers the whole image, so keep the handle rather than asking again.

| Where | How | Access |
| --- | --- | --- |
| Scripts the agent saved | `MH_getImage`, `MH_listImages` | Always; the user approved the script. |
| `executeContentScript`, ISOLATED `evaluateJavaScript` | The same | A session token, injected only into code that uses them. |
| MAIN `evaluateJavaScript` | Not available | The page's world can't message the extension, and giving it the token would give it to the page. Call from ISOLATED and pass `objectUrl()` across, or build the element in ISOLATED on a strict site: see below. |
| Installed userscripts | `GM_getImage`, `GM_listImages` (`GM.getImage`, `GM.listImages`) | Only with those `@grant` lines, which the install review shows as "Read the images you've saved in TamperSloth". Both worlds. |

A userscript can't use the `MH_` calls or the one-off token: it runs in its own world and is authenticated as itself.

### Page security rules

A site's Content Security Policy can block images, depending on the form and the world the code runs in. Measured with `data:` and `blob:` images on a page with `img-src 'self'`, in Chrome 141:

| Form | Script world (`USER_SCRIPT`) | Page world (`MAIN`) |
| --- | --- | --- |
| `<img>`, including in a shadow root | Loads | Blocked |
| CSS `background-image: url()`, from an inline style, `<style>` or adopted sheet | Blocked | Not run |
| `cursor: url()` with `dataUrl` | No violation raised | Blocked |
| `bitmap()` drawn on a `<canvas>` | Works | Not run |

So show pictures as a real `<img>`, using `object-fit` for a background-style crop, from a script's world. A canvas is the fallback, since drawing isn't a network load and the policy doesn't cover it.

These came from a throwaway test extension using the same world settings, not TamperSloth itself, and the default and named script worlds gave the same `<img>` and cursor results. The cursor row only shows that no violation was raised, because the test couldn't see the cursor being drawn. Chrome doesn't document any of this, so it could change.

## The library page

Gallery → Saved images (`/images`) lists everything, updates while the agent works (`BroadcastChannel`), and adds images from files, renames, downloads, deletes and copies the line a script needs.

## Moving between browsers

Nothing syncs, and uninstalling the extension deletes the library. Two ways to carry images:

- **A script's export** (`exportScript`, `exportAllScripts`) packs the images its code names literally, so `MH_getImage('logo')` is found and `MH_getImage(someVariable)` is not. Importing restores them.
- **Back up all images** on the library page writes one JSON file, and **Restore a backup** reads it.

Importing never overwrites: an image whose name is already taken stays as it is.

## Not included

Scripts can read the library but not write to it. Only the agent's tool and the library page add images, so a script can't replace an image that other scripts rely on. A script that needs to save its own output can use `GM_setValue` or `MH_setValue` for small values.

## Validation

`tests/image-library.test.mjs` runs the production modules against `fake-indexeddb` with mocked Chrome and canvas APIs. Browser-platform behavior is not established by it, including the clipboard document and real file fields, and the page security results above haven't been confirmed through TamperSloth itself. So it still needs a live smoke test on the unpacked extension: save from a URL, a page element and a screenshot; read an image from a saved script and a granted userscript on a strict site; upload to a file field; copy; and use the library page.
