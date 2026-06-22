# Urdown — اردو مارک ڈاؤن ایڈیٹر

> **Premium Urdu Markdown Editor** — Write, preview, and export Urdu & RTL content with a modern, responsive, mobile-first interface.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![AngularJS](https://img.shields.io/badge/AngularJS-1.8.3-E23237?logo=angular)](https://angularjs.org/)
[![Showdown](https://img.shields.io/badge/Showdown-2.1.0-744C9E)](https://github.com/showdownjs/showdown)
[![GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-222222?logo=github)](https://pages.github.com/)

---

## Overview

Urdown is a fully client-side, online Urdu markdown editor built with AngularJS. It provides a **premium, mobile-first editing experience** for right-to-left (RTL) languages like Urdu, with full support for left-to-right (LTR) content. Write markdown, see live preview, and export to HTML, PDF, or plain text — all in your browser with zero server dependencies.

### Key Features

| Feature | Description |
|---------|-------------|
| **Live Preview** | Real-time markdown rendering powered by Showdown.js |
| **RTL/LTR Support** | Native Urdu/Nastaliq font rendering with direction toggling |
| **Toolbar** | Bold, italic, headings, lists, code blocks, tables, links, images, and more |
| **Undo/Redo** | Full history stack (Ctrl+Z / Ctrl+Shift+Z) |
| **Search & Replace** | Find and replace across your entire document |
| **Auto-Save** | Automatic localStorage persistence with configurable toggle |
| **Statistics** | Word count, character count, reading time, headings, links, and more |
| **Focus Mode** | Distraction-free writing environment (F11) |
| **Scroll Sync** | Bidirectional scroll sync between editor and preview |
| **Split Pane** | Draggable resizer between editor and preview panels |
| **Drag & Drop** | Drop markdown files directly into the editor |
| **Export** | Download as `.md`, copy HTML, print to PDF |
| **Themes** | Light and dark modes with smooth CSS transitions |
| **Responsive** | Mobile-first design — works on phones, tablets, and desktops |
| **Keyboard Shortcuts** | Full shortcut reference modal (press `?`) |
| **Multi-language UI** | English and Urdu interface, easily extensible |

### CDN-Free Alternative

All external assets can be vendored for fully offline use. Currently loaded from CDN for zero-config deployment.

---

## Built With

- **[AngularJS 1.8.3](https://angularjs.org/)** — MVVM framework
- **[Showdown.js 2.1.0](https://github.com/showdownjs/showdown)** — Markdown-to-HTML converter
- **[ng-showdown](https://github.com/showdownjs/ng-showdown)** — AngularJS integration
- **[FileSaver.js](https://github.com/eligrey/FileSaver.js/)** — Client-side file download
- **[Inter](https://fonts.google.com/specimen/Inter)** — UI typography
- **[Noto Nastaliq Urdu](https://fonts.google.com/noto/specimen/Noto+Nastaliq+Urdu)** — Urdu script rendering

---

## Getting Started

### Quick Start

```bash
git clone https://github.com/yasinULLAH/Urdown.git
cd Urdown
# Serve with any HTTP server:
npx serve .
# or: python -m http.server
# or: php -S localhost:8000
```

Open `http://localhost:8000` in your browser.

### URL Parameters

Load content dynamically via URL hash:

```
https://yasinullah.github.io/Urdown/#?src=PATH_TO_MARKDOWN&editMode=true&nightMode=false&dir=rtl
```

| Param | Values | Default | Description |
|-------|--------|---------|-------------|
| `src` | URL | — | Load markdown from a URL |
| `editMode` | `true` / `false` | `true` | Start in edit or read mode |
| `nightMode` | `true` / `false` | `false` | Start with dark theme |
| `dir` | `rtl` / `ltr` | `rtl` | Text direction |

---

## Usage

### Editing
- Use the formatting toolbar or keyboard shortcuts to insert markdown syntax
- Switch between **Edit** and **Read** modes via the status bar toggle
- Enable **Focus Mode** (F11) for distraction-free writing

### File Operations
| Action | Shortcut | Description |
|--------|----------|-------------|
| New Document | `Ctrl+M` | Clear editor |
| Open File | `Ctrl+O` | Load from URL or local file |
| Save | `Ctrl+S` | Download as `.md` |
| Export PDF | `Ctrl+P` | Browser print-to-PDF |
| Show HTML | `Ctrl+H` | View rendered HTML source |
| Undo | `Ctrl+Z` | Undo last change |
| Redo | `Ctrl+Shift+Z` | Redo last change |
| Search | `Ctrl+F` | Find text in document |
| Toggle Edit | `Ctrl+E` | Switch edit/read mode |
| Toggle Night | `Ctrl+D` | Switch light/dark theme |
| Focus Mode | `F11` | Toggle distraction-free |
| Opposite Dir | `Ctrl+,` | Insert LTR-block within RTL |
| Help | `?` | Open keyboard shortcuts |

### RTL Text Blocks
Enclose English/LTR text in triple commas `,,,` to automatically render it in the opposite direction:

```
یہ اردو متن ہے۔
,,,
This English text will be LTR.
,,,
یہ دوبارہ اردو۔
```

### HugoWiki Shortcodes
```
{{% ltr %}}English text{{% \ltr %}}
{{% rtl %}}اردو متن{{% \rtl %}}
```

---

## Project Structure

```
Urdown/
├── index.html              # Single-page application entry
├── static/
│   ├── css/
│   │   ├── styles.css      # App styles (CSS custom properties, responsive)
│   │   └── output.css      # Preview/rendered markdown styles
│   ├── js/
│   │   └── urdown.js       # AngularJS controller & directives
│   ├── ui/
│   │   ├── english.json    # English UI strings
│   │   └── urdu.json       # Urdu UI strings
│   ├── img/                # Icons and favicon
│   └── placeholder.txt     # Default placeholder content
├── docs/                   # Documentation (English & Urdu)
├── README.md               # This file
└── .gitignore
```

---

## Contributing

Contributions are welcome! Areas you can help:

- **UI Translations** — Add a new language by copying `static/ui/english.json`, translating the strings, and registering it in `UILANGS` in `urdown.js`
- **Features** — Auto-scrolling, image paste, emoji picker, collaborative editing
- **Design** — Refinements to the responsive layout, animations, or theme system
- **Performance** — Optimization for large documents

---

## Credits

This project is a **complete modernization and enhancement** of the original [Urdown](https://github.com/hazrmard/Urdown) by [Hassan A. Z. Mardani](https://github.com/hazrmard).

> **Special thanks to the original author** — Hassan A. Z. Mardani — for creating the foundational concept of a web-based Urdu markdown editor. His work made this project possible.

The original version was a lightweight AngularJS + Showdown.js editor with essential RTL markdown capabilities. This fork adds:
- Premium responsive mobile-first UI with CSS custom properties theming
- Full formatting toolbar (bold, italic, headings, lists, code, tables, links, images, HR)
- Undo/redo history stack
- Search & replace functionality
- Word/character/reading-time statistics
- Auto-save with localStorage
- Focus/fullscreen mode
- Scroll-sync between editor and preview
- Drag-and-drop file loading
- Line numbers, word wrap toggle
- Settings panel (font size, line height, layout controls)
- Keyboard shortcuts reference modal
- Markdown help/cheatsheet modal
- Toast notification system
- Enhanced typography with Noto Nastaliq Urdu and Inter fonts
- Multi-language UI (English & Urdu)

---

## License

[MIT](LICENSE) — Original work by Hassan A. Z. Mardani. Modifications and enhancements by [yasinULLAH](https://github.com/yasinULLAH).
