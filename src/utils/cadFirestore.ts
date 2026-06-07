import { doc, setDoc, writeBatch, getDoc, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Point } from '../types';

const CHUNK_SIZE = 400; // Safe limit to stay well under 1MB

export interface CADChunk {
  id: string;
  manifestId: string;
  chunkIndex: number;
  lines: { points: Point[] }[];
}

export interface CADManifest {
  id: string;
  type: 'cad-layer';
  pageIndex: number;
  chunkIds: string[];
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
    fill: string;
  };
  layerOrder: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Save CAD layer chunks to Firestore with manifest
 * This prevents 1MB Firestore limit errors for large CAD geometries
 */
export async function saveCADLayerToFirestore(
  optimizedLines: Point[][],
  currentPage: number,
  style: { stroke: string; strokeWidth: number; opacity: number; fill: string }
): Promise<{ manifestId: string; chunkIds: string[] }> {
  const manifestId = crypto.randomUUID();
  const batch = writeBatch(db);
  const chunkIds: string[] = [];

  // 1. Create Chunks
  for (let i = 0; i < optimizedLines.length; i += CHUNK_SIZE) {
    const chunk = optimizedLines.slice(i, i + CHUNK_SIZE);
    const chunkId = crypto.randomUUID();
    chunkIds.push(chunkId);

    const chunkRef = doc(db, 'cad_geometry_chunks', chunkId);
    const chunkData: CADChunk = {
      id: chunkId,
      manifestId,
      chunkIndex: i / CHUNK_SIZE,
      lines: chunk.map(line => ({ points: line }))
    };
    batch.set(chunkRef, chunkData);
  }

  // 2. Create the Manifest
  const manifestRef = doc(db, 'annotations', manifestId);
  const manifestData: CADManifest = {
    id: manifestId,
    type: 'cad-layer',
    pageIndex: currentPage,
    chunkIds,
    style,
    layerOrder: 0,
    createdBy: 'pdf-vector-import',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  batch.set(manifestRef, manifestData);

  // 3. Commit everything at once safely
  await batch.commit();

  console.log(`CAD Firestore: Saved ${chunkIds.length} chunks for manifest ${manifestId}`);
  return { manifestId, chunkIds };
}

/**
 * Load CAD chunks from Firestore for a given manifest
 */
export async function loadCADChunksFromFirestore(
  chunkIds: string[]
): Promise<{ points: Point[] }[]> {
  const chunks: { points: Point[] }[] = [];

  for (const chunkId of chunkIds) {
    const chunkRef = doc(db, 'cad_geometry_chunks', chunkId);
    const chunkSnap = await getDoc(chunkRef);
    
    if (chunkSnap.exists()) {
      const chunkData = chunkSnap.data() as CADChunk;
      chunks.push(...chunkData.lines);
    }
  }

  return chunks;
}

/**
 * Delete CAD chunks from Firestore
 */
export async function deleteCADChunksFromFirestore(chunkIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  
  for (const chunkId of chunkIds) {
    const chunkRef = doc(db, 'cad_geometry_chunks', chunkId);
    batch.delete(chunkRef);
  }
  
  await batch.commit();
  console.log(`CAD Firestore: Deleted ${chunkIds.length} chunks`);
}
