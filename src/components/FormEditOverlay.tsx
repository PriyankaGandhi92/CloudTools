import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { FormField } from '../store/useStore';
import { getDocumentForPage } from '../utils/pdfRenderer';

interface LocalFormField extends FormField {
  canvasRect?: { left: number; top: number; width: number; height: number };
}

interface FormEditOverlayProps {
  pageIndex: number;
  scale: number;
  containerRef: React.RefObject<HTMLDivElement>;
  pdfSize: { width: number; height: number };
  panOffset: { x: number; y: number };
}

export default function FormEditOverlay({
  pageIndex,
  scale,
  containerRef,
  pdfSize,
  panOffset,
}: FormEditOverlayProps) {
  const { formEditMode, setFormFields, updateFormFieldValue, formFields } = useStore();
  const [pageFields, setPageFields] = useState<LocalFormField[]>([]);
  const formFieldsRef = useRef(formFields);

  const extractStringValue = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && 'displayValue' in value) return String(value.displayValue);
    if (typeof value === 'object' && 'exportValue' in value) return String(value.exportValue);
    return String(value);
  };

  useEffect(() => {
    formFieldsRef.current = formFields;
  }, [formFields]);

  // DEBUG: Track Render Updates
  useEffect(() => {
    if (formEditMode && pageFields.length > 0) {
      console.log('[FORM DEBUG] Render Cycle Updated:', {
        scale,
        panOffset,
        pdfSize
      });
    }
  }, [scale, panOffset, pdfSize, formEditMode, pageFields.length]);

  useEffect(() => {
    if (!formEditMode || !pdfSize.width) {
      setPageFields([]);
      return;
    }

    const loadFormFields = async () => {
      try {
        const pdfDocument = getDocumentForPage(pageIndex);
        if (!pdfDocument) return;

        const page = await pdfDocument.getPage(pageIndex + 1);
        
        const unscaledViewport = page.getViewport({ scale: 1 });
        const renderScale = pdfSize.width / unscaledViewport.width;
        
        console.group('[FORM DEBUG] Viewport Math');
        console.log('1. pdfSize Prop (from Konva):', pdfSize);
        console.log('2. unscaledViewport (from pdf.js):', { width: unscaledViewport.width, height: unscaledViewport.height, viewBox: unscaledViewport.viewBox });
        console.log('3. Calculated RenderScale:', renderScale);
        console.groupEnd();

        const viewport = page.getViewport({ scale: renderScale });
        
        const annotations = await page.getAnnotations({ intent: 'display' });
        const widgets = annotations.filter((a: any) => a.subtype === 'Widget' || a.fieldType);

        const fields: LocalFormField[] = widgets.map((widget: any, index: number) => {
          const fieldType = widget.fieldType;
          let type: FormField['type'] = 'text';

          if (fieldType === 'Btn') {
            if (widget.checkBox) type = 'checkbox';
            else if (widget.radioButton) type = 'radio';
          } else if (fieldType === 'Ch') {
            type = 'dropdown';
          } else if (fieldType === 'Sig') {
            type = 'signature';
          }

          const rawValue = widget.fieldValue || widget.buttonValue || '';
          const value = extractStringValue(rawValue);
          const rawOptions = widget.options || [];
          const processedOptions = rawOptions.map((opt: any) => extractStringValue(opt));

          const rect = widget.rect || [0, 0, 0, 0];
          const [x1, y1] = viewport.convertToViewportPoint(rect[0], rect[1]);
          const [x2, y2] = viewport.convertToViewportPoint(rect[2], rect[3]);
          
          const canvasRect = {
            left: Math.min(x1, x2),
            top: Math.min(y1, y2),
            width: Math.abs(x2 - x1),
            height: Math.abs(y2 - y1)
          };

          // DEBUG: Log only the very first field to prevent console spam
          if (index === 0) {
             console.group(`[FORM DEBUG] Field Math: ${widget.fieldName || 'Unknown'}`);
             console.log('A. Raw PDF Rect:', rect);
             console.log('B. Converted Pt1 [left, bottom?]:', [x1, y1]);
             console.log('C. Converted Pt2 [right, top?]:', [x2, y2]);
             console.log('D. Final Assigned canvasRect:', canvasRect);
             console.groupEnd();
          }

          return {
            name: widget.fieldName || `field_${Math.random().toString(36).substring(2, 9)}`,
            type,
            value: type === 'checkbox' || type === 'radio' ? (value === 'Yes' || value === 'On' || value === 'true') : value,
            pageIndex,
            rect,
            canvasRect,
            options: processedOptions,
            readOnly: widget.readOnly || false,
            defaultValue: widget.defaultValue ? extractStringValue(widget.defaultValue) : undefined,
          };
        });

        const processedFields = fields.map(field => ({
          ...field,
          value: extractStringValue(field.value),
          options: field.options?.map((opt: any) => extractStringValue(opt)) || [],
          defaultValue: field.defaultValue ? extractStringValue(field.defaultValue) : undefined
        })) as LocalFormField[];

        setPageFields(processedFields);

        const currentFields = formFieldsRef.current;
        const currentFieldMap = new Map(currentFields.map((f: FormField) => [f.name, f]));
        const mergedFields = processedFields.map(field => {
          const existing = currentFieldMap.get(field.name);
          if (existing) {
            return {
              ...existing,
              canvasRect: field.canvasRect, 
              value: extractStringValue(existing.value),
              options: existing.options?.map((opt: any) => extractStringValue(opt)) || [],
              defaultValue: existing.defaultValue ? extractStringValue(existing.defaultValue) : undefined
            } as LocalFormField;
          }
          return field;
        });

        const otherPageFields = currentFields
          .filter((f: FormField) => f.pageIndex !== pageIndex)
          .map((f: FormField) => ({
            ...f,
            value: extractStringValue(f.value),
            options: f.options?.map((opt: any) => extractStringValue(opt)) || [],
            defaultValue: f.defaultValue ? extractStringValue(f.defaultValue) : undefined
          })) as FormField[];
          
        setFormFields([...otherPageFields, ...mergedFields]);
      } catch (err) {
        console.error('Failed to load form fields:', err);
      }
    };

    loadFormFields();
  }, [formEditMode, pageIndex, pdfSize.width, setFormFields]);

  const handleFieldChange = useCallback((fieldName: string, newValue: string | boolean) => {
    updateFormFieldValue(fieldName, newValue);
    setPageFields(prev => prev.map(f => 
      f.name === fieldName ? { ...f, value: newValue } : f
    ));
  }, [updateFormFieldValue]);

  if (!formEditMode || pageFields.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-[100]" style={{ overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          transformOrigin: '0 0',
          transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${scale})`,
          width: `${pdfSize.width}px`,
          height: `${pdfSize.height}px`,
        }}
      >
        {pageFields.map((field) => {
          const cr = field.canvasRect;
          if (!cr || cr.width < 5 || cr.height < 5) return null;

          const style: React.CSSProperties = {
            position: 'absolute',
            left: `${cr.left}px`,
            top: `${cr.top}px`,
            width: `${cr.width}px`,
            height: `${cr.height}px`,
          };

          const baseClasses = "pointer-events-auto border border-bb-blue bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-bb-blue m-0 shadow-sm";

          let displayValue: string;
          try {
            displayValue = extractStringValue(field.value);
            if (typeof displayValue !== 'string') displayValue = String(displayValue || '');
          } catch (e) {
            displayValue = '';
          }

          const fontSizePx = Math.max(8, cr.height * 0.6);

          return (
            <div key={field.name} style={style} className="flex items-stretch">
              {field.type === 'checkbox' && (
                <input
                  type="checkbox"
                  checked={displayValue === 'Yes' || displayValue === 'On' || displayValue === 'true'}
                  disabled={field.readOnly}
                  onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                  className={`${baseClasses} cursor-pointer w-full h-full`}
                />
              )}
              {field.type === 'radio' && (
                <input
                  type="radio"
                  checked={displayValue === 'Yes' || displayValue === 'On' || displayValue === 'true'}
                  disabled={field.readOnly}
                  onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                  className={`${baseClasses} cursor-pointer rounded-full w-full h-full`}
                />
              )}
              {field.type === 'text' && (
                <input
                  type="text"
                  value={displayValue}
                  disabled={field.readOnly}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  className={`${baseClasses} px-1 w-full h-full`}
                  style={{ fontSize: `${fontSizePx}px`, backgroundColor: 'white' }}
                  autoFocus={false}
                />
              )}
              {field.type === 'dropdown' && (
                <select
                  value={displayValue}
                  disabled={field.readOnly}
                  onChange={(e) => handleFieldChange(field.name, e.target.value)}
                  className={`${baseClasses} px-1 w-full h-full cursor-pointer`}
                  style={{ fontSize: `${fontSizePx}px` }}
                >
                  {field.options?.map((opt) => (
                    <option key={String(extractStringValue(opt))} value={String(extractStringValue(opt))}>
                      {String(extractStringValue(opt))}
                    </option>
                  ))}
                </select>
              )}
              {field.type === 'signature' && (
                <button
                  disabled={field.readOnly}
                  onClick={() => alert('Signature editing not yet implemented')}
                  className={`${baseClasses} w-full h-full text-center text-xs text-gray-500 hover:bg-gray-50`}
                >
                  {displayValue ? 'Signed' : 'Click to sign'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
