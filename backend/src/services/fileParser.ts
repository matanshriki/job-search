/**
 * Parses PDF and DOCX files into plain text.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mammoth = require('mammoth') as {
  extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>
}

export type SupportedMimeType = 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function isSupportedMime(mime: string): mime is SupportedMimeType {
  return mime === 'application/pdf' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

export async function parseFileToText(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') {
    const result = await pdfParse(buffer)
    return result.text.trim()
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value.trim()
  }

  throw new Error(`Unsupported file type: ${mimeType}. Upload a PDF or DOCX file.`)
}
