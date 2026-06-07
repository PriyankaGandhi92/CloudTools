import { useState } from 'react';
import { useStore } from '../store/useStore';
import { executeCloudCommand } from '../utils/stirlingApi';
import { validatePdfReplacement } from '../utils/pdfCompatibility';

export function useCloudCommands() {
  const { pdfData, setPdfData, annotations, setAnnotations } = useStore();
  const [cloudStatus, setCloudStatus] = useState<string | null>(null);

  const processCommand = async (commandString: string) => {
    // 1. Parse command: CLOUD:COMPRESS scope=document lang=eng
    const regex = /(?:[^\s"]+|"[^"]*")+/g; // Matches words or quoted strings
    const tokens = commandString.match(regex)?.map(t => t.replace(/(^"|"$)/g, '')) || [];
    
    if (tokens[0].toUpperCase() !== 'CLOUD' || tokens.length < 2) return;
    
    // Parse operation from CLOUD:OPERATION format
    const operationParts = tokens[1].split(':');
    const operation = operationParts.length > 1 ? operationParts[1] : operationParts[0];
    
    const params: Record<string, string> = {};
    
    // Parse key=value arguments
    for (let i = 2; i < tokens.length; i++) {
      const [key, val] = tokens[i].split('=');
      if (key && val) params[key.toLowerCase()] = val;
    }

    if (!pdfData) return setCloudStatus("Error: No PDF loaded.");

    // 2. Execute
    setCloudStatus(`Executing ${operation}...`);
    const response = await executeCloudCommand(operation, pdfData, params);

    if (!response.success || !response.data) {
      return setCloudStatus(`Failed: ${response.error}`);
    }

    // 3. Handle File Downloads (Word/HTML)
    if (response.isConversion) {
      const blob = response.data as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Converted_${operation}.file`;
      a.click();
      URL.revokeObjectURL(url);
      return setCloudStatus(`${operation} downloaded successfully.`);
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
      }
    } else {
      // Safe replacement (e.g., Redaction or Compression didn't change layout)
      setPdfData(newPdfBuffer);
    }

    setCloudStatus(`${operation} applied successfully.`);
  };

  return { processCommand, cloudStatus };
}
