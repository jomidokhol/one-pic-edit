import React, { useState, useCallback } from 'react';
import { AppState, DetectedText } from './types';
import { analyzeImageText, editImageText } from './services/geminiService';
import { EditorOverlay } from './components/EditorOverlay';

type Resolution = 'original' | '4k' | '2k' | '1080p';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    originalImage: null,
    history: [],
    historyIndex: -1,
    detectedTexts: [],
    selectedTextId: null,
    processing: {
      isAnalyzing: false,
      isEditing: false,
      error: null,
    },
  });

  const [downloadRes, setDownloadRes] = useState<Resolution>('original');
  const [customFilename, setCustomFilename] = useState('onepicedit-export');
  const [showResMenu, setShowResMenu] = useState(false);

  const currentImage = state.historyIndex >= 0 ? state.history[state.historyIndex] : state.originalImage;

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      setState(prev => ({ 
        ...prev, 
        originalImage: base64, 
        history: [],
        historyIndex: -1,
        detectedTexts: [],
        processing: { ...prev.processing, isAnalyzing: true, error: null } 
      }));

      try {
        const results = await analyzeImageText(base64);
        setState(prev => ({
          ...prev,
          detectedTexts: results,
          processing: { ...prev.processing, isAnalyzing: false }
        }));
      } catch (err: any) {
        setState(prev => ({
          ...prev,
          processing: { 
            ...prev.processing, 
            isAnalyzing: false, 
            error: err.message || "Failed to analyze image. Check your API key." 
          }
        }));
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleEditText = useCallback(async (id: string, newText: string, font: string, color: string, strokeColor: string, strokeWidth: number, fontSize: number) => {
    const target = state.detectedTexts.find(t => t.id === id);
    if (!target || !state.originalImage) return;

    setState(prev => ({
      ...prev,
      processing: { ...prev.processing, isEditing: true, error: null }
    }));

    try {
      const baseToEdit = currentImage || state.originalImage;
      const result = await editImageText(baseToEdit, target.text, newText, target.boundingBox, font, color, strokeColor, strokeWidth, fontSize);
      
      if (result) {
        setState(prev => {
          const newHistory = prev.history.slice(0, prev.historyIndex + 1);
          newHistory.push(result);
          
          return {
            ...prev,
            history: newHistory,
            historyIndex: newHistory.length - 1,
            detectedTexts: prev.detectedTexts.map(t => t.id === id ? { ...t, text: newText, isEdited: true } : t),
            processing: { ...prev.processing, isEditing: false }
          };
        });
      } else {
        throw new Error("Editing failed. The AI couldn't generate the requested area.");
      }
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        processing: { 
          ...prev.processing, 
          isEditing: false, 
          error: err.message || "Editing failed." 
        }
      }));
    }
  }, [state.originalImage, state.history, state.historyIndex, state.detectedTexts, currentImage]);

  const handleUndo = () => {
    if (state.historyIndex >= 0) {
      setState(prev => ({ ...prev, historyIndex: prev.historyIndex - 1 }));
    }
  };

  const handleRedo = () => {
    if (state.historyIndex < state.history.length - 1) {
      setState(prev => ({ ...prev, historyIndex: prev.historyIndex + 1 }));
    }
  };

  const handleDownload = async () => {
    if (!currentImage) return;
    const finalName = (customFilename.trim() || 'export') + '.png';

    if (downloadRes === 'original') {
      const link = document.createElement('a');
      link.href = currentImage;
      link.download = finalName;
      link.click();
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let targetWidth = img.width;
      switch(downloadRes) {
        case '4k': targetWidth = 3840; break;
        case '2k': targetWidth = 2560; break;
        case '1080p': targetWidth = 1920; break;
      }
      const aspectRatio = img.height / img.width;
      canvas.width = targetWidth;
      canvas.height = targetWidth * aspectRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const resizedBase64 = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = resizedBase64;
        link.download = finalName;
        link.click();
      }
    };
    img.src = currentImage;
  };

  const handleReset = () => {
    setState({
      originalImage: null,
      history: [],
      historyIndex: -1,
      detectedTexts: [],
      selectedTextId: null,
      processing: {
        isAnalyzing: false,
        isEditing: false,
        error: null,
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-black text-slate-800">One Pic <span className="text-green-600">Edit</span></h1>
          <div className="flex items-center gap-2">
             {state.originalImage && (
               <div className="flex items-center gap-1 border-r pr-4 border-slate-100">
                  <button onClick={handleUndo} disabled={state.historyIndex < 0} className="w-8 h-8 rounded hover:bg-slate-100 disabled:opacity-30"><i className="fa-solid fa-rotate-left"></i></button>
                  <button onClick={handleRedo} disabled={state.historyIndex >= state.history.length - 1} className="w-8 h-8 rounded hover:bg-slate-100 disabled:opacity-30"><i className="fa-solid fa-rotate-right"></i></button>
                  <button onClick={handleReset} className="ml-2 text-xs font-bold text-slate-400 hover:text-slate-600">Reset</button>
               </div>
             )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        {state.processing.error && (
          <div className="mb-6 bg-red-50 border border-red-200 p-6 rounded-2xl">
            <div className="flex items-start gap-4">
              <i className="fa-solid fa-triangle-exclamation text-red-600 text-2xl mt-1"></i>
              <div>
                <h3 className="font-bold text-red-800 text-lg">System Error</h3>
                <p className="text-red-700 font-medium mb-3">{state.processing.error}</p>
                {state.processing.error.includes("leaked") && (
                  <div className="bg-white p-4 rounded-xl border border-red-100 text-sm text-slate-600 space-y-2">
                    <p className="font-bold text-slate-800">How to fix this:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Go to <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-600 underline">Google AI Studio</a>.</li>
                      <li>Delete the compromised key and create a <strong>new one</strong>.</li>
                      <li>Update the <strong>API_KEY</strong> environment variable in Vercel.</li>
                      <li>Redeploy your project.</li>
                    </ol>
                    <p className="italic text-xs mt-2 text-red-500">Note: Sharing keys in a chat window causes them to be flagged as leaked.</p>
                  </div>
                )}
                <button onClick={() => setState(p => ({ ...p, processing: { ...p.processing, error: null } }))} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700">Dismiss</button>
              </div>
            </div>
          </div>
        )}

        {!state.originalImage ? (
          <div className="max-w-xl mx-auto text-center py-20">
            <h2 className="text-3xl font-bold mb-4">Magic Text Editing</h2>
            <p className="text-slate-500 mb-8">Upload a photo to detect and rewrite text perfectly.</p>
            <label className="block p-20 border-2 border-dashed border-slate-300 rounded-3xl hover:border-green-500 hover:bg-green-50 transition-all cursor-pointer">
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
              <i className="fa-solid fa-cloud-arrow-up text-4xl text-slate-300 mb-4 block"></i>
              <span className="font-bold text-slate-600">Click to upload photo</span>
            </label>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            <div className="flex-1">
              <EditorOverlay
                imageSrc={currentImage || state.originalImage}
                detectedTexts={state.detectedTexts}
                onEditText={handleEditText}
                isProcessing={state.processing.isEditing}
                isAnalyzing={state.processing.isAnalyzing}
              />
            </div>
            
            <div className="w-full lg:w-80 space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold mb-4">Export Options</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Filename</label>
                    <input type="text" value={customFilename} onChange={e => setCustomFilename(e.target.value)} className="w-full mt-1 px-3 py-2 bg-slate-50 rounded-lg text-sm border focus:ring-2 focus:ring-green-500 outline-none" />
                  </div>
                  <button onClick={handleDownload} className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all">Download Image</button>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="font-bold text-sm mb-2">Instructions</h3>
                <p className="text-xs text-slate-500 leading-relaxed">Select any green box in the image to change its text. AI will handle the font, color, and background matching automatically.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;