
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { DetectedText } from '../types';

interface EditorOverlayProps {
  imageSrc: string;
  detectedTexts: DetectedText[];
  onEditText: (id: string, newText: string, font: string, color: string, strokeColor: string, strokeWidth: number, fontSize: number) => void;
  isProcessing: boolean;
  isAnalyzing: boolean;
}

const COMMON_FONTS = [
  { name: 'Match Original', value: 'original' },
  { name: 'Modern Sans (Arial)', value: 'Arial, "Helvetica Neue", Helvetica, sans-serif' },
  { name: 'Classic Serif (Times)', value: '"Times New Roman", Times, Baskerville, Georgia, serif' },
  { name: 'Monospace (Courier)', value: '"Courier New", Courier, "Lucida Sans Typewriter", "Lucida Typewriter", monospace' },
  { name: 'Geometric (Verdana)', value: 'Verdana, Geneva, sans-serif' },
  { name: 'Clean Sans (Helvetica)', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { name: 'Elegant Serif (Georgia)', value: 'Georgia, Times, "Times New Roman", serif' },
  { name: 'Bold Impact (Impact)', value: 'Impact, Haettenschweiler, "Franklin Gothic Bold", Charcoal, "Helvetica Inserat", "Bitstream Vera Sans Bold", "Arial Black", sans-serif' },
  { name: 'Slab Serif (Rockwell)', value: 'Rockwell, "Courier Bold", Courier, Georgia, Times, "Times New Roman", serif' },
  { name: 'Handwriting (Cursive)', value: '"Apple Chancery", "Brush Script MT", "Brush Script Std", "Lucidatypewriter", cursive' },
  { name: 'Comic Casual (Comic Sans)', value: '"Comic Sans MS", "Comic Sans", cursive' },
  { name: 'Bengali Modern (Hind Siliguri)', value: '"Hind Siliguri", "Noto Sans Bengali", sans-serif' },
  { name: 'Bengali Classic (Kalpurush)', value: 'Kalpurush, "Siyam Rupali", serif' },
  { name: 'Tech / Code (Consolas)', value: 'Consolas, monaco, monospace' },
  { name: 'Retro Typewriter', value: '"Lucida Sans Typewriter", "Lucida Typewriter", monospace' },
];

export const EditorOverlay: React.FC<EditorOverlayProps> = ({ 
  imageSrc, 
  detectedTexts, 
  onEditText,
  isProcessing,
  isAnalyzing
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempText, setTempText] = useState('');
  const [selectedFont, setSelectedFont] = useState('original');
  const [selectedColor, setSelectedColor] = useState('original');
  const [customColor, setCustomColor] = useState('#000000');
  const [useStroke, setUseStroke] = useState(false);
  const [strokeColor, setStrokeColor] = useState('#ffffff');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [fontSize, setFontSize] = useState(100);

  // Zoom and Pan states
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  
  // Simulated Progress State
  const [progress, setProgress] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval: number;
    if (isAnalyzing) {
      setProgress(0);
      interval = window.setInterval(() => {
        setProgress(prev => {
          if (prev < 40) return prev + 3;
          if (prev < 80) return prev + 0.8;
          if (prev < 98) return prev + 0.2;
          return prev;
        });
      }, 50);
    } else {
      setProgress(0);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const handleBoxClick = (textObj: DetectedText) => {
    if (isProcessing || isAnalyzing || isPanning) return;
    setEditingId(textObj.id);
    setTempText(textObj.text);
    setSelectedFont('original');
    setSelectedColor('original');
    setUseStroke(false);
    setFontSize(100); 
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId && tempText) {
      const colorToPass = selectedColor === 'original' ? 'original' : customColor;
      onEditText(
        editingId, 
        tempText, 
        selectedFont, 
        colorToPass, 
        useStroke ? strokeColor : 'none', 
        useStroke ? strokeWidth : 0,
        fontSize
      );
      setEditingId(null);
    }
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (isProcessing || isAnalyzing) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      const nextScale = Math.min(Math.max(scale + delta, 1), 5);
      setScale(nextScale);
      if (nextScale === 1) setOffset({ x: 0, y: 0 });
    }
  }, [isProcessing, isAnalyzing, scale]);

  const zoomIn = () => setScale(s => Math.min(s + 0.3, 5));
  const zoomOut = () => {
    const nextScale = Math.max(scale - 0.3, 1);
    setScale(nextScale);
    if (nextScale === 1) setOffset({ x: 0, y: 0 });
  };
  const resetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1 || isProcessing || isAnalyzing) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || scale <= 1) return;
    setOffset({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => setIsPanning(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const getPreviewStyle = (item: DetectedText): React.CSSProperties => {
    const isFontOriginal = selectedFont === 'original';
    const isColorOriginal = selectedColor === 'original';
    const strokeShadow = (useStroke && strokeWidth > 0) 
      ? `0 0 ${strokeWidth}px ${strokeColor}, 0 0 ${strokeWidth}px ${strokeColor}`
      : 'none';

    return {
      position: 'absolute',
      top: `${item.boundingBox.ymin / 10}%`,
      left: `${item.boundingBox.xmin / 10}%`,
      width: `${(item.boundingBox.xmax - item.boundingBox.xmin) / 10}%`,
      height: `${(item.boundingBox.ymax - item.boundingBox.ymin) / 10}%`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 25,
      fontFamily: isFontOriginal ? 'inherit' : selectedFont,
      color: isColorOriginal ? 'transparent' : customColor,
      background: isColorOriginal ? 'rgba(34, 197, 94, 0.1)' : 'transparent',
      fontSize: `${(fontSize / 100) * 80}%`, 
      fontWeight: 'bold',
      textAlign: 'center',
      textShadow: strokeShadow,
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      transition: 'all 0.1s ease-out',
      border: isColorOriginal ? '1px dashed rgba(34, 197, 94, 0.5)' : 'none',
    };
  };

  return (
    <>
      <div 
        ref={viewportRef}
        className={`relative w-full max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl bg-slate-200 ring-4 ring-green-100 group/container
          ${scale > 1 ? (isPanning ? 'cursor-grabbing select-none' : 'cursor-grab select-none') : 'cursor-default'}`}
        style={{ touchAction: scale > 1 ? 'none' : 'auto' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div 
          className="transition-transform duration-100 ease-out origin-center"
          style={{ 
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        >
          <img src={imageSrc} alt="Edit workspace" className="w-full h-auto block pointer-events-none" />
          
          <div className="absolute inset-0">
            {!isAnalyzing && detectedTexts.map((item) => {
              const isSelected = editingId === item.id;
              const isModified = item.isEdited;

              return (
                <React.Fragment key={item.id}>
                  <div
                    className={`absolute border-2 transition-all duration-300 cursor-pointer group/box flex items-center justify-center
                      ${isSelected 
                        ? 'border-green-600 bg-green-500/20 z-20 scale-[1.02] shadow-lg shadow-green-500/20' 
                        : isModified
                          ? 'border-green-500 bg-green-500/20 z-10 shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                          : 'border-white/40 bg-white/5 hover:border-green-500 hover:bg-green-500/20 hover:z-10 hover:scale-[1.01]'}`}
                    style={{
                      top: `${item.boundingBox.ymin / 10}%`,
                      left: `${item.boundingBox.xmin / 10}%`,
                      width: `${(item.boundingBox.xmax - item.boundingBox.xmin) / 10}%`,
                      height: `${(item.boundingBox.ymax - item.boundingBox.ymin) / 10}%`,
                    }}
                    onClick={() => handleBoxClick(item)}
                  >
                     <div 
                       className={`absolute -top-3 -right-3 w-6 h-6 border rounded-full flex items-center justify-center shadow-sm text-[10px] transition-all
                         ${isModified 
                            ? 'bg-green-600 border-green-700 text-white scale-110' 
                            : 'bg-white border-slate-200 text-slate-600 opacity-80 group-hover/box:opacity-100 group-hover/box:scale-110'}`}
                       style={{ transform: `scale(${1/scale})` }}
                      >
                        <i className={`fa-solid ${isModified ? 'fa-sparkles' : 'fa-pen'} text-[8px]`}></i>
                     </div>
                  </div>

                  {isSelected && (
                    <div style={getPreviewStyle(item)}>
                      {selectedColor === 'original' ? (
                        <span className="text-green-700/60 italic text-[10px] font-black uppercase tracking-tighter">Preview</span>
                      ) : (
                        tempText
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Scanner Overlay */}
          {isAnalyzing && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden bg-slate-900/40">
               <div className="absolute top-0 left-0 w-full h-[4px] bg-green-400 shadow-[0_0_25px_rgba(74,222,128,1),0_0_50px_rgba(74,222,128,0.5)] animate-scan-line z-40"></div>
               <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/90 backdrop-blur px-8 py-4 rounded-3xl shadow-2xl flex flex-col items-center gap-2 animate-bounce">
                    <span className="text-slate-800 font-black tracking-widest uppercase text-xs">Analyzing Image</span>
                    <span className="text-4xl font-black text-green-600">{Math.floor(progress)}%</span>
                  </div>
               </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-30">
          <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 p-1 flex flex-col gap-1">
            <button 
              onClick={zoomIn} 
              className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:bg-green-50 hover:text-green-600 transition-colors"
            >
              <i className="fa-solid fa-plus"></i>
            </button>
            <div className="h-[1px] bg-slate-100 mx-2"></div>
            <button 
              onClick={zoomOut} 
              className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:bg-green-50 hover:text-green-600 transition-colors"
            >
              <i className="fa-solid fa-minus"></i>
            </button>
            <div className="h-[1px] bg-slate-100 mx-2"></div>
            <button 
              onClick={resetZoom} 
              className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:bg-green-50 hover:text-green-600 transition-colors"
            >
              <i className="fa-solid fa-arrows-to-eye"></i>
            </button>
          </div>
        </div>

        {isAnalyzing && (
          <div className="absolute bottom-0 left-0 w-full h-2 bg-slate-200 z-50">
            <div 
              className="h-full bg-green-500 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}
      </div>

      {/* Global Editor Modal */}
      {editingId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div 
            className="bg-white p-6 sm:p-8 rounded-3xl shadow-2xl w-full max-w-lg transform transition-all border-t-8 border-green-600 max-h-[90vh] overflow-y-auto" 
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <div className="flex flex-col">
                <h3 className="text-2xl font-black text-slate-800 flex items-center gap-2">
                  <i className="fa-solid fa-wand-magic-sparkles text-green-600"></i>
                  Edit Text
                </h3>
              </div>
              <button 
                onClick={() => setEditingId(null)} 
                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-400">Content</label>
                <textarea
                  autoFocus
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-green-500/20 focus:border-green-500 outline-none transition-all text-slate-800 font-bold resize-none"
                  rows={2}
                  value={tempText}
                  onChange={(e) => setTempText(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400">Font</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-green-500/20 outline-none"
                    value={selectedFont}
                    onChange={(e) => setSelectedFont(e.target.value)}
                  >
                    {COMMON_FONTS.map(font => (
                      <option key={font.value} value={font.value}>{font.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400">Fill Color</label>
                  <div className="flex gap-2">
                    <select 
                      className="flex-1 px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-green-500/20 outline-none"
                      value={selectedColor}
                      onChange={(e) => setSelectedColor(e.target.value)}
                    >
                      <option value="original">Match Original</option>
                      <option value="custom">Pick Color</option>
                    </select>
                    {selectedColor === 'custom' && (
                      <input 
                        type="color" 
                        value={customColor}
                        onChange={(e) => setCustomColor(e.target.value)}
                        className="w-12 h-12 border-none p-0 bg-transparent cursor-pointer rounded-2xl overflow-hidden transition-transform hover:scale-110"
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2 bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-black uppercase tracking-wider text-slate-400">Scale factor</label>
                  <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">{fontSize}%</span>
                </div>
                <input 
                  type="range"
                  min="50"
                  max="300"
                  step="5"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-600"
                />
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                   <label className="text-xs font-black uppercase tracking-wider text-slate-400">Outline Effects</label>
                   <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={useStroke} onChange={(e) => setUseStroke(e.target.checked)} />
                      <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-green-600"></div>
                   </label>
                </div>
                
                {useStroke && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-green-50/50 rounded-2xl border-2 border-green-100">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black uppercase text-slate-400">Color</label>
                      <input type="color" value={strokeColor} onChange={(e) => setStrokeColor(e.target.value)} className="w-full h-10 bg-white cursor-pointer rounded-xl" />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black uppercase text-slate-400">Width: {strokeWidth}px</label>
                      <input type="range" min="1" max="10" value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} className="w-full h-10 accent-green-600" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setEditingId(null)} className="flex-1 px-6 py-4 text-slate-500 font-bold hover:bg-slate-100 rounded-2xl transition-all">Cancel</button>
                <button type="submit" className="flex-[2] px-6 py-4 bg-green-600 text-white font-black rounded-2xl shadow-xl hover:bg-green-700 transition-all active:scale-95">Apply Edit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isProcessing && (
        <div className="fixed inset-0 z-[70] bg-white/70 backdrop-blur-md flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-300">
          <div className="relative">
             <div className="w-20 h-20 border-8 border-green-100 rounded-full"></div>
             <div className="absolute inset-0 w-20 h-20 border-8 border-green-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div className="text-center space-y-2">
            <h4 className="text-2xl font-black text-slate-800">Perfecting Image...</h4>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan-line {
          0% { top: 0%; }
          100% { top: 100%; }
        }
        .animate-scan-line {
          animation: scan-line 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
      `}</style>
    </>
  );
};
