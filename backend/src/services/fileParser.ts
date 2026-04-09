/**
 * Parses PDF and DOCX files into plain text.
 *
 * PDF: uses `unpdf` which is backed by the WASM build of PDF.js —
 *      no browser globals (DOMMatrix, Path2D, etc.) required.
 * DOCX: uses `mammoth`, lazy-loaded inside the function so it
 *       doesn't crash the process at startup if it fails to load.
 */

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type SupportedMimeType = typeof PDF_MIME | typeof DOCX_MIME

export function isSupportedMime(mime: string): mime is SupportedMimeType {
  return mime === PDF_MIME || mime === DOCX_MIME
}

export async function parseFileToText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === PDF_MIME) {
    const { extractText } = await import('unpdf')
    const { text } = await extractText(new Uint8Array(buffer), { mergePages: true })
    return text.trim()
  }

  if (mimeType === DOCX_MIME) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth') as {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>
    }
    const result = await mammoth.extractRawText({ buffer })
    return result.value.trim()
  }

  throw new Error(`Unsupported file type: ${mimeType}. Upload a PDF or DOCX file.`)
}
