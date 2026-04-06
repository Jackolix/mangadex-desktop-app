# MangaDex Desktop

A desktop app for browsing, reading, and downloading manga from MangaDex.

Built with Tauri v2 (Rust), Svelte 5, and TailwindCSS v4.

---

<!-- Screenshots -->
<!-- Add screenshots to a `screenshots/` folder and update the paths below -->
<!--
![Browse](screenshots/browse.png)
![Reader](screenshots/reader.png)
![Library](screenshots/library.png)
-->

## Features

- Browse and search manga with filters (genre, status, content rating)
- Read chapters online with single-page, double-page, and long-strip modes
- Zoom to cursor with Ctrl+Scroll, pan by drag
- Download chapters for offline reading
- Export to epub
- Library with bookmarks and reading progress tracking
- Continue reading from where you left off
- MangaDex account login

## Tech Stack

- **Frontend**: Svelte 5 (runes), SvelteKit (SPA mode), TailwindCSS v4
- **Backend**: Tauri v2 (Rust)
- **Storage**: SQLite via tauri-plugin-sql, tauri-plugin-store for settings/auth
- **API**: MangaDex public REST API

## Development

**Prerequisites**: Node.js, pnpm, Rust, Tauri CLI

```bash
pnpm install
pnpm tauri dev
```

**Build:**

```bash
pnpm tauri build
```

## Login

MangaDex login requires a personal API client. You can create one at [mangadex.org/settings](https://mangadex.org/settings) under the API clients section. Enter your username, password, client ID, and client secret in the Settings page of the app.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

[MIT](LICENSE)
