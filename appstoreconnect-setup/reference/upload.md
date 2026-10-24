# Stage 8: the pictures and the video into App Store Connect

Two ways, and the owner chooses: through App Store Connect's API with an API key the owner keeps on their own disk
(section 3), which puts every set of screenshots, the header and the search-results video of every language in place
in one run; or by hand, in the browser, from a checklist (section 4). Either way the store's own preview is where the
owner sees each asset for the first time (section 5). Nothing is ever submitted to Apple in this stage.

## 1. Prepare

- Upload from `store/approved/<code>/`, the copies taken when the owner accepted each language (render and have
  accepted whatever is missing; `store/out/` is only where the renderers write). Every language of
  `store/store.config.json` has there:
  `frame-1.png` … `frame-<n>.png`, `header.png`, `search-video.mp4` (and `search-video-3840.mp4` if the large one was
  made), and a folder per further set of screenshots (`<code>/ipad/frame-1.png` …) for every other platform or display
  size the owner chose in stage 1.
- App previews, if the owner chose to record them: check each file against `specs.md` with `ffprobe` (size, length,
  frame rate) and list it under its language and display size.
- Check the files, not the logs: every picture has the size the store wants and no alpha channel, every video has the
  expected length and frame count (`ffprobe`), nothing is zero bytes, no language is missing a frame.
- By hand only: write `store/UPLOAD.md`, a checklist with one block per language, in the order of the language menu in App Store
  Connect, with the store's name of the language, the folder, the files in upload order, and the boxes to tick: one
  for each set of screenshots (named as App Store Connect names that platform and display size), header, video. Put the folder's full path there, so it can be pasted into the file dialog
  (in macOS: Shift-Command-G).

## 2. Ask which way

Say what each costs: the API needs a key once (a few minutes in App Store Connect, done by the owner) and then uploads
everything in one run; by hand is a file dialog per set and language (sets × languages × frames files). Record the
choice in `store/PROGRESS.md`.

## 3. Through the API, with the owner's key

**The owner's API key.** Once, by the owner, never through you:

1. App Store Connect → Users and Access → Integrations → App Store Connect API → Team Keys → "+". Any name; access
   **App Manager** (the asset library needs App Manager, Admin or Account Holder). Generate.
2. Download API Key (it can be downloaded once) gives `AuthKey_<KEY ID>.p8`. Move it out of every repository, readable
   by the owner only: `mkdir -p ~/.appstoreconnect/private_keys`, `mv ~/Downloads/AuthKey_*.p8
   ~/.appstoreconnect/private_keys/`, `chmod 600 ~/.appstoreconnect/private_keys/AuthKey_*.p8`.
3. A file `~/.appstoreconnect/<app>.env` with two lines, `ASC_KEY_ID=…` and `ASC_ISSUER_ID=…` (the Key ID beside the key,
   the Issuer ID above the list of keys), typed by the owner.
4. In `store/store.config.json`: `"connect": {"bundleId": "<the app's bundle ID>", "env": "~/.appstoreconnect/<app>.env"}`.

The key never enters the repository, the chat or an agent's brief: never open, print or copy the `.p8` or the `.env`,
and do not repeat the key ID or the issuer ID. `upload.mjs` reads them itself and signs its token in memory. If the
owner pastes a key into the conversation, tell them to revoke it in App Store Connect and make a new one.

**The run.**

1. The version is in "Prepare for Submission" (pictures can be placed only on a version still being prepared), and
   every language of the configuration has its localization there (stage 7 added them).
2. `node SKILL_DIR/tools/upload.mjs --check` reads the account and prints, per language and asset, the files, the
   specification App Store Connect will match them to, the placement type and group, and how many are there now and
   would be replaced. Nothing changes. Show it to the owner; a line that names a problem (a size Apple does not take,
   a missing localization) is fixed first.
3. On the owner's yes: one language as a trial, `node SKILL_DIR/tools/upload.mjs <source>`. The owner looks at that
   language on the version's page in App Store Connect. Then the rest, `node SKILL_DIR/tools/upload.mjs`, in the
   background: every file is uploaded and processed (videos take longest), the old placements of that group are
   removed, the new ones placed and put in order. A run that stops halfway is simply run again: what is already in
   the library is placed again, not uploaded again.
4. `--only frames,header,video` limits what goes up; `--frames`, `--header` and `--video` name other files
   (`{code}`, `{set}`, `{n}` in a pattern) when the approved copies live elsewhere.

What the tool does not do: submit anything, delete anything from the asset library, or touch another version, custom
product pages or in-app events. It works through App Store Connect's asset library, whose specifications and groups
it reads from Apple's reference data on every run; if a lookup fails, `node SKILL_DIR/tools/upload.mjs --ref` prints
the reference data's shape, and the files go up by hand meanwhile.

## 4. By hand

Tell the owner how, in their language, short:

1. App Store Connect → the app → the iOS version's page. Pick the language at the top of the page.
2. **Screenshots**: in the iPhone section, the display size the frames were rendered for; every further set in the
   section of its own platform and display size. Drag `frame-1.png` to
   `frame-<n>.png` in, then check their order on the page and drag them into place: the first ones are what search results show.
   If a set is already there, remove it first or the new ones are appended.
3. **Header** and **search-results video**: each has its own slot on the same page. Upload `header.png` and
   `search-video.mp4`. If the large video is refused, use the 1920 × 1280 one.
4. **Save**, then switch to the next language. A language with no pictures of its own shows the primary language's.
5. For each asset, open the preview App Store Connect offers and look at it on the iPhone layout.

A video takes a while to process after upload; a "processing" badge is normal.

## 5. Look at the previews together

Ask the owner to tell you (or to show you, in the pane) what the previews look like, at least for the source language,
one long-worded language and one right-to-left language if there is one:

- header: is the slogan whole, is anything under the back or share button;
- video: is any text or card cut, does the loop jump;
- screenshots: the right order, the first claim readable in the search-results layout.

What the preview crops is the only real measurement of the safe areas. If something is cut: fix it in the template or
the texts, render, compare the files that should not have changed with their approved copies
(`node SKILL_DIR/tools/compare.mjs`), replace the approved copy of the one that should, and have that file uploaded again. Record
the measured numbers in `store/store.config.json` (`header.visible`) and in `store/PROGRESS.md`, so the next render
warns about it.

## 6. Close

Update `store/CONNECT.md` ("Left for the owner": what remains is theirs alone: publishing the privacy answers,
testers, the submission) and `store/PROGRESS.md`. Then the last report: what is in the store's record now, what was
checked by whom, and what nobody has checked: texts read only by models, pictures in languages nobody previewed,
platforms and display sizes that got no set of their own and show a scaled one.
