/**
 * Parses PDF and DOCX files into plain text.
 * Uses dynamic imports so failures here don't crash the app at startup.
 */

const PDF_MIME = 'application/pdf'
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export type SupportedMimeType = typeof PDF_MIME | typeof DOCX_MIME

export function isSupportedMime(mime: string): mime is SupportedMimeType {
  return mime === PDF_MIME || mime === DOCX_MIME
}

export async function parseFileToText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === PDF_MIME) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const result = await pdfParse(buffer)
    return result.text.trim()
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
