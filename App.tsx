import React, { useState, useEffect, useRef, FC } from 'react';
import { Mic, MicOff, Send, Image as ImageIcon, Sparkles, Loader2, Home, Shirt, Download, Trash2, Upload, X, ScanLine, Save, Camera } from 'lucide-react';

// --- Firebase Imports and Type Definitions ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, Auth } from 'firebase/auth';
// Added Unsubscribe import for cleanup safety
import { getFirestore, doc, addDoc, onSnapshot, collection, query, Firestore, CollectionReference, deleteDoc, Unsubscribe } from 'firebase/firestore'; 

// Define the global Canvas variables
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;
declare const __app_id: string | undefined;

const apiKey = ""; // API Key injected by environment

type DesignMode = 'fashion' | 'architecture';

// Interface for Approved Designs stored in Firestore
interface ApprovedDesign {
    id: string;
    prompt: string;
    style: string;
    mode: DesignMode;
    imageUrl: string;
    createdAt: number;
}
// --- End Firebase Imports and Type Definitions ---


// --- API Helper ---
const generateImage = async (prompt: string, imageBase64: string | null = null, retries: number = 0): Promise<string> => {
  const delays = [1000, 2000, 4000, 8000, 16000];
  
  try {
    let url: string, body: string, isGemini: boolean;

    if (imageBase64) {
      // Image-to-Image (Gemini 2.5 Flash Image Preview)
      const base64Data = imageBase64.split(',')[1];
      isGemini = true;
      url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
      body = JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/png", data: base64Data } }
          ]
        }],
        generationConfig: { 
            responseModalities: ["IMAGE"] 
        }
      });
    } else {
      // Text-to-Image (Imagen 4.0)
      isGemini = false;
      url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`;
      body = JSON.stringify({
        instances: [{ prompt: prompt }],
        parameters: { sampleCount: 1 },
      });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    let base64: string | undefined;

    if (isGemini) {
        // Extract Gemini Image
        base64 = result.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data;
        if (!base64) throw new Error("No image generated from sketch");
    } else {
        // Extract Imagen Image
        if (!result.predictions || !result.predictions[0] || !result.predictions[0].bytesBase64Encoded) {
            throw new Error("Invalid response format or image data missing.");
        }
        base64 = result.predictions[0].bytesBase64Encoded;
    }
    
    return `data:image/png;base64,${base64}`;

  } catch (error) {
    console.warn(`API Attempt ${retries + 1} failed.`, error);
    if (retries < 5) {
      await new Promise(resolve => setTimeout(resolve, delays[retries]));
      return generateImage(prompt, imageBase64, retries + 1);
    } else {
      throw error;
    }
  }
};

// --- Components ---

const Header: FC<{ mode: DesignMode; setMode: (mode: DesignMode) => void }> = ({ mode, setMode }) => (
  <header className="flex flex-col md:flex-row items-center justify-between p-6 bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-10">
    <div className="flex items-center gap-3 mb-4 md:mb-0">
      <div className={`p-2 rounded-xl ${mode === 'fashion' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'} transition-colors duration-500`}>
        <Sparkles size={24} />
      </div>
      <div>
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600">
          Visionary
        </h1>
        <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">
          Realism Engine v1.1
        </p>
      </div>
    </div>

    <div className="flex bg-gray-100 p-1 rounded-full shadow-inner">
      <button
        onClick={() => setMode('fashion')}
        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
          mode === 'fashion' 
            ? 'bg-white text-rose-600 shadow-sm' 
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Shirt size={16} />
        Fashion
      </button>
      <button
        onClick={() => setMode('architecture')}
        className={`flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
          mode === 'architecture' 
            ? 'bg-white text-indigo-600 shadow-sm' 
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Home size={16} />
        Spaces
      </button>
    </div>
  </header>
);

const StyleSelector: FC<{ mode: DesignMode; selectedStyle: string; onSelect: (style: string) => void }> = ({ mode, selectedStyle, onSelect }) => {
  // Expanded fashion styles
  const fashionStyles = [
    'Haute Couture', 'Streetwear', 'Avant-Garde', 'Bohemian', 'Minimalist', 
    'Cyberpunk', 'Vintage', 'Dark Academia', 'Techwear', 'Cottagecore', 
    'Regency Era', 'Gothic', 'Art Deco', 'Utility'
  ];
  // Expanded architecture styles
  const architectureStyles = [
    'Modernist', 'Industrial', 'Biophilic', 'Mid-Century', 'Scandinavian', 
    'Futuristic', 'Brutalist', 'Baroque Revival', 'Deconstructivism', 'Prairie Style', 
    'Desert Modernism', 'Tudor', 'Zen Garden', 'High-Tech'
  ];
  
  const styles = mode === 'fashion' ? fashionStyles : architectureStyles;
  const accentColor = mode === 'fashion' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-indigo-200 bg-indigo-50 text-indigo-700';

  return (
    <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar mask-fade-right">
      {styles.map((style) => (
        <button
          key={style}
          onClick={() => onSelect(style)}
          className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
            selectedStyle === style
              ? accentColor + ' border-transparent shadow-sm'
              : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
          }`}
        >
          {style}
        </button>
      ))}
    </div>
  );
};

