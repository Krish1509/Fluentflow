"use client";

import { useEffect, useRef, useState } from "react";

// TypeScript declarations for Speech Recognition API
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [messages, setMessages] = useState<Array<{id: string, type: 'user' | 'ai', text: string, timestamp: Date}>>([]);
  const [interactiveMode, setInteractiveMode] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [showSpeakerMenu, setShowSpeakerMenu] = useState<string | null>(null);
  const timeoutRefs = useRef<Set<NodeJS.Timeout>>(new Set());
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [speechRate, setSpeechRate] = useState(0.9);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [speechVolume, setSpeechVolume] = useState(1.0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState('😊');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [conversationMood, setConversationMood] = useState('friendly');


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    // Use the same processUserInput function for consistency
    await processUserInput(inputText);
  };

  // Setup Speech Recognition instance lazily
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (!recognitionRef.current) {
      const rec = new SR();
      rec.lang = "en-US"; // auto language can be set by user later
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      recognitionRef.current = rec;
    }
  }, []);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const voices = speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (voices.length > 0 && !selectedVoice) {
        // Set default voice to first female voice or first voice
        const femaleVoice = voices.find(voice => 
          voice.name.includes('Female') || 
          voice.name.includes('Samantha') || 
          voice.name.includes('Karen') ||
          voice.name.includes('Zira') ||
          voice.name.includes('Google')
        );
        setSelectedVoice(femaleVoice ? femaleVoice.name : voices[0].name);
      }
    };

    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }, [selectedVoice]);

  // Update current time
  useEffect(() => {
    setCurrentTime(new Date()); // Set initial time on client
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Close speaker menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSpeakerMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.speaker-menu-container')) {
          setShowSpeakerMenu(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSpeakerMenu]);

  const processUserInput = async (text: string, autoSpeak: boolean = false) => {
    // Clear input text immediately
    setInputText("");
    
    // Add user message to chat history immediately
    const userMessage = {
      id: Date.now().toString(),
      type: 'user' as const,
      text: text.trim(),
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setMessageCount(prev => prev + 1);

    setLoading(true);
    setTypingIndicator(true);
    setError("");

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      
      // Add AI response to chat history immediately
      const aiMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai' as const,
        text: data.reply,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
      
      // Auto-speak if in interactive mode
      if (autoSpeak) {
        setTimeout(() => {
          // Stop any current speech
          speechSynthesis.cancel();
          
          const utterance = new SpeechSynthesisUtterance(data.reply);
          utterance.rate = speechRate;
          utterance.pitch = speechPitch;
          utterance.volume = speechVolume;
          
          const voices = speechSynthesis.getVoices();
          const selectedVoiceObj = voices.find(voice => voice.name === selectedVoice);
          if (selectedVoiceObj) {
            utterance.voice = selectedVoiceObj;
          }
          
          utterance.onend = () => {
            // After AI finishes speaking, start listening again in interactive mode
            if (interactiveMode && !isListening) {
              const timeoutId = setTimeout(() => {
                if (interactiveMode && !isListening) {
                  startInteractiveListening();
                }
              }, 800);
              timeoutRefs.current.add(timeoutId);
            }
          };
          
          utterance.onerror = () => {
            // If speech fails, still restart listening
            if (interactiveMode && !isListening) {
              const timeoutId = setTimeout(() => {
                if (interactiveMode && !isListening) {
                  startInteractiveListening();
                }
              }, 1000);
              timeoutRefs.current.add(timeoutId);
            }
          };
          
          speechSynthesis.speak(utterance);
        }, 200);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setTypingIndicator(false);
    }
  };

  const startListening = () => {
    const rec = recognitionRef.current;
    if (!rec) {
      setError("Speech Recognition not supported in this browser");
      return;
    }
    if (isListening) return;
    setError("");
    setIsListening(true);
    let finalTranscript = "";
    
    rec.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      setInputText(finalTranscript || interim);
    };
    
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsListening(false);
      setError("Speech Recognition error: " + (e?.error || "unknown"));
    };
    
    rec.onend = () => {
      setIsListening(false);
      
      // Just put the text in the input box, don't auto-submit
      if ((finalTranscript || "").trim()) {
        setInputText(finalTranscript);
      }
    };
    
    try {
      rec.start();
    } catch {}
  };

  const stopListening = () => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
        if (rec.abort) rec.abort(); // Also try abort if available
      } catch {
        // Ignore errors when stopping
      }
    }
    
    // Clear all pending timeouts immediately
    timeoutRefs.current.forEach(timeoutId => {
      clearTimeout(timeoutId);
    });
    timeoutRefs.current.clear();
    
    // Force reset all states immediately
    setIsListening(false);
    setIsSpeaking(false);
    setSpeakingMessageId(null);
    
    // Cancel any ongoing speech
    speechSynthesis.cancel();
  };

  const startInteractiveListening = () => {
    const rec = recognitionRef.current;
    if (!rec) {
      setError("Speech Recognition not supported in this browser");
      return;
    }
    
    // Stop any existing recognition first
    try {
      rec.stop();
    } catch {
      // Ignore errors when stopping
    }
    
    // Prevent multiple listening sessions
    if (isListening) {
      console.log("Already listening, ignoring start request");
      return;
    }
    
    // Wait a bit before starting new recognition
    setTimeout(() => {
      if (!interactiveMode) return; // Check if still in interactive mode
      if (isListening) return; // Double check we're not already listening
      
      setError("");
      setIsListening(true);
      let finalTranscript = "";
      
      rec.onresult = (event: SpeechRecognitionEvent) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) finalTranscript += transcript;
        }
      };
      
      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        setIsListening(false);
        console.log("Speech Recognition error:", e?.error);
        
        // Only restart for certain errors, not all
        if (e?.error === 'no-speech' || e?.error === 'audio-capture' || e?.error === 'not-allowed') {
          if (interactiveMode && !isListening) {
            const timeoutId = setTimeout(() => {
              if (interactiveMode && !isListening) {
                startInteractiveListening();
              }
            }, 2000);
            timeoutRefs.current.add(timeoutId);
          }
        }
      };
      
      rec.onend = () => {
        setIsListening(false);
        
        // Auto-submit and auto-speak in interactive mode
        if ((finalTranscript || "").trim()) {
          processUserInput(finalTranscript, true);
        }
        // Don't auto-restart if no speech detected - let user manually start again
      };
      
      try {
        rec.start();
      } catch (e) {
        console.error("Failed to start recognition:", e);
        setIsListening(false);
        // Try again after a delay only if still in interactive mode and not listening
        if (interactiveMode && !isListening) {
          const timeoutId = setTimeout(() => {
            if (interactiveMode && !isListening) {
              startInteractiveListening();
            }
          }, 3000);
          timeoutRefs.current.add(timeoutId);
        }
      }
    }, 100);
  };

  const toggleInteractiveMode = () => {
    if (interactiveMode) {
      // Stop interactive mode completely - clean up everything
      console.log("Closing interactive mode");
      
      // Stop all recognition and speech immediately
      const rec = recognitionRef.current;
      if (rec) {
        try {
          rec.stop();
          if (rec.abort) rec.abort();
        } catch {
          // Ignore errors
        }
      }
      
      // Cancel all speech
      speechSynthesis.cancel();
      
      // Clear all timeouts
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      timeoutRefs.current.clear();
      
      // Reset all states
      setInteractiveMode(false);
      setIsListening(false);
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      setError(""); // Clear any errors
    } else {
      // Start interactive mode - but don't start listening yet
      console.log("Opening interactive mode");
      setInteractiveMode(true);
      setIsListening(false); // Ensure listening is off when opening popup
      setIsSpeaking(false); // Ensure speaking is off
      setSpeakingMessageId(null); // Clear speaking state
      // Don't auto-start listening, let user click "Start Listening" in popup
    }
  };

  const speakMessage = (messageId: string, text: string) => {
    if (isSpeaking && speakingMessageId === messageId) {
      // Stop current speech
      speechSynthesis.cancel();
      setSpeakingMessageId(null);
      setIsSpeaking(false);
      return;
    }
    
    // Stop any current speech
    speechSynthesis.cancel();
    setIsSpeaking(true);
    setSpeakingMessageId(messageId);
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    const voices = speechSynthesis.getVoices();
    const selectedVoiceObj = voices.find(voice => voice.name === selectedVoice);
    if (selectedVoiceObj) {
      utterance.voice = selectedVoiceObj;
    }
    
    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
    };
    
    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
    };
    
    speechSynthesis.speak(utterance);
  };



  return (
    <div className={`min-h-screen flex flex-col transition-all duration-300 ${
      darkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-gradient-to-br from-blue-50 via-white to-purple-50'
    }`}>
      {/* Header */}
      <div className={`${
        darkMode 
          ? 'bg-gray-800/80 backdrop-blur-md border-gray-700/50' 
          : 'bg-white/80 backdrop-blur-md border-gray-200/50'
      } border-b px-3 sm:px-6 py-3 sm:py-4 flex items-center justify-between shadow-lg`}>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white text-lg sm:text-xl font-bold">F</span>
          </div>
          <h1 className={`text-lg sm:text-2xl font-bold bg-gradient-to-r ${
            darkMode 
              ? 'from-blue-400 to-purple-400' 
              : 'from-blue-600 to-purple-600'
          } bg-clip-text text-transparent`}>
            Fluent Flow
          </h1>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Online Status - Hidden on mobile */}
          <div className={`hidden sm:flex items-center gap-2 px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
            isOnline 
              ? 'bg-green-100 text-green-700' 
              : 'bg-red-100 text-red-700'
          }`}>
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
            <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* Message Count - Hidden on mobile */}
          <div className={`hidden sm:block px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
            darkMode ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700'
          }`}>
            💬 {messageCount}
          </div>

          {/* Current Time - Hidden on mobile */}
          <div className={`hidden sm:block px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${
            darkMode ? 'bg-gray-700/50 text-gray-300' : 'bg-gray-100 text-gray-700'
          }`}>
            🕐 {currentTime ? currentTime.toLocaleTimeString() : '--:--:--'}
          </div>

          {/* Voice Selection Dropdown - Hidden on mobile */}
          <div className="hidden sm:flex items-center gap-2">
            <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              🎤
            </span>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className={`px-2 sm:px-3 py-1 rounded-lg text-xs border transition-all duration-200 focus:ring-2 focus:ring-blue-500 ${
                darkMode 
                  ? 'bg-gray-700/50 border-gray-600 text-white hover:bg-gray-600/50' 
                  : 'bg-white/80 border-gray-300 text-gray-800 hover:bg-white'
              }`}
            >
              {availableVoices.map((voice, index) => (
                <option key={index} value={voice.name}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Actions Button - Hidden on mobile */}
          <button
            onClick={() => setShowQuickActions(!showQuickActions)}
            className={`hidden sm:block p-1.5 sm:p-2 rounded-lg transition-all duration-200 hover:scale-105 ${
              darkMode 
                ? 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            }`}
            title="Quick Actions"
          >
            ⚡
          </button>
          
          {/* Settings Button - Hidden on mobile */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`hidden sm:block p-1.5 sm:p-2 rounded-lg transition-all duration-200 hover:scale-105 ${
              darkMode 
                ? 'bg-gray-700/50 hover:bg-gray-600/50 text-gray-300' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            }`}
            title="Settings"
          >
            ⚙️
          </button>
          
          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`p-1.5 sm:p-2 rounded-lg transition-all duration-200 hover:scale-105 shadow-lg ${
              darkMode 
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-white' 
                : 'bg-gradient-to-r from-gray-100 to-gray-200 hover:from-gray-200 hover:to-gray-300 text-gray-700'
            }`}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-3 sm:space-y-4 min-h-0">
        {/* Welcome Message */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-4 sm:py-8 px-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-3 sm:mb-4 shadow-2xl">
              <span className="text-2xl sm:text-3xl">🤖</span>
            </div>
            <h2 className={`text-xl sm:text-2xl font-bold mb-2 sm:mb-3 ${
              darkMode ? 'text-white' : 'text-gray-800'
            }`}>
              Welcome to Fluent Flow
            </h2>
            <p className={`text-sm sm:text-base mb-4 sm:mb-6 max-w-sm sm:max-w-md ${
              darkMode ? 'text-gray-300' : 'text-gray-600'
            }`}>
              Your AI language tutor is ready to help! Start a conversation by typing a message or using voice input.
            </p>
            <div className="flex gap-2 sm:gap-3">
              <div className={`px-2 sm:px-3 py-2 rounded-xl ${
                darkMode ? 'bg-gray-800' : 'bg-white'
              } shadow-lg border`}>
                <span className="text-lg sm:text-xl">💬</span>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Type</p>
              </div>
              <div className={`px-2 sm:px-3 py-2 rounded-xl ${
                darkMode ? 'bg-gray-800' : 'bg-white'
              } shadow-lg border`}>
                <span className="text-lg sm:text-xl">🎤</span>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Voice</p>
              </div>
              <div className={`px-2 sm:px-3 py-2 rounded-xl ${
                darkMode ? 'bg-gray-800' : 'bg-white'
              } shadow-lg border`}>
                <span className="text-lg sm:text-xl">🎙️</span>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Interactive</p>
              </div>
            </div>
          </div>
        )}

        {/* Typing Indicator */}
        {typingIndicator && (
          <div className="flex justify-start">
            <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-3 sm:p-4 shadow-lg ${
              darkMode ? 'bg-gray-800/90 border border-gray-700/50' : 'bg-white/90 border border-gray-200/50'
            } backdrop-blur-sm`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg">
                  AI
                </div>
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
                <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  AI is typing...
                </span>
              </div>
            </div>
        </div>
        )}

        {/* Chat History */}
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-3 sm:p-4 shadow-lg relative transition-all duration-200 hover:shadow-xl ${
              message.type === 'user' 
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-lg' 
                : `${darkMode ? 'bg-gray-800/90 border border-gray-700/50' : 'bg-white/90 border border-gray-200/50'} rounded-bl-lg backdrop-blur-sm`
            }`}>
              {message.type === 'ai' && (
            <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg">
                      AI
                    </div>
                    <div>
                      <span className={`text-xs sm:text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                        AI Tutor
                      </span>
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (isSpeaking && speakingMessageId === message.id) {
                        // Stop speaking
                        speechSynthesis.cancel();
                        setSpeakingMessageId(null);
                        setIsSpeaking(false);
                      } else {
                        // Start speaking
                        speakMessage(message.id, message.text);
                      }
                    }}
                    className={`absolute top-1 right-1 sm:top-2 sm:right-2 p-1.5 sm:p-2 rounded-full transition-all duration-200 z-10 shadow-lg ${
                      isSpeaking && speakingMessageId === message.id
                        ? 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-400 hover:to-red-500 scale-110' 
                        : darkMode 
                          ? 'bg-gray-700/80 hover:bg-gray-600/80 text-gray-300 hover:text-white hover:scale-105' 
                          : 'bg-white/80 hover:bg-gray-100/80 text-gray-600 hover:text-gray-800 hover:scale-105'
                    }`}
                    title={isSpeaking && speakingMessageId === message.id ? "Stop speaking" : "Speak this message"}
                  >
                    <span className="text-sm sm:text-base">{isSpeaking && speakingMessageId === message.id ? '⏹' : '🔊'}</span>
                  </button>
                </div>
              )}
              <p className={`whitespace-pre-wrap leading-relaxed text-sm sm:text-base ${
                message.type === 'user' 
                  ? 'text-white font-medium' 
                  : darkMode 
                    ? 'text-gray-100' 
                    : 'text-gray-800'
              }`}>
                {message.text}
              </p>
              
              {message.type === 'user' && (
                <p className="text-blue-100 text-xs mt-2 opacity-80">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              )}
            </div>
          </div>
        ))}


        {/* Loading indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-2xl rounded-tl-sm p-4 shadow-sm border`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                  AI
                </div>
                <div className="flex space-x-1">
                  <div className={`w-2 h-2 ${darkMode ? 'bg-gray-400' : 'bg-gray-400'} rounded-full animate-bounce`}></div>
                  <div className={`w-2 h-2 ${darkMode ? 'bg-gray-400' : 'bg-gray-400'} rounded-full animate-bounce`} style={{animationDelay: '0.1s'}}></div>
                  <div className={`w-2 h-2 ${darkMode ? 'bg-gray-400' : 'bg-gray-400'} rounded-full animate-bounce`} style={{animationDelay: '0.2s'}}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Voice listening indicator - Fixed Position - Only show for regular mic mode */}
        {isListening && !interactiveMode && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 backdrop-blur-sm">
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-3xl p-8 shadow-2xl max-w-md w-full mx-4">
              <div className="flex flex-col items-center gap-6">
                <div className="flex space-x-3">
                  <div className="w-4 h-16 bg-white rounded-full animate-pulse"></div>
                  <div className="w-4 h-20 bg-white rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-4 h-12 bg-white rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                  <div className="w-4 h-18 bg-white rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
                  <div className="w-4 h-10 bg-white rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                </div>
                <div className="text-center">
                  <h3 className="text-2xl font-bold mb-2">🎤 Listening... Speak now!</h3>
                  <p className="text-sm opacity-90">Your speech will appear in the text box below</p>
                </div>
              </div>
            </div>
          </div>
        )}

      {/* Interactive Mode Popup */}
      {interactiveMode && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl max-w-lg w-full border-2`}>
              <div className="text-center">
                {/* Status */}
                <div className="mb-8">
                  {isListening ? (
                    <div className="flex flex-col items-center gap-4 sm:gap-6">
                      <div className="flex space-x-2 sm:space-x-3">
                        <div className="w-3 h-12 sm:w-4 sm:h-16 bg-gradient-to-t from-purple-400 to-purple-600 rounded-full animate-pulse"></div>
                        <div className="w-3 h-16 sm:w-4 sm:h-20 bg-gradient-to-t from-purple-400 to-purple-600 rounded-full animate-pulse" style={{animationDelay: '0.1s'}}></div>
                        <div className="w-3 h-10 sm:w-4 sm:h-12 bg-gradient-to-t from-purple-400 to-purple-600 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                        <div className="w-3 h-14 sm:w-4 sm:h-18 bg-gradient-to-t from-purple-400 to-purple-600 rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
                        <div className="w-3 h-8 sm:w-4 sm:h-10 bg-gradient-to-t from-purple-400 to-purple-600 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                      </div>
                      <div>
                        <h3 className={`text-xl sm:text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>🎙️ Listening...</h3>
                        <p className={`text-sm sm:text-lg ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Speak now - I&apos;ll respond and speak back</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4 sm:gap-6">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-3xl sm:text-4xl">🧠</span>
                      </div>
                      <div>
                        <h3 className={`text-xl sm:text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'} mb-2`}>AI Interactive</h3>
                        <p className={`text-sm sm:text-lg ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>Ready for natural conversation</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="space-y-4">
                  <button
                    onClick={() => {
                      if (isListening) {
                        stopListening();
                      } else {
                        startInteractiveListening();
                      }
                    }}
                    className={`w-full py-3 sm:py-4 px-6 sm:px-8 rounded-2xl font-bold text-lg sm:text-xl transition-all duration-300 transform hover:scale-105 ${
                      isListening
                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg'
                        : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-lg'
                    }`}
                  >
                    {isListening ? '⏹ Stop Listening' : '🎤 Start Listening'}
                  </button>

                  <button
                    onClick={() => {
                      // Use the same robust cleanup as toggleInteractiveMode
                      console.log("Closing interactive mode via close button");
                      
                      // Stop all recognition and speech immediately
                      const rec = recognitionRef.current;
                      if (rec) {
                        try {
                          rec.stop();
                          if (rec.abort) rec.abort();
                        } catch {
                          // Ignore errors
                        }
                      }
                      
                      // Cancel all speech
                      speechSynthesis.cancel();
                      
                      // Clear all timeouts
                      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
                      timeoutRefs.current.clear();
                      
                      // Reset all states
                      setInteractiveMode(false);
                      setIsListening(false);
                      setIsSpeaking(false);
                      setSpeakingMessageId(null);
                      setError(""); // Clear any errors
                    }}
                    className={`w-full py-3 sm:py-4 px-6 sm:px-8 rounded-2xl font-medium text-sm sm:text-base transition-all duration-200 hover:scale-105 ${
                      darkMode 
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600' 
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700 border border-gray-300'
                    }`}
                  >
                    ✕ Close Interactive Mode
                  </button>
                </div>

                {/* Instructions */}
                <div className={`mt-8 p-6 rounded-2xl ${darkMode ? 'bg-gray-700 border border-gray-600' : 'bg-gray-100 border border-gray-200'}`}>
                  <h4 className={`font-bold mb-4 text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>How it works:</h4>
                  <div className={`text-sm space-y-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</span>
                      <span>Click &quot;Start Listening&quot;</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</span>
                      <span>Speak your question naturally</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</span>
                      <span>I&apos;ll respond and speak back</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">4</span>
                      <span>I&apos;ll listen for your next question</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 bg-purple-500 text-white rounded-full flex items-center justify-center text-xs font-bold">5</span>
                      <span>Continue the conversation naturally</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            </div>
        )}

      </div>

      {/* Input Area */}
      <div className={`${
        darkMode 
          ? 'bg-gray-800/80 backdrop-blur-md border-gray-700/50' 
          : 'bg-white/80 backdrop-blur-md border-gray-200/50'
      } border-t p-2 sm:p-4 shadow-2xl flex-shrink-0`}>
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-2 sm:gap-4">
            <div className="flex-1 relative">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type your message here..."
                className={`w-full p-2 sm:p-3 pr-20 sm:pr-32 border-2 rounded-2xl focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 resize-none transition-all duration-200 text-sm sm:text-base ${
                  darkMode 
                    ? 'bg-gray-700/50 border-gray-600 text-white placeholder-gray-400 hover:bg-gray-700/70' 
                    : 'bg-white/80 border-gray-300 text-gray-800 placeholder-gray-500 hover:bg-white'
                }`}
                rows={1}
                style={{ minHeight: '40px', maxHeight: '100px' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (inputText.trim()) handleSubmit(e);
                  }
                }}
              />
              
              {/* Emoji Picker Button - Hidden on mobile */}
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`hidden sm:block absolute right-24 top-1/2 transform -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                  darkMode
                    ? 'bg-gray-600/80 hover:bg-gray-500/80 text-gray-300 hover:text-white hover:scale-105'
                    : 'bg-gray-100/80 hover:bg-gray-200/80 text-gray-600 hover:text-gray-800 hover:scale-105'
                }`}
                title="Add Emoji"
              >
                {selectedEmoji}
              </button>

              {/* Voice to Text Button */}
              <button
                type="button"
                onClick={() => {
                  if (isListening && !interactiveMode) {
                    stopListening();
                  } else {
                    startListening();
                  }
                }}
                className={`absolute right-12 sm:right-14 top-1/2 transform -translate-y-1/2 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                  isListening && !interactiveMode
                    ? 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white scale-110'
                    : darkMode
                      ? 'bg-gray-600/80 hover:bg-gray-500/80 text-gray-300 hover:text-white hover:scale-105'
                      : 'bg-gray-100/80 hover:bg-gray-200/80 text-gray-600 hover:text-gray-800 hover:scale-105'
                }`}
                title="Voice to Text: Speak → Text appears in input → Edit & Send"
              >
                <span className="text-sm sm:text-base">🎤</span>
              </button>

              {/* AI Interactive Button */}
              <button
                type="button"
                onClick={toggleInteractiveMode}
                className={`absolute right-2 sm:right-4 top-1/2 transform -translate-y-1/2 w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                  interactiveMode
                    ? 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 text-white scale-110'
                    : darkMode
                      ? 'bg-gray-600/80 hover:bg-gray-500/80 text-gray-300 hover:text-white hover:scale-105'
                      : 'bg-gray-100/80 hover:bg-gray-200/80 text-gray-600 hover:text-gray-800 hover:scale-105'
                }`}
                title="AI Interactive: Speak → AI responds → AI speaks → Repeat"
              >
                <span className="text-sm sm:text-base">🎙️</span>
              </button>
            </div>
            <button
              type="submit"
              disabled={loading || !inputText.trim()}
              className={`px-3 sm:px-6 py-3 sm:py-4 rounded-2xl sm:rounded-3xl font-bold text-sm sm:text-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed shadow-xl ${
                loading || !inputText.trim()
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-blue-500/25'
              }`}
            >
              {loading ? (
                <div className="w-4 h-4 sm:w-6 sm:h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg className="w-4 h-4 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl max-w-md w-full`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                ⚙️ Settings
              </h3>
              <button
                onClick={() => setShowSettings(false)}
                className={`p-2 rounded-full ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Speech Rate: {speechRate}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={speechRate}
                  onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Speech Pitch: {speechPitch}
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={speechPitch}
                  onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Speech Volume: {speechVolume}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={speechVolume}
                  onChange={(e) => setSpeechVolume(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Conversation Mood
                </label>
                <select
                  value={conversationMood}
                  onChange={(e) => setConversationMood(e.target.value)}
                  className={`w-full p-2 rounded-lg border ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white' 
                      : 'bg-white border-gray-300 text-gray-800'
                  }`}
                >
                  <option value="friendly">😊 Friendly</option>
                  <option value="professional">💼 Professional</option>
                  <option value="casual">😎 Casual</option>
                  <option value="enthusiastic">🚀 Enthusiastic</option>
                </select>
              </div>
            </div>
          </div>
              </div>
            )}

      {/* Quick Actions Modal */}
      {showQuickActions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-3xl p-6 shadow-2xl max-w-md w-full mx-4`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                ⚡ Quick Actions
              </h3>
              <button
                onClick={() => setShowQuickActions(false)}
                className={`p-2 rounded-full ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setInputText("Hello! How are you today?");
                  setShowQuickActions(false);
                }}
                className={`p-3 rounded-xl text-left transition-all duration-200 hover:scale-105 ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                <div className="text-2xl mb-1">👋</div>
                <div className="text-sm font-medium">Greeting</div>
              </button>
              
              <button
                onClick={() => {
                  setInputText("Can you help me with something?");
                  setShowQuickActions(false);
                }}
                className={`p-3 rounded-xl text-left transition-all duration-200 hover:scale-105 ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                <div className="text-2xl mb-1">❓</div>
                <div className="text-sm font-medium">Help</div>
              </button>
              
              <button
                onClick={() => {
                  setInputText("Tell me a joke!");
                  setShowQuickActions(false);
                }}
                className={`p-3 rounded-xl text-left transition-all duration-200 hover:scale-105 ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                <div className="text-2xl mb-1">😄</div>
                <div className="text-sm font-medium">Joke</div>
              </button>
              
              <button
                onClick={() => {
                  setInputText("What's the weather like?");
                  setShowQuickActions(false);
                }}
                className={`p-3 rounded-xl text-left transition-all duration-200 hover:scale-105 ${
                  darkMode 
                    ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                <div className="text-2xl mb-1">🌤️</div>
                <div className="text-sm font-medium">Weather</div>
              </button>
            </div>
          </div>
          </div>
        )}

      {/* Emoji Picker Modal */}
      {showEmojiPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-3xl p-6 shadow-2xl max-w-sm w-full mx-4`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                😊 Choose Emoji
              </h3>
              <button
                onClick={() => setShowEmojiPicker(false)}
                className={`p-2 rounded-full ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-6 gap-2">
              {['😊', '😂', '😍', '🤔', '😮', '😢', '😡', '🤗', '😴', '🤩', '😎', '🥳', '👍', '👎', '❤️', '🔥', '💯', '🎉'].map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    setSelectedEmoji(emoji);
                    setInputText(prev => prev + emoji);
                    setShowEmojiPicker(false);
                  }}
                  className={`p-3 rounded-xl text-2xl transition-all duration-200 hover:scale-110 ${
                    selectedEmoji === emoji 
                      ? 'bg-blue-500 text-white' 
                      : darkMode 
                        ? 'hover:bg-gray-700' 
                        : 'hover:bg-gray-100'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className={`fixed bottom-20 left-4 right-4 rounded-lg p-3 shadow-lg ${
          darkMode 
            ? 'bg-red-900 border-red-700 text-red-300' 
            : 'bg-red-100 border-red-400 text-red-700'
        } border`}>
          <strong>Error:</strong> {error}
      </div>
      )}
    </div>
  );
}
