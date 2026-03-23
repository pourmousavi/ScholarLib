---
sidebar_position: 1
---

# Storage Setup

ScholarLib stores all your PDFs and data in your personal cloud storage account. This ensures your research stays private and under your control.

## Supported Providers

### Dropbox

Works with free and paid accounts. Recommended for most users.

### Box

Ideal for university accounts with unlimited storage.

## How to Connect

1. On first launch, click "Connect Dropbox" or "Connect Box"
2. Sign in to your cloud account when prompted
3. Authorize ScholarLib to access a dedicated folder
4. Your library data will be stored in `/Apps/ScholarLib/`

## Data Structure

ScholarLib creates the following structure in your cloud storage:

```
/Apps/ScholarLib/
├── library.json        # Your library metadata
├── _system/
│   ├── settings.json   # App settings
│   ├── index.json      # Search index
│   └── chat_history.json
└── [Your Folders]/
    └── [Your PDFs]
```

## Switching Storage

To switch providers, go to **Settings → Storage → Disconnect**, then reconnect with a different account.

:::info
For a detailed guide on migrating your entire library to a new provider, see [Switching Providers](/storage/migration).
:::
