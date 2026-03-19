# Changelog

All notable changes to ScholarLib will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-XX

### Added

#### Core Features
- Three-panel layout with collapsible sidebar and document list
- Folder tree navigation with drag-and-drop organization
- Document library management with metadata display
- PDF viewer powered by PDF.js with zoom, search, and navigation

#### Storage Integration
- Box cloud storage adapter with OAuth authentication
- Dropbox cloud storage adapter (alternative)
- Demo mode for trying the app without storage setup
- Library data persistence in JSON format

#### Metadata Extraction
- Automatic metadata extraction from PDF content
- CrossRef API integration for DOI lookup
- Semantic Scholar API for academic paper metadata
- AI-powered metadata extraction fallback
- Metadata review and editing modal

#### AI Chat
- Ollama integration for local AI (private, free)
- WebLLM browser-based AI (works offline)
- Claude API support (cloud fallback)
- OpenAI API support (cloud fallback)
- Document-scoped Q&A with RAG
- Folder and library-wide search scope
- Chat history persistence and export

#### Notes & Export
- Rich text notes editor per document
- Export notes to Markdown, PDF, DOCX
- Chat export in multiple formats (MD, TXT, HTML, JSON, PDF)

#### Collaboration
- Share folders with collaborators
- Permission levels: viewer, annotator, contributor
- Activity dashboard with access logging
- Cloudflare Worker backend for sharing management

#### Settings
- AI provider configuration
- Storage management
- Metadata extraction preferences
- Theme selection (dark/light)
- Export preferences

#### PWA Support
- Installable on Mac, Windows, iPad
- Service worker for offline capability
- Graceful offline degradation
- iOS Safari install instructions

#### Accessibility
- Keyboard navigation support
- ARIA labels on interactive elements
- Reduced motion support
- Focus management for modals

### Security
- API keys stored locally only (never synced)
- All PDFs stored in user's own cloud storage
- No third-party servers for document storage
- Activity logging with 90-day retention

---

## Development

This project was built following a 17-stage development guide. Each stage is documented in `docs/stages/`.

For development instructions, see [CLAUDE.md](./CLAUDE.md).
