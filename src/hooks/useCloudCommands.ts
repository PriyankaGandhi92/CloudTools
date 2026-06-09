import { PDFDocument } from 'pdf-lib';
import { useStore } from '../store/useStore';
import { executeCloudCommand } from '../utils/stirlingApi';
import { validatePdfReplacement } from '../utils/pdfCompatibility';
import { parsePageRange, extractPages } from '../utils/pdfPageRange';

export function useCloudCommands() {
  const { pdfData, setPdfData, annotations, setAnnotations, setCloudStatus } = useStore();

  const processCommand = async (commandString: string) => {
    // 1. Parse command. Supports both forms:
    //    - "CLOUD:TO-HTML param=x"  (colon-joined, from autocomplete)
    //    - "CLOUD TO-HTML param=x"  (space-separated)
    const regex = /(?:[^\s"]+|"[^"]*")+/g; // Matches words or quoted strings
    const tokens = commandString.match(regex)?.map(t => t.replace(/(^"|"$)/g, '')) || [];

    if (tokens.length === 0) return;

    let operation: string;
    let paramStartIndex: number;
    const first = tokens[0].toUpperCase();

    if (first.startsWith('CLOUD:')) {
      // Combined token e.g. "CLOUD:TO-HTML"
      operation = tokens[0].split(':')[1] || '';
      paramStartIndex = 1;
    } else if (first === 'CLOUD') {
      if (tokens.length < 2) {
        setCloudStatus('Error: No cloud operation specified.');
        setTimeout(() => setCloudStatus(null), 4000);
        return;
      }
      // Second token may itself be ":TO-HTML" or "TO-HTML"
      const operationParts = tokens[1].split(':');
      operation = operationParts.length > 1 ? operationParts[1] : operationParts[0];
      paramStartIndex = 2;
    } else {
      // Not a cloud command
      return;
    }

    if (!operation) {
      setCloudStatus('Error: No cloud operation specified.');
      setTimeout(() => setCloudStatus(null), 4000);
      return;
    }

    const params: Record<string, string> = {};

    // Parse key=value arguments
    for (let i = paramStartIndex; i < tokens.length; i++) {
      const [key, val] = tokens[i].split('=');
      if (key && val) params[key.toLowerCase()] = val;
    }

    if (!pdfData) return setCloudStatus("Error: No PDF loaded.");

    // 1b. Optional page-range subset (e.g. pages=1-10). Lets users convert part
    // of a large PDF to stay under the cloud request/timeout limits.
    let inputPdf: ArrayBuffer = pdfData;
    const pagesParam = params['pages'] || params['range'];
    if (pagesParam) {
      try {
        const srcDoc = await PDFDocument.load(pdfData);
        const totalPages = srcDoc.getPageCount();
        const indices = parsePageRange(pagesParam, totalPages);
        if (!indices || indices.length === 0) {
          setCloudStatus(`Error: Invalid page range "${pagesParam}" (document has ${totalPages} pages).`);
          setTimeout(() => setCloudStatus(null), 5000);
          return;
        }
        setCloudStatus(`Extracting ${indices.length} page(s) for ${operation}...`);
        inputPdf = await extractPages(pdfData, indices);
      } catch (err) {
        setCloudStatus(`Error: Failed to extract page range. ${err instanceof Error ? err.message : ''}`);
        setTimeout(() => setCloudStatus(null), 5000);
        return;
      }
    }

    // 2. Execute
    const scopeLabel = pagesParam ? `${operation} (pages ${pagesParam})` : operation;
    setCloudStatus(`Executing ${scopeLabel}...`);
    const response = await executeCloudCommand(operation, inputPdf, params);

    if (!response.success || !response.data) {
      setCloudStatus(`Failed: ${response.error}`);
      // Auto-clear error after 5 seconds
      setTimeout(() => setCloudStatus(null), 5000);
      return;
    }

    // 3. Handle File Downloads (Word/HTML/PPT)
    if (response.isConversion) {
      const extMap: Record<string, string> = {
        'TO-WORD': 'docx',
        'TO-PPT': 'pptx',
        'TO-HTML': 'zip',
      };
      const ext = extMap[operation.toUpperCase()] || 'file';
      const blob = response.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Converted_${operation}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setCloudStatus(`${operation} downloaded successfully.`);
      // Auto-clear success after 4 seconds
      setTimeout(() => setCloudStatus(null), 4000);
      return;
    }

    // 4. Handle PDF Replacement & Safety Validation
    const newPdfBuffer = response.data as ArrayBuffer;
    setCloudStatus('Validating structure compatibility...');

    const validation = await validatePdfReplacement(pdfData, newPdfBuffer, annotations);

    if (validation.action === 'warn') {
      const userProceeds = window.confirm(
        `Warning: ${validation.warnings.join(' ')}\n\nDo you want to clear your current annotations to apply this update safely?`
      );
      if (userProceeds) {
        setAnnotations([]); // Clear unsafe annotations
        setPdfData(newPdfBuffer);
      } else {
        setCloudStatus(`${operation} cancelled by user.`);
        setTimeout(() => setCloudStatus(null), 3000);
        return;
      }
    } else {
      // Safe replacement (e.g., Redaction or Compression didn't change layout)
      setPdfData(newPdfBuffer);
    }

    setCloudStatus(`${operation} applied successfully.`);
    // Auto-clear success after 4 seconds
    setTimeout(() => setCloudStatus(null), 4000);
  };

  return { processCommand };
}
