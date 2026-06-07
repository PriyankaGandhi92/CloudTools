// Web Worker for heavy CAD math operations
// This offloads vector extraction and greedy merge from the main thread to prevent UI freezing

export interface VectorSegment {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
}

export interface WorkerMessage {
  type: 'processSegments';
  rawSegments: VectorSegment[];
}

export interface WorkerResponse {
  type: 'segmentsProcessed';
  optimizedPolylines: { x: number; y: number }[][];
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const { type, rawSegments } = e.data;

  if (type === 'processSegments') {
    try {
      const optimizedPolylines = performGreedyMerge(rawSegments);
      self.postMessage({
        type: 'segmentsProcessed',
        optimizedPolylines
      } as WorkerResponse);
    } catch (error) {
      console.error('CAD Worker error:', error);
      self.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
};

/**
 * Greedy Merge: Stitch touching segments into continuous polylines
 * This is the heavy computation that was blocking the main thread
 */
function performGreedyMerge(segments: VectorSegment[]): { x: number; y: number }[][] {
  const optimizedLines: { x: number; y: number }[][] = [];
  const tolerance = 0.5; // Pixel tolerance for endpoint matching

  for (const seg of segments) {
    let merged = false;

    // Try to attach this segment to an existing polyline
    for (const line of optimizedLines) {
      const lastPoint = line[line.length - 1];
      const firstPoint = line[0];

      // Check if segment start matches polyline end
      if (Math.abs(lastPoint.x - seg.p1.x) < tolerance && Math.abs(lastPoint.y - seg.p1.y) < tolerance) {
        line.push(seg.p2);
        merged = true;
        break;
      }
      // Check if segment end matches polyline end (reverse direction)
      if (Math.abs(lastPoint.x - seg.p2.x) < tolerance && Math.abs(lastPoint.y - seg.p2.y) < tolerance) {
        line.push(seg.p1);
        merged = true;
        break;
      }
      // Check if segment start matches polyline start (prepend)
      if (Math.abs(firstPoint.x - seg.p2.x) < tolerance && Math.abs(firstPoint.y - seg.p2.y) < tolerance) {
        line.unshift(seg.p1);
        merged = true;
        break;
      }
      // Check if segment end matches polyline start (prepend reversed)
      if (Math.abs(firstPoint.x - seg.p1.x) < tolerance && Math.abs(firstPoint.y - seg.p1.y) < tolerance) {
        line.unshift(seg.p2);
        merged = true;
        break;
      }
    }

    // If couldn't merge, start a new polyline
    if (!merged) {
      optimizedLines.push([seg.p1, seg.p2]);
    }
  }

  return optimizedLines;
}
