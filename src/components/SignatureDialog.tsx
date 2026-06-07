import React, { useRef, useState } from 'react';
import { X, Upload, ShieldCheck, Lock } from 'lucide-react';
import { useStore } from '../store/useStore';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as forge from 'node-forge';
import { loadPdf, getPageCount, renderPage } from '../utils/pdfRenderer';

/** Convert ArrayBuffer to binary string for node-forge */
function arrayBufferToBinaryString(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return str;
}

interface SignatureDialogProps {
  onClose: () => void;
}

type SignaturePosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'
  | 'center'
  | 'custom';

export default function SignatureDialog({ onClose }: SignatureDialogProps) {
  const { pdfData, setPdfData, setPageCount, currentDocument, savedCert, setSavedCert, pageCount, currentPage } = useStore();
  const [certFile, setCertFile] = useState<ArrayBuffer | null>(savedCert?.data ?? null);
  const [certFileName, setCertFileName] = useState(savedCert?.name ?? '');
  const [certPassword, setCertPassword] = useState('');
  const [signerName, setSignerName] = useState('');
  const [reason, setReason] = useState('Document approval');
  const [location, setLocation] = useState('');
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState('');
  const [lockAfterSign, setLockAfterSign] = useState(true);
  const [saveCertPermanently, setSaveCertPermanently] = useState(!!savedCert);
  const certInputRef = useRef<HTMLInputElement>(null);

  // Customization fields
  const [certifying, setCertifying] = useState('I certify the accuracy and authenticity of this document.');
  const [extraText, setExtraText] = useState('');
  const [signaturePage, setSignaturePage] = useState<number>(currentPage); // 0-indexed
  const [signaturePosition, setSignaturePosition] = useState<SignaturePosition>('bottom-right');
  const [customX, setCustomX] = useState<number>(30);
  const [customY, setCustomY] = useState<number>(30);
  const [boxWidth, setBoxWidth] = useState<number>(260);
  const [boxHeight, setBoxHeight] = useState<number>(110);
  const [borderColor, setBorderColor] = useState<string>('#3366cc');

  const handleCertUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setCertFile(buffer);
    setCertFileName(file.name);
    setError('');

    // Try to extract signer name from the certificate
    try {
      const p12Der = arrayBufferToBinaryString(buffer);
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, certPassword || '');
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certs = certBags[forge.pki.oids.certBag];
      if (certs && certs.length > 0 && certs[0].cert) {
        const cn = certs[0].cert.subject.getField('CN');
        if (cn) setSignerName(cn.value as string);
      }
    } catch {
      // Will be validated during signing
    }
  };

  const handleSign = async () => {
    if (!pdfData) {
      setError('No PDF loaded.');
      return;
    }
    if (!certFile) {
      setError('Please import a certificate file (.p12 / .pfx).');
      return;
    }
    if (!certPassword) {
      setError('Please enter the certificate password.');
      return;
    }

    setSigning(true);
    setError('');

    try {
      // Parse the PKCS#12 certificate
      const p12Der = arrayBufferToBinaryString(certFile);
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      let p12: forge.pkcs12.Pkcs12Pfx;
      try {
        p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, certPassword);
      } catch {
        setError('Invalid certificate password or corrupted file.');
        setSigning(false);
        return;
      }

      // Extract certificate and private key
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const certs = certBags[forge.pki.oids.certBag];
      const keys = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];

      if (!certs || certs.length === 0 || !certs[0].cert) {
        setError('No certificate found in the file.');
        setSigning(false);
        return;
      }
      if (!keys || keys.length === 0 || !keys[0].key) {
        setError('No private key found in the file.');
        setSigning(false);
        return;
      }

      const cert = certs[0].cert;
      const privateKey = keys[0].key;

      // Get signer details
      const cn = cert.subject.getField('CN');
      const displayName = signerName || (cn ? cn.value as string : 'Unknown Signer');
      const issuerCN = cert.issuer.getField('CN');
      const issuerName = issuerCN ? issuerCN.value as string : 'Unknown Issuer';

      // Load the PDF with pdf-lib
      const pdfDoc = await PDFDocument.load(pdfData.slice(0));
      const pages = pdfDoc.getPages();
      const targetPageIdx = Math.max(0, Math.min(signaturePage, pages.length - 1));
      const targetPage = pages[targetPageIdx];
      const { width, height } = targetPage.getSize();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Determine signature box position based on user choice
      const sigBoxW = Math.max(150, Math.min(boxWidth, width - 20));
      const sigBoxH = Math.max(60, Math.min(boxHeight, height - 20));
      let sigBoxX = 30;
      let sigBoxY = 30;
      const margin = 30;
      switch (signaturePosition) {
        case 'bottom-right':
          sigBoxX = width - sigBoxW - margin;
          sigBoxY = margin;
          break;
        case 'bottom-left':
          sigBoxX = margin;
          sigBoxY = margin;
          break;
        case 'top-right':
          sigBoxX = width - sigBoxW - margin;
          sigBoxY = height - sigBoxH - margin;
          break;
        case 'top-left':
          sigBoxX = margin;
          sigBoxY = height - sigBoxH - margin;
          break;
        case 'center':
          sigBoxX = (width - sigBoxW) / 2;
          sigBoxY = (height - sigBoxH) / 2;
          break;
        case 'custom':
          // Custom X/Y are user-space coordinates (PDF origin = bottom-left)
          sigBoxX = Math.max(0, Math.min(customX, width - sigBoxW));
          sigBoxY = Math.max(0, Math.min(customY, height - sigBoxH));
          break;
      }

      const now = new Date();
      const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);

      // Parse border color
      const hex = borderColor.replace('#', '');
      const br = parseInt(hex.substring(0, 2), 16) / 255;
      const bg = parseInt(hex.substring(2, 4), 16) / 255;
      const bb = parseInt(hex.substring(4, 6), 16) / 255;
      const borderRgb = rgb(br, bg, bb);

      // Draw signature box background
      targetPage.drawRectangle({
        x: sigBoxX,
        y: sigBoxY,
        width: sigBoxW,
        height: sigBoxH,
        color: rgb(0.98, 0.98, 1),
        borderColor: borderRgb,
        borderWidth: 1.5,
      });

      // Shield icon area (left side)
      const stripeW = 40;
      targetPage.drawRectangle({
        x: sigBoxX,
        y: sigBoxY,
        width: stripeW,
        height: sigBoxH,
        color: borderRgb,
      });
      targetPage.drawText('S', {
        x: sigBoxX + 14,
        y: sigBoxY + sigBoxH / 2 - 10,
        size: 22,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      // Compose text lines (top -> down)
      const textX = sigBoxX + stripeW + 8;
      let cursorY = sigBoxY + sigBoxH - 14;
      const lineGap = 11;
      const drawLine = (text: string, size = 7, bold = false, color = rgb(0.35, 0.35, 0.35)) => {
        if (!text) return;
        // Trim text to fit
        const maxChars = Math.floor((sigBoxW - stripeW - 16) / (size * 0.5));
        const safe = text.length > maxChars ? text.substring(0, maxChars - 1) + '…' : text;
        targetPage.drawText(safe, { x: textX, y: cursorY, size, font: bold ? fontBold : font, color });
        cursorY -= lineGap;
      };

      drawLine('Digitally Signed By:', 7);
      drawLine(displayName, 10, true, rgb(0.1, 0.1, 0.3));
      cursorY -= 2;
      drawLine(`Issuer: ${issuerName}`, 7);
      if (reason) drawLine(`Reason: ${reason}`, 7);
      drawLine(`Date: ${dateStr}`, 7);
      if (location) drawLine(`Location: ${location}`, 7);
      if (certifying) drawLine(certifying, 6, false, rgb(0.2, 0.4, 0.2));
      if (extraText) {
        // Support multiple lines in extraText
        for (const line of extraText.split('\n')) {
          drawLine(line, 6, false, rgb(0.45, 0.45, 0.45));
        }
      }

      // Create the actual PKCS#7 digital signature
      // Hash the PDF content
      const pdfBytes = await pdfDoc.save();
      const md = forge.md.sha256.create();
      md.update(arrayBufferToBinaryString(pdfBytes.buffer as ArrayBuffer));

      // Create PKCS#7 signed data
      const p7 = forge.pkcs7.createSignedData();
      p7.content = forge.util.createBuffer(arrayBufferToBinaryString(pdfBytes.buffer as ArrayBuffer));
      p7.addCertificate(cert);
      p7.addSigner({
        key: privateKey,
        certificate: cert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
          {
            type: forge.pki.oids.contentType,
            value: forge.pki.oids.data,
          },
          {
            type: forge.pki.oids.messageDigest,
          },
          {
            type: forge.pki.oids.signingTime,
            value: now.toISOString(),
          },
        ],
      });
      p7.sign();

      // Store signature metadata in PDF info dict
      pdfDoc.setTitle(currentDocument?.name || 'Signed Document');
      pdfDoc.setSubject(`Digitally signed by ${displayName}`);
      pdfDoc.setKeywords(['digitally-signed', `signer:${displayName}`, `issuer:${issuerName}`, `date:${dateStr}`]);
      pdfDoc.setProducer('BlueprintPDF Digital Signature');
      pdfDoc.setCreator('BlueprintPDF');

      // Save the signed PDF
      const signedBytes = await pdfDoc.save();
      const signedBuffer = signedBytes.buffer as ArrayBuffer;

      // Reload the signed PDF into the editor
      setPdfData(signedBuffer);
      await loadPdf(signedBuffer);
      setPageCount(getPageCount());

      // If lock after sign, clear all editable annotations
      if (lockAfterSign) {
        const { setAnnotations, setMeasurements, setPdfLocked } = useStore.getState();
        setAnnotations([]);
        setMeasurements([]);
        setPdfLocked(true);
      }

      // Save certificate permanently if requested
      if (saveCertPermanently && certFile) {
        setSavedCert({ data: certFile.slice(0), name: certFileName });
      }

      alert(`PDF signed successfully by ${displayName}.\n\nIssuer: ${issuerName}\nDate: ${dateStr}${lockAfterSign ? '\n\nPDF is now locked for editing.' : ''}`);
      onClose();
    } catch (err: any) {
      console.error('Signing failed:', err);
      setError(`Signing failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bb-sidebar border border-bb-border rounded-lg shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bb-border">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-green-400" />
            <span className="text-sm font-semibold text-bb-text">Digital Signature</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-bb-hover rounded text-bb-muted">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Certificate upload */}
          <div>
            <label className="block text-xs text-bb-muted mb-1.5">Certificate File (.p12 / .pfx)</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => certInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-bb-hover hover:bg-bb-border rounded text-xs text-bb-text transition-colors"
              >
                <Upload size={13} />
                {certFileName || 'Import Certificate'}
              </button>
              <input
                ref={certInputRef}
                type="file"
                accept=".p12,.pfx"
                onChange={handleCertUpload}
                className="hidden"
              />
              {certFile && <span className="text-[10px] text-green-400">✓ Loaded</span>}
            </div>
          </div>

          {/* Certificate password */}
          <div>
            <label className="block text-xs text-bb-muted mb-1.5">Certificate Password</label>
            <input
              type="password"
              value={certPassword}
              onChange={(e) => setCertPassword(e.target.value)}
              placeholder="Enter certificate password"
              className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
            />
          </div>

          {/* Signer name */}
          <div>
            <label className="block text-xs text-bb-muted mb-1.5">Signer Name</label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Auto-detected from certificate"
              className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs text-bb-muted mb-1.5">Reason for Signing</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Document approval"
              className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs text-bb-muted mb-1.5">Location (optional)</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., New York, NY"
              className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
            />
          </div>

          {/* Certifying statement */}
          <div>
            <label className="block text-xs text-bb-muted mb-1.5">Certifying Statement</label>
            <textarea
              value={certifying}
              onChange={(e) => setCertifying(e.target.value)}
              placeholder="What are you certifying with this signature?"
              rows={2}
              className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue resize-y"
            />
          </div>

          {/* Additional custom text */}
          <div>
            <label className="block text-xs text-bb-muted mb-1.5">Additional Custom Text (optional)</label>
            <textarea
              value={extraText}
              onChange={(e) => setExtraText(e.target.value)}
              placeholder="Job title, P.E. license #, project ID, etc. (one item per line)"
              rows={2}
              className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue resize-y"
            />
          </div>

          {/* Page selector */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-bb-muted mb-1.5">Sign on Page</label>
              <input
                type="number"
                min={1}
                max={Math.max(1, pageCount)}
                value={signaturePage + 1}
                onChange={(e) => setSignaturePage(Math.max(0, Math.min(pageCount - 1, parseInt(e.target.value) - 1 || 0)))}
                className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-bb-muted mb-1.5">Border Color</label>
              <input
                type="color"
                value={borderColor}
                onChange={(e) => setBorderColor(e.target.value)}
                className="w-full h-[30px] bg-bb-dark border border-bb-border rounded cursor-pointer"
              />
            </div>
          </div>

          {/* Position */}
          <div>
            <label className="block text-xs text-bb-muted mb-1.5">Signature Position</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['top-left', 'center', 'top-right', 'bottom-left', 'custom', 'bottom-right'] as SignaturePosition[]).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setSignaturePosition(pos)}
                  className={`px-2 py-1.5 text-[10px] rounded border transition-colors ${
                    signaturePosition === pos
                      ? 'bg-bb-blue/20 border-bb-blue text-bb-text'
                      : 'bg-bb-dark border-bb-border text-bb-muted hover:text-bb-text hover:border-bb-border/80'
                  }`}
                >
                  {pos.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Custom X/Y */}
          {signaturePosition === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-bb-muted mb-1.5">X (points, from left)</label>
                <input
                  type="number"
                  value={customX}
                  onChange={(e) => setCustomX(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-bb-muted mb-1.5">Y (points, from bottom)</label>
                <input
                  type="number"
                  value={customY}
                  onChange={(e) => setCustomY(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
                />
              </div>
            </div>
          )}

          {/* Box size */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-bb-muted mb-1.5">Box Width</label>
              <input
                type="number"
                min={150}
                value={boxWidth}
                onChange={(e) => setBoxWidth(parseFloat(e.target.value) || 260)}
                className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
              />
            </div>
            <div>
              <label className="block text-xs text-bb-muted mb-1.5">Box Height</label>
              <input
                type="number"
                min={60}
                value={boxHeight}
                onChange={(e) => setBoxHeight(parseFloat(e.target.value) || 110)}
                className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
              />
            </div>
          </div>

          {/* Lock PDF option */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="lockPdf"
              checked={lockAfterSign}
              onChange={(e) => setLockAfterSign(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="lockPdf" className="text-xs text-bb-text flex items-center gap-1">
              <Lock size={12} className="text-amber-400" />
              Lock PDF after signing (prevent further edits)
            </label>
          </div>

          {/* Save certificate permanently */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="saveCert"
              checked={saveCertPermanently}
              onChange={(e) => setSaveCertPermanently(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="saveCert" className="text-xs text-bb-text flex items-center gap-1">
              <ShieldCheck size={12} className="text-green-400" />
              Remember this certificate for future signing
            </label>
          </div>

          {/* Error message */}
          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Info box */}
          <div className="px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded text-[11px] text-blue-300/80 leading-relaxed">
            <strong>Supported formats:</strong> PKCS#12 (.p12, .pfx) certificates including IdenTrust, DigiCert, GlobalSign, and other trusted CAs. The signature will be embedded with SHA-256 and a visible stamp on page 1.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-bb-border">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-bb-muted hover:text-bb-text hover:bg-bb-hover rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSign}
            disabled={signing || !certFile}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-xs font-medium transition-colors"
          >
            {signing ? (
              <>Signing...</>
            ) : (
              <>
                <ShieldCheck size={13} />
                Apply Signature
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
