import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface BimViewerProps {
  ifcUrl?: string; // URL to the .ifc file in Firebase Storage
}

export default function BimViewer({ ifcUrl }: BimViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Basic Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#1e1e2e');

    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);

    // Add grid helper
    const gridHelper = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
    scene.add(gridHelper);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Load IFC file if URL provided
    if (ifcUrl) {
      fetch(ifcUrl)
        .then(response => response.text())
        .then(text => {
          // For now, just show that we received the file
          // Full IFC parsing requires web-ifc library which needs separate setup
          console.log('IFC file loaded:', text.substring(0, 100) + '...');
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load IFC:', err);
          setError('Failed to load IFC file');
          setLoading(false);
        });
    } else {
      setLoading(false);
    }

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [ifcUrl]);

  return (
    <div className="w-full h-full relative bg-bb-dark">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 outline-none" />
      
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bb-dark/80 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-bb-blue border-t-transparent rounded-full animate-spin" />
            <span className="text-bb-muted font-mono text-sm">Loading BIM Model...</span>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bb-dark/90 backdrop-blur-sm z-10">
          <div className="text-center">
            <p className="text-red-400 font-mono text-sm mb-2">Error loading BIM model</p>
            <p className="text-bb-muted text-xs">{error}</p>
          </div>
        </div>
      )}

      {/* No IFC File Message */}
      {!ifcUrl && !loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-bb-dark/50 backdrop-blur-sm z-10">
          <div className="text-center">
            <p className="text-bb-muted font-mono text-sm">No BIM model linked to this document</p>
            <p className="text-bb-muted/60 text-xs mt-1">Upload an .ifc file to enable 3D view</p>
          </div>
        </div>
      )}
    </div>
  );
}
