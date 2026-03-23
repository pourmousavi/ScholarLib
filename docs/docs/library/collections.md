---
sidebar_position: 3
---

# Collections

Collections are **higher-level groupings of tags** that organize documents for a specific purpose or project. While tags group semantically similar documents, collections bring together documents you need for a particular task — like writing a paper, preparing a thesis chapter, or conducting a literature review.

## Understanding Collections vs Tags

The key difference is in their purpose and how they relate to documents:

:::info Tags: "What is this paper about?"
Tags describe the content or nature of a document. A paper tagged "Deep Learning" and "Computer Vision" belongs with other papers on those topics. Tags are semantic — they capture what documents have in common conceptually.
:::

:::info Collections: "What do I need this paper for?"
Collections gather documents for a specific goal. A "PhD Thesis Chapter 3" collection might include papers tagged "Battery Modeling", "State Estimation", and "Machine Learning" — not because these tags are related, but because you need all of them for that chapter.
:::

## How Collections Work

Collections contain **tags**, not documents directly. A document belongs to a collection if it has any of the collection's tags.

- Add tags to a collection to include all documents with those tags
- A single collection can contain multiple unrelated tags
- Documents automatically appear/disappear as tags are added/removed
- You can exclude specific documents from a collection even if they have matching tags

## Example: Writing a Paper

Imagine you're writing a paper on "Energy-Aware Machine Learning for IoT Devices":

1. You have tags: "Energy Efficiency", "Machine Learning", "IoT", "Edge Computing", "Surveys"
2. Create a collection: "Energy-ML-IoT Paper"
3. Add the relevant tags to this collection
4. Now you can:
   - Filter your library to see all papers for this project
   - Use AI Chat scoped to this collection to ask research questions
   - Share the collection with co-authors

## Creating Collections

1. Look for the **COLLECTIONS** section in the left sidebar
2. Click the **+** button next to "COLLECTIONS"
3. Enter a name and optional description
4. Select which tags to include in this collection
5. Click "Create Collection"

## Managing Collections

Right-click any collection to access options:

- **Edit collection** — Change name, description, color, or tags
- **Filter by this collection** — Show all documents in this collection
- **Share collection** — Make this collection visible to collaborators
- **Merge collections** — Combine multiple collections into one

## Excluding Documents

Sometimes a document has a matching tag but doesn't belong in a particular collection. You can exclude specific documents:

- Right-click a document → "Exclude from collection..."
- Select which collections to exclude it from
- The document keeps its tags but won't appear in that collection
- You can re-include the document later if needed

## Filtering by Collections

- **Single collection:** Click a collection to see all its documents
- **Multiple collections:** Hold Shift and click to select multiple
- **AND mode:** Show documents that appear in ALL selected collections
- **OR mode:** Show documents that appear in ANY selected collection

## Collections in AI Chat

Collections are especially powerful with AI Chat. Scope your questions to a collection to get answers based only on papers relevant to that project:

1. Click "Collections" in the AI Chat scope selector
2. Select one or more collections
3. Choose AND/OR mode for multiple collections
4. Your questions will only search documents in those collections

## Sharing Collections

Share entire collections with collaborators. When you share a collection, all documents in that collection become visible to the shared users:

1. Right-click a collection → "Share collection..."
2. Enter email addresses of collaborators
3. Choose permission level (view or edit)
4. Collaborators see the collection and can filter by it

## Comparison Table

| Feature | Tags | Collections |
|---------|------|-------------|
| Purpose | Categorize by content/topic | Organize for a project/task |
| Contains | Documents (directly) | Tags (documents indirectly) |
| Exclusions | No (all tagged docs included) | Yes (exclude specific docs) |
| Typical use | "ML", "Survey", "2024" | "Thesis Ch.3", "Grant Proposal" |
| Question answered | "What is this about?" | "What do I need this for?" |

## Tips for Using Collections

:::tip Best Practices
- Create a collection for each major writing project or research goal
- Name collections by their purpose: "Thesis Chapter 3", "Review Paper Draft", "Grant Literature"
- Use collections to scope AI Chat for project-specific research questions
- Share collections with co-authors working on the same project
- A collection can include tags that aren't related to each other — that's the point!
:::
