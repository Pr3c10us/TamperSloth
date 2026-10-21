import type {SubmissionFormat} from "../../internals/domain/challenge";

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
    image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    video: ['.mp4', '.mpeg', '.webm', '.mov'],
    audio: ['.mp3', '.wav', '.ogg', '.m4a'],
}

export function isValidSubmissionType(
    fileExtensionOrMimeType: string,
    submissionFormats: SubmissionFormat[]
): boolean {
    const input = fileExtensionOrMimeType.toLowerCase()

    // Check if it's a mime type
    if (input.includes('/')) {
        const mimePrefix = input.split('/')[0]

        // Handle text/* and application/* mime types
        if (mimePrefix === 'text' || mimePrefix === 'application') {
            return submissionFormats.includes('text') || submissionFormats.includes('code')
        }

        // For other mime types, try to convert to extension
        const extension = mimeTypeToExtension(input)
        if (!extension) {
            return false
        }

        return submissionFormats.some(format =>
            ALLOWED_EXTENSIONS[format]?.includes(extension)
        )
    }

    // Handle file extensions
    let extension = input
    if (!extension.startsWith('.')) {
        extension = '.' + extension
    }

    return submissionFormats.some(format =>
        ALLOWED_EXTENSIONS[format]?.includes(extension)
    )
}

function mimeTypeToExtension(mimeType: string): string {
    const mimeMap: Record<string, string> = {
        // Images
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        // Videos
        'video/mp4': '.mp4',
        'video/mpeg': '.mpeg',
        'video/webm': '.webm',
        'video/quicktime': '.mov',
        // Audio
        'audio/mpeg': '.mp3',
        'audio/mp3': '.mp3',
        'audio/wav': '.wav',
        'audio/ogg': '.ogg',
        'audio/mp4': '.m4a',
    }

    return mimeMap[mimeType.toLowerCase()] || ''
}