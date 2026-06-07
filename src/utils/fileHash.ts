/**
 * Generate a SHA-256 hash from a file buffer
 * This creates a unique identifier for a file that remains constant
 * even if the file is renamed or moved to a different location.
 */
export async function generateDocumentId(fileBuffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
