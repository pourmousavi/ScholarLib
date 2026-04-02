# ScholarLib

A professional academic reference manager with AI-powered document Q&A. Built for researchers who want complete control over their data.

**Live App:** https://alipourmousavi.com/ScholarLib/

## Why ScholarLib?

- **Free** — No subscription fees, no storage costs
- **Private** — PDFs stored in your own cloud storage (Box/Dropbox), never on third-party servers
- **AI-powered** — Local AI via Ollama or WebLLM for document Q&A, with optional cloud API fallback
- **Cross-platform** — Works on Mac, Windows, and iPad via browser (PWA-installable)
- **Collaborative** — Share folders with students and colleagues

## Features

### Document Management
- PDF viewing with zoom, search, and navigation
- Folder organization with drag-and-drop
- Automatic metadata extraction (CrossRef, Semantic Scholar, AI)
- Tags, stars, and read/unread status

### AI Chat
- Ask questions about your documents
- Scope to single document, folder, or entire library
- Local AI options: Ollama (macOS/Linux) or WebLLM (browser-based)
- Cloud fallback: Claude or OpenAI APIs
- Chat history with export (Markdown, PDF, JSON)

### Notes & Export
- Rich text notes per document
- Export to Markdown, PDF, or DOCX
- Citation formatting

### Collaboration
- Share folders with granular permissions
- Activity dashboard showing who accessed what
- Works with university Box accounts

### PWA Support
- Install as a desktop/mobile app
- Works offline (with cached data)

## Getting Started

### For Users

1. Visit [https://alipourmousavi.com/ScholarLib/](https://alipourmousavi.com/ScholarLib/)
2. Connect your Box or Dropbox account
3. Upload PDFs and start organizing your library

### For Developers

```bash
# Clone the repository
git clone https://github.com/[username]/ScholarLib.git
cd ScholarLib

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Environment Variables

Create a `.env.local` file:

```
VITE_BOX_CLIENT_ID=your_box_app_client_id
VITE_BOX_REDIRECT_URI=https://yourusername.github.io/scholarlib/auth/box
VITE_DROPBOX_APP_KEY=your_dropbox_app_key
VITE_WORKER_URL=https://scholarlib-api.your-subdomain.workers.dev
VITE_APP_BASE_URL=https://yourusername.github.io/scholarlib
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + Vite |
| State | Zustand |
| PDF | PDF.js |
| Local AI | Ollama, WebLLM |
| Storage | Box API, Dropbox API |
| Backend | Cloudflare Workers |
| Hosting | GitHub Pages |

## Documentation

- [CLAUDE.md](CLAUDE.md) — Build guide for developers
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — System design
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — UI components and styling
- [docs/USER_SETUP.md](docs/USER_SETUP.md) — Setup instructions for end users
- [CHANGELOG.md](CHANGELOG.md) — Version history

## License

MIT License — see [LICENSE](LICENSE) for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

For detailed development instructions, see [CLAUDE.md](CLAUDE.md).
