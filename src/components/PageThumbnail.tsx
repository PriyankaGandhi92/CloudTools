import React, { useEffect, useRef, useState, memo } from 'react';
import { useStore } from '../store/useStore';
import { shallow } from 'zustand/shallow';
import { renderPage } from '../utils/pdfRenderer';
import { GripVertical, Bookmark, BookmarkCheck } from 'lucide-react';

interface PageThumbnailProps {
  pageIndex: number;
  underlyingPageIndex: number;
  isActive: boolean;
  isSelectedForDeletion: boolean;
  isBookmarked: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  hasPdf: boolean;
  maxWidth: number;
  thumbnailKey: number;
  pageRotations: Record<number, number>;
  onClick: () => void;
  onCtrlClick: () => void;
  onShiftClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onToggleBookmark: () => void;
}

const PageThumbnail = memo(({
  pageIndex,
  underlyingPageIndex,
  isActive,
  isSelectedForDeletion,
  isBookmarked,
  isDragging,
  isDropTarget,
  hasPdf,
  maxWidth,
  thumbnailKey,
  pageRotations,
  onClick,
  onCtrlClick,
  onShiftClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onToggleBookmark,
}: PageThumbnailProps) => {
  const [pdfImageSrc, setPdfImageSrc] = useState<string | null>(null);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // SHALLOW SUBSCRIPTION: Only re-render if annotations on THIS EXACT PAGE change
  const pageAnnotations = useStore(
    (state) => state.annotations.filter((a: any) => a.pageIndex === pageIndex),
    shallow
  );

  // RENDER PDF BACKGROUND EXACTLY ONCE (or when thumbnailKey changes)
  useEffect(() => {
    if (!hasPdf) return;
    
    let isCancelled = false;
    const canvas = document.createElement('canvas');
    
    // Render at a low scale (0.5) for thumbnail performance
    renderPage(pageIndex, canvas, 0.5, 0).then((size) => {
      if (isCancelled) return;
      setPdfDimensions(size);
      setPdfImageSrc(canvas.toDataURL()); // Save as static image
    }).catch(console.error);

    return () => { isCancelled = true; };
  }, [pageIndex, hasPdf, thumbnailKey]);

  // 3. DRAW ANNOTATIONS INSTANTLY ON THE OVERLAY
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || pdfDimensions.width === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous annotations
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // EXACT SCALE MATH:
    // Because renderPage was called at 0.5 scale, the native PDF width is double the thumbnail dimension
    const nativePdfWidth = pdfDimensions.width * 2;
    const nativePdfHeight = pdfDimensions.height * 2;

    const scaleX = canvas.width / nativePdfWidth;
    const scaleY = canvas.height / nativePdfHeight;

    pageAnnotations.forEach(ann => {
      ctx.save();
      ctx.scale(scaleX, scaleY);

      // Inherit the exact colors and opacity from the main canvas
      ctx.strokeStyle = ann.style?.stroke || '#ef4444';
      ctx.lineWidth = ann.style?.strokeWidth || 2;
      ctx.fillStyle = ann.style?.fill !== 'transparent' ? (ann.style?.fill || 'transparent') : 'transparent';
      ctx.globalAlpha = ann.style?.opacity ?? 1;

      // ADDED MISSING TYPES: freehand, highlight, arrow
      if (['line', 'measure-polyline', 'freehand', 'highlight', 'arrow'].includes(ann.type)) {

        // Match highlight blending so it looks like a real marker
        if (ann.type === 'highlight') {
          ctx.strokeStyle = ann.style?.stroke || '#ffeb3b';
          ctx.lineWidth = ann.style?.strokeWidth || 20;
          ctx.globalAlpha = ann.style?.opacity ?? 0.35;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalCompositeOperation = 'multiply';
        }

        ctx.beginPath();
        if (ann.points && ann.points.length > 0) {
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x, ann.points[i].y);
          }
          ctx.stroke();
        }
      } else if (ann.type === 'rectangle' || ann.type === 'eraser-box') {
        if (ann.points && ann.points.length > 0) {
          const p = ann.points[0];
          ctx.strokeRect(p.x, p.y, ann.width || 0, ann.height || 0);
          if (ctx.fillStyle !== 'transparent') ctx.fillRect(p.x, p.y, ann.width || 0, ann.height || 0);
        }
      } else if (ann.type === 'circle') {
        if (ann.points && ann.points.length > 0) {
          const p = ann.points[0];
          ctx.beginPath();
          ctx.ellipse(p.x + (ann.width || 0) / 2, p.y + (ann.height || 0) / 2, (ann.width || 0) / 2, (ann.height || 0) / 2, 0, 0, 2 * Math.PI);
          ctx.stroke();
          if (ctx.fillStyle !== 'transparent') ctx.fill();
        }
      }
      ctx.restore();
    });
  }, [pageAnnotations, pdfDimensions]);

  // Fallback for when PDF is not loaded
  useEffect(() => {
    if (!hasPdf && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.fillStyle = '#666';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No PDF', canvasRef.current.width / 2, canvasRef.current.height / 2);
      }
    }
  }, [hasPdf]);

  const rotation = pageRotations[pageIndex] || 0;
  const aspectRatio = pdfDimensions.width && pdfDimensions.height 
    ? pdfDimensions.width / pdfDimensions.height 
    : 8.5 / 11;

  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
    const timer = setTimeout(() => {
      e.preventDefault();
      onContextMenu(e as any);
    }, 500);
    setLongPressTimer(timer);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
    setTouchStart(null);
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        if (e.shiftKey) {
          onShiftClick();
        } else if (e.ctrlKey) {
          onCtrlClick();
        } else {
          onClick();
        }
      }}
      onContextMenu={onContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`w-full rounded overflow-hidden border-2 transition-all cursor-pointer relative group mb-2 ${
        isDragging
          ? 'opacity-40 border-bb-blue'
          : isDropTarget
          ? 'border-orange-400 ring-2 ring-orange-400/30'
          : isSelectedForDeletion
          ? 'border-red-500 ring-1 ring-red-500/30'
          : isActive
          ? 'border-bb-blue shadow-lg shadow-bb-blue/20 bg-bb-panel'
          : 'border-transparent hover:border-gray-500 hover:bg-bb-hover'
      }`}
      style={{ 
        width: maxWidth,
        height: maxWidth / aspectRatio,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center'
      }}
    >
      {/* Drop indicator line */}
      {isDropTarget && (
        <div className="absolute -top-1.5 left-0 right-0 h-1.5 bg-orange-500 rounded z-50 shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
      )}
      
      {/* Grip handle */}
      <div className="absolute top-0.5 left-0.5 cursor-grab text-bb-muted/40 hover:text-bb-muted z-10">
        <GripVertical size={12} />
      </div>
      
      {/* Bookmark button */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleBookmark(); }}
        className={`absolute top-0.5 right-0.5 p-0.5 rounded transition-all z-10 ${
          isBookmarked ? 'text-yellow-400' : 'text-bb-muted/30 opacity-0 group-hover:opacity-100 hover:text-yellow-400'
        }`}
        title={isBookmarked ? 'Remove bookmark' : 'Bookmark this page'}
      >
        {isBookmarked ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
      </button>
      
      {/* Selection indicator */}
      {isSelectedForDeletion && (
        <div className="absolute top-0.5 right-5 w-3 h-3 bg-red-500 rounded-full z-10" />
      )}

      {/* Layer 1: The Static PDF Background */}
      {pdfImageSrc ? (
        <img 
          src={pdfImageSrc} 
          alt={`Page ${underlyingPageIndex + 1}`} 
          className="w-full h-full object-contain bg-white" 
        />
      ) : (
        <canvas 
          ref={canvasRef}
          width={maxWidth}
          height={maxWidth / aspectRatio}
          className="w-full h-full bg-gray-800"
        />
      )}

      {/* Layer 2: The Instant Annotation Overlay */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        width={400} // Higher resolution so the lines aren't pixelated
        height={400 * (pdfDimensions.height / pdfDimensions.width || 1.3)}
      />
      
      {/* Page Number Badge */}
      <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
        {underlyingPageIndex + 1}
      </div>
    </div>
  );
});

export default PageThumbnail;
