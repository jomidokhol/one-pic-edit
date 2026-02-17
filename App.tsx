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
            error: err.message || "Failed to analyze image. Check your API key and connection." 
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
        throw new Error("The AI was unable to generate an edited image for this area.");
      }
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        processing: { 
          ...prev.processing, 
          isEditing: false, 
          error: err.message || "Editing failed. The AI couldn't process this area." 
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
    setCustomFilename('onepicedit-export');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-green-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">
              One Pic <span className="text-green-600 italic">Edit</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
             {state.originalImage && (
               <div className="flex items-center gap-1 mr-4 border-r pr-4 border-slate-100">
                  <button 
                    onClick={handleUndo}
                    disabled={state.historyIndex < 0}
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    title="Undo"
                  >
                    <i className="fa-solid fa-rotate-left"></i>
                  </button>
                  <button 
                    onClick={handleRedo}
                    disabled={state.historyIndex >= state.history.length - 1}
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                    title="Redo"
                  >
                    <i className="fa-solid fa-rotate-right"></i>
                  </button>
               </div>
             )}

             {state.originalImage && (
               <button 
                 onClick={handleReset}
                 className="bg-slate-100 text-slate-600 hover:bg-slate-200 px-4 py-2 rounded-xl font-bold transition-all text-sm"
               >
                 New Project
               </button>
             )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full">
        {!state.originalImage ? (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-extrabold text-slate-900 mb-4 leading-tight">
                Perfect Edits, <br/>
                <span className="text-green-600">Invisible Results.</span>
              </h2>
              <p className="text-lg text-slate-600">
                Upload any photo, click text to rewrite it with custom fonts, colors, and strokes.
              </p>
            </div>

            <label className="group relative block w-full aspect-video border-4 border-dashed border-slate-200 rounded-3xl hover:border-green-400 hover:bg-green-50/30 transition-all cursor-pointer overflow-hidden">
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
                <div className="w-20 h-20 bg-slate-100 group-hover:bg-green-100 rounded-full flex items-center justify-center transition-colors mb-4">
                  <i className="fa-solid fa-cloud-arrow-up text-3xl text-slate-400 group-hover:text-green-600"></i>
                </div>
                <p className="text-xl font-bold text-slate-700 mb-1 group-hover:text-green-700">Drop your photo here</p>
                <p className="text-slate-500">Supports JPG, PNG, and WebP</p>
              </div>
            </label>
          </div>
        ) : (
          <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            {state.processing.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-2xl flex items-center gap-4">
                <i className="fa-solid fa-circle-exclamation text-xl"></i>
                <p className="font-medium">{state.processing.error}</p>
                <button 
                  onClick={() => setState(p => ({ ...p, processing: { ...p.processing, error: null } }))}
                  className="ml-auto text-red-400 hover:text-red-600"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            )}

            {/* Download and Options Bar */}
            {currentImage && (
              <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6 animate-in fade-in slide-in-from-top-4">
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                   <div className="flex flex-col w-full sm:w-64">
                     <label className="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">Filename</label>
                     <input 
                       type="text" 
                       value={customFilename}
                       onChange={(e) => setCustomFilename(e.target.value)}
                       placeholder="Enter filename..."
                       className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none text-sm font-bold text-slate-800"
                     />
                   </div>
                   <div className="flex flex-col w-full sm:w-auto">
                     <label className="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">Resolution</label>
                     <div className="relative">
                        <button 
                          onClick={() => setShowResMenu(!showResMenu)}
                          className="w-full sm:w-40 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-sm font-bold text-slate-700 hover:bg-slate-100 transition-all"
                        >
                          <span>{downloadRes === 'original' ? 'Highest (Original)' : downloadRes.toUpperCase()}</span>
                          <i className={`fa-solid fa-chevron-${showResMenu ? 'up' : 'down'} text-[10px]`}></i>
                        </button>
                        {showResMenu && (
                          <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                             <div className="p-2 flex flex-col">
                               {(['original', '4k', '2k', '1080p'] as Resolution[]).map((res) => (
                                 <button
                                   key={res}
                                   onClick={() => {
                                     setDownloadRes(res);
                                     setShowResMenu(false);
                                   }}
                                   className={`px-4 py-2 text-left text-xs font-bold rounded-xl transition-colors ${downloadRes === res ? 'bg-green-50 text-green-700' : 'text-slate-600 hover:bg-slate-50'}`}
                                 >
                                   {res === 'original' ? 'Highest (Original)' : res.toUpperCase()}
                                 </button>
                               ))}
                             </div>
                          </div>
                        )}
                     </div>
                   </div>
                </div>

                <button 
                  onClick={handleDownload}
                  className="w-full md:w-auto bg-green-600 text-white px-8 py-3 rounded-2xl font-black shadow-lg shadow-green-100 hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 text-lg"
                >
                  <i className="fa-solid fa-circle-check"></i>
                  Download Final Edit
                </button>
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-8 items-start">
              <div className="flex-1 w-full">
                <EditorOverlay
                  imageSrc={currentImage || state.originalImage}
                  detectedTexts={state.detectedTexts}
                  onEditText={handleEditText}
                  isProcessing={state.processing.isEditing}
                  isAnalyzing={state.processing.isAnalyzing}
                />
              </div>

              <div className="w-full lg:w-80 bg-white p-6 rounded-3xl shadow-xl border border-slate-100 flex flex-col gap-6 sticky top-24">
                <div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">Editor Panel</h3>
                  <ul className="text-sm text-slate-500 leading-relaxed list-disc list-inside space-y-2">
                    <li>Click any detected text box.</li>
                    <li>Update text, font, and color.</li>
                    <li>The AI will seamlessly blend it.</li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4">Statistics</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">Detected items</span>
                      <span className="font-bold text-slate-700">{state.detectedTexts.length}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">History index</span>
                      <span className="font-bold text-green-600">{state.historyIndex + 1} / {state.history.length}</span>
                    </div>
                  </div>
                </div>

                {state.processing.isAnalyzing && (
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                    <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm font-medium text-slate-600">Scanning for text...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm font-medium">
            &copy; {new Date().getFullYear()} One Pic Edit. Powered by Gemini AI.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;