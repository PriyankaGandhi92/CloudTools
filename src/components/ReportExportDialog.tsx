import React, { useState } from 'react';
import { X, Download, Loader2, FileImage, Image as ImageIcon, Layers, Building2, MapPin, FileText, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  exportImagesAsZip,
  downloadBlob,
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
} from '../utils/reportExport';
import { generateFieldwireReport } from '../utils/reportGenerator';

interface Props {
  onClose: () => void;
}

export default function ReportExportDialog({ onClose }: Props) {
  const { pageCount, annotations, currentDocument } = useStore();
  const baseName = (currentDocument?.name || 'document').replace(/\.pdf$/i, '');
  const [options, setOptions] = useState<ExportOptions>({
    ...DEFAULT_EXPORT_OPTIONS,
    documentName: baseName,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeAiCover, setIncludeAiCover] = useState(true);

  const uploadedImageCount = annotations.filter(
    (a) => a.type === 'image' && a.imageData
  ).length;
  const bimPhotoCount = annotations.reduce(
    (n, a) => n + (a.type === 'bim-capture' && a.bimContent?.images ? a.bimContent.images.length : 0),
    0,
  );
  const pinPhotoCount = annotations.reduce(
    (n, a) => n + (a.type === 'pin' && a.pinContent?.images ? a.pinContent.images.length : 0),
    0,
  );

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await exportImagesAsZip(pageCount, annotations, options);
      downloadBlob(blob, `${options.documentName || 'export'}_images.zip`);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDocxExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const tasks = annotations.filter(a => a.type === 'inspection-task');
      await generateFieldwireReport(tasks, baseName, includeAiCover);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'DOCX export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-bb-panel border border-bb-border rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-bb-border">
          <h2 className="text-lg font-semibold text-bb-text flex items-center gap-2">
            <Download size={20} className="text-bb-blue" />
            Reports & Exports
          </h2>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-bb-muted hover:text-bb-text transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <p className="text-xs text-bb-muted">
            Export rendered PDF pages, every image embedded inside the PDF, plus all photos
            attached to BIM @Inspection annotations and Location Pins. Each category is saved
            to its own folder inside the ZIP.
          </p>

          {/* File name */}
          <div>
            <label className="block text-xs text-bb-muted mb-1">Export name</label>
            <input
              type="text"
              value={options.documentName}
              onChange={(e) => setOptions({ ...options, documentName: e.target.value })}
              className="w-full px-3 py-2 bg-bb-dark border border-bb-border rounded-md text-bb-text text-sm focus:outline-none focus:ring-2 focus:ring-bb-blue"
              placeholder="document"
            />
          </div>

          {/* Include PDF pages */}
          <label className="flex items-start gap-3 p-3 border border-bb-border rounded-md cursor-pointer hover:bg-bb-hover transition-colors">
            <input
              type="checkbox"
              checked={options.includePdfPages}
              onChange={(e) => setOptions({ ...options, includePdfPages: e.target.checked })}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-bb-text font-medium">
                <FileImage size={14} />
                Include PDF pages as images
              </div>
              <p className="text-xs text-bb-muted mt-0.5">
                {pageCount} page{pageCount === 1 ? '' : 's'} will be rendered.
              </p>
            </div>
          </label>

          {/* Include real embedded images from inside the PDF */}
          <label className="flex items-start gap-3 p-3 border border-bb-border rounded-md cursor-pointer hover:bg-bb-hover transition-colors">
            <input
              type="checkbox"
              checked={options.includeEmbeddedImages}
              onChange={(e) => setOptions({ ...options, includeEmbeddedImages: e.target.checked })}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-bb-text font-medium">
                <Layers size={14} />
                Include images embedded inside the PDF
              </div>
              <p className="text-xs text-bb-muted mt-0.5">
                Extracts every raster image XObject in the PDF content streams (logos,
                photographs, scanned details, etc.) → <code className="text-bb-blue">embedded_images/</code>
              </p>
            </div>
          </label>

          {/* Include user-uploaded image annotations */}
          <label className="flex items-start gap-3 p-3 border border-bb-border rounded-md cursor-pointer hover:bg-bb-hover transition-colors">
            <input
              type="checkbox"
              checked={options.includeUploadedImages}
              onChange={(e) => setOptions({ ...options, includeUploadedImages: e.target.checked })}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-bb-text font-medium">
                <ImageIcon size={14} />
                Include user-uploaded image annotations
              </div>
              <p className="text-xs text-bb-muted mt-0.5">
                {uploadedImageCount} image{uploadedImageCount === 1 ? '' : 's'} pasted or uploaded as annotations → <code className="text-bb-blue">uploaded_images/</code>
              </p>
            </div>
          </label>

          {/* Include BIM @Inspection photos */}
          <label className="flex items-start gap-3 p-3 border border-bb-border rounded-md cursor-pointer hover:bg-bb-hover transition-colors">
            <input
              type="checkbox"
              checked={options.includeBimImages}
              onChange={(e) => setOptions({ ...options, includeBimImages: e.target.checked })}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-bb-text font-medium">
                <Building2 size={14} />
                Include BIM @Inspection photos & data
              </div>
              <p className="text-xs text-bb-muted mt-0.5">
                {bimPhotoCount} photo{bimPhotoCount === 1 ? '' : 's'} across BIM annotations (each with a <code className="text-bb-blue">_data.txt</code>) → <code className="text-bb-blue">bim_images/</code>
              </p>
            </div>
          </label>

          {/* Include Location Pin photos */}
          <label className="flex items-start gap-3 p-3 border border-bb-border rounded-md cursor-pointer hover:bg-bb-hover transition-colors">
            <input
              type="checkbox"
              checked={options.includePinImages}
              onChange={(e) => setOptions({ ...options, includePinImages: e.target.checked })}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-bb-text font-medium">
                <MapPin size={14} />
                Include Location Pin photos & notes
              </div>
              <p className="text-xs text-bb-muted mt-0.5">
                {pinPhotoCount} photo{pinPhotoCount === 1 ? '' : 's'} across inspection pins (each with a <code className="text-bb-blue">_notes.txt</code>) → <code className="text-bb-blue">pin_images/</code>
              </p>
            </div>
          </label>

          {/* DOCX Inspection Report */}
          <div className="border-t border-bb-border pt-4 mt-4">
            <div className="flex items-center gap-2 text-sm text-bb-text font-medium mb-3">
              <FileText size={14} />
              Inspection Task Report (DOCX)
            </div>
            <label className="flex items-start gap-3 p-3 border border-bb-border rounded-md cursor-pointer hover:bg-bb-hover transition-colors">
              <input
                type="checkbox"
                checked={includeAiCover}
                onChange={(e) => setIncludeAiCover(e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm text-bb-text font-medium">
                  <Sparkles size={14} className="text-blue-400" />
                  AI-generated executive summary
                </div>
                <p className="text-xs text-bb-muted mt-0.5">
                  Include AI-written project summary on cover page (requires subscription)
                </p>
              </div>
            </label>
          </div>

          {/* Format & quality */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-bb-muted mb-1">Image format</label>
              <select
                value={options.imageFormat}
                onChange={(e) => setOptions({ ...options, imageFormat: e.target.value as 'png' | 'jpeg' })}
                className="w-full px-3 py-2 bg-bb-dark border border-bb-border rounded-md text-bb-text text-sm focus:outline-none focus:ring-2 focus:ring-bb-blue"
              >
                <option value="png">PNG (lossless)</option>
                <option value="jpeg">JPEG (smaller)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-bb-muted mb-1">Render quality</label>
              <select
                value={options.pdfPageScale}
                onChange={(e) => setOptions({ ...options, pdfPageScale: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 bg-bb-dark border border-bb-border rounded-md text-bb-text text-sm focus:outline-none focus:ring-2 focus:ring-bb-blue"
              >
                <option value={1}>72 DPI (small)</option>
                <option value={2}>144 DPI (medium)</option>
                <option value={3}>216 DPI (high)</option>
                <option value={4}>288 DPI (print)</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-md px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-bb-border">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm text-bb-muted hover:text-bb-text transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDocxExport}
            disabled={busy}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
            {busy ? 'Generating...' : 'Export DOCX'}
          </button>
          <button
            onClick={handleExport}
            disabled={busy || (!options.includePdfPages && !options.includeEmbeddedImages && !options.includeUploadedImages && !options.includeBimImages && !options.includePinImages)}
            className="px-4 py-2 bg-bb-blue hover:bg-blue-600 disabled:opacity-60 text-white text-sm font-medium rounded-md transition-colors flex items-center gap-2"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {busy ? 'Exporting...' : 'Export ZIP'}
          </button>
        </div>
      </div>
    </div>
  );
}
