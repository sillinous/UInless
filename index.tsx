/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

//Vibe coded by ammaar@google.com

import { GoogleGenAI, Type } from '@google/genai';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { diffLines, diffCss, Change } from 'diff';

import { Artifact, Session, ComponentVariation, LayoutPreset } from './types';
import { INITIAL_PLACEHOLDERS, LAYOUT_OPTIONS, LAYOUT_PRESETS } from './constants';
import { generateId } from './utils';

import DottedGlowBackground from './components/DottedGlowBackground';
import ArtifactCard from './components/ArtifactCard';
import SideDrawer from './components/SideDrawer';
import { 
    ThinkingIcon, 
    CodeIcon, 
    CopyIcon,
    ReloadIcon,
    SparklesIcon, 
    ArrowLeftIcon, 
    ArrowRightIcon, 
    ArrowUpIcon, 
    GridIcon,
    MobileIcon,
    DesktopIcon,
    UndoIcon,
    RedoIcon,
    DownloadIcon,
    CheckIcon,
    ShareIcon,
    MagicIcon,
    HistoryIcon,
    LayoutIcon,
    ResponsiveIcon,
    PaletteIcon,
    ShieldCheckIcon
} from './components/Icons';

type HistoryState = {
    sessions: Session[];
    currentSessionIndex: number;
    focusedArtifactIndex: number | null;
};

type Toast = {
    id: string;
    message: string;
};

type ExportFormat = 'html' | 'react' | 'vue';

type InspectorTab = 'code' | 'tokens' | 'audit' | 'variations' | 'compare-versions';

const STORAGE_KEY = 'FLASH_UI_PERSISTENCE_V1';
const AUTO_SAVE_INTERVAL = 120000; // 2 minutes

const QUICK_ACTIONS = [
    "Dark Mode", "Add Animation", "Make Responsive", "Change Colors", "Add Data", "Minimalist Style"
];

// --- Helper: Extract Design Tokens ---
const extractDesignTokens = (html: string) => {
    const tokens: { colors: string[], fonts: string[] } = { colors: [], fonts: [] };
    
    // Hex colors
    const hexRegex = /#[0-9A-Fa-f]{3,6}/g;
    const foundColors = html.match(hexRegex);
    if (foundColors) tokens.colors = Array.from(new Set(foundColors));

    // RGB/RGBA
    const rgbaRegex = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)/g;
    const foundRgba = html.match(rgbaRegex);
    if (foundRgba) tokens.colors = [...tokens.colors, ...Array.from(new Set(foundRgba))];

    // Fonts (roughly)
    const fontRegex = /font-family:\s*['"]?([^;,'"]+)['"]?/g;
    let match;
    while ((match = fontRegex.exec(html)) !== null) {
        tokens.fonts.push(match[1].trim());
    }
    tokens.fonts = Array.from(new Set(tokens.fonts));

    return tokens;
};