const ImageDisplay: FC<{ image: string | null; loading: boolean; prompt: string; mode: DesignMode }> = ({ image, loading, prompt, mode }) => {
  if (loading) {
    return (
      <div className="w-full aspect-[4/3] md:aspect-square bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 gap-4 animate-pulse">
        <Loader2 className="animate-spin text-gray-300" size={48} />
        <div className="text-center px-6">
          <p className="font-medium text-gray-500">Materializing concept...</p>
          <p className="text-sm mt-2 opacity-75">"{prompt.slice(0, 50)}{prompt.length > 50 ? '...' : ''}"</p>
        </div>
      </div>
    );
  }

  if (!image) {
    return (
      <div className="w-full aspect-[4/3] md:aspect-square bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 gap-4">
        <div className={`p-6 rounded-full ${mode === 'fashion' ? 'bg-rose-50 text-rose-200' : 'bg-indigo-50 text-indigo-200'}`}>
          <ImageIcon size={48} />
        </div>
        <p className="font-medium">Ready to visualize your next masterpiece</p>
      </div>
    );
  }

  return (
    <div className="group relative w-full aspect-[4/3] md:aspect-square rounded-2xl overflow-hidden shadow-2xl ring-1 ring-gray-900/5 bg-gray-900">
        <img 
            src={image} 
            alt="Generated visualization" 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            // Adding onError to ImageDisplay for robustness
            onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null; 
                target.src = 'https://placehold.co/800x600/eeeeee/333333?text=Image+Load+Error';
            }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6">
            <button 
                onClick={() => {
                    const link = document.createElement('a');
                    link.href = image;
                    link.download = `visionary-${Date.now()}.png`;
                    link.click();
                }}
                className="ml-auto bg-white/20 backdrop-blur-md hover:bg-white/30 text-white p-2 rounded-lg transition-colors"
                title="Download"
            >
                <Download size={20} />
            </button>
        </div>
    </div>
  );
};


