
export interface DetectedText {
  id: string;
  text: string;
  isEdited?: boolean;
  boundingBox: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
  confidence: number;
}

export interface ProcessingState {
  isAnalyzing: boolean;
  isEditing: boolean;
  error: string | null;
}

export interface AppState {
  originalImage: string | null;
  history: string[]; // Stack of base64 images
  historyIndex: number;
  detectedTexts: DetectedText[];
  selectedTextId: string | null;
  processing: ProcessingState;
}
