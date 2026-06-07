import { PDFDocument } from 'pdf-lib';
import type { Annotation } from '../types';

export async function validatePdfReplacement(
  oldPdfBuffer: ArrayBuffer,
  newPdfBuffer: ArrayBuffer,
  currentAnnotations: Annotation[]
): Promise<{ compatible: boolean; warnings: string[]; action: 'replace' | 'clear-annotations' | 'warn' }> {
  
  if (currentAnnotations.length === 0) {
    return { compatible: true, warnings: [], action: 'replace' };
  }

  const oldDoc = await PDFDocument.load(oldPdfBuffer, { ignoreEncryption: true });
  const newDoc = await PDFDocument.load(newPdfBuffer, { ignoreEncryption: true });

  const warnings: string[] = [];
  let action: 'replace' | 'clear-annotations' | 'warn' = 'replace';

  // 1. Check Page Count mismatch
  const oldPageCount = oldDoc.getPageCount();
  const newPageCount = newDoc.getPageCount();
  
  if (oldPageCount !== newPageCount) {
    warnings.push(`Page count changed from ${oldPageCount} to ${newPageCount}.`);
    action = 'warn';
  }

  // 2. Check Physical Dimensions of all pages
  const pageCountToCheck = Math.min(oldPageCount, newPageCount);
  
  for (let i = 0; i < pageCountToCheck; i++) {
    const oldPage = oldDoc.getPage(i);
    const newPage = newDoc.getPage(i);
    
    const oldSize = oldPage.getSize();
    const newSize = newPage.getSize();

    // Allow a 1-point margin of error for rounding differences in different PDF engines
    if (Math.abs(oldSize.width - newSize.width) > 1 || Math.abs(oldSize.height - newSize.height) > 1) {
      warnings.push(`Page ${i + 1} dimensions changed from ${oldSize.width.toFixed(1)}x${oldSize.height.toFixed(1)} to ${newSize.width.toFixed(1)}x${newSize.height.toFixed(1)}. Annotations may be misaligned.`);
      action = 'warn';
    }
  }

  return {
    compatible: warnings.length === 0,
    warnings,
    action
  };
}
