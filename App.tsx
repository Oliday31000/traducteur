
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { TranscriptItem } from './types';
import { 
  createPcmBlob, 
  decodeBase64, 
  decodeAudioData, 
  AUDIO_INPUT_SAMPLE_RATE, 
  AUDIO_OUTPUT_SAMPLE_RATE 
} from './utils/audioUtils';
import AudioVisualizer from './components/AudioVisualizer';
import { TranscriptBubble } from './components/TranscriptBubble';

// Fix: Use the recommended full model name for native audio conversation tasks
coonst MODEL_NAME = 'models/gemini-pro';

const LANGUAGES = [
  English',
  'French',
  'Spanish',
  'German',
  'Italian',
  'Portuguese',
  'Russian',
  'Chinese',
  'Japanese',
  'Korean',
  'Hindi'
];

type VoiceOption = 'Girl' | 'Boy';

function App() {
  // State
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  
  // Language & Voice State
  const [langA, setLangA] = useState('English');
  const [voiceA, setVoiceA] = useState<VoiceOption>('Girl');
  
  const [langB, setLangB] = useState('French');
  const [voiceB, setVoiceB] = useState<VoiceOption>('Boy');
  
  const [isAudioOn, setIsAudioOn] = useState(true);
  
  // Refs for Audio & Connection
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<Promise<any> | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  
  // Audio Playback Queue
  const nextStartTimeRef = useRef<number>(0);
  const scheduledSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Ref for Audio Toggle (to access inside closures)
  const isAudioOnRef = useRef(true);

  // Transcription Accumulation
  const currentInputTransRef = useRef<string>('');
  const currentOutputTransRef = useRef<string>('');

  // Auto-scroll ref
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new transcripts
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const toggleAudio = () => {
    const newState = !isAudioOn;
    setIsAudioOn(newState);
    isAudioOnRef.current = newState;
  };

  const disconnect = useCallback(() => {
    setIsActive(false);

    // Stop all audio sources
    scheduledSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    scheduledSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    // Close Audio Contexts
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;

    // Stop Media Stream
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;

    // Close Session
    sessionRef.current?.then(session => {
        if (session.close) session.close();
    }).catch(() => {});
    sessionRef.current = null;

  }, []);

  const getSystemInstruction = (l1: string, v1: VoiceOption, l2: string, v2: VoiceOption) => {
    const tone1 = v1 === 'Girl' ? 'feminine/female' : 'masculine/male';
    const tone2 = v2 === 'Girl' ? 'feminine/female' : 'masculine/male';

    return `You are a real-time interpreter controlled by a specific voice command.

OPERATIONAL RULES:
1.  **PASSIVE LISTENING**: Listen to the user's speech continuously. Do NOT translate normal sentences immediately. Remain SILENT by default.
2.  **TRIGGER WORD**: You are waiting for the specific command word "Translate" (or "Traducir", "Traduire", "Übersetzen", "Traduzir") to be spoken by the user.
3.  **SILENCE CHECK**: Once you detect the trigger word, wait for approximately 3 seconds of silence to ensure the user has fully finished their thought.
4.  **EXECUTION & VOICE ADAPTATION**: 
    - Identify the language spoken BEFORE the trigger word.
    - If the source was ${l1}, translate it to ${l2}. **Speak the ${l2} translation with a ${tone2} voice tone.**
    - If the source was ${l2}, translate it to ${l1}. **Speak the ${l1} translation with a ${tone1} voice tone.**
5.  **OUTPUT FORMAT**: 
    - **NO PREFIXES**: Do NOT say "Translate", "To translate", "Translation:", or "Here is the translation".
    - **DIRECT TRANSLATION**: Start speaking the translated text immediately.
    - **CLEANUP**: Ensure the trigger word itself is NOT included in your output.
    - If no trigger word is heard, remain silent.`;
  };

  const connect = async () => {
    setError(null);
    
    if (langA === langB) {
      setError("Please select two different languages.");
      return;
    }

    try {
      // 1. Initialize Audio Contexts
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      inputAudioContextRef.current = new AudioContext({
        sampleRate: AUDIO_INPUT_SAMPLE_RATE,
      });
      outputAudioContextRef.current = new AudioContext({
        sampleRate: AUDIO_OUTPUT_SAMPLE_RATE,
      });

      // 2. Setup Output Node
      outputNodeRef.current = outputAudioContextRef.current.createGain();
      outputNodeRef.current.connect(outputAudioContextRef.current.destination);

      // 3. Get User Media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // 4. Initialize Gemini Client
      const apiKey =
  (window as any).process?.env?.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });
      
      // Determine base voice configuration.
      // If both are Girl, use Kore. If both are Boy, use Puck. If mixed, default to Kore (Girl) and rely on system instruction for tone shift.
      let baseVoiceName = 'Kore';
      if (voiceA === 'Boy' && voiceB === 'Boy') {
        baseVoiceName = 'Puck';
      }

      // 5. Connect to Live API
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: baseVoiceName } },
          },
          systemInstruction: getSystemInstruction(langA, voiceA, langB, voiceB),
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Connection opened");
            setIsActive(true);
            
            // Start processing audio input
            if (!inputAudioContextRef.current || !stream) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(stream);
            sourceNodeRef.current = source;
            
            const processor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              
              // Correct: Use sessionPromise.then to send real-time input to avoid race conditions
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(processor);
            processor.connect(inputAudioContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            handleServerMessage(message);
          },
          onclose: (e) => {
            console.log("Connection closed", e);
            setIsActive(false);
          },
          onerror: (e) => {
            console.error("Connection error", e);
            setError("Connection error. Please try again.");
            disconnect();
          }
        }
      });
      
      sessionRef.current = sessionPromise;

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start audio session");
      disconnect();
    }
  };

  const handleServerMessage = async (message: LiveServerMessage) => {
    const { serverContent } = message;

    // 1. Handle Transcriptions (Text)
    if (serverContent?.inputTranscription) {
      const text = serverContent.inputTranscription.text;
      if (text) {
        currentInputTransRef.current += text;
        updateTranscript('user', currentInputTransRef.current, false);
      }
    }
    
    if (serverContent?.outputTranscription) {
      const text = serverContent.outputTranscription.text;
      if (text) {
        currentOutputTransRef.current += text;
        updateTranscript('model', currentOutputTransRef.current, false);
      }
    }

    if (serverContent?.turnComplete) {
      // Mark current partials as complete
      if (currentInputTransRef.current) {
        updateTranscript('user', currentInputTransRef.current, true);
        currentInputTransRef.current = '';
      }
      if (currentOutputTransRef.current) {
        updateTranscript('model', currentOutputTransRef.current, true);
        currentOutputTransRef.current = '';
      }
    }

    // 2. Handle Audio (Playback)
    const base64Audio = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (base64Audio && outputAudioContextRef.current && outputNodeRef.current) {
      // Check if audio return is enabled
      if (!isAudioOnRef.current) {
        return;
      }

      const ctx = outputAudioContextRef.current;
      
      // Sync nextStartTime to track end of audio playback queue for gapless playback
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
      
      const audioBuffer = await decodeAudioData(
        decodeBase64(base64Audio),
        ctx,
        AUDIO_OUTPUT_SAMPLE_RATE
      );
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputNodeRef.current);
      
      source.addEventListener('ended', () => {
        scheduledSourcesRef.current.delete(source);
      });
      
      source.start(nextStartTimeRef.current);
      scheduledSourcesRef.current.add(source);
      nextStartTimeRef.current += audioBuffer.duration;
    }
    
    // 3. Handle Interruptions
    if (serverContent?.interrupted) {
       // Stop current playback
       scheduledSourcesRef.current.forEach(s => s.stop());
       scheduledSourcesRef.current.clear();
       nextStartTimeRef.current = 0;
    }
  };

  const updateTranscript = (source: 'user' | 'model', text: string, isComplete: boolean) => {
    setTranscripts(prev => {
      const lastItem = prev[prev.length - 1];
      
      // If the last item matches the source and is not complete, update it
      if (lastItem && lastItem.source === source && !lastItem.isComplete) {
        const updated = { ...lastItem, text, isComplete };
        return [...prev.slice(0, -1), updated];
      }
      
      // Otherwise, create a new item
      if (!text && !isComplete) return prev;
      
      return [
        ...prev,
        {
          id: Date.now().toString() + Math.random(),
          source,
          text,
          isComplete,
          timestamp: new Date()
        }
      ];
    });
  };

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 sm:p-6 lg:p-8 bg-slate-900 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-slate-950 text-slate-100">
      
      {/* Header */}
      <header className="w-full max-w-3xl mb-6 flex flex-col items-center text-center">
        <div className="p-3 bg-indigo-500/10 rounded-full mb-4 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 8l6 6" /><path d="M4 14l6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="M22 22l-5-10-5 10" /><path d="M14 18h6" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300">
          Live Audio Translator
        </h1>
        <p className="mt-2 text-slate-400 max-w-md">
          Real-time bidirectional interpreter. Speak naturally. Say <span className="text-indigo-400 font-bold">"Translate"</span> or <span className="text-indigo-400 font-bold">"Traducir"</span> to trigger translation.
        </p>
      </header>

      {/* Language & Voice Selection Configuration */}
      <div className="w-full max-w-2xl mb-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
        
        {/* Party A Configuration */}
        <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
           <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-400"></div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Participant 1</label>
           </div>
           
           <div className="space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Language</label>
                <div className="relative">
                  <select 
                    value={langA} 
                    onChange={(e) => setLangA(e.target.value)}
                    disabled={isActive}
                    className="w-full appearance-none bg-slate-900 border border-slate-700 text-slate-200 py-2.5 px-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition-all text-sm"
                  >
                    {LANGUAGES.map(lang => (
                      <option key={lang} value={lang} disabled={lang === langB}>
                        {lang}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                    <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Voice</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                  {(['Girl', 'Boy'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVoiceA(v)}
                      disabled={isActive}
                      className={`py-1.5 rounded-md text-xs font-medium transition-all ${
                        voiceA === v 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-50'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
           </div>
        </div>

        {/* Party B Configuration */}
        <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
           <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">Participant 2</label>
           </div>
           
           <div className="space-y-4">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Language</label>
                <div className="relative">
                  <select 
                    value={langB} 
                    onChange={(e) => setLangB(e.target.value)}
                    disabled={isActive}
                    className="w-full appearance-none bg-slate-900 border border-slate-700 text-slate-200 py-2.5 px-3 pr-8 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50 transition-all text-sm"
                  >
                    {LANGUAGES.map(lang => (
                      <option key={lang} value={lang} disabled={lang === langA}>
                        {lang}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                    <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1 mb-1 block">Voice</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
                  {(['Girl', 'Boy'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVoiceB(v)}
                      disabled={isActive}
                      className={`py-1.5 rounded-md text-xs font-medium transition-all ${
                        voiceB === v 
                          ? 'bg-emerald-600 text-white shadow-sm' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-50'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
           </div>
        </div>

      </div>

      {/* Audio Return Toggle */}
      <div className="w-full max-w-md mb-6 flex justify-center">
        <label className="flex items-center cursor-pointer gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition-colors">
          <div className="relative">
            <input 
              type="checkbox" 
              className="sr-only" 
              checked={isAudioOn}
              onChange={toggleAudio}
            />
            <div className={`block w-10 h-6 rounded-full transition-colors ${isAudioOn ? 'bg-indigo-500' : 'bg-slate-700'}`}></div>
            <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${isAudioOn ? 'translate-x-4' : ''}`}></div>
          </div>
          <div className="flex items-center gap-2 text-slate-300">
             {isAudioOn ? (
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                 <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
               </svg>
             ) : (
               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                 <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
               </svg>
             )}
             <span className="text-sm font-medium">Audio Return</span>
          </div>
        </label>
      </div>

      {/* Main Interface */}
      <main className="w-full max-w-3xl flex-1 flex flex-col relative">
        
        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            {error}
          </div>
        )}

        {/* Transcript Container */}
        <div className="flex-1 bg-slate-900/50 backdrop-blur-md rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden flex flex-col h-[500px] mb-6 relative">
          
          {/* Clear Button */}
          {transcripts.length > 0 && (
            <button
              onClick={clearTranscripts}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-800/50 text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all border border-slate-700/50 backdrop-blur-sm"
              title="Clear History"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            {transcripts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <p>Press the microphone button to start translating.</p>
              </div>
            ) : (
              transcripts.map((item) => (
                <TranscriptBubble key={item.id} item={item} />
              ))
            )}
            <div ref={scrollEndRef} />
          </div>
          
          {/* Visualizer Footer */}
          <div className="h-20 bg-slate-800/50 border-t border-slate-700/50 flex items-center justify-center relative overflow-hidden">
             {isActive ? (
               <div className="w-full h-full absolute inset-0 flex items-center justify-center">
                  <AudioVisualizer 
                    isActive={isActive}
                    audioContext={inputAudioContextRef.current}
                    sourceNode={sourceNodeRef.current}
                    color="#818cf8"
                  />
               </div>
             ) : (
               <div className="text-xs text-slate-500 font-medium tracking-widest uppercase">
                  Ready to connect
               </div>
             )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center items-center gap-6">
          {!isActive ? (
            <button
              onClick={connect}
              className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/30 hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-4 focus:ring-indigo-500/30"
            >
              <div className="absolute inset-0 rounded-full bg-white opacity-0 group-hover:opacity-20 transition-opacity" />
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="group flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10 border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 shadow-lg shadow-red-500/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
        
        <div className="mt-4 text-center">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${isActive ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-slate-700/50 text-slate-400 border border-slate-700'}`}>
                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-400 animate-pulse' : 'bg-slate-500'}`} />
                {isActive ? 'Live Connection Active' : 'Disconnected'}
            </span>
        </div>

      </main>
    </div>
  );
}

export default App;
