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
            error: err.message || "Failed to analyze image." 
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
                  <button onClick={handleUndo} disabled={state.historyIndex < 0} className="w-8 h-8 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"><i className="fa-solid fa-rotate-left"></i></button>
                  <button onClick={handleRedo} disabled={state.historyIndex >= state.history.length - 1} className="w-8 h-8 rounded hover:bg-slate-100 disabled:opacity-30 transition-colors"><i className="fa-solid fa-rotate-right"></i></button>
                  <button onClick={handleReset} className="ml-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">Reset</button>
               </div>
             )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
        {state.processing.error && (
          <div className="mb-6 bg-amber-50 border border-amber-200 p-6 rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-4">
              <i className={`fa-solid ${state.processing.error.includes("QUOTA") ? 'fa-hourglass-half' : 'fa-triangle-exclamation'} text-amber-600 text-2xl mt-1`}></i>
              <div className="flex-1">
                <h3 className="font-bold text-amber-800 text-lg">
                  {state.processing.error.includes("QUOTA") ? "Rate Limit Reached" : "Service Issue"}
                </h3>
                <p className="text-amber-700 font-medium mb-3">{state.processing.error}</p>
                
                {state.processing.error.includes("QUOTA") && (
                  <div className="bg-white/60 p-4 rounded-xl border border-amber-100 text-sm text-slate-700 space-y-2">
                    <p className="font-bold text-slate-800 underline">Free Tier Notice:</p>
                    <p>The Gemini API free tier limits how many images you can process per minute.</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Wait <strong>60 seconds</strong> and try again.</li>
                      <li>Check your project's limits in the <a href="https://console.cloud.google.com/google/maps-apis/quotas" target="_blank" className="text-blue-600 hover:underline">Cloud Console</a>.</li>
                      <li>Consider adding a credit card to your Google Cloud project to enable Pay-As-You-Go pricing.</li>
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex gap-3">
                  <button 
                    onClick={() => setState(p => ({ ...p, processing: { ...p.processing, error: null } }))} 
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 transition-all shadow-sm"
                  >
                    Dismiss
                  </button>
                  {state.processing.error.includes("QUOTA") && (
                    <button 
                      onClick={() => window.location.reload()} 
                      className="px-4 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg font-bold hover:bg-amber-50 transition-all shadow-sm"
                    >
                      Retry Now
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!state.originalImage ? (
          <div className="max-w-xl mx-auto text-center py-20 animate-in fade-in duration-700">
            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-3xl flex items-center justify-center mx-auto mb-6 text-3xl shadow-inner">
               <i className="fa-solid fa-wand-magic-sparkles"></i>
            </div>
            <h2 className="text-4xl font-black mb-4 tracking-tight text-slate-900">Magic Text Editing</h2>
            <p className="text-slate-500 mb-10 text-lg leading-relaxed">Detect, rewrite, and blend text into any photo using cutting-edge AI. No design skills required.</p>
            <label className="group block p-20 border-4 border-dashed border-slate-200 rounded-[2.5rem] hover:border-green-500 hover:bg-green-50/50 transition-all cursor-pointer relative overflow-hidden">
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
              <div className="relative z-10">
                <i className="fa-solid fa-cloud-arrow-up text-5xl text-slate-300 group-hover:text-green-400 group-hover:scale-110 transition-all mb-4 block"></i>
                <span className="text-xl font-bold text-slate-600 group-hover:text-green-700 transition-colors">Click to choose a photo</span>
                <p className="text-sm text-slate-400 mt-2">Maximum file size: 10MB</p>
              </div>
            </label>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8 animate-in slide-in-from-bottom-4 duration-500">
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
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 ring-1 ring-slate-100">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <i className="fa-solid fa-download text-green-600 text-sm"></i>
                  Export Settings
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filename</label>
                    <input 
                      type="text" 
                      value={customFilename} 
                      onChange={e => setCustomFilename(e.target.value)} 
                      className="w-full mt-1 px-4 py-2.5 bg-slate-50 rounded-xl text-sm border-2 border-transparent focus:border-green-500 focus:bg-white transition-all outline-none font-bold" 
                    />
                  </div>
                  <button 
                    onClick={handleDownload} 
                    className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-slate-200"
                  >
                    Download PNG
                  </button>
                </div>
              </div>
              
              <div className="bg-green-50 p-6 rounded-3xl border border-green-100">
                <h3 className="font-bold text-sm text-green-800 mb-3 flex items-center gap-2">
                  <i className="fa-solid fa-circle-info"></i>
                  Quick Start
                </h3>
                <ul className="text-xs text-green-700 leading-relaxed space-y-2 font-medium">
                  <li className="flex gap-2">
                    <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-[10px] shrink-0 font-bold">1</span>
                    Click any highlighted box in the image.
                  </li>
                  <li className="flex gap-2">
                    <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-[10px] shrink-0 font-bold">2</span>
                    Type your new text and choose styles.
                  </li>
                  <li className="flex gap-2">
                    <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-[10px] shrink-0 font-bold">3</span>
                    Hit "Apply" and wait for the AI to blend.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
      
      <footer className="py-10 border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
           <div className="text-sm font-bold text-slate-400">
             © {new Date().getFullYear()} One Pic Edit
           </div>
           <div className="flex gap-6 text-slate-400 font-bold text-xs uppercase tracking-widest">
              <a href="#" className="hover:text-green-600 transition-colors">Terms</a>
              <a href="#" className="hover:text-green-600 transition-colors">Privacy</a>
              <a href="https://ai.google.dev" target="_blank" className="hover:text-green-600 transition-colors">Powered by Gemini</a>
           </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
