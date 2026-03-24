---
sidebar_position: 6
---

# PDF Annotations

Highlight, underline, and annotate your PDFs directly in ScholarLib. Annotations are saved to your cloud storage and can be exported with your notes.

## Creating Annotations

### Text Highlights

1. Open a PDF document
2. Select text by clicking and dragging over it
3. A toolbar appears with options:
   - **Color picker** — Choose from 8 colors (yellow, red, green, blue, purple, orange, gray, cyan)
   - **Highlight button** — Create highlight with current color
   - **Note button** — Create highlight and immediately add a comment

:::tip Quick Highlighting
After selecting text, just click the highlight button to create a highlight with the current color. Change colors using the color picker.
:::

### Adding Comments to Highlights

1. Click on any existing highlight
2. A popover appears showing the highlighted text
3. Click the note area to add or edit your comment
4. Press **Enter** to save, or **Shift+Enter** for a new line
5. Click outside the popover to close it

### Annotation Colors

ScholarLib provides 8 annotation colors matching Zotero's palette:

| Color | Suggested Use |
|-------|---------------|
| **Yellow** | General highlights |
| **Red** | Important/critical points |
| **Green** | Methodology, positive findings |
| **Blue** | Definitions, concepts |
| **Purple** | Questions, things to follow up |
| **Orange** | Examples, data points |
| **Gray** | Background info, less important |
| **Cyan** | Quotes to cite |

:::info Personal System
Create your own color coding system! The colors are suggestions — use them however works best for your workflow.
:::

## Annotation Sidebar

Click the **highlighter icon** in the PDF toolbar to open the annotation sidebar. The sidebar shows:

- **All annotations** for the current document
- **Search** to find specific annotations
- **Filters** by type (highlight, underline, area, note) and color
- **Sorting** by page, date, or color

### Sidebar Actions

- **Click** an annotation to jump to its location in the PDF
- **Edit** comments directly in the sidebar
- **Change color** using the palette button
- **Delete** annotations with the trash icon

## Area Annotations

For figures, tables, or diagrams that can't be selected as text:

1. Click the **area selection** button in the toolbar
2. Drag a rectangle around the region
3. Add a comment to describe what you're highlighting
4. The selected area is captured as an image

:::note Coming Soon
Area selection mode is available but the toolbar button will be added in a future update. For now, text highlighting is the primary annotation method.
:::

## AI Integration

Your annotations enhance AI chat responses:

### How It Works

1. When you highlight text and add comments, they're indexed with the document
2. When you ask AI questions, your annotations provide additional context
3. The AI sees what you've marked as important and your notes

### Example

If you highlight "The degradation rate was 2.5% per year" and add the comment "Key finding for my thesis", the AI can reference this when you ask about degradation rates.

### Controlling AI Context

By default, all annotations are included in AI context. To exclude an annotation:

1. Click on the annotation
2. In the popover, find the AI settings
3. Toggle "Include in AI context" off

:::tip Research Workflow
Highlight key findings, methods, and conclusions as you read. When you later ask AI questions about the paper, it will prioritize your highlighted content.
:::

## Exporting Annotations

### With Notes Export

When you export notes for a document, you can include annotations:

1. Open the Notes panel
2. Click **Export**
3. Select format (Markdown, PDF, or Word)
4. Check "Include annotations"
5. Annotations appear as a "Highlights & Annotations" section

### Standalone Export

Export just annotations from the annotation sidebar:

1. Open the annotation sidebar
2. Click the **export** button
3. Choose format:
   - **Markdown** — Formatted text with quotes and comments
   - **JSON** — Full data for backup or transfer

### Export Format Example

```markdown
## Page 3

🖍️ **Highlight:**

> "The calendar aging model showed excellent agreement with experimental data"

**Note:**
Key validation result - cite this in methodology section

*Created: Mar 15, 2026 | Color: Yellow*
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Escape` | Cancel selection / Close popover |
| `Enter` | Save comment |
| `Shift+Enter` | New line in comment |

## Importing Annotations

When you import from Zotero, annotations embedded in your PDFs are automatically extracted:

1. During Zotero import, check "Extract PDF annotations"
2. All highlights, underlines, and notes from your PDFs are imported
3. Annotations appear in ScholarLib matching their original colors and positions

See [Importing from Zotero](/import) for more details.

## Tips & Best Practices

:::tip Effective Annotation Habits
1. **Be selective** — Don't highlight everything. Focus on key findings, methods, and conclusions.
2. **Add context** — Use comments to note WHY something is important, not just WHAT it says.
3. **Use colors consistently** — Develop a personal system (e.g., red for key findings, blue for definitions).
4. **Review regularly** — Use the sidebar to review your annotations before writing.
5. **Export before submitting** — Include your annotations when exporting notes for papers.
:::

## Syncing & Storage

- Annotations are saved to `_system/annotations.json` in your cloud storage
- Changes sync automatically with debounced auto-save (1 second delay)
- Annotations are tied to document IDs, so they persist even if you rename files
- When you switch documents, annotations save immediately
