import React, { useState, useEffect } from 'react';
import { getPageTextItems, getPageCount } from '../utils/pdfRenderer';
import { useStore } from '../store/useStore';
import { ExternalLink, Search, X } from 'lucide-react';

export default function AddressScanDialog({ onClose }: { onClose: () => void }) {
  const { pdfData, currentPage } = useStore();
  const [addresses, setAddresses] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const scanForAddresses = async () => {
    setScanning(true);
    setAddresses([]);
    
    try {
      const pageCount = getPageCount();
      const allAddresses: string[] = [];
      
      // Simple address regex patterns
      const patterns = [
        /\d+\s+[A-Za-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Dr|Drive|Blvd|Boulevard|Ct|Court|Pl|Place|Way)[.,\s]*/gi,
        /\d+\s+[A-Za-z]+\s+[A-Za-z]+\s+(?:St|Street|Ave|Avenue|Rd|Road|Ln|Lane|Dr|Drive|Blvd|Boulevard|Ct|Court|Pl|Place|Way)[.,\s]*/gi,
        /\d+\s+[A-Za-z]+\s+[A-Za-z]+,\s*[A-Za-z]+\s*\d{5}/gi,
        /\d+\s+[A-Za-z]+\s+[A-Za-z]+,\s*[A-Za-z]+/gi,
      ];
      
      for (let i = 0; i < pageCount; i++) {
        const textItems = await getPageTextItems(i);
        const pageText = textItems.map(item => item.text).join(' ');
        
        for (const pattern of patterns) {
          const matches = pageText.match(pattern);
          if (matches) {
            allAddresses.push(...matches.map(m => m.trim()));
          }
        }
      }
      
      // Deduplicate addresses
      const uniqueAddresses = Array.from(new Set(allAddresses)).slice(0, 50);
      setAddresses(uniqueAddresses);
      setScanned(true);
    } catch (error) {
      console.error('Error scanning for addresses:', error);
    } finally {
      setScanning(false);
    }
  };

  const openInGoogleMaps = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-bb-panel border border-bb-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-bb-border">
          <h2 className="text-lg font-semibold text-bb-text flex items-center gap-2">
            <Search size={18} className="text-bb-accent" />
            Scan for Addresses
          </h2>
          <button
            onClick={onClose}
            className="text-bb-muted hover:text-bb-text transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!scanned ? (
            <div className="text-center py-8">
              <p className="text-bb-muted mb-4">
                Click the button below to scan the entire PDF for addresses.
              </p>
              <button
                onClick={scanForAddresses}
                disabled={scanning}
                className="px-4 py-2 bg-bb-accent hover:bg-bb-accent/90 text-white rounded transition-colors disabled:opacity-50"
              >
                {scanning ? 'Scanning...' : 'Scan PDF'}
              </button>
            </div>
          ) : addresses.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-bb-muted">No addresses found in the PDF.</p>
              <button
                onClick={scanForAddresses}
                disabled={scanning}
                className="mt-4 px-4 py-2 bg-bb-accent hover:bg-bb-accent/90 text-white rounded transition-colors disabled:opacity-50"
              >
                Scan Again
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-bb-muted mb-4">
                Found {addresses.length} address{addresses.length !== 1 ? 'es' : ''}:
              </p>
              <div className="space-y-2">
                {addresses.map((address, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-bb-dark border border-bb-border rounded hover:border-bb-accent/50 transition-colors"
                  >
                    <span className="text-sm text-bb-text flex-1">{address}</span>
                    <button
                      onClick={() => openInGoogleMaps(address)}
                      className="ml-3 p-2 text-bb-accent hover:text-bb-accent/80 transition-colors"
                      title="Open in Google Maps"
                    >
                      <ExternalLink size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={scanForAddresses}
                disabled={scanning}
                className="mt-4 w-full px-4 py-2 bg-bb-accent hover:bg-bb-accent/90 text-white rounded transition-colors disabled:opacity-50"
              >
                Scan Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
