import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Upload, Image as ImageIcon, Type, Save, Sparkles, Loader2 } from 'lucide-react';
import type { BIMType, BIMDialogData } from '../types';
import { callGeminiBimAnalyze } from '../utils/firebaseAi';
import { useStore } from '../store/useStore';

interface BimDataDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: BIMDialogData) => void;
  bimType: BIMType;
  initialData?: BIMDialogData;
}

export default function BimDataDialog({ isOpen, onClose, onSave, bimType, initialData }: BimDataDialogProps) {
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [images, setImages] = useState<string[]>(initialData?.images || []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  // Door-specific fields
  const [doorType, setDoorType] = useState(initialData?.doorType || '');
  const [doorWidth, setDoorWidth] = useState(initialData?.doorWidth || '');
  const [doorHeight, setDoorHeight] = useState(initialData?.doorHeight || '');
  const [doorMaterial, setDoorMaterial] = useState(initialData?.doorMaterial || '');
  const [doorFireRating, setDoorFireRating] = useState(initialData?.doorFireRating || '');
  const [doorManufacturer, setDoorManufacturer] = useState(initialData?.doorManufacturer || '');

  // Wall-specific fields
  const [wallType, setWallType] = useState(initialData?.wallType || '');
  const [wallThickness, setWallThickness] = useState(initialData?.wallThickness || '');
  const [wallHeight, setWallHeight] = useState(initialData?.wallHeight || '');
  const [wallMaterial, setWallMaterial] = useState(initialData?.wallMaterial || '');
  const [wallInsulation, setWallInsulation] = useState(initialData?.wallInsulation || '');
  const [wallFireRating, setWallFireRating] = useState(initialData?.wallFireRating || '');

  // Supplier-specific fields
  const [supplierName, setSupplierName] = useState(initialData?.supplierName || '');
  const [supplierContact, setSupplierContact] = useState(initialData?.supplierContact || '');
  const [supplierCategory, setSupplierCategory] = useState(initialData?.supplierCategory || '');

  // Fire Rating-specific fields
  const [fireRatingValue, setFireRatingValue] = useState(initialData?.fireRatingValue || '');
  const [assemblyType, setAssemblyType] = useState(initialData?.assemblyType || '');
  const [testedAssembly, setTestedAssembly] = useState(initialData?.testedAssembly || '');

  // Update state when initialData changes
  useEffect(() => {
    setNotes(initialData?.notes || '');
    setImages(initialData?.images || []);
    setDoorType(initialData?.doorType || '');
    setDoorWidth(initialData?.doorWidth || '');
    setDoorHeight(initialData?.doorHeight || '');
    setDoorMaterial(initialData?.doorMaterial || '');
    setDoorFireRating(initialData?.doorFireRating || '');
    setDoorManufacturer(initialData?.doorManufacturer || '');
    setWallType(initialData?.wallType || '');
    setWallThickness(initialData?.wallThickness || '');
    setWallHeight(initialData?.wallHeight || '');
    setWallMaterial(initialData?.wallMaterial || '');
    setWallInsulation(initialData?.wallInsulation || '');
    setWallFireRating(initialData?.wallFireRating || '');
    setSupplierName(initialData?.supplierName || '');
    setSupplierContact(initialData?.supplierContact || '');
    setSupplierCategory(initialData?.supplierCategory || '');
    setFireRatingValue(initialData?.fireRatingValue || '');
    setAssemblyType(initialData?.assemblyType || '');
    setTestedAssembly(initialData?.testedAssembly || '');
  }, [initialData]);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        setImages((prev) => [...prev, base64]);

        // Trigger AI analysis via Firebase Functions
        if (!aiAnalyzing) {
          setAiAnalyzing(true);
          try {
            const imageBase64 = base64.split(',')[1];
            console.log('Starting AI analysis for', bimType, 'with image size:', imageBase64.length);
            const result = await callGeminiBimAnalyze({ imageBase64, bimType });
            console.log('AI analysis result:', result);
            
            if (result.success && result.data) {
              // Auto-fill form fields based on BIM type
              if (bimType === 'door') {
                if (result.data.doorType) { console.log('Setting doorType:', result.data.doorType); setDoorType(result.data.doorType); }
                if (result.data.doorWidth) { console.log('Setting doorWidth:', result.data.doorWidth); setDoorWidth(result.data.doorWidth); }
                if (result.data.doorHeight) { console.log('Setting doorHeight:', result.data.doorHeight); setDoorHeight(result.data.doorHeight); }
                if (result.data.doorMaterial) { console.log('Setting doorMaterial:', result.data.doorMaterial); setDoorMaterial(result.data.doorMaterial); }
                if (result.data.doorFireRating) { console.log('Setting doorFireRating:', result.data.doorFireRating); setDoorFireRating(result.data.doorFireRating); }
                if (result.data.doorManufacturer) { console.log('Setting doorManufacturer:', result.data.doorManufacturer); setDoorManufacturer(result.data.doorManufacturer); }
              } else if (bimType === 'wall') {
                if (result.data.wallType) { console.log('Setting wallType:', result.data.wallType); setWallType(result.data.wallType); }
                if (result.data.wallThickness) { console.log('Setting wallThickness:', result.data.wallThickness); setWallThickness(result.data.wallThickness); }
                if (result.data.wallHeight) { console.log('Setting wallHeight:', result.data.wallHeight); setWallHeight(result.data.wallHeight); }
                if (result.data.wallMaterial) { console.log('Setting wallMaterial:', result.data.wallMaterial); setWallMaterial(result.data.wallMaterial); }
                if (result.data.wallInsulation) { console.log('Setting wallInsulation:', result.data.wallInsulation); setWallInsulation(result.data.wallInsulation); }
                if (result.data.wallFireRating) { console.log('Setting wallFireRating:', result.data.wallFireRating); setWallFireRating(result.data.wallFireRating); }
              } else if (bimType === 'supplier') {
                if (result.data.supplierName) { console.log('Setting supplierName:', result.data.supplierName); setSupplierName(result.data.supplierName); }
                if (result.data.supplierContact) { console.log('Setting supplierContact:', result.data.supplierContact); setSupplierContact(result.data.supplierContact); }
                if (result.data.supplierCategory) { console.log('Setting supplierCategory:', result.data.supplierCategory); setSupplierCategory(result.data.supplierCategory); }
              } else if (bimType === 'fire-rating') {
                if (result.data.fireRatingValue) { console.log('Setting fireRatingValue:', result.data.fireRatingValue); setFireRatingValue(result.data.fireRatingValue); }
                if (result.data.assemblyType) { console.log('Setting assemblyType:', result.data.assemblyType); setAssemblyType(result.data.assemblyType); }
                if (result.data.testedAssembly) { console.log('Setting testedAssembly:', result.data.testedAssembly); setTestedAssembly(result.data.testedAssembly); }
              }
              if (result.data.notes) { console.log('Setting notes:', result.data.notes); setNotes(result.data.notes); }
            }
          } catch (error: any) {
            console.error('AI analysis failed:', error);
            const errorMessage = error?.message || error?.toString() || 'Unknown error';
            alert(`AI analysis failed: ${errorMessage}. Please ensure Firebase Functions are deployed and API keys are configured.`);
          } finally {
            setAiAnalyzing(false);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleCameraCapture = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const data: BIMDialogData = {
      notes,
      images,
    };

    if (bimType === 'door') {
      data.doorType = doorType;
      data.doorWidth = doorWidth;
      data.doorHeight = doorHeight;
      data.doorMaterial = doorMaterial;
      data.doorFireRating = doorFireRating;
      data.doorManufacturer = doorManufacturer;
    } else if (bimType === 'wall') {
      data.wallType = wallType;
      data.wallThickness = wallThickness;
      data.wallHeight = wallHeight;
      data.wallMaterial = wallMaterial;
      data.wallInsulation = wallInsulation;
      data.wallFireRating = wallFireRating;
    } else if (bimType === 'supplier') {
      data.supplierName = supplierName;
      data.supplierContact = supplierContact;
      data.supplierCategory = supplierCategory;
    } else if (bimType === 'fire-rating') {
      data.fireRatingValue = fireRatingValue;
      data.assemblyType = assemblyType;
      data.testedAssembly = testedAssembly;
    }

    onSave(data);
    onClose();
  };

  const getDialogTitle = () => {
    switch (bimType) {
      case 'door': return 'Door Information';
      case 'wall': return 'Wall Information';
      case 'supplier': return 'Supplier Information';
      case 'fire-rating': return 'Fire Rating Information';
      default: return 'BIM Information';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]">
      <div className="bg-bb-sidebar border border-bb-border rounded-lg shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-bb-border">
          <h2 className="text-lg font-semibold text-bb-text">{getDialogTitle()}</h2>
          <button onClick={onClose} className="p-1 hover:bg-bb-hover rounded text-bb-muted">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {/* Door-specific fields */}
          {bimType === 'door' && (
            <>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  <Type size={16} />
                  Door Type
                </label>
                <select
                  value={doorType}
                  onChange={(e) => setDoorType(e.target.value)}
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select door type...</option>
                  <option value="Single">Single</option>
                  <option value="Double">Double</option>
                  <option value="Sliding">Sliding</option>
                  <option value="Folding">Folding</option>
                  <option value="Revolving">Revolving</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                    Width
                  </label>
                  <input
                    type="text"
                    value={doorWidth}
                    onChange={(e) => setDoorWidth(e.target.value)}
                    placeholder="e.g., 36 or 3 ft"
                    className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                    Height
                  </label>
                  <input
                    type="text"
                    value={doorHeight}
                    onChange={(e) => setDoorHeight(e.target.value)}
                    placeholder="e.g., 80 or 6'8"
                    className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  Material
                </label>
                <input
                  type="text"
                  value={doorMaterial}
                  onChange={(e) => setDoorMaterial(e.target.value)}
                  placeholder="e.g., Wood, Steel, Glass"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  Fire Rating
                </label>
                <input
                  type="text"
                  value={doorFireRating}
                  onChange={(e) => setDoorFireRating(e.target.value)}
                  placeholder="e.g., 30 min, 60 min"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  Manufacturer
                </label>
                <input
                  type="text"
                  value={doorManufacturer}
                  onChange={(e) => setDoorManufacturer(e.target.value)}
                  placeholder="Manufacturer name"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}

          {/* Wall-specific fields */}
          {bimType === 'wall' && (
            <>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  <Type size={16} />
                  Wall Type
                </label>
                <select
                  value={wallType}
                  onChange={(e) => setWallType(e.target.value)}
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select wall type...</option>
                  <option value="Load-bearing">Load-bearing</option>
                  <option value="Partition">Partition</option>
                  <option value="Curtain">Curtain</option>
                  <option value="Shear">Shear</option>
                  <option value="Retaining">Retaining</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="mb-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                    Thickness
                  </label>
                  <input
                    type="text"
                    value={wallThickness}
                    onChange={(e) => setWallThickness(e.target.value)}
                    placeholder="e.g., 4 or 6 inches"
                    className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                    Height
                  </label>
                  <input
                    type="text"
                    value={wallHeight}
                    onChange={(e) => setWallHeight(e.target.value)}
                    placeholder="e.g., 8 ft or 10 ft"
                    className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  Material
                </label>
                <input
                  type="text"
                  value={wallMaterial}
                  onChange={(e) => setWallMaterial(e.target.value)}
                  placeholder="e.g., Concrete, Brick, Drywall"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  Insulation
                </label>
                <input
                  type="text"
                  value={wallInsulation}
                  onChange={(e) => setWallInsulation(e.target.value)}
                  placeholder="e.g., R-13, R-19"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  Fire Rating
                </label>
                <input
                  type="text"
                  value={wallFireRating}
                  onChange={(e) => setWallFireRating(e.target.value)}
                  placeholder="e.g., 1-hour, 2-hour"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}

          {/* Supplier-specific fields */}
          {bimType === 'supplier' && (
            <>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  <Type size={16} />
                  Supplier Name
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="Supplier company name"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  Contact Information
                </label>
                <input
                  type="text"
                  value={supplierContact}
                  onChange={(e) => setSupplierContact(e.target.value)}
                  placeholder="Phone, email, or website"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  Product Category
                </label>
                <input
                  type="text"
                  value={supplierCategory}
                  onChange={(e) => setSupplierCategory(e.target.value)}
                  placeholder="e.g., HVAC, Electrical, Plumbing"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}

          {/* Fire Rating-specific fields */}
          {bimType === 'fire-rating' && (
            <>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  <Type size={16} />
                  Fire Rating
                </label>
                <input
                  type="text"
                  value={fireRatingValue}
                  onChange={(e) => setFireRatingValue(e.target.value)}
                  placeholder="e.g., 1-hour, 2-hour, 3-hour"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  Assembly Type
                </label>
                <select
                  value={assemblyType}
                  onChange={(e) => setAssemblyType(e.target.value)}
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select assembly type...</option>
                  <option value="Wall">Wall</option>
                  <option value="Floor">Floor</option>
                  <option value="Ceiling">Ceiling</option>
                  <option value="Roof">Roof</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
                  Tested Assembly
                </label>
                <input
                  type="text"
                  value={testedAssembly}
                  onChange={(e) => setTestedAssembly(e.target.value)}
                  placeholder="e.g., UL Design U301"
                  className="w-full bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted focus:outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}

          {/* Common fields */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
              <Type size={16} />
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              className="w-full h-32 bg-bb-dark border border-bb-border rounded p-3 text-sm text-bb-text placeholder-bb-muted resize-none focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Images Section */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-bb-text mb-2">
              <ImageIcon size={16} />
              Photos
            </label>

            {/* Image Upload Buttons */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={handleCameraCapture}
                disabled={aiAnalyzing}
                className="flex items-center gap-2 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {aiAnalyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Camera size={16} />
                    Camera+AI
                  </>
                )}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={aiAnalyzing}
                className="flex items-center gap-2 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {aiAnalyzing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Upload
                  </>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                disabled={aiAnalyzing}
                className="hidden"
              />
            </div>

            {aiAnalyzing && (
              <div className="flex items-center gap-2 text-xs text-blue-300 mb-3">
                <Sparkles size={12} className="animate-pulse" />
                <span>Analyzing image with AI to auto-fill form fields...</span>
              </div>
            )}

            {/* Image Preview Grid */}
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={img}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-24 object-cover rounded border border-bb-border"
                    />
                    <button
                      onClick={() => handleRemoveImage(index)}
                      className="absolute top-1 right-1 p-1 bg-red-600/80 hover:bg-red-600 rounded text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-bb-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-bb-dark hover:bg-bb-hover text-bb-text text-sm rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
          >
            <Save size={16} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