const convertToReactComponent = (html: string): string => {
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    const css = styleMatch ? styleMatch[1].trim() : '';

    const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);
    let bodyHtml = bodyMatch ? bodyMatch[1].trim() : html;
    bodyHtml = bodyHtml.replace(/<style>[\s\S]*?<\/style>/, '').trim();

    let jsx = bodyHtml.replace(/class="/g, 'className="');

    return `import React, { useEffect } from 'react';

const GeneratedComponent = () => {
  useEffect(() => {
    // Add any necessary script initialization here
  }, []);

  return (
    <>
      <style>{\`
        ${css}
      \`}</style>
      <div dangerouslySetInnerHTML={{ __html: \`
        ${jsx.replace(/`/g, '\\`')}
      \` }} />
    </>
  );
};

export default GeneratedComponent;`;
};

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState<number>(-1);
  const [focusedArtifactIndex, setFocusedArtifactIndex] = useState<number | null>(null);
  
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

  const [inputValue, setInputValue] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [placeholders, setPlaceholders] = useState<string[]>(INITIAL_PLACEHOLDERS);
  
  const [previewWidth, setPreviewWidth] = useState<string>('100%'); 
  const [activeLayout, setActiveLayout] = useState<string>('layout-grid');
  const [activePreset, setActivePreset] = useState<LayoutPreset>(LAYOUT_PRESETS[0]);
  const [isLayoutPickerOpen, setIsLayoutPickerOpen] = useState<boolean>(false);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const [drawerState, setDrawerState] = useState<{
      isOpen: boolean;
      mode: InspectorTab;
      title: string;
      data: any; 
  }>({ isOpen: false, mode: 'code', title: '', data: null });
  
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>('code');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('html');
  const [auditResults, setAuditResults] = useState<{ status: string; note: string }[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);

  const [componentVariations, setComponentVariations] = useState<ComponentVariation[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const layoutPickerRef = useRef<HTMLDivElement>(null);

  const [isApiKeySelected, setIsApiKeySelected] = useState<boolean>(false);
  const [showApiKeyPrompt, setShowApiKeyPrompt] = useState<boolean>(false);

  // Auto-save logic
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const hasChangesRef = useRef(false);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.sessions) setSessions(parsed.sessions);
            if (parsed.currentSessionIndex !== undefined) setCurrentSessionIndex(parsed.currentSessionIndex);
            if (parsed.focusedArtifactIndex !== undefined) setFocusedArtifactIndex(parsed.focusedArtifactIndex);
        } catch (e) {
            console.error("Failed to restore session", e);
        }
    }
  }, []);

  // Track changes for auto-save
  useEffect(() => {
    if (sessions.length > 0) {
        hasChangesRef.current = true;
    }
  }, [sessions, currentSessionIndex, focusedArtifactIndex]);

  // Periodic check for auto-save
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasChangesRef.current && sessions.length > 0 && !isLoading) {
        setIsSaveDialogOpen(true);
      }
    }, AUTO_SAVE_INTERVAL);
    return () => clearInterval(interval);
  }, [sessions, isLoading]);

  const handleConfirmSave = useCallback(() => {
    const data = {
        sessions,
        currentSessionIndex,
        focusedArtifactIndex
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    hasChangesRef.current = false;
    setIsSaveDialogOpen(false);
    showToast("Session saved to local storage");
  }, [sessions, currentSessionIndex, focusedArtifactIndex]);

  const handlePostponeSave = useCallback(() => {
    setIsSaveDialogOpen(false);
    showToast("Save postponed");
  }, []);

  useEffect(() => {
    const checkApiKey = async () => {
        const hasEnvKey = !!process.env.API_KEY;
        let hasSelectedKey = false;
        if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
            hasSelectedKey = await window.aistudio.hasSelectedApiKey();
        }
        const isAuthorized = hasEnvKey || hasSelectedKey;
        setIsApiKeySelected(isAuthorized);
        setShowApiKeyPrompt(!isAuthorized);
    };
    checkApiKey();
  }, []);

  const showToast = (message: string) => {
      const id = Date.now().toString();
      setToasts(prev => [...prev, { id, message }]);
      setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
      }, 3000);
  };

  const addToHistory = useCallback(() => {
      setUndoStack(prev => [...prev, { sessions, currentSessionIndex, focusedArtifactIndex }]);
      setRedoStack([]);
  }, [sessions, currentSessionIndex, focusedArtifactIndex]);

  const handlePerformAudit = async (html: string) => {
      if (!isApiKeySelected || isAuditing) return;
      setIsAuditing(true);
      setAuditResults([]);
      
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: `Perform a detailed accessibility audit of this UI HTML. Look for color contrast, semantic HTML, ARIA labels, and keyboard navigation. Return ONLY a JSON array of objects with "status" (pass/warning/fail) and "note" (brief description). 
              
              HTML:
              ${html}`,
              config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                      type: Type.ARRAY,
                      items: {
                          type: Type.OBJECT,
                          properties: {
                              status: { type: Type.STRING },
                              note: { type: Type.STRING }
                          },
                          required: ["status", "note"]
                      }
                  }
              }
          });
          
          const results = JSON.parse(response.text);
          setAuditResults(results);
      } catch (e) {
          console.error("Audit failed", e);
      } finally {
          setIsAuditing(false);
      }
  };

  const handleOpenInspector = (initialTab: InspectorTab = 'code') => {
      const currentSession = sessions[currentSessionIndex];
      if (currentSession && focusedArtifactIndex !== null) {
          const artifact = currentSession.artifacts[focusedArtifactIndex];
          setActiveInspectorTab(initialTab);
          setDrawerState({ isOpen: true, mode: initialTab, title: 'Developer Inspector', data: artifact.html });
          
          if (initialTab === 'audit') {
              handlePerformAudit(artifact.html);
          }
      }
  };

  const handleSendMessage = useCallback(async (manualPrompt?: string) => {
    if (!isApiKeySelected) {
        showToast("Please select an API key first.");
        setShowApiKeyPrompt(true);
        return;
    }

    const promptToUse = manualPrompt || inputValue;
    const trimmedInput = promptToUse.trim();
    if (!trimmedInput || isLoading) return;
    setInputValue('');

    addToHistory();
    setIsLoading(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    if (focusedArtifactIndex !== null && sessions[currentSessionIndex]) {
        const currentSession = sessions[currentSessionIndex];
        const artifact = currentSession.artifacts[focusedArtifactIndex];
        const currentHtml = artifact.html;
        
        setSessions(prev => prev.map((sess, i) => 
            i === currentSessionIndex ? {
                ...sess,
                artifacts: sess.artifacts.map((art, j) => 
                    j === focusedArtifactIndex ? { 
                        ...art, 
                        versions: [...(art.versions || []), { html: art.html, timestamp: Date.now() }],
                        html: '', 
                        status: 'streaming' 
                    } : art
                )
            } : sess
        ));

        try {
             const prompt = `
            You are a World-Class Frontend Architect.
            Modify the following UI component based on: "${trimmedInput}".
            
            RULES:
            1. Use Semantic HTML.
            2. If logic is needed (tabs, toggles, etc.), include a <script> block with Vanilla JS inside the HTML.
            3. Maintain design tokens (CSS variables).
            
            EXISTING CODE:
            ${currentHtml}

            USER REQUEST:
            ${trimmedInput}

            Return ONLY updated RAW HTML.
            `.trim();

            const responseStream = await ai.models.generateContentStream({
                model: 'gemini-3-flash-preview',
                contents: [{ parts: [{ text: prompt }], role: "user" }],
            });

            let accumulatedHtml = '';
            for await (const chunk of responseStream) {
                const text = chunk.text;
                if (typeof text === 'string') {
                    accumulatedHtml += text;
                    setSessions(prev => prev.map((sess, i) => 
                        i === currentSessionIndex ? {
                            ...sess,
                            artifacts: sess.artifacts.map((art, j) => 
                                j === focusedArtifactIndex ? { ...art, html: accumulatedHtml } : art
                            )
                        } : sess
                    ));
                }
            }
            
            let finalHtml = accumulatedHtml.trim();
            finalHtml = finalHtml.replace(/```html|```/g, '').trim();

            setSessions(prev => prev.map((sess, i) => 
                i === currentSessionIndex ? {
                    ...sess,
                    artifacts: sess.artifacts.map((art, j) => 
                        j === focusedArtifactIndex ? { ...art, html: finalHtml, status: 'complete' } : art
                    )
                } : sess
            ));
        } catch (e: any) {
            setIsLoading(false);
        } finally {
            setIsLoading(false);
        }
        return;
    }

    // Standard Generation Logic
    const sessionId = generateId();
    const placeholderArtifacts: Artifact[] = Array(3).fill(null).map((_, i) => ({
        id: `${sessionId}_${i}`,
        styleName: 'Thinking...',
        html: '',
        status: 'streaming',
        versions: []
    }));

    const nextSessionIndex = sessions.length;
    setSessions(prev => [...prev, { id: sessionId, prompt: trimmedInput, timestamp: Date.now(), artifacts: placeholderArtifacts }]);
    setCurrentSessionIndex(nextSessionIndex);

    try {
        const stylePrompt = `Generate 3 creative design directions for: "${trimmedInput}". Return JSON: ["Style1", "Style2", "Style3"]`;
        const styleResponse = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: stylePrompt });
        const stylesString = styleResponse.text.match(/\[[\s\S]*\]/)?.[0] || '[]';
        const styles = JSON.parse(stylesString);

        const generateArtifact = async (idx: number, style: string) => {
            const prompt = `Create a functional UI component for "${trimmedInput}" in the style of "${style}". Include interactive JS if relevant. Return ONLY raw HTML.`;
            const responseStream = await ai.models.generateContentStream({ model: 'gemini-3-flash-preview', contents: prompt });
            let acc = '';
            for await (const chunk of responseStream) {
                acc += chunk.text;
                setSessions(prev => prev.map(s => s.id === sessionId ? {
                    ...s, artifacts: s.artifacts.map((a, i) => i === idx ? { ...a, html: acc, styleName: style } : a)
                } : s));
            }
            const final = acc.replace(/```html|```/g, '').trim();
            setSessions(prev => prev.map(s => s.id === sessionId ? {
                ...s, artifacts: s.artifacts.map((a, i) => i === idx ? { ...a, html: final, status: 'complete' } : a)
            } : s));
        };

        styles.forEach((s: string, i: number) => generateArtifact(i, s));
    } catch (e) {
        setIsLoading(false);
    } finally {
        setIsLoading(false);
    }
  }, [inputValue, isLoading, sessions, currentSessionIndex, focusedArtifactIndex, isApiKeySelected]);

  const tokens = useMemo(() => {
      const art = sessions[currentSessionIndex]?.artifacts[focusedArtifactIndex || 0];
      return art ? extractDesignTokens(art.html) : { colors: [], fonts: [] };
  }, [sessions, currentSessionIndex, focusedArtifactIndex]);

  const hasStarted = sessions.length > 0 || isLoading;

  return (
    <>
        <div className="toast-container">
            {toasts.map(toast => <div key={toast.id} className="toast"><CheckIcon /> {toast.message}</div>)}
        </div>

        {/* Auto-save confirmation dialog */}
        {isSaveDialogOpen && (
          <div className="save-dialog-overlay">
            <div className="save-dialog">
              <div className="save-dialog-icon"><HistoryIcon /></div>
              <h3>Save Your Progress?</h3>
              <p>You have unsaved changes in your current session. Would you like to save them to local storage now?</p>
              <div className="save-dialog-actions">
                <button className="postpone-btn" onClick={handlePostponeSave}>Postpone</button>
                <button className="confirm-btn" onClick={handleConfirmSave}><CheckIcon /> Save Progress</button>
              </div>
            </div>
          </div>
        )}

        <SideDrawer 
            isOpen={drawerState.isOpen} 
            onClose={() => setDrawerState(s => ({...s, isOpen: false}))} 
            title={drawerState.title}
        >
            <div className="inspector-tabs">
                <button className={activeInspectorTab === 'code' ? 'active' : ''} onClick={() => setActiveInspectorTab('code')}><CodeIcon /> Code</button>
                <button className={activeInspectorTab === 'tokens' ? 'active' : ''} onClick={() => setActiveInspectorTab('tokens')}><PaletteIcon /> Tokens</button>
                <button className={activeInspectorTab === 'audit' ? 'active' : ''} onClick={() => { setActiveInspectorTab('audit'); handlePerformAudit(drawerState.data); }}><ShieldCheckIcon /> A11y Audit</button>
            </div>

            <div className="inspector-content">
                {activeInspectorTab === 'code' && (
                    <div className="code-inspector">
                        <div className="export-format-selector">
                            <button className={exportFormat === 'html' ? 'active' : ''} onClick={() => setExportFormat('html')}>HTML</button>
                            <button className={exportFormat === 'react' ? 'active' : ''} onClick={() => setExportFormat('react')}>React</button>
                        </div>
                        <pre className="code-block"><code>{exportFormat === 'html' ? drawerState.data : convertToReactComponent(drawerState.data)}</code></pre>
                    </div>
                )}

                {activeInspectorTab === 'tokens' && (
                    <div className="tokens-inspector">
                        <section>
                            <h3>Color Palette</h3>
                            <div className="token-grid">
                                {tokens.colors.map(c => (
                                    <div key={c} className="token-chip" onClick={() => { navigator.clipboard.writeText(c); showToast(`Copied ${c}`); }}>
                                        <div className="color-swatch" style={{ background: c }} />
                                        <span>{c}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                        <section>
                            <h3>Typography</h3>
                            <div className="token-list">
                                {tokens.fonts.map(f => <div key={f} className="token-font">{f}</div>)}
                            </div>
                        </section>
                    </div>
                )}

                {activeInspectorTab === 'audit' && (
                    <div className="audit-inspector">
                        {isAuditing ? <div className="loading-audit"><ThinkingIcon /> Running AI Scan...</div> : (
                            <div className="audit-list">
                                {auditResults.map((r, i) => (
                                    <div key={i} className={`audit-item ${r.status}`}>
                                        <span className="audit-status-icon">{r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '!'}</span>
                                        <p>{r.note}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </SideDrawer>

        <div className="immersive-app" style={activePreset.styles}>
            <DottedGlowBackground gap={24} radius={1.5} color="rgba(255, 255, 255, 0.03)" glowColor="rgba(255, 255, 255, 0.15)" speedScale={0.5} />

            <div className={`stage-container ${focusedArtifactIndex !== null ? 'mode-focus' : 'mode-split'}`}>
                {/* Empty State Logic */}
                 {!hasStarted && (
                     <div className="empty-state">
                         <h1>Flash UI</h1>
                         <p>Design Token-driven generation with Production-ready code.</p>
                         <button className="surprise-button" onClick={() => handleSendMessage(INITIAL_PLACEHOLDERS[Math.floor(Math.random()*INITIAL_PLACEHOLDERS.length)])}>
                            <SparklesIcon /> Quick Start
                         </button>
                     </div>
                 )}

                {sessions[currentSessionIndex] && (
                    <div className="session-group active-session">
                        <div className={`artifact-grid ${activeLayout}`}>
                            {sessions[currentSessionIndex].artifacts.map((art, i) => (
                                <ArtifactCard 
                                    key={art.id} 
                                    artifact={art} 
                                    isFocused={focusedArtifactIndex === i} 
                                    onClick={() => setFocusedArtifactIndex(i)} 
                                    previewWidth={previewWidth}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className={`action-bar ${hasStarted ? 'visible' : ''}`}>
                 <div className="action-buttons">
                    <button onClick={() => setFocusedArtifactIndex(null)}><GridIcon /> Grid View</button>
                    <button onClick={() => setPreviewWidth(w => w === '375px' ? '100%' : '375px')}><MobileIcon /> Responsive</button>
                    <button onClick={() => handleOpenInspector('code')}><CodeIcon /> Inspector</button>
                    <button onClick={() => handleOpenInspector('tokens')}><PaletteIcon /> Tokens</button>
                    <button onClick={() => handleOpenInspector('audit')}><ShieldCheckIcon /> Audit</button>
                    <button onClick={() => handleSendMessage("Polish and animate the transitions")}><MagicIcon /> Vibe Polishing</button>
                 </div>
            </div>

            <div className="floating-input-container">
                <div className={`input-wrapper ${isLoading ? 'loading' : ''}`}>
                    <input 
                        ref={inputRef}
                        type="text" 
                        value={inputValue} 
                        onChange={(e) => setInputValue(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Describe a component or feature..."
                        disabled={isLoading}
                    />
                    <button className="send-button" onClick={() => handleSendMessage()} disabled={isLoading || !inputValue.trim()}>
                        <ArrowUpIcon />
                    </button>
                </div>
            </div>
        </div>
    </>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
