# AGENTS.md — Adding a new UI language to floor-plan-editor

Scope: this file only. This describes one task: adding a language to the
`settings.language` dropdown. It is not a user manual — see `/README.md`
(English) or `/README.zh-TW.md` (Traditional Chinese) for that; end users
never need this file.

## Constraints (read before editing)

- Zero build step, zero bundler, zero package manager. This is a static
  site opened directly as `index.html` (`file://`) or served as static
  files. All locale files are loaded via classic `<script>` tags, in
  document order, before `js/i18n.js` runs.
- There is no dynamic file discovery (`fetch()` of local files fails under
  `file://` CORS). A new language file MUST be registered with an explicit
  `<script>` tag in `index.html`. This is the one unavoidable manual edit.
- The language dropdown itself requires no edit — it is generated at
  runtime from `Object.keys(window.LOCALES)` (see `index.html`, the
  `<select v-model="appState.settings.language">` block). Do not add a
  `<option>` element by hand; it will not match the loaded-locale pattern
  other code expects and creates a state the UI can't reach.

## Procedure

1. Copy `locales/_template.js` to `locales/<BCP47-code>.js`.
   Use a real BCP 47 language tag as both the filename and the
   `window.LOCALES['<code>']` object key — e.g. `ja-JP`, `de-DE`, `fr-FR`.
   Look at `locales/en.js` (`en-US`) and `locales/zh-TW.js` (`zh-TW`) for
   the exact pattern.

2. Replace every `'TRANSLATE_ME: ...'` value with a real translation.
   Do not delete or rename keys, do not add new keys. `js/i18n.js`'s
   `t(key)` does a flat lookup with silent fallback to `en-US` — a missing
   key doesn't error, it just shows English text in the middle of the
   translated UI, which reads as a bug to an end user, not as a build
   failure to you. Translate all of them.

3. Set `_langName` to the language's own native name written in itself
   (e.g. `'日本語'`, `'Deutsch'`, `'Français'`) — NOT translated into
   English and NOT translated into whatever `en-US`/`zh-TW` would call it.
   This is the one key that is never run through `t()`; it is read directly
   by the dropdown so each language always names itself correctly no
   matter which language is currently active.

4. Register the file in `index.html`. Find this block (currently around
   line 500):
   ```html
   <script src="locales/en.js"></script>
   <script src="locales/zh-TW.js"></script>
   <script src="js/i18n.js"></script>
   ```
   Add your new `<script src="locales/<code>.js"></script>` line anywhere
   between the existing locale `<script>` lines and the `js/i18n.js` line.
   Order among locale files doesn't matter; all of them must load before
   `js/i18n.js` and `js/state.js`.

5. Do not touch anything else in `index.html`. No dropdown markup, no
   `settings.*` keys beyond what's already in the template — those were
   removed on purpose when the dropdown became dynamic.

## Validation (run all of these before calling it done)

```bash
node --check locales/<code>.js                        # syntax
grep -c TRANSLATE_ME locales/<code>.js                 # must print 0
diff <(grep -o "^  '[^']*'" locales/en.js | sort) \
     <(grep -o "^  '[^']*'" locales/<code>.js | sort)  # must print nothing — same key set as en.js
```

Then open `index.html` in a browser, open Settings, confirm the new
language appears in the dropdown under its own `_langName`, and switch to
it. Every visible string should change; any string still in English is
either a missed key or a real fallback bug — check `grep -c TRANSLATE_ME`
passed before assuming the latter.

## File format contract

- `window.LOCALES['<code>'] = { 'section.key': 'string', ... }` — flat map,
  no nesting, no ICU plural rules, no `{variable}` interpolation. `t(key)`
  is a plain object lookup (`js/i18n.js`); it does not support anything
  beyond a 1:1 string substitution.
- `_langName` is reserved (see step 3). Every other key must exist in
  `locales/_template.js` — that file is the authoritative key list, not
  this document. If `_template.js` and this file ever disagree, trust
  `_template.js` and, if you're a human maintainer, fix this file to match.
