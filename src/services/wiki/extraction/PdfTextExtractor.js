import { hashMarkdown } from '../WikiHash'

async function blobToArrayBuffer(blob) {
  if (blob.arrayBuffer) return blob.arrayBuffer()
  return new Response(blob).arrayBuffer()
}

export class PdfTextExtractor {
  async extractPdf(adapter, pdfPath) {
    const blob = await adapter.downloadFile(pdfPath)
    const buffer = await blobToArrayBuffer(blob)
    const pdfjs = await import('pdfjs-dist')
    const pdf = await pdfjs.getDocument({ data: buffer }).promise
    const pages = []

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const text = content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ').trim()
      pages.push({
        index: i - 1,
        text,
        page_text_hash: await hashMarkdown(text),
      })
    }

    const totalText = pages.reduce((sum, page) => sum + page.text.length, 0)
    const ocrWarnings = []
    if (totalText < Math.max(500, pdf.numPages * 120)) {
      ocrWarnings.push('low_text_density')
    }

    return {
      pages,
      extraction_version: `pdfjs-${pdfjs.version || 'unknown'}`,
      extraction_confidence: ocrWarnings.length ? 0.7 : 0.95,
      ocr_warnings: ocrWarnings,
    }
  }
}
