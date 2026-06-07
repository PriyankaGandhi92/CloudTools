# BluePrint - Collaborative PDF Editor

A browser-based collaborative PDF editor inspired by Bluebeam Revu, with measurement tools, markup workflows, and real-time collaboration.

## Tech Stack

- **React + TypeScript** (Vite)
- **PDF.js** for PDF rendering
- **Konva.js** (react-konva) for canvas interaction
- **Firebase** (Auth, Firestore, Storage) for backend
- **Zustand** for state management
- **TailwindCSS** for styling
- **Lucide** for icons

## Features

### PDF Handling
- Upload and render PDFs with zoom/pan
- Page thumbnail navigation (left sidebar)

### Markup Tools
- Text, arrows, lines, rectangles, circles
- Freehand drawing & highlighting
- Select / move / resize / delete annotations
- Style controls (color, fill, stroke width, opacity)

### Measurement System
- **Calibration Mode** — draw a reference line, input real-world value, supports non-uniform X/Y scaling
- **Distance** — point-to-point measurement
- **Area** — polygon area (double-click to close)
- **Perimeter** — polygon perimeter
- **Angle** — 3-point angle measurement
- **Count** — click to count objects
- **Volume** — area × height input
- Live measurement display while drawing
- Unit support: inches, feet, cm, meters, mm

### Real-Time Collaboration
- Firestore-based annotation sync
- User presence indicators
- Shareable document concept

### Tool Chest (Right Sidebar)
- Save custom markup presets
- Reusable annotation styles
- Calibration info display
- Measurement results panel

### Advanced
- Undo/redo (Ctrl+Z / Ctrl+Y)
- Snap-to-grid (optional)
- Layer ordering
- Drag-and-drop annotations

## Getting Started

```bash
# Install dependencies
npm install

# Copy env and add your Firebase credentials
cp .env.example .env

# Start dev server
npm run dev
```

## Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Authentication, Firestore, and Storage
3. Copy your config values into `.env`

### Firestore Data Model

```
documents/{docId}
  ├── annotations/{annId}    — type, points, style, createdBy, timestamps
  ├── measurements/{measId}  — type, value, unit, annotationId
  ├── calibrations/{pageIdx} — scaleX, scaleY, unit, realWorldValue
  └── presence/{userId}      — displayName, color, currentPage, lastActive
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Ctrl+Z | Undo |
| Ctrl+Shift+Z / Ctrl+Y | Redo |
| Delete | Delete selected annotation |

## Local-Only Mode

The app works fully offline without Firebase. All annotations, measurements, and calibrations are stored in local Zustand state. To enable Firebase sync, configure your `.env` and use the `useFirebaseSync` hook.
