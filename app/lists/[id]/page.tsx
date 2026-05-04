"use client";

import { useAuth } from "@/hooks/use-auth";
import { OperationType, handleFirestoreError, db } from "@/lib/firebase";
import { ShoppingItem, ShoppingList, UnitType } from "@/lib/types";
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, deleteDoc, addDoc, arrayUnion, writeBatch, setDoc } from "firebase/firestore";
import { ArrowLeft, Check, Copy, Package, Plus, Share2, Trash2, ChevronDown, Pencil, RotateCcw, X, Eraser, Loader2, Eye } from "lucide-react";

export interface Presence {
  uid: string;
  email: string;
  displayName: string | null;
  lastActive: any;
  activeItemId: string | null;
  status: 'viewing' | 'editing';
}
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import * as Dialog from '@radix-ui/react-dialog';
import * as Select from '@radix-ui/react-select';

export default function ListDetail() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { user, loading } = useAuth();
  
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [collaborators, setCollaborators] = useState<Presence[]>([]);

  // Form states
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingItem | null>(null);
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

  // Delete states
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ShoppingItem | null>(null);
  const [lastDeletedItem, setLastDeletedItem] = useState<Partial<ShoppingItem> | null>(null);
  const [showUndo, setShowUndo] = useState(false);
  const [isClearPricesConfirmOpen, setIsClearPricesConfirmOpen] = useState(false);

  // Share states
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");

  // Presence tracking logic
  useEffect(() => {
    if (!user || !id) return;

    const presenceRef = doc(db, "lists", id, "presence", user.uid);
    
    const updatePresence = (itemId: string | null = null, status: 'viewing' | 'editing' = 'viewing') => {
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
      const now = Date.now();
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
        setList({ id: doc.id, ...doc.data() } as ShoppingList);
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
      itemsData.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setItems(itemsData);
      setLoadingData(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `lists/${id}/items`));

    return () => {
      unsubList();
      unsubItems();
    };
  }, [user, id, router]);

  if (loading || loadingData) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!list) return null;

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !user) return;

    try {
      if (editingItem) {
        await updateDoc(doc(db, "lists", id, "items", editingItem.id), {
          name: newItemName.trim(),
          quantity: newItemQuantity,
          unit: newItemUnit,
          category: newItemCategory,
          price: parseCurrencyToNumber(newItemPrice),
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, "lists", id, "items"), {
          name: newItemName.trim(),
          quantity: newItemQuantity,
          unit: newItemUnit,
          category: newItemCategory,
          price: parseCurrencyToNumber(newItemPrice),
          purchased: false,
          authorId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
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
      await updateDoc(doc(db, "lists", id, "items", item.id), {
        purchased: !item.purchased,
        updatedAt: serverTimestamp()
      });
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

  const handleUndoDelete = async () => {
    if (!lastDeletedItem || !user) return;
    try {
      await addDoc(collection(db, "lists", id, "items"), {
        ...lastDeletedItem,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
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

  const totalValue = items.reduce((acc, item) => acc + (item.price || 0), 0);
  const purchasedValue = items.filter(i => i.purchased).reduce((acc, item) => acc + (item.price || 0), 0);
  const unpurchasedValue = items.filter(i => !i.purchased).reduce((acc, item) => acc + (item.price || 0), 0);

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

          <span className="hidden sm:flex items-center gap-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-100">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
            <span>Sincronizado</span>
          </span>
        </div>
      </header>

      {/* Main Content Bento Grid */}
      <div className="grid grid-cols-12 gap-4 flex-grow min-h-0">
        
        {/* Active Shopping List */}
        <div className="col-span-12 lg:col-span-8 bg-white rounded-3xl shadow-sm border border-slate-100 p-4 sm:p-6 flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-6 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-800">Itens</h2>
                {items.some(i => i.price > 0) && (
                  <button 
                    onClick={() => setIsClearPricesConfirmOpen(true)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Limpar todos os preços"
                  >
                    <Eraser size={16} />
                  </button>
                )}
              </div>
              <p className="text-sm font-medium text-slate-400">
                {items.filter(i => i.purchased).length} de {items.length} itens comprados
              </p>
            </div>
            
            <Dialog.Root open={isAddItemOpen} onOpenChange={(open) => {
              if (!open) handleCloseForm();
              else setIsAddItemOpen(true);
            }}>
              <Dialog.Trigger asChild>
                <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 transition-colors">
                  + Novo Item
                </button>
              </Dialog.Trigger>
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
                              </Select.Viewport>
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </div>
                      <div className="flex-1">
                        <label className="text-sm font-bold text-slate-600">Valor Total (R$) <span className="font-medium text-slate-400 opacity-80">(Op)</span></label>
                        <input 
                          type="text"
                          value={newItemPrice}
                          onChange={e => setNewItemPrice(formatCurrency(e.target.value))}
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
          </div>

          <div className="space-y-4 overflow-y-auto pr-2 pb-4 flex-1">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 border-2 border-dashed border-slate-100 rounded-3xl">
                <Package className="w-12 h-12 mb-4 text-slate-300" />
                <p className="font-medium">Nenhum produto adicionado</p>
              </div>
            ) : (
              activeCategories.map(category => {
                const catItems = items.filter(i => i.category === category);
                if (catItems.length === 0) return null;

                return (
                  <div key={category} className="space-y-3">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-2 mb-2">{category}</h3>
                    <div className="space-y-2">
                      {catItems.map(item => (
                        <div 
                          key={item.id} 
                          onMouseEnter={() => setSelfActivity(item.id, 'viewing')}
                          onMouseLeave={() => setSelfActivity(null, 'viewing')}
                          className={`group relative flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border transition-all ${
                            item.purchased 
                              ? "border-slate-100 bg-slate-50/50 opacity-60 line-through" 
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

                          <input 
                            type="checkbox"
                            checked={item.purchased}
                            onChange={() => handleTogglePurchase(item)}
                            className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0 cursor-pointer"
                          />
                          
                          <div className="flex-grow min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{item.name}</p>
                            <p className="text-xs font-medium text-slate-500">
                              {item.quantity} {item.unit}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="font-bold text-slate-800">
                              {item.price > 0 ? `R$ ${item.price.toFixed(2).replace('.', ',')}` : '-'}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <button 
                              onClick={() => handleOpenEdit(item)}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-xl transition-colors focus:outline-none shrink-0"
                              title="Editar"
                            >
                              <Pencil size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteItem(item)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded-xl transition-colors focus:outline-none shrink-0"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Sidebar Data - Hidden on Mobile */}
        <div className="hidden lg:flex col-span-4 flex-col gap-4 overflow-y-auto min-h-0">
          
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
              {items.filter(i => i.purchased).slice(0, 3).map(item => (
                <div key={item.id} className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <span className="text-sm font-semibold text-slate-600 truncate mr-2">{item.name}</span>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-2 py-1 rounded-md shrink-0">R$ {item.price.toFixed(2)}</span>
                </div>
              ))}
              {items.filter(i => i.purchased).length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-2">Nenhum item comprado.</p>
              )}
            </div>
          </div>

          {/* Collaborators / Sharing */}
          <div className="bg-amber-50 rounded-3xl border border-amber-100 p-6 shrink-0">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-amber-800 uppercase tracking-widest">Membros</h3>
              <Dialog.Root open={isShareOpen} onOpenChange={setIsShareOpen}>
                <Dialog.Trigger asChild>
                  <button className="bg-amber-200 hover:bg-amber-300 text-amber-900 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm">
                    + Convidar
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                  <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-100 bg-white p-6 shadow-2xl duration-200 sm:rounded-3xl">
                    <Dialog.Title className="text-xl font-bold text-slate-800">Compartilhar Lista</Dialog.Title>
                    <Dialog.Description className="text-sm font-medium text-slate-500">
                      Adicione o e-mail (Conta Google) de quem você quer convidar.
                    </Dialog.Description>
                    <form onSubmit={handleShare} className="flex flex-col gap-4 mt-2">
                      <div>
                        <label className="text-sm font-bold text-slate-600">E-mail</label>
                        <input 
                          type="email" required value={shareEmail} onChange={e => setShareEmail(e.target.value)}
                          className="mt-1 w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                          placeholder="email@gmail.com" 
                        />
                      </div>
                      <div className="mt-4 flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <Dialog.Close asChild>
                          <button type="button" className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                        </Dialog.Close>
                        <button type="submit" className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-100 transition-colors">Adicionar</button>
                      </div>
                    </form>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
            
            <div className="space-y-3">
              {list.members.map(m => (
                <div key={m} className="flex items-center gap-3 bg-white/50 border border-amber-100 p-2.5 rounded-2xl shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-amber-200 border-2 border-amber-50 flex items-center justify-center font-bold text-amber-800 text-xs shrink-0">
                    {m.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-sm truncate min-w-0 flex-1">
                    <p className="font-bold text-amber-900 truncate">{m}</p>
                    <p className="text-xs text-amber-700/70 font-medium">{m === list.ownerId ? 'Proprietário' : 'Convidado'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                <span className="text-lg font-black leading-none mt-1 text-emerald-400">R$ {totalValue.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