const ApprovedDesignsList: FC<{ designs: ApprovedDesign[]; onDelete: (id: string) => void; isDbLoading: boolean; }> = ({ designs, onDelete, isDbLoading }) => {
    
    if (isDbLoading) {
        return <div className="text-center text-gray-500 py-6"><Loader2 className="inline animate-spin mr-2" size={16}/> Loading Saved Visions...</div>
    }

    return (
        <div className="space-y-4 pt-8 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Approved Designs (Persistent Storage)</h3>
            
            {designs.length === 0 ? (
                <div className="text-center text-gray-400 border border-dashed border-gray-200 p-6 rounded-xl">
                    No approved designs saved yet.
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 max-h-96 overflow-y-auto pr-2">
                    {designs.map((item) => (
                        <div
                            key={item.id}
                            className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 shadow-sm"
                        >
                            <img src={item.imageUrl} alt="Saved Design" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors duration-200 flex flex-col justify-end p-2">
                                <p className="text-white text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity truncate">{item.prompt}</p>
                                <button 
                                    onClick={() => onDelete(item.id)}
                                    className="absolute top-1 right-1 bg-red-500/80 hover:bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                    title="Delete Design"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};


export default function App() {
  const [mode, setMode] = useState<DesignMode>('fashion'); // 'fashion' | 'architecture'
  const [inputText, setInputText] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('Haute Couture');
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]); // Session history (not persistent)
  const [error, setError] = useState<string | null>(null);
  
  // Sketch State
  const [sketchImage, setSketchImage] = useState<string | null>(null);
  
  // REFS UPDATED: One for File Upload, one for Camera Capture
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Recognition setup
  const recognitionRef = useRef<any>(null);

  // --- Firebase States ---
  const [db, setDb] = useState<Firestore | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [approvedDesigns, setApprovedDesigns] = useState<ApprovedDesign[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(true);
  
  // Store the unsubscribe function reference
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  // --- Firebase Initialization ---
  // Initializes DB and Auth instances (runs only once)
  useEffect(() => {
    const initializeFirebase = async () => {
        try {
            const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestoreDb);
            setAuth(firebaseAuth);

            // Handle initial sign-in
            if (typeof __initial_auth_token !== 'undefined') {
                await signInWithCustomToken(firebaseAuth, __initial_auth_token);
            } else {
                await signInAnonymously(firebaseAuth);
            }
        } catch (error) {
            console.error("Firebase initialization or sign-in failed:", error);
            setError("Failed to initialize storage.");
        }
    };
    initializeFirebase();
  }, []);


  // --- Auth State Change Listener & Firestore Listener (COMBINED FOR RELIABILITY) ---
  // This useEffect now manages both authentication state and the Firestore listener
  useEffect(() => {
    if (!auth || !db) return; // Wait for both auth and db instances to be set

    // 1. Clear previous listener if it exists 
    if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
    }
    
    // 2. Set up the Auth State Listener
    const authUnsubscribe = onAuthStateChanged(auth, (user) => {
        setIsDbLoading(false); // Auth is ready to check/respond
        
        if (!user || !user.uid) {
            // If the user object is not available (e.g., initial state or failed sign-in), 
            // we cannot set the private data listener as the path would be incorrect.
            setApprovedDesigns([]);
            setUserId(null);
            console.log("[Firestore Debug] User not authenticated or UID missing. Cannot set up listener.");
            return; 
        }

        // Determine the current user ID (Guaranteed to be valid UID here)
        const currentUserId = user.uid;
        setUserId(currentUserId); 

        // 3. ATTACH FIRESTORE LISTENER ONLY AFTER VALID USER ID IS CONFIRMED
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        // Constructing the PRIVATE path for the current user
        const designsCollectionPath = `/artifacts/${appId}/users/${currentUserId}/approvedDesigns`; 
        
        console.log(`[Firestore Debug] User ID: ${currentUserId}`);
        console.log(`[Firestore Debug] Collection Path: ${designsCollectionPath}`);
        
        const designsCollection = collection(db, designsCollectionPath) as CollectionReference<Omit<ApprovedDesign, 'id'>>;
        const designsQuery = query(designsCollection);

        const snapshotUnsubscribe = onSnapshot(designsQuery, (snapshot) => {
            const fetchedDesigns: ApprovedDesign[] = [];
            snapshot.forEach(doc => {
                const data = doc.data() as Omit<ApprovedDesign, 'id'> & { createdAt: number };
                fetchedDesigns.push({
                    id: doc.id,
                    mode: (data as any).mode || 'fashion', 
                    ...data,
                });
            });
            
            fetchedDesigns.sort((a, b) => b.createdAt - a.createdAt);
            setApprovedDesigns(fetchedDesigns);
            setError(null); // Clear any previous fetch errors on success
        }, (e) => {
            // This is the error handler that catches the "Missing or insufficient permissions"
            console.error("Error fetching approved designs:", e);
            setError("Error fetching approved designs from storage. Check console for path/permissions.");
        });

        // Store the unsubscribe function for cleanup
        unsubscribeRef.current = snapshotUnsubscribe;
    });

    // Cleanup function: unsubscribe from both Auth and Firestore listener
    return () => {
        authUnsubscribe();
        if (unsubscribeRef.current) {
            unsubscribeRef.current();
        }
    };
  }, [auth, db]); 


  // --- Design Management Logic (Save/Delete) ---
  const handleApproveDesign = async () => {
    if (!db || !auth || !currentImage) {
        setError("Cannot approve design: No generated image or storage not ready.");
        return;
    }
    
    // Use the most authoritative UID directly from the auth instance
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
        setError("Cannot approve design: Authentication failed.");
        return;
    }

    // Construct the path for saving
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const designsCollectionPath = `/artifacts/${appId}/users/${currentUid}/approvedDesigns`;
    const designsCollection = collection(db, designsCollectionPath) as CollectionReference<Omit<ApprovedDesign, 'id'>>;
    
    setLoading(true);
    try {
        const newDesign: Omit<ApprovedDesign, 'id'> = {
            prompt: inputText,
            style: selectedStyle,
            imageUrl: currentImage,
            mode: mode, 
            createdAt: Date.now(),
        };
        await addDoc(designsCollection, newDesign);
        console.log(`[Firestore Write] Saved design to: ${designsCollectionPath}`);
        setError(null);
        setCurrentImage(null); 
    } catch (e) {
        console.error("Error saving design:", e);
        setError("Failed to save design to storage.");
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteDesign = async (id: string) => {
    if (!db || !auth) return;

    // Use the most authoritative UID directly from the auth instance
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;

    // Construct the path for deleting
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const designsCollectionPath = `/artifacts/${appId}/users/${currentUid}/approvedDesigns`;
    const designsCollection = collection(db, designsCollectionPath) as CollectionReference<Omit<ApprovedDesign, 'id'>>;
    
    setLoading(true);
    try {
        // Correct and clean usage of deleteDoc
        await deleteDoc(doc(designsCollection, id)); 
        console.log(`[Firestore Write] Deleted design from: ${designsCollectionPath}/${id}`);
        setError(null);
    } catch (e) {
        console.error("Error deleting design:", e);
        setError("Failed to delete design from storage.");
    } finally {
        setLoading(false);
    }
  };
  // --- End Firebase Logic ---

  useEffect(() => {
    // Reset style when mode changes to a valid default
    setSelectedStyle(mode === 'fashion' ? 'Haute Couture' : 'Modernist');
  }, [mode]);

  // --- Voice Input Logic (No change needed) ---
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
        const transcript = event.results[0][0].transcript;
        setInputText(prev => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
            setError("Voice input error. Please try typing instead.");
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      console.error("Speech recognition is not supported in this browser.");
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setError(null);
      recognitionRef.current.start();
      setIsListening(true);
    }
  };
  // --- End Voice Input Logic ---


  // --- Sketch Upload/Camera Logic (No change needed in handler) ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Clear the input value so the same file can be selected again later if needed
    event.target.value = ''; 
    
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSketchImage(reader.result as string);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!inputText.trim() && !sketchImage) {
        setError('Please enter a description or upload a sketch.');
        return;
    }

    setLoading(true);
    setError(null);
    setCurrentImage(null);

    // Prompt Engineering
    let promptPrefix = "";
    if (sketchImage) {
        promptPrefix = mode === 'fashion' 
            ? "Transform this rough sketch/photo into a high-end, photorealistic fashion photograph. The design is: " 
            : "Transform this architectural sketch/photo into a photorealistic, real-world building render. The design details are: ";
    } else {
        promptPrefix = mode === 'fashion' 
            ? "A professional, photorealistic fashion design visualization of " 
            : "A professional, photorealistic architectural visualization of ";
    }
    
    const styleContext = `, ${selectedStyle} style`;
    // Smart Prompting: The core of the enhancement is here
    const qualityBoosters = ", 8k resolution, highly detailed, realistic textures, cinematic lighting, masterpiece, award winning photography";
    const subject = inputText.trim() || "the structure shown in the sketch";

    const fullPrompt = `${promptPrefix} ${subject}${styleContext}${qualityBoosters}`;

    try {
      const imageUrl = await generateImage(fullPrompt, sketchImage);
      setCurrentImage(imageUrl);
      // Update session history
      setHistory(prev => [{ 
        id: Date.now(), 
        url: imageUrl, 
        prompt: subject, 
        mode, 
        style: selectedStyle,
        hasSketch: !!sketchImage 
      }, ...prev]);
    } catch (err) {
      console.error(err);
      setError("Failed to generate visualization. Please try again. The AI model may be unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-gray-900 selection:text-white">
      <Header mode={mode} setMode={setMode} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
        
        {/* Left Column: Controls & Input */}
        <div className="space-y-8 animate-in slide-in-from-left duration-700">
          
          <div className="space-y-4">
            <h2 className="text-3xl font-bold tracking-tight">
              Describe your 
              <span className={`ml-2 relative inline-block ${mode === 'fashion' ? 'text-rose-600' : 'text-indigo-600'}`}>
                {mode === 'fashion' ? 'Look' : 'Space'}
                <svg className="absolute -bottom-1 left-0 w-full h-3 opacity-20" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" />
                </svg>
              </span>
            </h2>
            <p className="text-gray-500 text-lg">
              Speak, type, or upload a sketch. Our engine handles the physics, lighting, and materials.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden focus-within:ring-2 focus-within:ring-gray-900/10 transition-shadow">
            
            {/* Sketch Preview Area */}
            {sketchImage && (
              <div className="bg-gray-50 border-b border-gray-100 p-4 flex items-center gap-4">
                <div className="relative group">
                    <img src={sketchImage} alt="Sketch" className="h-20 w-20 object-cover rounded-lg border border-gray-200 bg-white" />
                    <button 
                        onClick={() => setSketchImage(null)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                    >
                        <X size={12} />
                    </button>
                </div>
                <div className="flex-1">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <ScanLine size={14} className="text-blue-500"/> Sketch/Photo Scanned
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                        The AI will use this image as the structural reference for the final render.
                    </p>
                </div>
              </div>
            )}

            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={mode === 'fashion' ? "Describe materials, colors, or details to add to your image..." : "Describe materials, lighting, or environment for your building image..."}
              className={`w-full p-6 resize-none outline-none text-lg text-gray-700 placeholder:text-gray-300 ${sketchImage ? 'h-32' : 'h-40'}`}
            />
            
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-100">
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleListening}
                  disabled={loading}
                  className={`p-2 rounded-full transition-all duration-300 ${
                    isListening 
                      ? 'bg-red-50 text-red-600 animate-pulse ring-2 ring-red-100' 
                      : 'hover:bg-gray-200 text-gray-500'
                  }`}
                  title="Voice Input"
                >
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                
                {/* New Inputs for distinct Upload vs. Camera actions 
                  The handler is the same, but the input type/capture attribute determines the OS behavior.
                */}
                
                {/* 1. Upload from Gallery */}
                <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden" 
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className={`p-2 rounded-full transition-all duration-300 hover:bg-gray-200 text-gray-500`}
                    title="Upload Image from Gallery"
                >
                    <Upload size={20} />
                </button>

                {/* 2. Take Photo via Camera */}
                <input 
                    type="file" 
                    ref={cameraInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    capture="environment" // Forces the camera UI open
                    className="hidden" 
                />
                <button
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={loading}
                    className={`p-2 rounded-full transition-all duration-300 hover:bg-gray-200 text-gray-500 ${sketchImage ? 'text-blue-600 bg-blue-50' : ''}`}
                    title="Take Photo of Outfit or Sketch"
                >
                    <Camera size={20} />
                </button>

                <div className="h-4 w-px bg-gray-300 mx-1"></div>
                <StyleSelector mode={mode} selectedStyle={selectedStyle} onSelect={setSelectedStyle} />
              </div>
              
              <button
                onClick={handleGenerate}
                disabled={loading || (!inputText && !sketchImage)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-white transition-all transform active:scale-95 ${
                  loading || (!inputText && !sketchImage)
                    ? 'bg-gray-300 cursor-not-allowed'
                    : mode === 'fashion' 
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-200'
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200'
                }`}
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                <span>{sketchImage ? 'Render Image' : 'Generate'}</span>
              </button>
            </div>
          </div>

          {/* History / Recent (Session-based) */}
          {history.length > 0 && (
            <div className="space-y-4 pt-8 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Recent Concepts (Session)</h3>
                <button 
                  onClick={() => setHistory([])}
                  className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                >
                  <Trash2 size={12} /> Clear
                </button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {history.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                        setCurrentImage(item.url);
                        setInputText(item.prompt);
                        setMode(item.mode);
                        setSelectedStyle(item.style);
                    }}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-gray-900/50 transition-all"
                  >
                    <img 
                        src={item.url} 
                        alt="History" 
                        className="w-full h
