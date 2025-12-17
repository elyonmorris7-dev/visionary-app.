import React, { useState, useEffect, useRef, FC } from 'react';
import { Mic, MicOff, Send, Image as ImageIcon, Sparkles, Loader2, Home, Shirt, Download, Trash2, Upload, X, ScanLine, Save, Camera } from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, Auth } from 'firebase/auth';
import { getFirestore, doc, addDoc, onSnapshot, collection, query, Firestore, CollectionReference, deleteDoc, Unsubscribe } from 'firebase/firestore'; 

// --- API Key Setup ---
// This line allows Vercel to securely inject your key
const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY || ""; 

type DesignMode = 'fashion' | 'architecture';

interface ApprovedDesign {
    id: string;
    prompt: string;
    style: string;
    mode: DesignMode;
    imageUrl: string;
    createdAt: number;
}

// ... (The rest of your code stays exactly the same)
