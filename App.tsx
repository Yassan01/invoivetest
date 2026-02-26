import React, { useState, useEffect, useMemo, useRef } from 'react';
import { InvoiceData, InvoiceStatus, DocumentType, Category, HistoryLog } from './types';
import { extractInvoiceData, askInvoiceAssistant } from './services/geminiService';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { motion, AnimatePresence } from 'motion/react';

const INITIAL_DATA: InvoiceData[] = [
  { id: '1', vendor: 'Google Cloud', date: '2023-11-01', amount: 12500, currency: 'HUF', invoiceNumber: 'INV-1002', category: 'Software', docType: 'Invoice', status: 'Paid', fileName: 'google_invoice.pdf', uploadDate: '2023-11-02', comment: 'Monthly hosting' },
  { id: '2', vendor: 'E.ON Energy', date: '2023-10-25', amount: 45000, currency: 'HUF', invoiceNumber: 'UT-5521', category: 'Utility', docType: 'Invoice', status: 'Pending', fileName: 'eon_utility.png', uploadDate: '2023-10-26', comment: 'Electricity bill Q3' },
  { id: '3', vendor: 'WizzAir', date: '2023-11-05', amount: 32000, currency: 'HUF', invoiceNumber: 'WA-8812', category: 'Travel', docType: 'Receipt', status: 'Paid', fileName: 'flight_ticket.pdf', uploadDate: '2023-11-06', comment: 'Business trip to London' },
];

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const getVendorIcon = (vendor: string, dynamic: boolean) => {
  if (!dynamic) return 'fa-solid fa-building';
  const v = vendor.toLowerCase();
  if (v.includes('google') || v.includes('cloud') || v.includes('software')) return 'fa-solid fa-cloud';
  if (v.includes('e.on') || v.includes('energy') || v.includes('utility') || v.includes('electricity')) return 'fa-solid fa-bolt';
  if (v.includes('wizz') || v.includes('travel') || v.includes('flight') || v.includes('airline')) return 'fa-solid fa-plane';
  if (v.includes('food') || v.includes('restaurant') || v.includes('uber') || v.includes('bolt')) return 'fa-solid fa-utensils';
  if (v.includes('amazon') || v.includes('shop') || v.includes('store')) return 'fa-solid fa-cart-shopping';
  return 'fa-solid fa-building';
};

const getDaysUntilDeadline = (deadlineDay: number) => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  let deadline = new Date(currentYear, currentMonth, deadlineDay);
  
  if (now > deadline) {
    deadline = new Date(currentYear, currentMonth + 1, deadlineDay);
  }
  
  const diffTime = deadline.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

type SortConfig = {
  key: keyof InvoiceData;
  direction: 'ascending' | 'descending';
} | null;

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

interface Settings {
  deadlineDay: number;
  darkMode: boolean;
  autoDarkMode: boolean;
  dynamicVendorIcons: boolean;
  bellEnabled: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  deadlineDay: 10,
  darkMode: true,
  autoDarkMode: false,
  dynamicVendorIcons: false,
  bellEnabled: false
};

const DarkModeSwitch: React.FC<{ active: boolean; onChange: () => void }> = ({ active, onChange }) => {
  return (
    <button
      onClick={onChange}
      className="relative w-20 h-10 rounded-full bg-slate-700 p-1 flex items-center overflow-hidden transition-colors"
    >
      <motion.div
        className="z-10 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center relative"
        animate={{ x: active ? 40 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        <AnimatePresence mode="wait">
          {active ? (
            <motion.i
              key="moon"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 90 }}
              className="fa-solid fa-moon text-indigo-600 text-sm"
            />
          ) : (
            <motion.i
              key="sun"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 90 }}
              className="fa-solid fa-sun text-yellow-500 text-sm"
            />
          )}
        </AnimatePresence>
      </motion.div>
      
      {/* Background elements */}
      <div className="absolute inset-0 flex justify-between px-3 items-center pointer-events-none">
        <div className="flex gap-1 opacity-40">
          <i className="fa-solid fa-cloud text-[10px] text-slate-300"></i>
          <i className="fa-solid fa-cloud text-[10px] text-slate-300 -mt-1"></i>
        </div>
        <div className="flex gap-1 opacity-40">
          <i className="fa-solid fa-star text-[8px] text-yellow-200"></i>
          <i className="fa-solid fa-star text-[8px] text-yellow-200 mt-1"></i>
        </div>
      </div>

      {/* Rolling animation elements */}
      <motion.div 
        className="absolute inset-0 pointer-events-none"
        animate={{ x: active ? 0 : -80 }}
      >
         {/* This could be more complex but let's keep it simple for now */}
      </motion.div>
    </button>
  );
};

