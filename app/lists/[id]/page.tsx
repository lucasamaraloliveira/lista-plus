"use client";

import React, { useEffect, useMemo, useState, useRef, Fragment } from "react";
import { useAuth } from "@/hooks/use-auth";
import { OperationType, handleFirestoreError, db } from "@/lib/firebase";
import { ShoppingItem, ShoppingList, UnitType, SubItem } from "@/lib/types";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, deleteDoc, addDoc, arrayUnion, writeBatch, setDoc, Timestamp, getDocs, orderBy } from "firebase/firestore";
import { ArrowLeft, Check, Copy, Package, Plus, Share2, Trash2, ChevronDown, ChevronRight, Pencil, RotateCcw, X, Eraser, Loader2, Eye, Search, BarChart2, TrendingUp, TrendingDown, Calendar, Calculator } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from '@radix-ui/react-select';
import { motion, AnimatePresence } from "framer-motion";
import { LoadingScreen } from "@/components/loading-screen";



export interface Presence {
  uid: string;
  email: string;
  displayName: string | null;
  lastActive: any;
  activeItemId: string | null;
  status: 'viewing' | 'editing';
}

export default function ListDetail() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, loading } = useAuth();
  
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpandItem = (itemId: string) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };
  
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
      }
      return (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0);
    }).filter(item => 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.subItems && item.subItems.some(si => si.name.toLowerCase().includes(searchQuery.toLowerCase())))
    );
  }, [items, sortBy, searchQuery]);



  const [loadingData, setLoadingData] = useState(true);
  const [collaborators, setCollaborators] = useState<Presence[]>([]);

  // Month transition and History states
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showMonthTransitionBanner, setShowMonthTransitionBanner] = useState(false);
  const [newCalendarMonth, setNewCalendarMonth] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedProductForComparison, setSelectedProductForComparison] = useState<string>("");

  // Form states
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);

  // Sub-item states
  const [isAddSubItemOpen, setIsAddSubItemOpen] = useState(false);
  const [activeParentItemId, setActiveParentItemId] = useState<string | null>(null);
  const [newSubItemName, setNewSubItemName] = useState("");
  const [newSubItemQuantity, setNewSubItemQuantity] = useState(1);
  const [newSubItemPrice, setNewSubItemPrice] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState(1);
  const [newItemUnit, setNewItemUnit] = useState<UnitType>("unidade");
  const [newItemCategory, setNewItemCategory] = useState("Alimentação");
  const [newItemPrice, setNewItemPrice] = useState("");

  const formatCurrency = (value: string | number) => {
    if (value === "") return "";
    const amount = typeof value === 'string' 
      ? parseInt(value.replace(/\D/g, ""), 10) / 100 
      : value;
    
    if (isNaN(amount)) return "";

    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const parseCurrencyToNumber = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (!digits) return 0;
    return parseInt(digits, 10) / 100;
  };

  const syncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Delete states
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ShoppingItem | null>(null);
  const [lastDeletedItem, setLastDeletedItem] = useState<Partial<ShoppingItem> | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [isClearPricesConfirmOpen, setIsClearPricesConfirmOpen] = useState(false);

  // Share states
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Budget states
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [tempBudget, setTempBudget] = useState("");
  const [shouldAddToBudget, setShouldAddToBudget] = useState(false);

  // Calculator states
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [calcDisplay, setCalcDisplay] = useState("");
  const [calcResult, setCalcResult] = useState("");
  const [copiedCalcResult, setCopiedCalcResult] = useState(false);

  const allUniqueProductNames = useMemo(() => {
    const names = new Set<string>();
    items.forEach(item => names.add(item.name));
    historyData.forEach(h => {
      if (h.itemsSnapshot) {
        h.itemsSnapshot.forEach((item: any) => names.add(item.name));
      }
    });
    return Array.from(names).sort();
  }, [items, historyData]);

  const lastUpdateRef = useRef<number>(0);
  // Presence tracking logic
  useEffect(() => {
    if (!user || !id) return;

    const presenceRef = doc(db, "lists", id, "presence", user.uid);
    
    const updatePresence = (itemId: string | null = null, status: 'viewing' | 'editing' = 'viewing') => {
      const now = Date.now();
      const presenceKey = `${itemId}-${status}`;
      
      // Throttle: Only update if status changed OR 30s passed since last update
      if ((window as any).lastPresenceKey === presenceKey && now - lastUpdateRef.current < 30000) {
        return;
      }
      
      (window as any).lastPresenceKey = presenceKey;
      lastUpdateRef.current = now;

      setDoc(presenceRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || "Membro",
        lastActive: serverTimestamp(),
        activeItemId: itemId,
        status: status
      }).catch(err => console.error("Presence error:", err));
    };

    updatePresence(); // Initial status: viewing

    const unsubPresence = onSnapshot(collection(db, "lists", id, "presence"), (snapshot) => {
      const presences: Presence[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as Presence;
        // Keep only other users
        if (data.uid !== user.uid) {
          presences.push(data);
        }
      });
      setCollaborators(presences);
    });

    // We store the update function in a window variable or ref if we want to call it from other places easily
    // But here we'll just expose it via state or use it in specific handlers
    (window as any).updatePresence = updatePresence;

    return () => {
      unsubPresence();
      deleteDoc(presenceRef).catch(() => {});
    };
  }, [user, id]);

  const setSelfActivity = (itemId: string | null, status: 'viewing' | 'editing' = 'viewing') => {
    if ((window as any).updatePresence) {
      (window as any).updatePresence(itemId, status);
    }
  };

  useEffect(() => {
    if (!user || !id) return;

    const unsubList = onSnapshot(doc(db, "lists", id), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setList({ id: doc.id, ...data } as ShoppingList);

        // Check if calendar month is newer than list month
        const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
        if (data && data.month && currentMonthStr > data.month) {
          setNewCalendarMonth(currentMonthStr);
          setShowMonthTransitionBanner(true);
        } else {
          setShowMonthTransitionBanner(false);
        }
      } else {
        router.push("/");
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `lists/${id}`));

    const q = query(collection(db, "lists", id, "items"));
    const unsubItems = onSnapshot(q, (snapshot) => {
      const itemsData: ShoppingItem[] = [];
      snapshot.forEach((doc) => {
        itemsData.push({ id: doc.id, ...doc.data() } as ShoppingItem);
      });
      setItems(itemsData);
      setLoadingData(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `lists/${id}/items`));

    return () => {
      unsubList();
      unsubItems();
    };
  }, [user, id, router]);

  const fetchHistory = async () => {
    if (!id) return;
    setLoadingHistory(true);
    try {
      const q = query(collection(db, "lists", id, "history"), orderBy("month", "desc"));
      const snapshot = await getDocs(q);
      const hist: any[] = [];
      snapshot.forEach(doc => {
        hist.push({ id: doc.id, ...doc.data() });
      });
      setHistoryData(hist);
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleArchiveAndReset = async () => {
    if (!id || !list || !list.month || isTransitioning) return;
    setIsTransitioning(true);
    try {
      const batch = writeBatch(db);
      
      // 1. Reset all items
      items.forEach((item) => {
        const itemRef = doc(db, "lists", id, "items", item.id);
        const updates: any = {
          purchased: false,
          price: 0,
          updatedAt: serverTimestamp()
        };
        if (item.subItems && item.subItems.length > 0) {
          updates.subItems = item.subItems.map(si => ({
            ...si,
            purchased: false,
            price: 0
          }));
        }
        batch.update(itemRef, updates);
      });

      // 2. Save history snapshot
      const historyRef = doc(db, "lists", id, "history", list.month);
      batch.set(historyRef, {
        month: list.month,
        totalValue,
        purchasedValue,
        categoryTotals: list.categoryTotals || {},
        budget: list.budget || 0,
        itemsSnapshot: items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          price: item.price,
          purchased: item.purchased,
          subItems: item.subItems || []
        })),
        archivedAt: serverTimestamp()
      });

      // 3. Update main list document
      const listRef = doc(db, "lists", id);
      batch.update(listRef, {
        month: newCalendarMonth,
        totalValue: 0,
        categoryTotals: {},
        updatedAt: serverTimestamp()
      });

      await batch.commit();
      setShowMonthTransitionBanner(false);
    } catch (error) {
      console.error("Transition error:", error);
      handleFirestoreError(error, OperationType.UPDATE, `lists/${id}`);
    } finally {
      setIsTransitioning(false);
    }
  };

  // Helper to sync list totals only when necessary
  const syncListTotals = async (updatedItems: ShoppingItem[]) => {
    if (!id || !user) return;

    const currentTotal = updatedItems.reduce((acc, item) => {
      const itemTotal = (item.subItems && item.subItems.length > 0)
        ? (item.price || 0)
        : ((item.price || 0) * item.quantity);
      return acc + itemTotal;
    }, 0);
    const catTotals: Record<string, number> = {};
    updatedItems.forEach(item => {
      const itemTotal = (item.subItems && item.subItems.length > 0)
        ? (item.price || 0)
        : ((item.price || 0) * item.quantity);
      if (itemTotal > 0) {
        catTotals[item.category] = (catTotals[item.category] || 0) + itemTotal;
      }
    });
    
    // Round to 2 decimal places to avoid floating point issues triggering unwanted updates
    const roundedTotal = Math.round(currentTotal * 100) / 100;

    try {
      await updateDoc(doc(db, "lists", id), {
        totalValue: roundedTotal,
        categoryTotals: catTotals,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to sync totalValue:", err);
    }
  };

  if (loading || loadingData || !list) return <LoadingScreen />;

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !user) return;

    try {
      const price = parseCurrencyToNumber(newItemPrice);
      if (editingItem) {
        await updateDoc(doc(db, "lists", id, "items", editingItem.id), {
          name: newItemName.trim(),
          quantity: newItemQuantity,
          unit: newItemUnit,
          category: newItemCategory,
          price: price,
          updatedAt: serverTimestamp()
        });
        
        // Sync total
        const updatedItems = items.map(i => i.id === editingItem.id ? { ...i, price, category: newItemCategory } : i);
        syncListTotals(updatedItems);
      } else {
        const newDoc = await addDoc(collection(db, "lists", id, "items"), {
          name: newItemName.trim(),
          quantity: newItemQuantity,
          unit: newItemUnit,
          category: newItemCategory,
          price: price,
          purchased: false,
          authorId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // Sync total
        const newItem = { id: newDoc.id, name: newItemName, quantity: newItemQuantity, unit: newItemUnit, category: newItemCategory, price, purchased: false };
        syncListTotals([...items, newItem as ShoppingItem]);
      }
      handleCloseForm();
    } catch (error) {
      handleFirestoreError(error, editingItem ? OperationType.UPDATE : OperationType.CREATE, `lists/${id}/items`);
    }
  };

  const handleOpenEdit = (item: ShoppingItem) => {
    setEditingItem(item);
    setNewItemName(item.name);
    setNewItemQuantity(item.quantity);
    setNewItemUnit(item.unit);
    setNewItemCategory(item.category);
    setNewItemPrice(item.price ? formatCurrency(item.price) : "");
    setIsAddItemOpen(true);
    setSelfActivity(item.id, 'editing');
  };

  const handleCloseForm = () => {
    setIsAddItemOpen(false);
    setEditingItem(null);
    setNewItemName("");
    setNewItemQuantity(1);
    setNewItemPrice("");
    setSelfActivity(null, 'viewing');
  };

  const handleTogglePurchase = async (item: ShoppingItem) => {
    try {
      const newPurchased = !item.purchased;
      const updates: any = {
        purchased: newPurchased,
        updatedAt: serverTimestamp()
      };

      if (item.subItems && item.subItems.length > 0) {
        updates.subItems = item.subItems.map(si => ({ ...si, purchased: newPurchased }));
      }

      await updateDoc(doc(db, "lists", id, "items", item.id), updates);
      
      // Sync total
      const updatedItems = items.map(i => i.id === item.id ? { ...i, ...updates } : i);
      syncListTotals(updatedItems);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lists/${id}/items/${item.id}`);
    }
  };

  const handleDeleteItem = (item: ShoppingItem) => {
    setItemToDelete(item);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      const itemData = { ...itemToDelete };
      delete (itemData as any).id;
      
      await deleteDoc(doc(db, "lists", id, "items", itemToDelete.id));
      
      // Sync total
      syncListTotals(items.filter(i => i.id !== itemToDelete.id));

      setLastDeletedItem(itemData);
      setShowUndo(true);
      setIsDeleteConfirmOpen(false);
      setItemToDelete(null);

      // Auto hide undo after 10 seconds
      setTimeout(() => setShowUndo(false), 10000);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `lists/${id}/items/${itemToDelete.id}`);
    }
  };

  const handleAddSubItem = async (itemId: string, name: string, quantity: number, price: number) => {
    if (!user || !id) return;
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const newSubItem: SubItem = {
      id: Math.random().toString(36).substring(7),
      name,
      quantity,
      price,
      purchased: false,
      createdAt: Timestamp.now()
    };

    const updatedSubItems = [...(item.subItems || []), newSubItem];
    const newTotal = updatedSubItems.reduce((acc, si) => acc + (si.price * si.quantity), 0);

    try {
      await updateDoc(doc(db, "lists", id, "items", itemId), {
        subItems: updatedSubItems,
        price: newTotal,
        updatedAt: serverTimestamp()
      });

      // Sync total
      const updatedItems = items.map(i => i.id === itemId ? { ...i, subItems: updatedSubItems, price: newTotal } : i);
      syncListTotals(updatedItems);

      // Ensure the item is expanded so the new brand is visible
      setExpandedItems(prev => ({
        ...prev,
        [itemId]: true
      }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lists/${id}/items/${itemId}/subitems`);
    }
  };

  const handleToggleSubItem = async (itemId: string, subItemId: string) => {
    if (!user || !id) return;
    const item = items.find(i => i.id === itemId);
    if (!item || !item.subItems) return;

    const updatedSubItems = item.subItems.map(si => 
      si.id === subItemId ? { ...si, purchased: !si.purchased } : si
    );

    // If all sub-items are purchased, mark parent as purchased? Maybe.
    const allPurchased = updatedSubItems.every(si => si.purchased);

    try {
      await updateDoc(doc(db, "lists", id, "items", itemId), {
        subItems: updatedSubItems,
        purchased: allPurchased,
        updatedAt: serverTimestamp()
      });

      // Sync total
      const updatedItems = items.map(i => i.id === itemId ? { ...i, subItems: updatedSubItems, purchased: allPurchased } : i);
      syncListTotals(updatedItems);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lists/${id}/items/${itemId}/subitems/${subItemId}`);
    }
  };

  const handleDeleteSubItem = async (itemId: string, subItemId: string) => {
    if (!user || !id) return;
    const item = items.find(i => i.id === itemId);
    if (!item || !item.subItems) return;

    const updatedSubItems = item.subItems.filter(si => si.id !== subItemId);
    const newTotal = updatedSubItems.length > 0 
      ? updatedSubItems.reduce((acc, si) => acc + (si.price * si.quantity), 0)
      : item.price; // Keep current price if no sub-items left or reset? 

    try {
      await updateDoc(doc(db, "lists", id, "items", itemId), {
        subItems: updatedSubItems,
        price: newTotal,
        updatedAt: serverTimestamp()
      });

      // Sync total
      const updatedItems = items.map(i => i.id === itemId ? { ...i, subItems: updatedSubItems, price: newTotal } : i);
      syncListTotals(updatedItems);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lists/${id}/items/${itemId}/subitems/${subItemId}`);
    }
  };

  const handleUndoDelete = async () => {
    if (!lastDeletedItem || !user) return;
    try {
      const newDoc = await addDoc(collection(db, "lists", id, "items"), {
        ...lastDeletedItem,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Sync total
      syncListTotals([...items, { id: newDoc.id, ...lastDeletedItem } as ShoppingItem]);

      setLastDeletedItem(null);
      setShowUndo(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `lists/${id}/items`);
    }
  };

  const handleClearAllPrices = async () => {
    try {
      const batch = writeBatch(db);
      items.forEach((item) => {
        if (item.price > 0) {
          const itemRef = doc(db, "lists", id, "items", item.id);
          batch.update(itemRef, { 
            price: 0,
            updatedAt: serverTimestamp()
          });
        }
      });
      const listRef = doc(db, "lists", id);
      batch.update(listRef, { 
        totalValue: 0, 
        categoryTotals: {}, 
        updatedAt: serverTimestamp() 
      });

      await batch.commit();
      setIsClearPricesConfirmOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lists/${id}/items`);
    }
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareEmail.trim()) return;

    try {
      if (!list.members.includes(shareEmail.trim())) {
        await updateDoc(doc(db, "lists", id), {
          members: arrayUnion(shareEmail.trim()),
          updatedAt: serverTimestamp()
        });
      }
      setShareEmail("");
      setIsShareOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lists/${id}`);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !user || !id) return;

    try {
      const cleanName = newCategoryName.trim();
      if (!list.categories.includes(cleanName)) {
        await updateDoc(doc(db, "lists", id), {
          categories: arrayUnion(cleanName),
          updatedAt: serverTimestamp()
        });
      }
      setNewItemCategory(cleanName);
      setNewCategoryName("");
      setIsAddCategoryOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lists/${id}`);
    }
  };

  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const typedValue = parseCurrencyToNumber(tempBudget);
      const newBudget = shouldAddToBudget 
        ? (list.budget || 0) + typedValue 
        : typedValue;

      await updateDoc(doc(db, "lists", id), {
        budget: newBudget,
        updatedAt: serverTimestamp()
      });
      setIsBudgetOpen(false);
      setShouldAddToBudget(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lists/${id}`);
    }
  };

  const handleClearBudget = async () => {
    if (!id || !user) return;
    try {
      await updateDoc(doc(db, "lists", id), {
        budget: 0,
        updatedAt: serverTimestamp()
      });
      setIsBudgetOpen(false);
      setShouldAddToBudget(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lists/${id}`);
    }
  };

  const handleCalcPress = (value: string) => {
    setCopiedCalcResult(false);
    if (value === "C") {
      setCalcDisplay("");
      setCalcResult("");
    } else if (value === "backspace") {
      setCalcDisplay(prev => prev.slice(0, -1));
      setCalcResult("");
    } else if (value === "=") {
      try {
        const expression = calcDisplay.replace(/,/g, ".");
        if (/[^0-9+\-*/().]/g.test(expression)) {
          setCalcResult("Erro");
          return;
        }
        const res = Function(`"use client"; return (${expression})`)();
        if (res !== undefined && !isNaN(res) && isFinite(res)) {
          const formatted = Number(res.toFixed(4)).toString().replace(".", ",");
          setCalcResult(formatted);
          setCalcDisplay(formatted);
        } else {
          setCalcResult("Erro");
        }
      } catch (err) {
        setCalcResult("Erro");
      }
    } else {
      setCalcDisplay(prev => prev + value);
    }
  };

  const handleCopyCalcResult = () => {
    const toCopy = calcResult || calcDisplay;
    if (!toCopy) return;
    navigator.clipboard.writeText(toCopy.trim());
    setCopiedCalcResult(true);
    setTimeout(() => setCopiedCalcResult(false), 2000);
  };

  const totalValue = items.reduce((acc, item) => {
    const itemTotal = (item.subItems && item.subItems.length > 0)
      ? (item.price || 0)
      : ((item.price || 0) * item.quantity);
    return acc + itemTotal;
  }, 0);
  
  const purchasedValue = items.reduce((acc, item) => {
    if (item.subItems && item.subItems.length > 0) {
      const siTotal = item.subItems
        .filter(si => si.purchased)
        .reduce((sum, si) => sum + (si.price * si.quantity), 0);
      return acc + siTotal;
    }
    return acc + (item.purchased ? ((item.price || 0) * item.quantity) : 0);
  }, 0);

  const unpurchasedValue = totalValue - purchasedValue;



  const categoriesSet = new Set(items.map(i => i.category));
  const activeCategories = Array.from(categoriesSet).sort();

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 h-[100dvh] flex flex-col bg-slate-50 text-slate-900">
      <header className="flex justify-between items-center mb-6 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="bg-indigo-600 p-2 rounded-lg hover:bg-indigo-700 transition-colors">
            <ArrowLeft size={20} className="text-white" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 truncate max-w-xs sm:max-w-md">{list.name}</h1>
        </div>
        
        <div className="flex items-center gap-3">
          {/* List of members - discreet */}
          <div 
            className="flex -space-x-2 items-center cursor-pointer hover:opacity-80 transition-opacity" 
            onClick={() => setIsShareOpen(true)}
            title="Gerenciar membros"
          >
            {list.members.slice(0, 3).map((m, i) => {
              const isActive = collaborators.some(c => c.email === m);
              return (
                <div 
                  key={m} 
                  className={`h-8 w-8 rounded-full ring-2 ring-slate-50 flex items-center justify-center text-[10px] font-bold transition-all ${
                    isActive 
                      ? "bg-indigo-600 text-white border-2 border-white scale-110 shadow-lg z-20" 
                      : "bg-amber-100 border border-amber-200 text-amber-800"
                  }`}
                  style={{ zIndex: isActive ? 30 : 10 - i }}
                >
                  {isActive && (
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
                  )}
                  {m.charAt(0).toUpperCase()}
                </div>
              );
            })}
            {list.members.length > 3 && (
              <div className="h-8 w-8 rounded-full ring-2 ring-slate-50 bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 z-0">
                +{list.members.length - 3}
              </div>
            )}
          </div>

          <button 
            onClick={() => {
              setTempBudget("");
              setShouldAddToBudget(false);
              setIsBudgetOpen(true);
            }}
            className={`flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border transition-all ${
              list.budget && totalValue >= list.budget * 0.9 
                ? "text-red-600 bg-red-50 border-red-200 animate-pulse-subtle" 
                : "text-slate-600 bg-white border-slate-200 hover:border-indigo-300 shadow-sm"
            }`}
          >
            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
              !list.budget ? "bg-slate-300" :
              totalValue >= list.budget ? "bg-red-500" :
              totalValue >= list.budget * 0.9 ? "bg-amber-500" :
              "bg-emerald-500"
            }`} />
            <span className="whitespace-nowrap">
              <span className="hidden sm:inline text-slate-400 font-bold uppercase tracking-tighter mr-1">Saldo: </span>
              {list.budget ? `R$ ${(list.budget - purchasedValue).toFixed(2).replace('.', ',')}` : "Definir"}
            </span>
          </button>

          <button 
            onClick={() => {
              fetchHistory();
              setIsHistoryOpen(true);
            }}
            className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-bold px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full border border-indigo-150 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 hover:border-indigo-300 shadow-sm transition-all"
            title="Histórico da Lista"
          >
            <Calendar size={14} className="text-indigo-600" />
            <span className="whitespace-nowrap">Histórico</span>
          </button>

          <span className="hidden sm:flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span>Sincronizado</span>
          </span>
        </div>
      </header>

      {/* Main Content Bento Grid */}
      <div className="grid grid-cols-12 gap-4 flex-grow min-h-0 overflow-hidden">
        
        {/* Active Shopping List */}
        <div className="col-span-12 lg:col-span-8 bg-white rounded-3xl shadow-sm border border-slate-100 p-4 sm:p-6 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-6 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">Itens</h2>

                <button 
                  onClick={() => setIsClearPricesConfirmOpen(true)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition-all ${
                    items.some(i => i.price > 0 || (i.subItems && i.subItems.some(si => si.price > 0))) 
                      ? "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50" 
                      : "text-slate-300 cursor-not-allowed opacity-50"
                  }`}
                  disabled={!items.some(i => i.price > 0 || (i.subItems && i.subItems.some(si => si.price > 0)))}
                  title="Limpar todos os preços"
                >
                  <Eraser size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Limpar Preços</span>
                </button>
              </div>
              <p className="text-sm font-medium text-slate-400">
                {items.filter(i => i.purchased).length} de {items.length} itens comprados
              </p>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setSortBy('date')}
                  className={`px-2 sm:px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight rounded-lg transition-all ${
                    sortBy === 'date' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Recentes
                </button>
                <button 
                  onClick={() => setSortBy('name')}
                  className={`px-2 sm:px-3 py-1.5 text-[10px] font-bold uppercase tracking-tight rounded-lg transition-all ${
                    sortBy === 'name' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  A-Z
                </button>
              </div>

              <button 
                onClick={() => setIsAddItemOpen(true)}
                className="hidden sm:flex bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 transition-colors items-center gap-2"
              >
                <Plus size={18} />
                Novo Item
              </button>
            </div>
          </div>

          {/* Month Transition Banner */}
          <AnimatePresence>
            {showMonthTransitionBanner && list && (
              <motion.div 
                initial={{ opacity: 0, height: 0, y: -20 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -20 }}
                className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-4 sm:p-5 mb-6 shadow-sm overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-amber-100 p-2.5 rounded-2xl text-amber-800 shrink-0">
                      <Calendar size={20} className="animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">
                        O mês de referência mudou!
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                        Deseja arquivar os gastos de <strong className="text-indigo-600 uppercase">{new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(list.month + "-02"))}</strong> no histórico e iniciar um novo mês zerado?
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2.5 self-end sm:self-center shrink-0">
                    <button 
                      onClick={() => setShowMonthTransitionBanner(false)}
                      className="px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100/80 rounded-xl transition-all"
                    >
                      Dispensar
                    </button>
                    <button 
                      onClick={handleArchiveAndReset}
                      disabled={isTransitioning}
                      className="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg shadow-amber-100 transition-all flex items-center gap-1.5"
                    >
                      {isTransitioning ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Processando...
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          Arquivar e Resetar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Search Bar */}
          {items.length > 0 && (
            <div className="relative mb-6">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={18} />
              </div>
              <input 
                type="text"
                placeholder="Buscar produto ou marca..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          <div className="space-y-4 overflow-y-auto pr-2 pb-32 lg:pb-4 flex-1">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 border-2 border-dashed border-slate-100 rounded-3xl">
                <Package className="w-12 h-12 mb-4 text-slate-300" />
                <p className="font-medium">Nenhum produto adicionado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedItems.map(item => (
                  <React.Fragment key={item.id}>
                          <div 
                            className={`group relative flex flex-col gap-2 p-3 sm:p-4 rounded-2xl border transition-all ${
                              item.purchased 
                                ? "border-slate-100 bg-slate-50/50 opacity-60" 
                                : item.subItems && item.subItems.some(si => si.purchased)
                                  ? "border-amber-200 bg-amber-50/30 shadow-sm"
                                  : "border-slate-200 bg-white shadow-sm hover:border-indigo-200"
                            }`}
                          >
                            {/* Active collaborator indicator */}
                            {collaborators.filter(c => c.activeItemId === item.id).map(c => (
                              <div 
                                key={c.uid}
                                className="absolute -top-2 left-6 bg-indigo-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm border border-white z-10 animate-in fade-in zoom-in duration-300"
                              >
                                {c.status === 'editing' ? <Loader2 size={8} className="animate-spin" /> : <Eye size={8} />}
                                {c.displayName?.split(' ')[0]}
                              </div>
                            ))}

                            {/* Row 1: Title, Checkbox, Chevron and Price */}
                            <div className="flex items-center justify-between gap-2.5 w-full">
                              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-grow">
                                {/* Chevron */}
                                {item.subItems && item.subItems.length > 0 ? (
                                  <button 
                                    onClick={() => toggleExpandItem(item.id)}
                                    className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors shrink-0 focus:outline-none"
                                    title={expandedItems[item.id] ? "Colapsar marcas" : "Expandir marcas"}
                                  >
                                    {expandedItems[item.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                  </button>
                                ) : (
                                  <div className="w-[26px] h-[26px] shrink-0" />
                                )}

                                {/* Checkbox */}
                                <input 
                                  type="checkbox"
                                  checked={item.purchased}
                                  onChange={() => handleTogglePurchase(item)}
                                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                                />

                                {/* Name */}
                                <p className={`font-semibold text-slate-800 truncate ${item.purchased ? "line-through text-slate-400" : ""}`}>
                                  {item.name}
                                </p>
                              </div>

                              {/* Price */}
                              <div className="text-right shrink-0">
                                <p className="font-bold text-slate-800 text-sm sm:text-base">
                                  {item.price > 0 
                                    ? `R$ ${(item.subItems && item.subItems.length > 0 ? item.price : item.price * item.quantity).toFixed(2).replace('.', ',')}` 
                                    : '-'}
                                </p>
                                 {item.subItems && item.subItems.length > 0 && (
                                    <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-tighter leading-none mt-1">Acumulado</p>
                                 )}
                              </div>
                            </div>

                            {/* Row 2: Metadata and Actions */}
                            <div className="flex items-center justify-between w-full pl-[52px] sm:pl-[60px]">
                              {/* Metadata */}
                              <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5 flex-wrap flex-grow min-w-0 pr-2">
                                <span>{item.quantity} {item.unit}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  {item.category}
                                </span>
                                {item.subItems && item.subItems.length > 0 && (
                                  <>
                                    <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                                    <span className="text-[10px] text-amber-600 font-bold whitespace-nowrap">
                                      ({item.subItems.filter(si => si.purchased).length}/{item.subItems.length} marcas)
                                    </span>
                                  </>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex gap-1 shrink-0">
                                <button 
                                  onClick={() => {
                                    setActiveParentItemId(item.id);
                                    setNewSubItemName("");
                                    setNewSubItemQuantity(1);
                                    setNewSubItemPrice("");
                                    setIsAddSubItemOpen(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors focus:outline-none shrink-0"
                                  title="Adicionar Marca/Variação"
                                >
                                  <Plus size={16} />
                                </button>
                                <button 
                                  onClick={() => handleOpenEdit(item)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors focus:outline-none shrink-0"
                                  title="Editar"
                                >
                                  <Pencil size={16} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteItem(item)}
                                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-xl transition-colors focus:outline-none shrink-0"
                                  title="Excluir"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>

                        {/* Sub-items list */}
                        {item.subItems && item.subItems.length > 0 && expandedItems[item.id] && (
                          <div className="ml-12 mr-4 mb-2 space-y-1 animate-in slide-in-from-top-2 duration-300">
                            {item.subItems.map(si => (
                              <div key={si.id} className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border ${
                                si.purchased ? "bg-slate-50/30 border-slate-100 opacity-60" : "bg-slate-50/80 border-slate-100"
                              }`}>
                                <div className="flex items-center gap-3 min-w-0">
                                  <input 
                                    type="checkbox"
                                    checked={si.purchased}
                                    onChange={() => handleToggleSubItem(item.id, si.id)}
                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                                  />
                                  <div className="min-w-0">
                                    <p className={`text-sm font-bold text-slate-700 truncate ${si.purchased ? "line-through" : ""}`}>
                                      {si.name}
                                    </p>
                                    <p className="text-[10px] font-bold text-slate-400">
                                      {si.quantity}x {si.price > 0 ? `R$ ${si.price.toFixed(2).replace('.', ',')}` : '-'}
                                    </p>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => handleDeleteSubItem(item.id, si.id)}
                                  className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </React.Fragment>
                      ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar Data - Hidden on Mobile */}
        <div className="hidden lg:flex col-span-4 flex-col gap-4 overflow-y-auto min-h-0 pr-2 pb-10 custom-scrollbar h-full">
          
          {/* Summary Dashboard Card */}
          <div className="bg-indigo-900 rounded-3xl p-6 text-white shadow-xl shadow-indigo-200 shrink-0 relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-indigo-300 text-xs font-bold uppercase tracking-wider mb-2">Total Pendente</h3>
              <p className="text-4xl font-black mb-1">R$ {unpurchasedValue.toFixed(2).replace('.', ',')}</p>
              <div className="flex items-center gap-2 text-indigo-300 text-xs mt-4">
                <span className="bg-indigo-800 px-3 py-1.5 rounded-lg font-medium">{items.filter(i => !i.purchased).length} itens restantes</span>
              </div>
            </div>
            {/* Decoration */}
            <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-indigo-500 rounded-full blur-2xl opacity-20"></div>
          </div>

          
          {/* History / Completed Mini Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm shrink-0">
            <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Comprado (Total: R$ {purchasedValue.toFixed(2).replace('.', ',')})</h3>
            <div className="space-y-3 mt-4">
              {items.filter(i => i.purchased).map(item => {
                const itemTotal = (item.subItems && item.subItems.length > 0)
                  ? item.price
                  : item.price * item.quantity;
                return (
                  <div key={item.id} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-sm font-semibold text-slate-600 truncate mr-2">{item.name}</span>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-2 py-1 rounded-md shrink-0">
                      R$ {itemTotal.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                );
              })}
              {items.filter(i => i.purchased).length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-2">Nenhum item comprado.</p>
              )}
            </div>
          </div>

          {/* Category Distribution Chart */}
          {items.some(i => i.price > 0) && (
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm overflow-hidden flex flex-col gap-4 shrink-0">
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">Categorias</h3>
              
              {(() => {
                const catTotals: Record<string, number> = {};
                items.forEach(item => {
                  const itemTotal = (item.subItems && item.subItems.length > 0)
                    ? (item.price || 0)
                    : ((item.price || 0) * item.quantity);
                  if (itemTotal > 0) {
                    catTotals[item.category] = (catTotals[item.category] || 0) + itemTotal;
                  }
                });

                const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
                const total = sortedCats.reduce((sum, [_, val]) => sum + val, 0);
                const colors = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
                
                let currentPercent = 0;
                const gradientParts = sortedCats.map(([cat, val], idx) => {
                  const percent = (val / total) * 100;
                  const start = currentPercent;
                  currentPercent += percent;
                  return `${colors[idx % colors.length]} ${start}% ${currentPercent}%`;
                });

                return (
                  <>
                    <div 
                      className="w-full aspect-square max-w-[120px] mx-auto rounded-full shadow-inner relative"
                      style={{ background: `conic-gradient(${gradientParts.join(', ')})` }}
                    >
                      <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center">
                        <BarChart2 size={20} className="text-slate-100" />
                      </div>
                    </div>
                    
                    <div className="space-y-1.5 mt-2">
                      {sortedCats.map(([cat, val], idx) => (
                        <div key={cat} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                            <span className="text-[10px] font-bold text-slate-500 truncate">{cat}</span>
                          </div>
                          <span className="text-[10px] font-black text-slate-700">
                            {((val / total) * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

        </div>

      </div>

      {/* Undo Notification */}
      <AnimatePresence>
        {showUndo && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 lg:bottom-6 max-lg:bottom-28 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-sm px-4"
          >
            <div className="bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between gap-4 pointer-events-auto border border-slate-800">
              <div className="flex items-center gap-2">
                <Trash2 size={18} className="text-red-400" />
                <span className="text-sm font-medium">Item excluído</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-px h-4 bg-slate-700" />
                <button 
                  onClick={handleUndoDelete}
                  className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors text-sm font-bold px-2 py-1 rounded-lg hover:bg-white/5"
                >
                  <RotateCcw size={16} />
                  DESFAZER
                </button>
                <button 
                  onClick={() => setShowUndo(false)}
                  className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                  title="Fechar"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <Dialog.Root open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-sm:w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-6 border border-slate-100 bg-white p-8 shadow-2xl duration-200 rounded-3xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                <Trash2 size={28} className="text-red-500" />
              </div>
              <Dialog.Title className="text-xl font-bold text-slate-800 mb-2">Excluir Item?</Dialog.Title>
              <Dialog.Description className="text-slate-500 font-medium">
                Tem certeza que deseja excluir <span className="text-slate-800 font-bold">&quot;{itemToDelete?.name}&quot;</span> da sua lista?
              </Dialog.Description>
            </div>
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button className="flex-1 px-5 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-2xl transition-colors">
                  Cancelar
                </button>
              </Dialog.Close>
              <button 
                onClick={handleConfirmDelete}
                className="flex-1 px-5 py-3 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-2xl shadow-lg shadow-red-100 transition-colors"
              >
                Excluir
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      
      {/* Clear Prices Confirmation Modal */}
      <Dialog.Root open={isClearPricesConfirmOpen} onOpenChange={setIsClearPricesConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-sm:w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-6 border border-slate-100 bg-white p-8 shadow-2xl duration-200 rounded-3xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                <Eraser size={28} className="text-indigo-500" />
              </div>
              <Dialog.Title className="text-xl font-bold text-slate-800 mb-2">Limpar Preços?</Dialog.Title>
              <Dialog.Description className="text-slate-500 font-medium">
                Deseja zerar os valores de todos os itens desta lista? Esta ação não pode ser desfeita.
              </Dialog.Description>
            </div>
            <div className="flex gap-3">
              <Dialog.Close asChild>
                <button className="flex-1 px-5 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-2xl transition-colors">
                  Cancelar
                </button>
              </Dialog.Close>
              <button 
                onClick={handleClearAllPrices}
                className="flex-1 px-5 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-lg shadow-indigo-100 transition-colors"
              >
                Limpar Tudo
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Budget Selection Dialog */}
      <Dialog.Root open={isBudgetOpen} onOpenChange={setIsBudgetOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-sm:w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-6 border border-slate-100 bg-white p-8 shadow-2xl duration-200 rounded-3xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                <Plus size={28} className="text-emerald-500" />
              </div>
              <Dialog.Title className="text-xl font-bold text-slate-800 mb-2">Saldo Disponível</Dialog.Title>
              <Dialog.Description className="text-slate-500 font-medium">
                Defina o limite de gastos ou adicione valor ao saldo atual.
              </Dialog.Description>
              {list.budget !== undefined && list.budget > 0 && (
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
                    Saldo Atual: R$ {list.budget.toFixed(2).replace('.', ',')}
                  </p>
                  <button
                    type="button"
                    onClick={handleClearBudget}
                    className="text-[10px] font-bold text-red-500 hover:text-white hover:bg-red-500 border border-red-100 hover:border-red-500 rounded-full px-2.5 py-1 transition-all"
                    title="Limpar Saldo"
                  >
                    Limpar
                  </button>
                </div>
              )}
            </div>
            <form onSubmit={handleUpdateBudget} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Valor em Reais</label>
                <input 
                  type="text"
                  autoFocus
                  value={tempBudget}
                  onChange={e => setTempBudget(formatCurrency(e.target.value))}
                  inputMode="numeric"
                  onKeyDown={(e) => {
                    if (
                      !/[0-9]/.test(e.key) && 
                      e.key !== "Backspace" && 
                      e.key !== "Delete" && 
                      e.key !== "Tab" && 
                      e.key !== "ArrowLeft" && 
                      e.key !== "ArrowRight"
                    ) {
                      e.preventDefault();
                    }
                  }}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-lg font-bold text-slate-700"
                  placeholder="0,00"
                />
              </div>
              {list.budget !== undefined && list.budget > 0 && (
                <div className="flex items-center gap-2 mb-2 bg-slate-50 border border-slate-100 p-3 rounded-2xl">
                  <input 
                    type="checkbox"
                    id="addToBudget"
                    checked={shouldAddToBudget}
                    onChange={(e) => setShouldAddToBudget(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="addToBudget" className="text-xs font-bold text-slate-500 cursor-pointer select-none">
                    Somar ao saldo atual
                  </label>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Dialog.Close asChild>
                  <button type="button" className="flex-1 px-5 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-2xl transition-colors">
                    Cancelar
                  </button>
                </Dialog.Close>
                <button type="submit" className="flex-1 px-5 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-lg shadow-indigo-100 transition-colors">
                  Salvar
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Share / Invite Dialog */}
      <Dialog.Root open={isShareOpen} onOpenChange={setIsShareOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-sm:w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-6 border border-slate-100 bg-white p-8 shadow-2xl duration-200 rounded-3xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-4">
                <Share2 size={28} className="text-amber-600" />
              </div>
              <Dialog.Title className="text-xl font-bold text-slate-800 mb-2">Compartilhar Lista</Dialog.Title>
              <Dialog.Description className="text-slate-500 font-medium">
                Convide outras pessoas para visualizar e editar esta lista em tempo real.
              </Dialog.Description>
            </div>
            <form onSubmit={handleShare} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">E-mail (Google)</label>
                <input 
                  type="email" 
                  required 
                  value={shareEmail} 
                  onChange={e => setShareEmail(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-700"
                  placeholder="exemplo@gmail.com" 
                />
              </div>
              
              <div className="space-y-2 mt-4">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Membros Atuais</label>
                <div className="max-h-[120px] overflow-y-auto space-y-2 pr-2">
                  {list.members.map(m => (
                    <div key={m} className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700 shrink-0">
                        {m.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold text-slate-600 truncate">{m}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Dialog.Close asChild>
                  <button type="button" className="flex-1 px-5 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-2xl transition-colors">
                    Fechar
                  </button>
                </Dialog.Close>
                <button type="submit" className="flex-1 px-5 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-lg shadow-indigo-100 transition-colors">
                  Convidar
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add Item Dialog */}
      <Dialog.Root open={isAddItemOpen} onOpenChange={(open) => {
        if (!open) handleCloseForm();
        else setIsAddItemOpen(true);
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-100 bg-white p-6 shadow-2xl duration-200 sm:rounded-3xl">
            <Dialog.Title className="text-xl font-bold text-slate-800">{editingItem ? "Editar Produto" : "Novo Produto"}</Dialog.Title>
            <form onSubmit={handleAddItem} className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-600">Nome</label>
                <input 
                  type="text" required value={newItemName} onChange={e => setNewItemName(e.target.value)}
                  className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-bold text-slate-600">Quantidade</label>
                  <input 
                    type="number" min="0.01" step="0.01" required value={newItemQuantity} onChange={e => setNewItemQuantity(Number(e.target.value))}
                    className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm font-bold text-slate-600">Medida</label>
                  <Select.Root value={newItemUnit} onValueChange={(val) => setNewItemUnit(val as UnitType)}>
                    <Select.Trigger className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all flex items-center justify-between">
                      <Select.Value />
                      <Select.Icon>
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="overflow-hidden bg-white rounded-2xl shadow-xl border border-slate-100 z-50">
                        <Select.Viewport className="p-2">
                          <Select.Item value="unidade" className="relative flex items-center px-8 py-2 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-50 focus:bg-indigo-50 focus:text-indigo-700 outline-none cursor-pointer data-[highlighted]:bg-indigo-50 data-[highlighted]:text-indigo-700 transition-colors">
                            <Select.ItemText>Unidade(s)</Select.ItemText>
                            <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                              <Check className="w-4 h-4 text-indigo-600" />
                            </Select.ItemIndicator>
                          </Select.Item>
                          <Select.Item value="pacote" className="relative flex items-center px-8 py-2 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-50 focus:bg-indigo-50 focus:text-indigo-700 outline-none cursor-pointer data-[highlighted]:bg-indigo-50 data-[highlighted]:text-indigo-700 transition-colors">
                            <Select.ItemText>Pacote(s)</Select.ItemText>
                            <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                              <Check className="w-4 h-4 text-indigo-600" />
                            </Select.ItemIndicator>
                          </Select.Item>
                          <Select.Item value="caixa" className="relative flex items-center px-8 py-2 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-50 focus:bg-indigo-50 focus:text-indigo-700 outline-none cursor-pointer data-[highlighted]:bg-indigo-50 data-[highlighted]:text-indigo-700 transition-colors">
                            <Select.ItemText>Caixa(s)</Select.ItemText>
                            <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                              <Check className="w-4 h-4 text-indigo-600" />
                            </Select.ItemIndicator>
                          </Select.Item>
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-sm font-bold text-slate-600">Categoria</label>
                  <Select.Root value={newItemCategory} onValueChange={(val) => setNewItemCategory(val)}>
                    <Select.Trigger className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all flex items-center justify-between">
                      <Select.Value />
                      <Select.Icon>
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content className="overflow-hidden bg-white rounded-2xl shadow-xl border border-slate-100 z-50 max-h-[300px]">
                        <Select.Viewport className="p-2">
                          {list.categories.map(cat => (
                            <Select.Item key={cat} value={cat} className="relative flex items-center px-8 py-2 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-50 focus:bg-indigo-50 focus:text-indigo-700 outline-none cursor-pointer data-[highlighted]:bg-indigo-50 data-[highlighted]:text-indigo-700 transition-colors">
                              <Select.ItemText>{cat}</Select.ItemText>
                              <Select.ItemIndicator className="absolute left-2 inline-flex items-center">
                                <Check className="w-4 h-4 text-indigo-600" />
                              </Select.ItemIndicator>
                            </Select.Item>
                          ))}
                          <div className="border-t border-slate-100 my-1 pt-1">
                            <button 
                              type="button"
                              onClick={() => setIsAddCategoryOpen(true)}
                              className="w-full flex items-center gap-2 px-8 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors text-left"
                            >
                              <Plus size={14} />
                              Nova Categoria...
                            </button>
                          </div>
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                </div>
                <div className="flex-1">
                  <label className="text-sm font-bold text-slate-600">Preço Unitário (R$) <span className="font-medium text-slate-400 opacity-80">(Op)</span></label>
                  <input 
                    type="text"
                    value={newItemPrice}
                    onChange={e => setNewItemPrice(formatCurrency(e.target.value))}
                    inputMode="numeric"
                    onKeyDown={(e) => {
                      if (
                        !/[0-9]/.test(e.key) && 
                        e.key !== "Backspace" && 
                        e.key !== "Delete" && 
                        e.key !== "Tab" && 
                        e.key !== "ArrowLeft" && 
                        e.key !== "ArrowRight"
                      ) {
                        e.preventDefault();
                      }
                    }}
                    className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                    placeholder="0,00"
                  />
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                <Dialog.Close asChild>
                  <button type="button" className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                </Dialog.Close>
                <button type="submit" className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-100 transition-colors">Salvar</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Share / Invite Dialog */}
      <Dialog.Root open={isShareOpen} onOpenChange={setIsShareOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-sm:w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-6 border border-slate-100 bg-white p-8 shadow-2xl duration-200 rounded-3xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-4">
                <Share2 size={28} className="text-amber-600" />
              </div>
              <Dialog.Title className="text-xl font-bold text-slate-800 mb-2">Compartilhar Lista</Dialog.Title>
              <Dialog.Description className="text-slate-500 font-medium text-sm">
                O acesso é automático para o e-mail convidado após o login.
              </Dialog.Description>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Link de Acesso Direto</label>
              <div className="flex gap-2">
                <input 
                  readOnly
                  type="text"
                  value={`https://lista-plus.vercel.app/lists/${id}`}
                  className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-500 outline-none"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    copiedLink ? "bg-emerald-500 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {copiedLink ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </div>
            <form onSubmit={handleShare} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">E-mail (Google)</label>
                <input 
                  type="email" 
                  required 
                  value={shareEmail} 
                  onChange={e => setShareEmail(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-slate-700"
                  placeholder="exemplo@gmail.com" 
                />
              </div>
              
              <div className="space-y-2 mt-4">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Membros Atuais</label>
                <div className="max-h-[120px] overflow-y-auto space-y-2 pr-2">
                  {list.members.map(m => (
                    <div key={m} className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-700 shrink-0">
                        {m.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-semibold text-slate-600 truncate">{m}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Dialog.Close asChild>
                  <button type="button" className="flex-1 px-5 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-2xl transition-colors">
                    Fechar
                  </button>
                </Dialog.Close>
                <button type="submit" className="flex-1 px-5 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-lg shadow-indigo-100 transition-colors">
                  Convidar
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Floating Action Button for mobile */}
      <div className="sm:hidden fixed bottom-32 right-6 z-40">
        <motion.button 
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsAddItemOpen(true)}
          className="bg-gradient-to-br from-indigo-600 to-violet-600 text-white w-16 h-16 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgb(79,70,229,0.4)] transition-all border-4 border-white active:shadow-inner"
        >
          <Plus size={32} />
        </motion.button>
      </div>

      {/* Mobile Floating Summary Balloon */}
      <AnimatePresence>
        {items.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-md pointer-events-none"
          >
            <div className="bg-indigo-950/95 backdrop-blur-md text-white px-6 py-4 rounded-[2rem] shadow-2xl border border-indigo-800/50 flex items-center justify-between gap-4 pointer-events-auto">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-indigo-300/80 uppercase tracking-widest">Pendente</span>
                <span className="text-lg font-black leading-none mt-1 text-amber-400">R$ {unpurchasedValue.toFixed(2).replace('.', ',')}</span>
              </div>
              <div className="w-[1px] h-8 bg-indigo-800/50" />
              <div className="flex flex-col text-right">
                <span className="text-[10px] font-bold text-indigo-300/80 uppercase tracking-widest">Total Geral</span>
                <span className={`text-lg font-black leading-none mt-1 ${
                  list.budget && totalValue >= list.budget * 0.9 ? "text-red-400 animate-pulse" : "text-emerald-400"
                }`}>R$ {totalValue.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
            {list.budget && list.budget > 0 && totalValue >= list.budget * 0.9 && (
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-lg border-2 border-white animate-bounce whitespace-nowrap">
                ⚠️ SALDO CRÍTICO: {((totalValue / list.budget) * 100).toFixed(0)}%
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Sub-item Dialog */}
      <Dialog.Root open={isAddSubItemOpen} onOpenChange={setIsAddSubItemOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-sm:w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-6 border border-slate-100 bg-white p-8 shadow-2xl duration-200 rounded-[2.5rem] outline-none">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4 text-indigo-500">
                <Plus size={28} />
              </div>
              <Dialog.Title className="text-xl font-bold text-slate-800 mb-1">Adicionar Marca/Variação</Dialog.Title>
              <Dialog.Description className="text-slate-500 font-medium mb-4 text-center text-sm">
                Ex: Marca específica, tamanho ou peso diferente.
              </Dialog.Description>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                if (activeParentItemId && newSubItemName.trim()) {
                  handleAddSubItem(activeParentItemId, newSubItemName.trim(), newSubItemQuantity, Number(newSubItemPrice.replace(/[^\d]/g, '')) / 100);
                  setIsAddSubItemOpen(false);
                }
              }} className="w-full space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Nome / Marca</label>
                  <input 
                    type="text" 
                    autoFocus
                    required
                    placeholder="Ex: Marca A, 500ml, etc."
                    value={newSubItemName}
                    onChange={e => setNewSubItemName(e.target.value)}
                    className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                  />
                </div>
                
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Qtd</label>
                    <input 
                      type="number" 
                      required
                      min="1"
                      value={newSubItemQuantity}
                      onChange={e => setNewSubItemQuantity(Number(e.target.value))}
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                    />
                  </div>
                  <div className="flex-[2]">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">Preço Unit.</label>
                    <input 
                      type="text" 
                      value={newSubItemPrice}
                      onChange={e => setNewSubItemPrice(formatCurrency(e.target.value))}
                      inputMode="numeric"
                      onKeyDown={(e) => {
                        if (
                          !/[0-9]/.test(e.key) && 
                          e.key !== "Backspace" && 
                          e.key !== "Delete" && 
                          e.key !== "Tab" && 
                          e.key !== "ArrowLeft" && 
                          e.key !== "ArrowRight"
                        ) {
                          e.preventDefault();
                        }
                      }}
                      placeholder="0,00"
                      className="w-full px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Dialog.Close asChild>
                    <button type="button" className="flex-1 px-5 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-2xl transition-colors">
                      Cancelar
                    </button>
                  </Dialog.Close>
                  <button 
                    type="submit"
                    className="flex-1 px-5 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl shadow-lg shadow-indigo-100 transition-colors"
                  >
                    Adicionar
                  </button>
                </div>
              </form>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {/* New Category Dialog */}
      <Dialog.Root open={isAddCategoryOpen} onOpenChange={setIsAddCategoryOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-[70] w-full max-w-sm translate-x-[-50%] translate-y-[-50%] border border-slate-100 bg-white shadow-2xl duration-200 rounded-[2rem] p-6 outline-none">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
                <Plus size={20} />
              </div>
              <Dialog.Title className="text-lg font-bold text-slate-800">Nova Categoria</Dialog.Title>
            </div>
            
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-600">Nome da Categoria</label>
                <input 
                  autoFocus
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" 
                  placeholder="Ex: Pet Shop, Churrasco..."
                />
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsAddCategoryOpen(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-100 transition-colors"
                >
                  Criar Categoria
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Floating Calculator Button */}
      <div className="fixed bottom-52 right-6 sm:bottom-8 sm:right-8 z-40">
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsCalculatorOpen(true)}
          className="bg-white hover:bg-slate-50 text-indigo-600 w-16 h-16 rounded-full flex items-center justify-center shadow-lg border border-slate-200 active:shadow-inner"
          title="Calculadora"
        >
          <Calculator size={28} />
        </motion.button>
      </div>

      {/* Calculator Dialog */}
      <Dialog.Root open={isCalculatorOpen} onOpenChange={setIsCalculatorOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-sm:w-[calc(100%-2rem)] max-w-xs translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-800 bg-slate-900 p-6 shadow-2xl duration-200 rounded-[2rem] outline-none">
            <div className="flex justify-between items-center text-white">
              <Dialog.Title className="text-sm font-bold tracking-wider text-slate-400">CALCULADORA</Dialog.Title>
              <Dialog.Close asChild>
                <button className="text-slate-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>

            {/* Display screen */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-right flex flex-col justify-end min-h-[96px] select-all w-full overflow-hidden">
              <div className="text-slate-500 text-xs font-mono tracking-wide truncate h-5 w-full">
                {calcDisplay || " "}
              </div>
              <div className="text-white text-3xl font-black font-mono tracking-tight mt-1 truncate w-full">
                {calcResult || calcDisplay || "0"}
              </div>
            </div>

            {/* Actions (Copy Result) */}
            <div className="flex gap-2 justify-end mb-1">
              <button
                type="button"
                onClick={handleCopyCalcResult}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  copiedCalcResult 
                    ? "bg-emerald-500/20 text-emerald-400" 
                    : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                }`}
                disabled={!calcDisplay && !calcResult}
              >
                <Copy size={12} />
                <span>{copiedCalcResult ? "Copiado!" : "Copiar"}</span>
              </button>
            </div>

            {/* Button grid */}
            <div className="grid grid-cols-4 gap-2.5">
              {/* Row 1 */}
              <button type="button" onClick={() => handleCalcPress("C")} className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-base font-bold py-3.5 rounded-2xl transition-colors">C</button>
              <button type="button" onClick={() => handleCalcPress("(")} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-base font-bold py-3.5 rounded-2xl transition-colors">(</button>
              <button type="button" onClick={() => handleCalcPress(")")} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-base font-bold py-3.5 rounded-2xl transition-colors">)</button>
              <button type="button" onClick={() => handleCalcPress("/")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-black py-3.5 rounded-2xl transition-colors">/</button>

              {/* Row 2 */}
              <button type="button" onClick={() => handleCalcPress("7")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors">7</button>
              <button type="button" onClick={() => handleCalcPress("8")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors">8</button>
              <button type="button" onClick={() => handleCalcPress("9")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors">9</button>
              <button type="button" onClick={() => handleCalcPress("*")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-black py-3.5 rounded-2xl transition-colors">*</button>

              {/* Row 3 */}
              <button type="button" onClick={() => handleCalcPress("4")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors">4</button>
              <button type="button" onClick={() => handleCalcPress("5")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors">5</button>
              <button type="button" onClick={() => handleCalcPress("6")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors">6</button>
              <button type="button" onClick={() => handleCalcPress("-")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-black py-3.5 rounded-2xl transition-colors">-</button>

              {/* Row 4 */}
              <button type="button" onClick={() => handleCalcPress("1")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors">1</button>
              <button type="button" onClick={() => handleCalcPress("2")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors">2</button>
              <button type="button" onClick={() => handleCalcPress("3")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors">3</button>
              <button type="button" onClick={() => handleCalcPress("+")} className="bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-black py-3.5 rounded-2xl transition-colors">+</button>

              {/* Row 5 */}
              <button type="button" onClick={() => handleCalcPress("0")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors col-span-2">0</button>
              <button type="button" onClick={() => handleCalcPress(",")} className="bg-slate-800 hover:bg-slate-700 text-white text-lg font-bold py-3.5 rounded-2xl transition-colors">,</button>
              <button type="button" onClick={() => handleCalcPress("backspace")} className="bg-slate-800 hover:bg-slate-700 text-slate-400 text-base font-bold py-3.5 rounded-2xl flex items-center justify-center transition-colors">⌫</button>

              {/* Equals Button */}
              <button type="button" onClick={() => handleCalcPress("=")} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xl font-black py-4 rounded-2xl col-span-4 transition-colors mt-1 shadow-lg shadow-emerald-950/50">
                =
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* History Dialog */}
      <Dialog.Root open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] border border-slate-100 bg-white shadow-2xl duration-200 rounded-[2.5rem] outline-none max-h-[90vh] flex flex-col overflow-hidden p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-100 p-2.5 rounded-2xl text-indigo-600">
                  <RotateCcw size={24} />
                </div>
                <div>
                  <Dialog.Title className="text-xl font-bold text-slate-800">Histórico da Lista</Dialog.Title>
                  <Dialog.Description className="text-slate-500 font-medium text-sm">
                    Acompanhamento de gastos e compras anteriores.
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
                <X className="text-slate-400" size={24} />
              </Dialog.Close>
            </div>

            {loadingHistory ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                <Loader2 size={36} className="animate-spin text-indigo-600" />
                <span className="text-sm font-semibold">Carregando histórico...</span>
              </div>
            ) : historyData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 border border-dashed border-slate-200 rounded-3xl p-6">
                <Calendar size={36} className="text-slate-300 mb-2" />
                <span className="text-sm font-semibold text-slate-500">Nenhum mês anterior arquivado.</span>
                <span className="text-xs text-slate-400 mt-1">Quando o mês virar, você poderá salvar o histórico aqui.</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-2 space-y-6 pb-6">
                {/* Product Price Comparison Section */}
                <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 space-y-4">
                  <div>
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider block mb-1">Comparador de Preços por Item</h4>
                    <span className="text-xs text-slate-500 font-medium">Veja a evolução dos preços pagos por um mesmo produto ao longo do tempo.</span>
                  </div>
                  
                  <div className="w-full">
                    <select
                      value={selectedProductForComparison}
                      onChange={(e) => setSelectedProductForComparison(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-2xl py-3 px-4 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
                    >
                      <option value="">Selecione um produto...</option>
                      {allUniqueProductNames.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  {selectedProductForComparison && (() => {
                    const priceHistory: Array<{
                      month: string;
                      price: number;
                      subItemsText?: string;
                      isCurrent: boolean;
                    }> = [];

                    // 1. Check current items
                    const currentItem = items.find(i => i.name === selectedProductForComparison);
                    if (currentItem && currentItem.price > 0) {
                      priceHistory.push({
                        month: list.month || "",
                        price: currentItem.price,
                        subItemsText: currentItem.subItems && currentItem.subItems.length > 0
                          ? currentItem.subItems.map(si => `${si.name} (x${si.quantity})`).join(", ")
                          : undefined,
                        isCurrent: true
                      });
                    }

                    // 2. Check historical snapshots
                    historyData.forEach(h => {
                      const histItem = h.itemsSnapshot?.find((i: any) => i.name === selectedProductForComparison);
                      if (histItem && histItem.price > 0) {
                        priceHistory.push({
                          month: h.month,
                          price: histItem.price,
                          subItemsText: histItem.subItems && histItem.subItems.length > 0
                            ? histItem.subItems.map((si: any) => `${si.name} (x${si.quantity})`).join(", ")
                            : undefined,
                          isCurrent: false
                        });
                      }
                    });

                    // Sort chronological (oldest to newest)
                    priceHistory.sort((a, b) => a.month.localeCompare(b.month));

                    if (priceHistory.length === 0) {
                      return <p className="text-xs text-slate-400 font-medium italic pl-1">Nenhum preço registrado para este item.</p>;
                    }

                    return (
                      <div className="space-y-2.5 mt-2">
                        {priceHistory.map((entry, idx) => {
                          const prevEntry = priceHistory[idx - 1];
                          const diff = prevEntry ? entry.price - prevEntry.price : 0;
                          const percent = prevEntry ? (diff / prevEntry.price) * 100 : 0;

                          return (
                            <div key={entry.month} className="flex justify-between items-center bg-white border border-slate-100 p-3 rounded-2xl shadow-sm">
                              <div>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                                  {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(entry.month + "-02"))}
                                  {entry.isCurrent && <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full ml-2 uppercase">Mês Ativo</span>}
                                </span>
                                {entry.subItemsText && (
                                  <span className="text-[10px] text-slate-400 font-medium block mt-0.5">Marcas: {entry.subItemsText}</span>
                                )}
                              </div>
                              <div className="text-right flex items-center gap-3">
                                <span className="text-sm font-black text-slate-800">
                                  R$ {entry.price.toFixed(2).replace('.', ',')}
                                </span>
                                {prevEntry && (
                                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-0.5 border ${
                                    diff > 0 
                                      ? "bg-red-50 border-red-100 text-red-600" 
                                      : diff < 0 
                                        ? "bg-emerald-50 border-emerald-100 text-emerald-600" 
                                        : "bg-slate-50 border-slate-100 text-slate-500"
                                  }`}>
                                    {diff > 0 ? "+" : diff < 0 ? "" : ""}
                                    {percent.toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* History Cards */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Registros de Período</h4>
                  
                  {historyData.map((h, idx) => {
                    const total = h.totalValue || 0;
                    const prevHistory = historyData[idx + 1];
                    const prevTotal = prevHistory ? prevHistory.totalValue : null;
                    const diff = prevTotal !== null ? total - prevTotal : 0;
                    const percent = prevTotal ? (diff / prevTotal) * 100 : 0;

                    return (
                      <div key={h.id} className="bg-slate-50 border border-slate-100 rounded-[2rem] p-5 space-y-4 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-xl border border-slate-100 flex flex-col items-center justify-center shadow-sm">
                              <span className="text-[9px] font-black text-slate-400 uppercase leading-none">
                                {new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(h.month + "-02")).replace('.', '')}
                              </span>
                              <span className="text-[10px] font-bold text-indigo-600 leading-none mt-0.5">
                                {h.month.split('-')[0]}
                              </span>
                            </div>
                            <div>
                              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none">Gasto Total</h4>
                              <p className="text-lg font-black text-slate-800 tracking-tight mt-1">
                                R$ {total.toFixed(2).replace('.', ',')}
                              </p>
                            </div>
                          </div>

                          {prevTotal !== null && (
                            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border self-start sm:self-center ${
                              diff > 0 
                                ? "bg-red-50 border-red-100 text-red-600" 
                                : "bg-emerald-50 border-emerald-100 text-emerald-600"
                            }`}>
                              {diff > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                              <div className="flex flex-col">
                                <span className="text-[9px] font-black uppercase tracking-wider leading-none">
                                  {diff > 0 ? "Aumento" : "Economia"}
                                </span>
                                <span className="text-xs font-bold leading-none mt-1">
                                  {percent.toFixed(1).replace('.', ',')}% (R$ {Math.abs(diff).toFixed(2).replace('.', ',')})
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Category List */}
                        {h.categoryTotals && Object.keys(h.categoryTotals).length > 0 && (
                          <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-2 shadow-sm">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">Gastos por Categoria</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-1">
                              {Object.entries(h.categoryTotals as Record<string, number>)
                                .sort((a, b) => b[1] - a[1])
                                .map(([cat, val]) => (
                                  <div key={cat} className="flex justify-between items-center text-xs">
                                    <span className="font-semibold text-slate-500 truncate mr-2">{cat}</span>
                                    <span className="font-bold text-slate-700 shrink-0">R$ {val.toFixed(2).replace('.', ',')}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Historical Items List (Expandable) */}
                        <Dialog.Root>
                          <Dialog.Trigger asChild>
                            <button className="w-full flex items-center justify-center gap-2 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl text-xs font-bold transition-all mt-2 bg-white shadow-sm">
                              <Eye size={14} />
                              Ver Itens Comprados ({h.itemsSnapshot?.length || 0})
                            </button>
                          </Dialog.Trigger>
                          <Dialog.Portal>
                            <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                            <Dialog.Content className="fixed left-[50%] top-[50%] z-[70] w-full max-w-md translate-x-[-50%] translate-y-[-50%] border border-slate-100 bg-white shadow-2xl duration-200 rounded-3xl p-6 outline-none max-h-[80vh] flex flex-col overflow-hidden">
                              <div className="flex justify-between items-start mb-4">
                                <div>
                                  <Dialog.Title className="text-base font-bold text-slate-800">
                                    Itens de {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(h.month + "-02"))}
                                  </Dialog.Title>
                                  <Dialog.Description className="text-xs text-slate-500">
                                    Lista de itens comprados no período.
                                  </Dialog.Description>
                                </div>
                                <Dialog.Close className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                                  <X className="text-slate-400" size={18} />
                                </Dialog.Close>
                              </div>
                              <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-4">
                                {h.itemsSnapshot && h.itemsSnapshot.length > 0 ? (
                                  h.itemsSnapshot.map((item: any) => (
                                    <div key={item.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                      <div>
                                        <p className="text-xs font-bold text-slate-700 truncate">{item.name}</p>
                                        <span className="text-[10px] text-slate-400 font-semibold">{item.quantity} {item.unit} | {item.category}</span>
                                      </div>
                                      <span className="text-xs font-black text-slate-800">
                                        {item.price > 0 ? `R$ ${item.price.toFixed(2).replace('.', ',')}` : '-'}
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-xs text-slate-400 italic text-center py-4">Nenhum item arquivado.</p>
                                )}
                              </div>
                            </Dialog.Content>
                          </Dialog.Portal>
                        </Dialog.Root>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </div>
  );
}
