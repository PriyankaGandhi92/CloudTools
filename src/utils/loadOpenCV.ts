let opencvPromise: Promise<void> | null = null;

declare global {
  interface Window { cv: any; }
}

export async function loadOpenCV(): Promise<void> {
  if (window.cv && window.cv.Mat) {
    return Promise.resolve();
  }

  if (opencvPromise) {
    return opencvPromise;
  }

  opencvPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
    script.async = true;
    
    script.onload = () => {
      // Wait for OpenCV to initialize
      const checkInterval = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('OpenCV failed to load within timeout'));
      }, 10000);
    };
    
    script.onerror = () => {
      reject(new Error('Failed to load OpenCV script'));
    };
    
    document.head.appendChild(script);
  });

  return opencvPromise;
}

export function isOpenCVReady(): boolean {
  return !!(window.cv && window.cv.Mat);
}