const VendorIconSwitch: React.FC<{ active: boolean; onChange: () => void }> = ({ active, onChange }) => {
  return (
    <button
      onClick={onChange}
      className="relative w-20 h-10 rounded-full bg-slate-700 p-1 flex items-center transition-colors"
    >
      <motion.div
        className={`z-10 w-8 h-8 rounded-full shadow-lg flex items-center justify-center ${active ? 'bg-green-500' : 'bg-red-500'}`}
        animate={{ x: active ? 40 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        <AnimatePresence mode="wait">
          {active ? (
            <motion.i
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="fa-solid fa-check text-white text-sm"
            />
          ) : (
            <motion.i
              key="xmark"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="fa-solid fa-xmark text-white text-sm"
            />
          )}
        </AnimatePresence>
      </motion.div>
      <div className="absolute inset-0 flex justify-between px-4 items-center text-[10px] font-bold pointer-events-none">
        <span className="text-red-400">OFF</span>
        <span className="text-green-400">ON</span>
      </div>
    </button>
  );
};

const AutoDarkSwitch: React.FC<{ active: boolean; onChange: () => void }> = ({ active, onChange }) => {
  return (
    <button
      onClick={onChange}
      className="relative w-20 h-10 rounded-full bg-slate-700 p-1 flex items-center transition-colors"
    >
      <motion.div
        className="z-10 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center"
        animate={{ x: active ? 40 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        <div className="relative w-5 h-5 border-2 border-slate-800 rounded-full">
          <motion.div 
            className="absolute top-1/2 left-1/2 w-0.5 h-2 bg-slate-800 origin-bottom -translate-x-1/2 -translate-y-full"
            animate={{ rotate: active ? 360 : 0 }}
            transition={{ duration: 0.5 }}
          />
          <motion.div 
            className="absolute top-1/2 left-1/2 w-0.5 h-1.5 bg-slate-800 origin-bottom -translate-x-1/2 -translate-y-full"
            animate={{ rotate: active ? 720 : 0 }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </motion.div>
      <div className="absolute inset-0 flex justify-center items-center opacity-20 pointer-events-none">
        <i className="fa-solid fa-clock"></i>
      </div>
    </button>
  );
};

const BellSwitch: React.FC<{ active: boolean; onChange: () => void }> = ({ active, onChange }) => {
  return (
    <button
      onClick={onChange}
      className="relative w-20 h-10 rounded-full bg-slate-700 p-1 flex items-center transition-colors"
    >
      <motion.div
        className="z-10 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center"
        animate={{ x: active ? 40 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      >
        <AnimatePresence mode="wait">
          {active ? (
            <motion.i
              key="bell"
              initial={{ rotate: 0 }}
              animate={{ rotate: [0, -20, 20, -20, 20, 0] }}
              transition={{ duration: 0.5 }}
              className="fa-solid fa-bell text-indigo-600 text-sm"
            />
          ) : (
            <motion.div
              key="bell-off"
              className="relative"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
               <motion.i 
                animate={{ x: [0, -2, 2, -2, 2, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="fa-solid fa-bell text-slate-400 text-sm opacity-50" 
               />
               <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-5 h-0.5 bg-red-500 rotate-45"></div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </button>
  );
};

const App: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceData[]>(() => {
    const saved = localStorage.getItem('smart-invoices');
    return saved ? JSON.parse(saved) : INITIAL_DATA;
  });
  
  // History State
  const [history, setHistory] = useState<HistoryLog[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Custom Doc Types State
  const [customDocTypes, setCustomDocTypes] = useState<string[]>(() => {
    const saved = localStorage.getItem('custom-doc-types');
    return saved ? JSON.parse(saved) : [];
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('smart-invoices-settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [activeTab, setActiveTab] = useState<'table' | 'dashboard' | 'vendors' | 'export' | 'settings'>('table');
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceData | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [isTableEditMode, setIsTableEditMode] = useState(false);
  
  // Batch Edit State
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  
  // Mobile Sidebar State
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Undo/Delete State (Toast)
  const [deletedInvoice, setDeletedInvoice] = useState<InvoiceData | null>(null);
  const [showUndoToast, setShowUndoToast] = useState(false);
  const undoTimeoutRef = useRef<number | null>(null);

  // Zoom & Pan State for Preview
  const [zoomLevel, setZoomLevel] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const startPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Custom Type Input State (Temporary for Modal)
  const [tempCustomType, setTempCustomType] = useState('');

  // Vendors Tab State
  const [selectedVendorDetail, setSelectedVendorDetail] = useState<string | null>(null);
  const [vendorSearchTerm, setVendorSearchTerm] = useState('');

  // Advanced Filters
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'All'>('All');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // PDF Preview State
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // Export State
  const [exportStart, setExportStart] = useState('');
  const [exportEnd, setExportEnd] = useState('');

  // Dashboard Drilldown State
  const [showVendorStats, setShowVendorStats] = useState(false);

  // AI Chat State
  const [isChatOpen, setIsChatOpen] = useState(false); 
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{ role: 'ai', text: 'Hi! Ask me anything about your spending.'}]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Add Menu State
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Greeting & Fun Fact
  const [greeting, setGreeting] = useState({ text: 'Hello', icon: '👋' });
  const [funFact, setFunFact] = useState('');

  const dragCounter = useRef(0);

  // Persist Custom Types
  useEffect(() => {
    localStorage.setItem('custom-doc-types', JSON.stringify(customDocTypes));
  }, [customDocTypes]);

  // Dynamic Vendor-Category Map
  const vendorCategoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    invoices.forEach(inv => {
      if (inv.vendor && inv.category) {
        map[inv.vendor.trim().toLowerCase()] = inv.category;
      }
    });
    return map;
  }, [invoices]);

  // Vendor Statistics for Vendors Tab
  const vendorStats = useMemo(() => {
    const stats: Record<string, { count: number, total: number, lastDate: string, category: string }> = {};
    invoices.forEach(inv => {
      if (!stats[inv.vendor]) {
        stats[inv.vendor] = { count: 0, total: 0, lastDate: '', category: inv.category };
      }
      stats[inv.vendor].count++;
      stats[inv.vendor].total += inv.amount;
      // Update last date
      if (inv.date > stats[inv.vendor].lastDate || stats[inv.vendor].lastDate === '') {
        stats[inv.vendor].lastDate = inv.date;
      }
    });
    return Object.entries(stats)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total);
  }, [invoices]);

  const filteredVendorStats = useMemo(() => {
    return vendorStats.filter(vendor => 
      vendor.name.toLowerCase().includes(vendorSearchTerm.toLowerCase()) || 
      vendor.category.toLowerCase().includes(vendorSearchTerm.toLowerCase())
    );
  }, [vendorStats, vendorSearchTerm]);

  useEffect(() => {
    localStorage.setItem('smart-invoices', JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem('smart-invoices-settings', JSON.stringify(settings));
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [settings]);

  useEffect(() => {
    if (settings.autoDarkMode) {
      const hour = new Date().getHours();
      const isNight = hour >= 18 || hour < 6;
      if (isNight !== settings.darkMode) {
        setSettings(s => ({ ...s, darkMode: isNight }));
      }
    }
  }, [settings.autoDarkMode]);

  useEffect(() => {
    // Set default export range to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    setExportStart(firstDay);
    setExportEnd(lastDay);

    // Calculate Greeting
    const hour = now.getHours();
    if (hour >= 5 && hour < 12) setGreeting({ text: 'Good Morning', icon: '☕' });
    else if (hour >= 12 && hour < 18) setGreeting({ text: 'Good Afternoon', icon: '☀️' });
    else if (hour >= 18 && hour < 22) setGreeting({ text: 'Good Evening', icon: '🌙' });
    else setGreeting({ text: 'Time to rest?', icon: '✨' });

  }, []);

  // Generate Fun Fact
  useEffect(() => {
    if (invoices.length === 0) {
      setFunFact("Upload your first invoice to get insights!");
      return;
    }
    const genericFacts = [
        () => {
          const total = invoices.reduce((s, i) => s + i.amount, 0);
          return `You have tracked a total of ${total.toLocaleString()} HUF so far.`;
        },
        () => {
            const counts = invoices.reduce((acc: any, inv) => ({...acc, [inv.category]: (acc[inv.category] || 0) + 1}), {});
            if (Object.keys(counts).length === 0) return "Start categorizing to see trends.";
            const topCat = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
            return `Most of your documents are in the '${topCat}' category.`;
        },
        () => {
            const paidCount = invoices.filter(i => i.status === 'Paid').length;
            const percent = ((paidCount / invoices.length) * 100).toFixed(0);
            return `You have successfully paid ${percent}% of your invoices.`;
        }
    ];

    const uniqueVendors = Array.from(new Set(invoices.map(i => i.vendor).filter(v => v)));
    const companyFacts = uniqueVendors.length > 0 ? [
        () => {
            const randomVendor = uniqueVendors[Math.floor(Math.random() * uniqueVendors.length)];
            const vendorInvoices = invoices.filter(i => i.vendor === randomVendor);
            const total = vendorInvoices.reduce((a, b) => a + b.amount, 0);
            return `You have spent a total of ${total.toLocaleString()} HUF at ${randomVendor}.`;
        },
        () => {
            const max = invoices.reduce((prev, current) => (prev.amount > current.amount) ? prev : current);
            return `Your single largest expense was at ${max.vendor} for ${max.amount.toLocaleString()} HUF.`;
        }
    ] : [];

    const allFacts = [...genericFacts, ...companyFacts];
    if (allFacts.length > 0) {
        const index = Math.floor(Math.random() * allFacts.length);
        setFunFact(allFacts[index]());
    }

  }, [invoices]);

  // Handle PDF Blob URL and reset image error & zoom
  useEffect(() => {
    setImageError(false);
    setZoomLevel(1);
    setPan({ x: 0, y: 0 }); // Reset Pan
    setTempCustomType(''); // Reset custom type input
    if (selectedInvoice && selectedInvoice.fileData && selectedInvoice.mimeType === 'application/pdf') {
      try {
        const base64Content = selectedInvoice.fileData.split(',')[1];
        const binaryString = window.atob(base64Content);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPdfPreviewUrl(url);
        
        return () => {
          URL.revokeObjectURL(url);
          setPdfPreviewUrl(null);
        };
      } catch (e) {
        console.error("Failed to create PDF blob", e);
      }
    } else {
      setPdfPreviewUrl(null);
    }
  }, [selectedInvoice]);

  // Scroll chat to bottom
  useEffect(() => {
    if (isChatOpen) {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isChatOpen]);

  // Get unique existing vendors
  const uniqueVendors = useMemo(() => {
    const vendors = new Set(invoices.map(inv => inv.vendor));
    return Array.from(vendors).sort();
  }, [invoices]);

  const addToHistory = (type: 'Edit' | 'Delete', prevState: InvoiceData, description: string) => {
    const newLog: HistoryLog = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      timestamp: Date.now(),
      description,
      previousState: { ...prevState }, // Clone deep enough for our flat structure
      invoiceId: prevState.id
    };
    setHistory(prev => [newLog, ...prev]);
  };

  const handleRestoreHistory = (log: HistoryLog) => {
    if (log.type === 'Delete') {
      // Re-add the item
      setInvoices(prev => [log.previousState, ...prev]);
    } else if (log.type === 'Edit') {
      // Revert the item
      setInvoices(prev => prev.map(inv => inv.id === log.invoiceId ? log.previousState : inv));
    }
    // Remove the log entry after restoring
    setHistory(prev => prev.filter(h => h.id !== log.id));
  };

  const processFiles = async (files: FileList) => {
    if (files.length === 0) return;
    setIsUploading(true);
    setIsAddMenuOpen(false); 
    setIsMobileSidebarOpen(false); // Close mobile menu on action
    
    const file = files[0];
    
    if (file.type.match('image.*') || file.type === 'application/pdf') {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        const result = e.target?.result as string;
        const base64Data = result.split(',')[1];
        const tempId = Math.random().toString(36).substr(2, 9);
        
        try {
          const extracted = await extractInvoiceData(base64Data, file.type);
          
          const knownCategory = vendorCategoryMap[extracted.vendor.trim().toLowerCase()];

          const newInvoice: InvoiceData = {
            id: tempId,
            vendor: extracted.vendor,
            date: extracted.date,
            amount: extracted.amount,
            currency: extracted.currency,
            invoiceNumber: extracted.invoiceNumber,
            category: knownCategory || extracted.category,
            docType: extracted.docType || 'Invoice',
            status: 'Pending',
            fileName: file.name,
            uploadDate: new Date().toISOString().split('T')[0],
            fileData: result,
            mimeType: file.type
          };
          
          setSelectedInvoice(newInvoice);
          
        } catch (error) {
          console.error("Extraction failed", error);
          const errorInvoice: InvoiceData = {
            id: tempId,
            vendor: 'Extraction Error',
            date: new Date().toISOString().split('T')[0],
            amount: 0,
            currency: 'HUF',
            invoiceNumber: 'N/A',
            category: 'Other',
            docType: 'Other',
            status: 'Error',
            fileName: file.name,
            uploadDate: new Date().toISOString().split('T')[0],
            fileData: result,
            mimeType: file.type
          };
          setSelectedInvoice(errorInvoice);
        }
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } else {
      setIsUploading(false);
    }
  };

  const handleManualEntry = () => {
    setIsAddMenuOpen(false);
    setIsMobileSidebarOpen(false);
    const tempId = Math.random().toString(36).substr(2, 9);
    const blankInvoice: InvoiceData = {
        id: tempId,
        vendor: 'New Vendor',
        date: new Date().toISOString().split('T')[0],
        amount: 0,
        currency: 'HUF',
        invoiceNumber: '',
        category: Category.Other,
        docType: 'Invoice',
        status: 'Pending',
        fileName: 'Manual Entry',
        uploadDate: new Date().toISOString().split('T')[0]
    };
    setSelectedInvoice(blankInvoice);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = chatInput;
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const aiResponse = await askInvoiceAssistant(userMsg, invoices);
      setChatMessages(prev => [...prev, { role: 'ai', text: aiResponse }]);
    } catch (error) {
      setChatMessages(prev => [...prev, { role: 'ai', text: "Sorry, I had trouble connecting to the brain." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const updateInvoiceField = <K extends keyof InvoiceData>(field: K, value: InvoiceData[K]) => {
    setSelectedInvoice(prev => {
        if (!prev) return null;
        if (field === 'vendor') {
            const knownCategory = vendorCategoryMap[String(value).trim().toLowerCase()];
            if (knownCategory) {
                return { ...prev, [field]: value, category: knownCategory };
            }
        }
        return { ...prev, [field]: value };
    });
  };

  // Handle saving logic including custom doc types
  const handleSave = () => {
    if (!selectedInvoice) return;

    let finalInvoice = { ...selectedInvoice };

    // Handle Custom Document Type Logic
    if (selectedInvoice.docType === 'Other' && tempCustomType.trim()) {
        const newType = tempCustomType.trim();
        // Add to custom types list if not exists
        if (!customDocTypes.includes(newType)) {
            setCustomDocTypes(prev => [...prev, newType].sort());
        }
        // Save the custom type string (casting to any to bypass strict enum for custom values)
        finalInvoice.docType = newType as DocumentType;
    }

    setInvoices(prev => {
      const exists = prev.find(inv => inv.id === finalInvoice.id);
      if (exists) {
        // Record History for Edit
        addToHistory('Edit', exists, `Updated invoice for ${exists.vendor}`);
        return prev.map(inv => inv.id === finalInvoice.id ? finalInvoice : inv);
      } else {
        return [finalInvoice, ...prev];
      }
    });
    setSelectedInvoice(null);
  };

  const handleInlineUpdate = (id: string, field: keyof InvoiceData, value: any) => {
     const original = invoices.find(i => i.id === id);
     if (original) {
        // We log inline updates too. Note: This will log every change (like typing).
        // In a real app we might debounce this or only log on blur, but for "all modifications" this is accurate.
        // To reduce spam in history for this specific implementation, we rely on the user understanding immediate history.
        // However, since state updates are fast, let's just log it.
        
        // *Optimization*: Check if value actually changed to avoid duplicate logs if clicked but not changed
        if (original[field] !== value) {
             addToHistory('Edit', original, `Changed ${field} for ${original.vendor}`);
        }
     }

     setInvoices(prev => prev.map(inv => {
         if (inv.id === id) {
             const updated = { ...inv, [field]: value };
             if (field === 'vendor') {
                 const knownCategory = vendorCategoryMap[String(value).trim().toLowerCase()];
                 if (knownCategory) {
                     updated.category = knownCategory;
                 }
             }
             return updated;
         }
         return inv;
     }));
  };

  const deleteInvoice = (id: string) => {
      const invoiceToDelete = invoices.find(i => i.id === id);
      if (!invoiceToDelete) return;

      // Add to history log
      addToHistory('Delete', invoiceToDelete, `Deleted ${invoiceToDelete.vendor}`);

      // Immediately delete and show undo toast
      setDeletedInvoice(invoiceToDelete);
      setInvoices(prev => prev.filter(i => i.id !== id));
      setShowUndoToast(true);

      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = window.setTimeout(() => {
          setShowUndoToast(false);
          setDeletedInvoice(null);
      }, 5000);
  };

  const handleUndoDelete = () => {
      if (deletedInvoice) {
          setInvoices(prev => [deletedInvoice, ...prev]);
          setDeletedInvoice(null);
          setShowUndoToast(false);
          if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      }
  };

  const handleSort = (key: keyof InvoiceData) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Bulk Selection Handlers
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleAllSelection = (currentFiltered: InvoiceData[]) => {
    if (selectedIds.size === currentFiltered.length && currentFiltered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(currentFiltered.map(i => i.id)));
    }
  };

  const handleBulkUpdate = (field: keyof InvoiceData, value: any) => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Are you sure you want to update ${selectedIds.size} items?`)) return;
    
    // For bulk update, we should log each one or create a 'Bulk' history type.
    // To keep it simple, we log individual edits for now or just one generic.
    // Let's log individual for correctness so Undo works per item.
    invoices.forEach(inv => {
        if(selectedIds.has(inv.id)) {
            addToHistory('Edit', inv, `Bulk updated ${field}`);
        }
    });

    setInvoices(prev => prev.map(inv => {
        if (selectedIds.has(inv.id)) {
            return { ...inv, [field]: value };
        }
        return inv;
    }));
    setSelectedIds(new Set());
  };

  const filteredInvoices = useMemo(() => {
    let data = invoices.filter(inv => {
      const matchesText = 
        inv.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.status.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'All' || inv.status === filterStatus;
      let matchesDate = true;
      if (filterDateFrom) matchesDate = matchesDate && inv.date >= filterDateFrom;
      if (filterDateTo) matchesDate = matchesDate && inv.date <= filterDateTo;

      return matchesText && matchesStatus && matchesDate;
    });

    if (sortConfig !== null) {
      data.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        if (aValue === undefined) aValue = '';
        if (bValue === undefined) bValue = '';
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [invoices, searchTerm, sortConfig, filterStatus, filterDateFrom, filterDateTo]);

  const stats = useMemo(() => {
    // ... existing stats logic ...
    const byCategory = invoices.reduce((acc, inv) => {
      acc[inv.category] = (acc[inv.category] || 0) + inv.amount;
      return acc;
    }, {} as Record<string, number>);

    const byVendor = invoices.reduce((acc, inv) => {
      acc[inv.vendor] = (acc[inv.vendor] || 0) + inv.amount;
      return acc;
    }, {} as Record<string, number>);

    const vendorData = Object.entries(byVendor).map(([name, value]) => ({ name, value })).sort((a, b) => (b.value as number) - (a.value as number)); 
    const pieData = Object.entries(byCategory).map(([name, value]) => ({ name, value })).sort((a, b) => (b.value as number) - (a.value as number));

    return { pieData, vendorData, total: invoices.reduce((sum, inv) => sum + inv.amount, 0) };
  }, [invoices]);

  const barData = useMemo(() => {
     // ... existing barData logic ...
    const monthly = invoices.reduce((acc, inv) => {
      const month = inv.date.substring(0, 7);
      acc[month] = (acc[month] || 0) + inv.amount;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(monthly).sort((a, b) => a[0].localeCompare(b[0])).map(([name, amount]) => ({ name, amount }));
  }, [invoices]);

  const getStatusBadgeClass = (status: InvoiceStatus) => {
    switch (status) {
      case 'Paid': return 'bg-green-900/30 text-green-400';
      case 'Pending': return 'bg-yellow-900/30 text-yellow-400';
      case 'Overdue': return 'bg-red-900/30 text-red-400';
      case 'Processing': return 'bg-blue-900/30 text-blue-400';
      default: return 'bg-gray-800 text-gray-400';
    }
  };

  const handleExport = async (type: 'csv' | 'files', mode: 'custom' | 'current-month' | 'current-year' | 'all', grouping: 'week' | 'month' | 'year' = 'month') => {
    // ... existing export logic ...
    let filteredForExport = invoices;
    const now = new Date();

    if (mode === 'custom') {
      filteredForExport = invoices.filter(inv => inv.date >= exportStart && inv.date <= exportEnd);
    } else if (mode === 'current-month') {
      const currentMonthStr = now.toISOString().slice(0, 7);
      filteredForExport = invoices.filter(inv => inv.date.startsWith(currentMonthStr));
    } else if (mode === 'current-year') {
      const currentYearStr = now.getFullYear().toString();
      filteredForExport = invoices.filter(inv => inv.date.startsWith(currentYearStr));
    }

    if (filteredForExport.length === 0) {
      alert("No invoices found.");
      return;
    }

    if (type === 'files') {
      const zip = new JSZip();
      filteredForExport.forEach(inv => {
        let folderName = 'Unsorted';
        const date = new Date(inv.date);
        
        if (grouping === 'year') {
          folderName = date.getFullYear().toString();
        } else if (grouping === 'month') {
          folderName = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        } else if (grouping === 'week') {
           const yearStart = new Date(date.getFullYear(), 0, 1);
           const pastDays = (date.getTime() - yearStart.getTime()) / 86400000;
           const weekNum = Math.ceil((pastDays + yearStart.getDay() + 1) / 7);
           folderName = `${date.getFullYear()}-W${weekNum}`;
        }

        if (inv.fileData) {
          const base64Content = inv.fileData.split(',')[1];
          let extension = 'bin';
          if (inv.mimeType === 'application/pdf') extension = 'pdf';
          else if (inv.mimeType === 'image/jpeg') extension = 'jpg';
          else if (inv.mimeType === 'image/png') extension = 'png';
          
          const filename = `${inv.vendor.replace(/[^a-z0-9]/gi, '_')}_${inv.date}_${inv.invoiceNumber}.${extension}`;
          zip.folder(folderName)?.file(filename, base64Content, { base64: true });
        }
      });
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `invoices_${mode}_export.zip`);
    } else {
      const headers = ['ID', 'Vendor', 'Date', 'Amount', 'Currency', 'Category', 'Type', 'Status', 'Comment'];
      const csvRows = [headers.join(',')];
      filteredForExport.forEach(inv => {
        const row = [inv.id, `"${inv.vendor}"`, inv.date, inv.amount, inv.currency, inv.category, inv.docType, inv.status, `"${inv.comment || ''}"`];
        csvRows.push(row.join(','));
      });
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      saveAs(blob, `invoices_${mode}_export.csv`);
    }
  };

  const renderCustomizedLabel = (props: any) => {
    // ... existing label logic
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, index, name, value } = props;
    if (index > 4 && percent < 0.05) return null;
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 25;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text x={x} y={y} fill="#e2e8f0" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" className="text-xs font-semibold">
        {name}: {value.toLocaleString()} ({ (percent * 100).toFixed(0) }%)
      </text>
    );
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const toggleAddMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAddMenuOpen(!isAddMenuOpen);
  };

  // Preview Handlers
  const handleZoom = (delta: number) => {
      setZoomLevel(prev => Math.max(0.1, Math.min(5, prev + delta)));
  };

  const handlePreviewWheel = (e: React.WheelEvent) => {
      if (selectedInvoice?.mimeType?.startsWith('image/')) {
          const delta = e.deltaY * -0.002;
          setZoomLevel(prev => Math.max(0.1, Math.min(5, prev + delta)));
      }
  };

  const handlePreviewMouseDown = (e: React.MouseEvent) => {
     if (selectedInvoice?.mimeType?.startsWith('image/')) {
         e.preventDefault();
         setIsPanning(true);
         startPanRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
     }
  };
  
  const handlePreviewMouseMove = (e: React.MouseEvent) => {
      if (!isPanning) return;
      e.preventDefault();
      setPan({
          x: e.clientX - startPanRef.current.x,
          y: e.clientY - startPanRef.current.y
      });
  };

  const handlePreviewMouseUp = () => {
      setIsPanning(false);
  };

  return (
    <div 
      className="min-h-screen flex flex-col md:flex-row relative bg-slate-900 text-slate-100 font-sans h-screen overflow-hidden"
      onDragEnter={(e) => { 
        if (selectedInvoice) return; // Prevent drag actions if modal is open
        e.preventDefault(); 
        dragCounter.current++; 
        setIsDragging(true); 
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => { 
        dragCounter.current--; 
        if (dragCounter.current === 0) setIsDragging(false); 
      }}
      onDrop={(e) => { 
        if (selectedInvoice) return; // Prevent drop if modal is open
        e.preventDefault(); 
        setIsDragging(false); 
        dragCounter.current = 0; 
        if (e.dataTransfer.files) processFiles(e.dataTransfer.files); 
      }}
    >
      {/* Loading Overlay */}
      {isUploading && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm">
           <i className="fa-solid fa-circle-notch animate-spin text-5xl text-indigo-500 mb-4"></i>
           <p className="text-xl font-semibold animate-pulse">Analyzing Document...</p>
        </div>
      )}

      {/* Drag Drop Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-indigo-600/90 flex flex-col items-center justify-center text-white backdrop-blur-sm pointer-events-none">
          <div className="p-12 border-4 border-dashed border-white/50 rounded-3xl flex flex-col items-center gap-6">
            <i className="fa-solid fa-cloud-arrow-up text-8xl animate-bounce"></i>
            <h2 className="text-4xl font-bold">Drop documents here!</h2>
            <p className="text-xl">AI will handle the rest</p>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      {showUndoToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-slate-800 text-white px-6 py-4 rounded-xl shadow-2xl border border-slate-600 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4">
              <span>Item deleted.</span>
              <button 
                onClick={handleUndoDelete}
                className="bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded-lg font-bold text-sm transition-colors"
              >
                  <i className="fa-solid fa-rotate-left mr-2"></i>Undo
              </button>
              <button onClick={() => setShowUndoToast(false)} className="text-slate-400 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
          </div>
      )}

      {/* History Sidebar */}
      <div className={`fixed inset-y-0 right-0 w-80 bg-slate-900 border-l border-slate-700 transform transition-transform duration-300 ease-in-out z-[90] flex flex-col shadow-2xl ${isHistoryOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-6 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
              <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  <i className="fa-solid fa-clock-rotate-left text-indigo-400"></i> History
              </h3>
              <button onClick={() => setIsHistoryOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <i className="fa-solid fa-xmark text-lg"></i>
              </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {history.length === 0 ? (
                  <div className="text-center text-slate-500 py-10">
                      <i className="fa-solid fa-wind text-3xl mb-3 opacity-30"></i>
                      <p>No changes recorded yet.</p>
                  </div>
              ) : (
                  history.map(log => (
                      <div key={log.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col gap-2 relative group">
                          <div className="flex justify-between items-start">
                              <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${log.type === 'Delete' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">{log.type}</span>
                              </div>
                              <span className="text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-sm text-white font-medium">{log.description}</p>
                          <div className="mt-2 pt-2 border-t border-slate-700/50 flex justify-end">
                              <button 
                                onClick={() => handleRestoreHistory(log)}
                                className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-indigo-600 text-slate-200 hover:text-white rounded-lg transition-colors font-semibold"
                              >
                                  <i className="fa-solid fa-rotate-left"></i> Undo Action
                              </button>
                          </div>
                      </div>
                  ))
              )}
          </div>
      </div>

      {/* History Sidebar Overlay (Click to close) */}
      {isHistoryOpen && (
          <div 
            className="fixed inset-0 bg-black/20 z-[85] backdrop-blur-[1px]"
            onClick={() => setIsHistoryOpen(false)}
          ></div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-40 w-72 bg-slate-800 border-r border-slate-700 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0 md:w-80 md:shadow-sm
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {!isChatOpen ? (
            <>
                <div className="p-6 pb-2 flex-shrink-0 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 text-indigo-400">
                      <i className="fa-solid fa-file-invoice-dollar text-3xl"></i>
                      <h1 className="text-xl font-bold tracking-tight text-white">InvoiceBox</h1>
                    </div>
                    {/* Mobile Close Button */}
                    <button onClick={() => setIsMobileSidebarOpen(false)} className="md:hidden text-slate-400">
                        <i className="fa-solid fa-xmark text-xl"></i>
                    </button>
                  </div>
                  
                  {/* Split Button */}
                  <div className="relative mb-6">
                     <div className="flex rounded-xl shadow-lg bg-indigo-600 transition-all">
                        <button 
                          onClick={triggerUpload} 
                          disabled={isUploading || selectedInvoice !== null} // Disable button if modal open
                          className="flex-1 hover:bg-indigo-700 py-3 px-4 rounded-l-xl font-medium text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <i className="fa-solid fa-plus"></i> Add Document
                        </button>
                        <button 
                          onClick={toggleAddMenu}
                          disabled={isUploading || selectedInvoice !== null} 
                          className="px-3 hover:bg-indigo-700 border-l border-indigo-500 rounded-r-xl text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <i className={`fa-solid fa-chevron-down text-xs transition-transform ${isAddMenuOpen ? 'rotate-180' : ''}`}></i>
                        </button>
                     </div>

                     {isAddMenuOpen && (
                         <div className="absolute top-full right-0 mt-2 bg-slate-700 rounded-xl shadow-xl border border-slate-600 overflow-hidden z-20 animate-in fade-in slide-in-from-top-2 w-48">
                             <button 
                                onClick={() => {
                                    setIsAddMenuOpen(false);
                                    cameraInputRef.current?.click();
                                }}
                                className="w-full text-left px-4 py-3 hover:bg-slate-600 text-slate-200 flex items-center gap-3 transition-colors border-b border-slate-600"
                             >
                                 <i className="fa-solid fa-camera text-indigo-400"></i> Take Photo
                             </button>
                             <button 
                                onClick={handleManualEntry}
                                className="w-full text-left px-4 py-3 hover:bg-slate-600 text-slate-200 flex items-center gap-3 transition-colors"
                             >
                                 <i className="fa-solid fa-keyboard text-indigo-400"></i> Manual Entry
                             </button>
                         </div>
                     )}
                     
                     <input 
                      ref={fileInputRef}
                      type="file" 
                      multiple 
                      className="hidden" 
                      accept="image/*,.pdf" 
                      onChange={(e) => e.target.files && processFiles(e.target.files)} 
                      onClick={(e) => (e.currentTarget.value = '')} 
                      disabled={isUploading || selectedInvoice !== null} 
                    />
                    <input 
                      ref={cameraInputRef}
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      capture="environment"
                      onChange={(e) => e.target.files && processFiles(e.target.files)} 
                      onClick={(e) => (e.currentTarget.value = '')} 
                      disabled={isUploading || selectedInvoice !== null} 
                    />
                  </div>

                  <nav className="space-y-2">
                    <button onClick={() => { setActiveTab('table'); setIsMobileSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'table' ? 'bg-indigo-900/20 text-indigo-400 font-semibold shadow-sm' : 'text-slate-400 hover:bg-slate-700'}`}>
                      <i className="fa-solid fa-list"></i><span>Documents</span>
                    </button>
                    <button onClick={() => { setActiveTab('vendors'); setIsMobileSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'vendors' ? 'bg-indigo-900/20 text-indigo-400 font-semibold shadow-sm' : 'text-slate-400 hover:bg-slate-700'}`}>
                      <i className="fa-solid fa-building"></i><span>Vendors</span>
                    </button>
                    <button onClick={() => { setActiveTab('dashboard'); setIsMobileSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'dashboard' ? 'bg-indigo-900/20 text-indigo-400 font-semibold shadow-sm' : 'text-slate-400 hover:bg-slate-700'}`}>
                      <i className="fa-solid fa-chart-pie"></i><span>Analytics</span>
                    </button>
                    <button onClick={() => { setActiveTab('export'); setIsMobileSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'export' ? 'bg-indigo-900/20 text-indigo-400 font-semibold shadow-sm' : 'text-slate-400 hover:bg-slate-700'}`}>
                      <i className="fa-solid fa-file-export"></i><span>Export</span>
                    </button>
                    <button onClick={() => { setActiveTab('settings'); setIsMobileSidebarOpen(false); }} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-indigo-900/20 text-indigo-400 font-semibold shadow-sm' : 'text-slate-400 hover:bg-slate-700'}`}>
                      <i className="fa-solid fa-gear"></i><span>Settings</span>
                    </button>
                  </nav>
                </div>
                
                <div className="mt-auto p-4 border-t border-slate-700">
                    <button 
                     onClick={() => setIsChatOpen(true)}
                     className="w-full flex items-center justify-between px-4 py-3 bg-slate-700/50 rounded-xl text-slate-300 hover:bg-slate-700 hover:text-white transition-colors border border-slate-600"
                   >
                     <div className="flex items-center gap-3 font-semibold">
                       <i className="fa-solid fa-robot text-indigo-400"></i> AI Assistant
                     </div>
                     <i className="fa-solid fa-chevron-right text-xs"></i>
                   </button>
                </div>
            </>
        ) : (
             <div className="flex flex-col h-full bg-slate-800 animate-in slide-in-from-left-4 duration-300">
               <div className="p-4 border-b border-slate-700 bg-slate-900/20 flex items-center justify-between">
                   <h2 className="font-bold text-white flex items-center gap-2">
                       <i className="fa-solid fa-robot text-indigo-400"></i> AI Assistant
                   </h2>
                   <button 
                     onClick={() => setIsChatOpen(false)}
                     className="text-slate-400 hover:text-white transition-colors text-sm px-2 py-1 rounded hover:bg-slate-700"
                   >
                     <i className="fa-solid fa-xmark mr-1"></i> Close
                   </button>
               </div>
               
               <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-700 text-slate-200 rounded-tl-none'}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isChatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-slate-700 text-slate-200 p-2 rounded-lg rounded-tl-none text-xs flex gap-1 items-center">
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-100"></span>
                        <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-200"></span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef}></div>
               </div>
               
               <div className="p-4 border-t border-slate-700 bg-slate-900/20">
                 <div className="relative">
                   <input 
                     type="text" 
                     value={chatInput} 
                     onChange={(e) => setChatInput(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                     placeholder="Ask me..." 
                     className="w-full bg-slate-900 border border-slate-600 text-white rounded-xl pl-4 pr-10 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                   />
                   <button 
                     onClick={handleSendMessage}
                     disabled={!chatInput.trim()}
                     className="absolute right-2 top-2 bottom-2 px-2 text-indigo-400 hover:text-white disabled:opacity-50"
                   >
                     <i className="fa-solid fa-paper-plane"></i>
                   </button>
                 </div>
               </div>
             </div>
        )}
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-8 h-full">
        
        {/* Mobile Header Toggle */}
        <div className="md:hidden flex items-center justify-between mb-6">
           <button 
             onClick={() => setIsMobileSidebarOpen(true)}
             className="text-white p-2 bg-slate-800 rounded-lg border border-slate-700 shadow-sm"
           >
             <i className="fa-solid fa-bars text-xl"></i>
           </button>
           <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <i className="fa-solid fa-file-invoice-dollar text-indigo-400"></i> InvoiceBox
           </h1>
           <div className="flex gap-2 items-center">
                {settings.bellEnabled && getDaysUntilDeadline(settings.deadlineDay) <= 7 && (
                  <motion.div 
                    animate={getDaysUntilDeadline(settings.deadlineDay) <= 2 ? { opacity: [1, 0, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1 }}
                    className="bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg"
                  >
                    {getDaysUntilDeadline(settings.deadlineDay)}d left
                  </motion.div>
                )}
                <button 
                    onClick={() => setIsHistoryOpen(true)}
                    className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-indigo-400 transition-colors shadow-sm"
                >
                    <i className="fa-solid fa-clock-rotate-left"></i>
                </button>
           </div>
        </div>

        {/* Dynamic Greeting & Fun Fact Banner */}
        <div className="bg-gradient-to-r from-slate-800 to-indigo-900/50 rounded-2xl p-6 mb-8 border border-slate-700 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <span>{greeting.icon}</span>
              {greeting.text}
            </h2>
            <p className="text-slate-300 mt-1 flex items-center gap-2">
              <i className="fa-solid fa-lightbulb text-yellow-400"></i>
              <span className="italic">{funFact}</span>
            </p>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-xs text-slate-400 uppercase tracking-wider font-bold">Total Tracked</div>
            <div className="text-2xl font-bold text-white">{stats.total.toLocaleString()} HUF</div>
          </div>
        </div>

        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full">
            <h2 className="text-2xl font-bold text-white whitespace-nowrap">
              {activeTab === 'table' ? 'Document Manager' : activeTab === 'dashboard' ? 'Spending Insights' : activeTab === 'vendors' ? 'Vendor Hub' : 'Data Export'}
            </h2>
          </div>
          {/* Desktop History Button */}
          <div className="hidden md:flex items-center gap-4">
              {settings.bellEnabled && getDaysUntilDeadline(settings.deadlineDay) <= 7 && (
                <motion.div 
                  animate={getDaysUntilDeadline(settings.deadlineDay) <= 2 ? { opacity: [1, 0, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 1 }}
                  className="bg-red-500 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg border border-red-400 flex items-center gap-2"
                >
                  <i className="fa-solid fa-triangle-exclamation"></i>
                  <span>{getDaysUntilDeadline(settings.deadlineDay)} days until deadline</span>
                </motion.div>
              )}
              <button 
                onClick={() => setIsHistoryOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all shadow-sm group"
              >
                  <i className="fa-solid fa-clock-rotate-left text-indigo-400 group-hover:rotate-[-45deg] transition-transform"></i>
                  <span className="font-semibold text-sm">History</span>
                  {history.length > 0 && (
                      <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                          {history.length}
                      </span>
                  )}
              </button>
          </div>
        </header>

        {activeTab === 'vendors' && (
            <div className="space-y-6">
                {!selectedVendorDetail ? (
                    <>
                    {/* Vendor Search Bar */}
                    <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col md:flex-row gap-4 items-center">
                         <div className="relative w-full">
                           <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                           <input 
                             type="text" 
                             placeholder="Search vendors..." 
                             className="w-full pl-10 pr-4 py-3 border border-slate-600 bg-slate-900 text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                             value={vendorSearchTerm} 
                             onChange={(e) => setVendorSearchTerm(e.target.value)} 
                           />
                         </div>
                    </div>

                    {/* Vendor List View */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredVendorStats.map((vendor, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => setSelectedVendorDetail(vendor.name)}
                                className="bg-slate-800 p-6 rounded-2xl border border-slate-700 hover:border-indigo-500 hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between min-h-[160px]"
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-3 bg-slate-700 rounded-lg group-hover:bg-indigo-900/30 group-hover:text-indigo-400 transition-colors">
                                        <i className={`${getVendorIcon(vendor.name, settings.dynamicVendorIcons)} text-xl`}></i>
                                    </div>
                                    <span className="bg-slate-700 text-xs px-2 py-1 rounded text-slate-300">{vendor.category}</span>
                                </div>
                                
                                <div>
                                    <h3 className="text-lg font-bold text-white mb-1 truncate">{vendor.name}</h3>
                                    <div className="flex justify-between items-end mt-2">
                                        <div>
                                            <p className="text-xs text-slate-400 uppercase font-bold">Total Spend</p>
                                            <p className="text-2xl font-bold text-white">{vendor.total.toLocaleString()} <span className="text-sm font-normal text-slate-500">HUF</span></p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-slate-400 mb-0.5">{vendor.count} invoices</p>
                                            <p className="text-[10px] text-slate-500">Last: {vendor.lastDate}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {filteredVendorStats.length === 0 && (
                            <div className="col-span-full py-12 text-center text-slate-500">
                                <i className="fa-regular fa-folder-open text-4xl mb-3 opacity-50"></i>
                                <p>No vendors found matching "{vendorSearchTerm}"</p>
                            </div>
                        )}
                    </div>
                    </>
                ) : (
                    /* Vendor Detail View */
                    <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden animate-in slide-in-from-right-4 fade-in duration-300">
                        <div className="p-6 border-b border-slate-700 bg-slate-700/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
                             <div className="flex items-center gap-4">
                                 <button onClick={() => setSelectedVendorDetail(null)} className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors">
                                     <i className="fa-solid fa-arrow-left"></i>
                                 </button>
                                 <div>
                                     <h3 className="text-2xl font-bold text-white">{selectedVendorDetail}</h3>
                                     <p className="text-slate-400 text-sm">Detailed transaction history</p>
                                 </div>
                             </div>
                             
                             <div className="flex gap-4 md:gap-8">
                                 <div>
                                     <p className="text-xs text-slate-400 uppercase font-bold">Total Volume</p>
                                     <p className="text-xl font-bold text-indigo-400">
                                        {vendorStats.find(v => v.name === selectedVendorDetail)?.total.toLocaleString()} HUF
                                     </p>
                                 </div>
                                 <div>
                                     <p className="text-xs text-slate-400 uppercase font-bold">Documents</p>
                                     <p className="text-xl font-bold text-white">
                                        {vendorStats.find(v => v.name === selectedVendorDetail)?.count}
                                     </p>
                                 </div>
                             </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-700/50 border-b border-slate-700">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold text-slate-300">Date</th>
                                        <th className="px-6 py-4 font-semibold text-slate-300">Invoice #</th>
                                        <th className="px-6 py-4 font-semibold text-slate-300">Category</th>
                                        <th className="px-6 py-4 font-semibold text-slate-300">Amount</th>
                                        <th className="px-6 py-4 font-semibold text-slate-300">Status</th>
                                        <th className="px-6 py-4 font-semibold text-slate-300">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700">
                                    {invoices.filter(i => i.vendor === selectedVendorDetail).sort((a,b) => b.date.localeCompare(a.date)).map(inv => (
                                        <tr key={inv.id} className="hover:bg-slate-700/30 transition-colors">
                                            <td className="px-6 py-4 text-slate-300">{inv.date}</td>
                                            <td className="px-6 py-4 text-white font-mono text-sm">{inv.invoiceNumber}</td>
                                            <td className="px-6 py-4 text-slate-300">{inv.category}</td>
                                            <td className="px-6 py-4 font-bold text-white">{inv.amount.toLocaleString()} <span className="text-xs font-normal text-slate-500">{inv.currency}</span></td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit tracking-wider ${getStatusBadgeClass(inv.status)}`}>
                                                    {inv.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button onClick={() => setSelectedInvoice(inv)} className="text-indigo-400 hover:text-white p-2 transition-colors">
                                                    <i className="fa-solid fa-eye"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        )}

        {activeTab === 'table' && (
          <div className="space-y-4">
            {/* Filter Controls */}
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col md:flex-row gap-4 items-center justify-between">
              
              {/* Left Group: Pencil + Search */}
              <div className="flex items-center gap-3 w-full md:flex-1">
                 {/* Edit Toggle - Icon Only */}
                 <button 
                  onClick={() => setIsTableEditMode(!isTableEditMode)}
                  className={`w-10 h-10 shrink-0 rounded-lg flex items-center justify-center transition-all border ${isTableEditMode ? 'bg-amber-600 border-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.5)]' : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`}
                  title={isTableEditMode ? "Exit Edit Mode" : "Enter Edit Mode"}
                 >
                   <i className="fa-solid fa-pen"></i>
                 </button>

                 <div className="relative w-full md:max-w-sm">
                   <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                   <input 
                     type="text" 
                     placeholder="Search vendor, category..." 
                     className="w-full pl-10 pr-4 py-2 border border-slate-600 bg-slate-900 text-white rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                     value={searchTerm} 
                     onChange={(e) => setSearchTerm(e.target.value)} 
                   />
                 </div>
              </div>

              {/* Right Group: Filters */}
              <div className="flex gap-2 w-full md:w-auto overflow-x-auto items-center">
                <select 
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as InvoiceStatus | 'All')}
                  className="bg-slate-900 border border-slate-600 text-white px-3 py-2 rounded-lg outline-none cursor-pointer"
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Paid">Paid</option>
                  <option value="Processing">Processing</option>
                  <option value="Overdue">Overdue</option>
                  <option value="Error">Error</option>
                </select>

                <div className="flex items-center gap-2 bg-slate-900 border border-slate-600 rounded-lg px-2">
                  <input 
                    type="date" 
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="bg-transparent text-white px-1 py-2 outline-none w-32"
                    placeholder="From"
                  />
                  <span className="text-slate-500">-</span>
                  <input 
                    type="date" 
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="bg-transparent text-white px-1 py-2 outline-none w-32"
                    placeholder="To"
                  />
                </div>
              </div>
            </div>

            {/* Batch Edit Section */}
            <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              <button 
                onClick={() => setIsBatchEditOpen(!isBatchEditOpen)}
                className="w-full px-6 py-4 flex items-center gap-3 hover:bg-slate-700/50 transition-colors text-white font-bold"
              >
                <motion.i 
                  animate={{ rotate: isBatchEditOpen ? 90 : 0 }}
                  className="fa-solid fa-caret-right text-indigo-400"
                ></motion.i>
                <span>Batch Edit</span>
                {selectedIds.size > 0 && (
                  <span className="bg-indigo-600 px-2 py-0.5 rounded-full text-[10px] ml-2">
                    {selectedIds.size} selected
                  </span>
                )}
              </button>

              <AnimatePresence>
                {isBatchEditOpen && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-slate-700"
                  >
                    <div className="p-6 space-y-6">
                      {selectedIds.size === 0 ? (
                        <p className="text-slate-500 text-sm italic">Select documents from the table below to perform bulk actions.</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="space-y-2">
                              <label className="text-xs text-slate-400 font-bold uppercase">Update Status</label>
                              <select 
                                onChange={(e) => {
                                  if(e.target.value) handleBulkUpdate('status', e.target.value);
                                  e.target.value = '';
                                }}
                                className="w-full bg-slate-900 border border-slate-600 text-white text-sm px-4 py-3 rounded-xl outline-none cursor-pointer hover:bg-slate-700 transition-colors"
                              >
                                <option value="">Choose Status...</option>
                                <option value="Pending">Pending</option>
                                <option value="Paid">Paid</option>
                                <option value="Processing">Processing</option>
                                <option value="Overdue">Overdue</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs text-slate-400 font-bold uppercase">Update Document Type</label>
                              <select 
                                onChange={(e) => {
                                  if(e.target.value) handleBulkUpdate('docType', e.target.value);
                                  e.target.value = '';
                                }}
                                className="w-full bg-slate-900 border border-slate-600 text-white text-sm px-4 py-3 rounded-xl outline-none cursor-pointer hover:bg-slate-700 transition-colors"
                              >
                                <option value="">Choose Type...</option>
                                <option value="Invoice">Invoice</option>
                                <option value="Receipt">Receipt</option>
                                <option value="Credit Note">Credit Note</option>
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-xs text-slate-400 font-bold uppercase">Sharing & Export</label>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => handleExport('files', 'custom')} // This uses current filters, but we could refine it for selectedIds
                                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2"
                                >
                                  <i className="fa-solid fa-download"></i> Download Selected
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end">
                             <button onClick={() => setSelectedIds(new Set())} className="text-sm text-slate-400 hover:text-white underline">Clear Selection</button>
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="bg-slate-800 rounded-2xl shadow-sm border border-slate-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-700/50 border-b border-slate-700">
                    <tr>
                      <th className="px-6 py-4 w-4">
                        <input 
                          type="checkbox" 
                          checked={selectedIds.size === filteredInvoices.length && filteredInvoices.length > 0}
                          onChange={() => toggleAllSelection(filteredInvoices)}
                          className="w-4 h-4 rounded border-slate-500 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                      {[
                        { key: 'vendor', label: 'Entity' },
                        { key: 'date', label: 'Date' },
                        { key: 'category', label: 'Category' },
                        { key: 'amount', label: 'Amount' },
                        { key: 'comment', label: 'Comment' },
                        { key: 'status', label: 'Status' },
                      ].map((col) => (
                        <th 
                          key={col.key}
                          className="px-6 py-4 font-semibold text-slate-300 cursor-pointer hover:text-white transition-colors select-none"
                          onClick={() => handleSort(col.key as keyof InvoiceData)}
                        >
                          <div className="flex items-center gap-2">
                            {col.label}
                            {sortConfig?.key === col.key && (
                              <i className={`fa-solid fa-arrow-${sortConfig.direction === 'ascending' ? 'up' : 'down'}-long text-xs text-indigo-400`}></i>
                            )}
                            {sortConfig?.key !== col.key && (
                              <i className="fa-solid fa-sort text-xs text-slate-600"></i>
                            )}
                          </div>
                        </th>
                      ))}
                      <th className="px-6 py-4 font-semibold text-slate-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {filteredInvoices.map(invoice => (
                      <tr key={invoice.id} className={`hover:bg-slate-700/30 transition-colors ${selectedIds.has(invoice.id) ? 'bg-indigo-900/10' : ''}`}>
                         <td className="px-6 py-4">
                           <input 
                              type="checkbox" 
                              checked={selectedIds.has(invoice.id)}
                              onChange={() => toggleSelection(invoice.id)}
                              className="w-4 h-4 rounded border-slate-500 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                           />
                         </td>
                        
                        {/* Vendor Cell */}
                        <td className="px-6 py-4">
                          {isTableEditMode ? (
                             <input 
                              type="text" 
                              value={invoice.vendor} 
                              onChange={(e) => handleInlineUpdate(invoice.id, 'vendor', e.target.value)}
                              className="bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 w-full text-sm"
                             />
                          ) : (
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-indigo-400 shrink-0">
                                <i className={getVendorIcon(invoice.vendor, settings.dynamicVendorIcons)}></i>
                              </div>
                              <div>
                                <div className="font-medium text-white">{invoice.vendor}</div>
                                <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{invoice.fileName}</div>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Date Cell */}
                        <td className="px-6 py-4 text-slate-400">
                           {isTableEditMode ? (
                             <input 
                              type="date" 
                              value={invoice.date} 
                              onChange={(e) => handleInlineUpdate(invoice.id, 'date', e.target.value)}
                              className="bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 w-32 text-sm"
                             />
                          ) : invoice.date}
                        </td>

                        {/* Category Cell */}
                        <td className="px-6 py-4 text-slate-400">
                           {isTableEditMode ? (
                             <select 
                              value={invoice.category} 
                              onChange={(e) => handleInlineUpdate(invoice.id, 'category', e.target.value)}
                              className="bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 text-sm"
                             >
                               {Object.values(Category).map(c => <option key={c} value={c}>{c}</option>)}
                             </select>
                          ) : invoice.category}
                        </td>

                        {/* Amount Cell */}
                        <td className="px-6 py-4 font-bold text-white whitespace-nowrap">
                           {isTableEditMode ? (
                             <div className="flex items-center gap-1">
                               <input 
                                type="number" 
                                value={invoice.amount} 
                                onChange={(e) => handleInlineUpdate(invoice.id, 'amount', parseFloat(e.target.value))}
                                className="bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 w-24 text-sm"
                               />
                               <span className="text-xs">{invoice.currency}</span>
                             </div>
                          ) : `${invoice.amount.toLocaleString()} ${invoice.currency}`}
                        </td>
                         
                        {/* Comment Cell - Read Only in Table for brevity, or editable text */}
                         <td className="px-6 py-4">
                          <div className="text-sm text-slate-500 italic max-w-xs truncate">{invoice.comment || '-'}</div>
                        </td>

                        {/* Status Cell */}
                        <td className="px-6 py-4">
                           {isTableEditMode ? (
                             <select 
                              value={invoice.status} 
                              onChange={(e) => handleInlineUpdate(invoice.id, 'status', e.target.value)}
                              className="bg-slate-900 border border-slate-600 text-white rounded px-2 py-1 text-xs uppercase font-bold"
                             >
                                <option value="Pending">Pending</option>
                                <option value="Paid">Paid</option>
                                <option value="Processing">Processing</option>
                                <option value="Overdue">Overdue</option>
                                <option value="Error">Error</option>
                             </select>
                           ) : (
                             <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase w-fit tracking-wider ${getStatusBadgeClass(invoice.status)}`}>
                                {invoice.status}
                              </span>
                           )}
                        </td>
                        <td className="px-6 py-4 space-x-1 whitespace-nowrap">
                          <button onClick={() => setSelectedInvoice(invoice)} className="text-indigo-400 hover:bg-indigo-900/30 p-2 rounded-lg" title="View"><i className="fa-solid fa-eye"></i></button>
                          <button onClick={() => deleteInvoice(invoice.id)} className="text-slate-500 hover:text-red-500 p-2 rounded-lg" title="Delete"><i className="fa-solid fa-trash-can"></i></button>
                        </td>
                      </tr>
                    ))}
                    {filteredInvoices.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-20 text-center text-gray-400">
                          <i className="fa-solid fa-magnifying-glass text-4xl mb-4 opacity-20 block"></i>
                          No results found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Main Stats Row */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div 
                onClick={() => setShowVendorStats(!showVendorStats)}
                className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg transform hover:scale-[1.02] transition-transform cursor-pointer relative overflow-hidden group"
              >
                <div className="absolute -right-4 -top-4 text-indigo-500/30 group-hover:text-indigo-500/40 transition-colors">
                  <i className="fa-solid fa-wallet text-9xl"></i>
                </div>
                <div className="relative z-10">
                  <p className="text-indigo-100 text-sm mb-1 font-medium">Cumulative Spend</p>
                  <p className="text-4xl font-bold mb-2">{stats.total.toLocaleString()} HUF</p>
                  <p className="text-xs text-indigo-200 flex items-center gap-1">
                    <i className={`fa-solid ${showVendorStats ? 'fa-chart-pie' : 'fa-list-ol'}`}></i>
                    {showVendorStats ? 'Switch to Category View' : 'Switch to Vendor View'}
                  </p>
                </div>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-sm flex flex-col justify-center">
                <p className="text-slate-400 text-sm mb-1 font-medium">Documents Processed</p>
                <p className="text-3xl font-bold text-white">{invoices.length}</p>
              </div>
              <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-sm flex flex-col justify-center">
                <p className="text-slate-400 text-sm mb-1 font-medium">Average per Entry</p>
                <p className="text-3xl font-bold text-white">{invoices.length > 0 ? (stats.total / invoices.length).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0} HUF</p>
              </div>
            </div>

            {/* Clean 2D Donut Chart */}
            <div className="bg-slate-800 p-8 rounded-2xl shadow-lg border border-slate-700">
               <h3 className="text-xl font-bold text-white mb-6 text-center">
                 {showVendorStats ? 'Spending by Vendor' : 'Spending by Category'}
               </h3>
               
               <div className="w-full h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={showVendorStats ? stats.vendorData : stats.pieData} 
                        cx="50%" 
                        cy="50%" 
                        dataKey="value" 
                        innerRadius={80}
                        outerRadius={120}
                        paddingAngle={5}
                        label={renderCustomizedLabel}
                        labelLine={true}
                        stroke="none"
                      >
                        {(showVendorStats ? stats.vendorData : stats.pieData).map((entry, index) => {
                            // Subtle pop effect for top items
                            const isTop = index < 3;
                            return (
                              <Cell 
                                key={`cell-${index}`} 
                                fill={COLORS[index % COLORS.length]} 
                                className={`transition-all duration-300 hover:opacity-80 outline-none`}
                                style={{ 
                                  filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.3))',
                                }}
                              />
                            );
                        })}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', background: '#1e293b', color: '#f1f5f9' }}
                        itemStyle={{ color: '#f1f5f9' }}
                        formatter={(val: number, name: string) => [`${val.toLocaleString()} HUF`, name]} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
               </div>
               <p className="text-center text-slate-500 text-sm mt-4 italic">
                 {showVendorStats ? "Top vendors are shown" : "Major categories are shown"}
               </p>
            </div>
            
            {/* Trend Chart */}
            <div className="bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-700">
                <h3 className="text-lg font-semibold mb-6 text-white">Monthly Expense Trend</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke='#334155' />
                      <XAxis dataKey="name" stroke='#64748b' />
                      <YAxis stroke='#64748b' />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', background: '#1e293b', color: '#f1f5f9' }}
                        itemStyle={{ color: '#f1f5f9' }}
                        formatter={(val: number, name: string) => [`${val.toLocaleString()} HUF`, name]} 
                      />
                      <Bar dataKey="amount" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
            </div>
          </div>
        )}

        {activeTab === 'export' && (
          <div className="bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-700 max-w-2xl mx-auto">
            <h3 className="text-2xl font-bold mb-6 text-white flex items-center gap-3">
              <i className="fa-solid fa-file-export text-indigo-400"></i>
              Export Data
            </h3>
            
            <div className="space-y-6">
              {/* Section 1: Quick Export (Current Period) */}
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-700">
                <h4 className="font-bold text-white text-lg mb-4">Current Period</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-400 uppercase font-bold mb-2">This Month</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleExport('csv', 'current-month')} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-colors">CSV</button>
                      <button onClick={() => handleExport('files', 'current-month')} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm transition-colors">Files</button>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                    <p className="text-xs text-slate-400 uppercase font-bold mb-2">This Year</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleExport('csv', 'current-year')} className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm transition-colors">CSV</button>
                      <button onClick={() => handleExport('files', 'current-year')} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm transition-colors">Files</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Custom Range */}
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-700">
                <h4 className="font-bold text-white text-lg mb-4">Custom Range</h4>
                <div className="flex flex-col md:flex-row gap-4 mb-4">
                  <div className="flex-1">
                    <label className="text-xs text-slate-400 block mb-1">From</label>
                    <input 
                      type="date" 
                      value={exportStart} 
                      onChange={(e) => setExportStart(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-400 block mb-1">To</label>
                    <input 
                      type="date" 
                      value={exportEnd} 
                      onChange={(e) => setExportEnd(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-600 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleExport('csv', 'custom')} className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors">Export CSV</button>
                  <button onClick={() => handleExport('files', 'custom')} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors">Export Files</button>
                </div>
              </div>

              {/* Section 3: Bulk Dump (Grouped) */}
              <div className="bg-slate-900 p-6 rounded-xl border border-slate-700">
                 <h4 className="font-bold text-white text-lg mb-4">All Data (Grouped)</h4>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                   <button onClick={() => handleExport('files', 'all', 'week')} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-lg text-sm transition-colors text-left">
                      <div className="font-bold">By Week</div>
                      <div className="text-xs text-slate-500">ZIP archive</div>
                   </button>
                   <button onClick={() => handleExport('files', 'all', 'month')} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-lg text-sm transition-colors text-left">
                      <div className="font-bold">By Month</div>
                      <div className="text-xs text-slate-500">ZIP archive</div>
                   </button>
                   <button onClick={() => handleExport('files', 'all', 'year')} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-lg text-sm transition-colors text-left">
                      <div className="font-bold">By Year</div>
                      <div className="text-xs text-slate-500">ZIP archive</div>
                   </button>
                 </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-xl">
              <h3 className="text-2xl font-bold text-white mb-8 flex items-center gap-3">
                <i className="fa-solid fa-gear text-indigo-400"></i>
                Application Settings
              </h3>

              <div className="space-y-8">
                {/* Appearance Section */}
                <section className="space-y-6">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-2">Appearance</h4>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold">Dark Mode</p>
                      <p className="text-slate-400 text-sm">Switch between light and dark themes</p>
                    </div>
                    <DarkModeSwitch 
                      active={settings.darkMode} 
                      onChange={() => setSettings(s => ({ ...s, darkMode: !s.darkMode }))} 
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold">Auto Dark Mode</p>
                      <p className="text-slate-400 text-sm">Switch based on time (18:00 - 06:00)</p>
                    </div>
                    <AutoDarkSwitch 
                      active={settings.autoDarkMode} 
                      onChange={() => setSettings(s => ({ ...s, autoDarkMode: !s.autoDarkMode }))} 
                    />
                  </div>
                </section>

                {/* Notifications Section */}
                <section className="space-y-6">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-2">Notifications</h4>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold">Deadline Reminder</p>
                      <p className="text-slate-400 text-sm">Show alert when deadline is approaching</p>
                    </div>
                    <BellSwitch 
                      active={settings.bellEnabled} 
                      onChange={() => setSettings(s => ({ ...s, bellEnabled: !s.bellEnabled }))} 
                    />
                  </div>

                  {settings.bellEnabled && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 space-y-4"
                    >
                      <div className="flex justify-between items-center">
                        <label className="text-slate-300 text-sm">Monthly Deadline Day</label>
                        <div className="flex items-center gap-3">
                          <input 
                            type="range" 
                            min="1" 
                            max="28" 
                            value={settings.deadlineDay}
                            onChange={(e) => setSettings(s => ({ ...s, deadlineDay: parseInt(e.target.value) }))}
                            className="w-32 accent-indigo-500"
                          />
                          <span className="bg-slate-800 px-3 py-1 rounded-lg text-white font-bold min-w-[40px] text-center">
                            {settings.deadlineDay}
                          </span>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500 italic">Reminder appears 7 days before. Blinks in the last 2 days.</p>
                    </motion.div>
                  )}
                </section>

                {/* Data Section */}
                <section className="space-y-6">
                  <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-2">Data & Display</h4>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-semibold">Dynamic Vendor Icons</p>
                      <p className="text-slate-400 text-sm">Show icons based on vendor type</p>
                    </div>
                    <VendorIconSwitch 
                      active={settings.dynamicVendorIcons} 
                      onChange={() => setSettings(s => ({ ...s, dynamicVendorIcons: !s.dynamicVendorIcons }))} 
                    />
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-hidden">
          <div className="bg-slate-800 w-full max-w-5xl h-full max-h-[95vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl animate-in fade-in zoom-in duration-200 relative">
            
            {/* Close Button - Absolutely positioned to top right corner */}
            <button 
                onClick={() => setSelectedInvoice(null)} 
                className="absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center bg-slate-900/50 hover:bg-red-500/80 text-white rounded-full transition-all backdrop-blur-md shadow-lg"
                title="Close Modal"
            >
                <i className="fa-solid fa-xmark text-xl"></i>
            </button>

            <div className="p-6 border-b border-slate-700 flex items-center justify-between bg-slate-700/50 pr-16">
              <div className="flex-1 mr-4 space-y-3">
                <div>
                  <label className="text-xs text-slate-400 font-bold uppercase block mb-1">Vendor / Entity</label>
                  <input
                    list="vendors-list"
                    type="text"
                    value={selectedInvoice.vendor}
                    onChange={(e) => updateInvoiceField('vendor', e.target.value)}
                    className="bg-transparent text-xl md:text-2xl font-bold text-white w-full outline-none border-b border-transparent focus:border-indigo-500 placeholder-slate-600 transition-colors"
                    placeholder="Enter vendor name..."
                  />
                  <datalist id="vendors-list">
                    {uniqueVendors.map(v => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                </div>
                
                <div className="flex gap-4">
                    <div className="flex-1">
                        <label className="text-xs text-slate-500 font-bold uppercase block mb-1">Invoice #</label>
                        <input
                            type="text"
                            value={selectedInvoice.invoiceNumber}
                            onChange={(e) => updateInvoiceField('invoiceNumber', e.target.value)}
                            className="bg-transparent text-lg font-bold text-white w-full outline-none border-b border-transparent focus:border-indigo-500 placeholder-slate-600 transition-colors"
                            placeholder="Invoice ID..."
                        />
                    </div>
                    <div className="w-40">
                        <label className="text-xs text-slate-500 font-bold uppercase block mb-1">Date</label>
                        <input
                            type="date"
                            value={selectedInvoice.date}
                            onChange={(e) => updateInvoiceField('date', e.target.value)}
                            className="bg-slate-900/50 text-sm text-slate-200 w-full px-3 py-2 rounded-lg border border-slate-600 focus:border-indigo-500 outline-none"
                        />
                    </div>
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
              {/* File Viewer */}
              <div 
                  className="h-[40vh] md:h-auto md:flex-1 bg-slate-900 relative overflow-hidden flex items-center justify-center select-none border-b md:border-b-0 md:border-r border-slate-700"
                  onWheel={selectedInvoice.mimeType?.startsWith('image/') ? handlePreviewWheel : undefined}
                  onMouseDown={selectedInvoice.mimeType?.startsWith('image/') ? handlePreviewMouseDown : undefined}
                  onMouseMove={selectedInvoice.mimeType?.startsWith('image/') ? handlePreviewMouseMove : undefined}
                  onMouseUp={selectedInvoice.mimeType?.startsWith('image/') ? handlePreviewMouseUp : undefined}
                  onMouseLeave={selectedInvoice.mimeType?.startsWith('image/') ? handlePreviewMouseUp : undefined}
              >
                
                {/* Zoom Controls Overlay */}
                {(selectedInvoice.mimeType === 'application/pdf' || selectedInvoice.mimeType?.startsWith('image/')) && !imageError && (
                   <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-600 backdrop-blur-sm">
                       <button onClick={() => handleZoom(0.5)} className="p-2 hover:bg-slate-700 rounded text-white" title="Zoom In"><i className="fa-solid fa-plus"></i></button>
                       <button onClick={() => handleZoom(-0.5)} className="p-2 hover:bg-slate-700 rounded text-white" title="Zoom Out"><i className="fa-solid fa-minus"></i></button>
                       <button onClick={() => { setZoomLevel(1); setPan({x:0, y:0}); }} className="p-2 hover:bg-slate-700 rounded text-white text-xs font-bold" title="Reset Zoom">1x</button>
                   </div>
                )}

                <div 
                  className="w-full h-full flex items-center justify-center transition-transform duration-75 origin-center"
                  style={{ 
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
                    cursor: isPanning ? 'grabbing' : (selectedInvoice.mimeType?.startsWith('image/') ? 'grab' : 'auto')
                  }}
                >
                    {selectedInvoice.fileData ? (
                    selectedInvoice.mimeType === 'application/pdf' ? (
                        pdfPreviewUrl ? (
                        <object 
                            data={pdfPreviewUrl} 
                            type="application/pdf"
                            className="w-full h-full rounded-lg shadow-inner bg-white"
                        >
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center bg-slate-900 border border-slate-700 rounded-lg">
                            <i className="fa-regular fa-file-pdf text-4xl mb-3"></i>
                            <p className="mb-4">Unable to display PDF inline.</p>
                            <a 
                                href={pdfPreviewUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                                <i className="fa-solid fa-arrow-up-right-from-square mr-2"></i>Open in New Tab
                            </a>
                            </div>
                        </object>
                        ) : (
                        <div className="text-slate-400">Loading PDF...</div>
                        )
                    ) : selectedInvoice.mimeType?.startsWith('image/') ? (
                        imageError ? (
                            <div className="text-slate-400 flex flex-col items-center">
                                <i className="fa-solid fa-triangle-exclamation text-5xl mb-3 text-amber-500"></i>
                                <p>Failed to load image preview.</p>
                            </div>
                        ) : (
                            <img 
                                src={selectedInvoice.fileData} 
                                alt="Document Preview" 
                                className="max-w-full max-h-full shadow-2xl rounded-lg border border-slate-700 object-contain pointer-events-none"
                                onError={() => setImageError(true)} 
                            />
                        )
                    ) : (
                        <div className="text-slate-400 flex flex-col items-center p-8 text-center" style={{ transform: 'scale(1)' }}>
                            <i className="fa-solid fa-file-circle-question text-6xl mb-4 text-indigo-400"></i>
                            <h3 className="text-xl font-semibold text-white mb-2">Preview Not Available</h3>
                            <p className="mb-6 max-w-xs text-sm">The file type <span className="font-mono text-indigo-300 bg-slate-800 px-1 rounded">{selectedInvoice.mimeType || 'unknown'}</span> cannot be previewed directly.</p>
                            <a 
                                href={selectedInvoice.fileData} 
                                download={`document_${selectedInvoice.id}.${selectedInvoice.mimeType?.split('/')[1] || 'bin'}`}
                                className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                                <i className="fa-solid fa-download"></i> Download File
                            </a>
                        </div>
                    )
                    ) : (
                    <div className="text-slate-600 flex flex-col items-center">
                        <i className="fa-solid fa-file-circle-exclamation text-7xl mb-4 opacity-50"></i>
                        <p className="text-lg font-medium">No document preview stored</p>
                    </div>
                    )}
                </div>
              </div>
              
              {/* Sidebar Settings */}
              <div className="flex-1 md:flex-none w-full md:w-96 p-6 md:p-8 bg-slate-800 border-l border-slate-700 flex flex-col gap-6 md:gap-8 overflow-y-auto">
                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Document Status</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-400 font-medium">Status</label>
                      <select 
                        value={selectedInvoice.status}
                        onChange={(e) => updateInvoiceField('status', e.target.value as InvoiceStatus)}
                        className="text-sm font-bold p-2 rounded-lg border border-slate-600 bg-slate-700 text-white focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Paid">Paid</option>
                        <option value="Processing">Processing</option>
                        <option value="Overdue">Overdue</option>
                        <option value="Error">Error</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-400 font-medium">Type</label>
                      <select 
                        value={selectedInvoice.docType}
                        onChange={(e) => updateInvoiceField('docType', e.target.value as DocumentType)}
                        className="text-sm p-2 rounded-lg border border-slate-600 bg-slate-700 text-white outline-none"
                      >
                        <option value="Invoice">Invoice</option>
                        <option value="Receipt">Receipt</option>
                        <option value="Credit Note">Credit Note</option>
                        <option value="Proforma">Proforma</option>
                        {customDocTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        <option value="Other">Other (Add New)</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Custom Document Type Input */}
                  {selectedInvoice.docType === 'Other' && (
                       <div className="animate-in fade-in slide-in-from-top-2">
                           <label className="text-xs text-indigo-300 font-bold mb-1 block">Specify Type:</label>
                           <input 
                             type="text" 
                             value={tempCustomType}
                             onChange={(e) => setTempCustomType(e.target.value)}
                             className="w-full bg-slate-900 border border-indigo-500 rounded px-3 py-2 text-white outline-none focus:ring-1 focus:ring-indigo-400"
                             placeholder="e.g. Warranty, Contract..."
                           />
                       </div>
                  )}

                </section>

                <section className="space-y-4">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">General Info</h4>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-400 font-medium">Category</label>
                      <select 
                        value={selectedInvoice.category}
                        onChange={(e) => updateInvoiceField('category', e.target.value)}
                        className="text-sm p-2 rounded-lg border border-slate-600 bg-slate-700 text-white outline-none"
                      >
                        {Object.values(Category).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs text-slate-400 font-medium">Amount</label>
                      <div className="flex items-center gap-2">
                        <input 
                          type="number"
                          value={selectedInvoice.amount}
                          onChange={(e) => updateInvoiceField('amount', parseFloat(e.target.value))}
                          className="flex-1 text-sm p-2 rounded-lg border border-slate-600 bg-slate-700 text-white outline-none font-bold"
                        />
                        <span className="text-sm font-bold text-slate-500">{selectedInvoice.currency}</span>
                      </div>
                    </div>
                  </div>
                </section>
                
                <section className="flex-1 flex flex-col min-h-[200px]">
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Notes & Comments</h4>
                  <textarea 
                    className="flex-1 w-full p-4 border border-slate-600 bg-slate-700 text-white rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none shadow-inner h-32"
                    placeholder="Add specific context for this expense..."
                    value={selectedInvoice.comment || ''}
                    onChange={(e) => updateInvoiceField('comment', e.target.value)}
                  />
                </section>

                <button onClick={handleSave} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-95 text-lg">
                  Confirm Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;