"use client";

import { useAuth } from "@/hooks/use-auth";
import { LogIn, Plus, Trash2, Users, Pencil, BarChart2, TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, Timestamp, updateDoc } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/lib/firebase";
import { ShoppingList } from "@/lib/types";
import Link from "next/link";
import * as Dialog from '@radix-ui/react-dialog';
import { LoadingScreen } from "@/components/loading-screen";

export default function Home() {
  const { user, loading, signIn, signOut } = useAuth();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [newListName, setNewListName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Delete states
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [listToDelete, setListToDelete] = useState<ShoppingList | null>(null);

  // Edit states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [listToEdit, setListToEdit] = useState<ShoppingList | null>(null);
  const [editListName, setEditListName] = useState("");
  const [editListMonth, setEditListMonth] = useState("");

  // Report states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    const q = query(
      collection(db, "lists"),
      where("members", "array-contains", user.email || "")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const listsData: ShoppingList[] = [];
      snapshot.forEach((doc) => {
        listsData.push({ id: doc.id, ...doc.data() } as ShoppingList);
      });
      // Sort client side because we don't have composite indexes created automatically
      listsData.sort((a, b) => b.updatedAt?.toMillis() - a.updatedAt?.toMillis());
      setLists(listsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "lists");
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="bg-indigo-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <Users className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Lista de Compras</h1>
          <p className="text-gray-500">Crie, compartilhe e acompanhe suas compras de supermercado em tempo real com sua família.</p>
          <button 
            onClick={signIn}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-xl shadow-lg shadow-indigo-100 transition-colors font-bold tracking-tight"
          >
            <LogIn size={20} />
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      await addDoc(collection(db, "lists"), {
        name: newListName.trim(),
        ownerId: user.uid,
        members: [user.email || ""],
        categories: ["Alimentação", "Limpeza", "Higiene", "Outros"],
        month: new Date().toISOString().slice(0, 7), // Default to current month YYYY-MM
        totalValue: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewListName("");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, "lists");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteList = (list: ShoppingList) => {
    setListToDelete(list);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!listToDelete) return;
    try {
      await deleteDoc(doc(db, "lists", listToDelete.id));
      setIsDeleteConfirmOpen(false);
      setListToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `lists/${listToDelete.id}`);
    }
  };

  const handleOpenEditModal = (list: ShoppingList) => {
    setListToEdit(list);
    setEditListName(list.name);
    setEditListMonth(list.month || new Date().toISOString().slice(0, 7));
    setIsEditModalOpen(true);
  };

  const handleUpdateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listToEdit || !editListName.trim()) return;

    try {
      await updateDoc(doc(db, "lists", listToEdit.id), {
        name: editListName.trim(),
        month: editListMonth,
        updatedAt: serverTimestamp(),
      });
      setIsEditModalOpen(false);
      setListToEdit(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lists/${listToEdit.id}`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Users size={24} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800">Minhas Listas</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600 font-bold bg-white px-4 py-2 rounded-full border border-slate-100 shadow-sm">
            {user.displayName}
          </div>
          <button 
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-4 py-2 rounded-xl transition-all font-bold text-sm shadow-sm border border-indigo-100"
          >
            <BarChart2 size={18} />
            Relatórios
          </button>
          <button 
            onClick={signOut}
            className="text-sm text-slate-500 hover:text-slate-900 font-medium transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      <form onSubmit={handleCreateList} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex gap-4 mb-8">
        <input 
          type="text" 
          value={newListName}
          onChange={e => setNewListName(e.target.value)}
          placeholder="Nome da nova lista (ex: Compras do Mês)" 
          className="flex-1 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
        />
        <button 
          type="submit"
          disabled={!newListName.trim() || isCreating}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-100"
        >
          <Plus size={20} />
          <span className="hidden sm:inline">Criar</span>
        </button>
      </form>

      {lists.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Nenhuma lista encontrada.</p>
          <p className="text-slate-400 text-sm">Crie uma nova lista para começar.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lists.map(list => (
            <div key={list.id} className="relative bg-white rounded-3xl shadow-sm border border-slate-100 p-5 flex flex-col group hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-50/50 transition-all duration-300">
              <Link href={`/lists/${list.id}`} className="absolute inset-0 z-0 rounded-3xl" aria-label={`Ver lista ${list.name}`} />
              
              <div className="relative z-10 pointer-events-none flex-1 mb-4">
                <h2 className="text-lg font-bold text-slate-800 mb-3 truncate group-hover:text-indigo-600 transition-colors">
                  {list.name}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">
                    <Users size={12} />
                    {list.members.length} {list.members.length === 1 ? 'Membro' : 'Membros'}
                  </span>
                  {list.month && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-wider">
                      <Calendar size={12} />
                      {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(list.month + "-02"))}
                    </span>
                  )}
                </div>
                {list.totalValue !== undefined && list.totalValue > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-50">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Gasto Total</span>
                    <span className="text-2xl font-black text-slate-800 tracking-tight">R$ {list.totalValue.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
              </div>

              <div className="relative z-10 pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
                <span className="text-[10px] text-slate-400 font-medium">
                  {list.updatedAt ? new Intl.DateTimeFormat('pt-BR').format(list.updatedAt.toDate()) : ''}
                </span>
                <div className="flex gap-1 items-center relative z-20">
                  {list.ownerId === user.uid && (
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleOpenEditModal(list);
                      }}
                      className="text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all p-2 rounded-xl"
                      title="Editar nome"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  {list.ownerId === user.uid && (
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteList(list);
                      }}
                      className="text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all p-2 rounded-xl"
                      title="Excluir lista"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit List Modal */}
      <Dialog.Root open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-sm:w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-6 border border-slate-100 bg-white p-8 shadow-2xl duration-200 rounded-3xl outline-none">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4 text-indigo-500">
                <Pencil size={28} />
              </div>
              <Dialog.Title className="text-xl font-bold text-slate-800 mb-2">Editar Nome</Dialog.Title>
              <Dialog.Description className="text-slate-500 font-medium mb-4 text-center">
                Atualize o nome da sua lista de compras.
              </Dialog.Description>
              
              <form onSubmit={handleUpdateList} className="w-full space-y-4">
                <input 
                  type="text" 
                  autoFocus
                  required
                  value={editListName}
                  onChange={e => setEditListName(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                />
                
                <div className="w-full">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block text-left">Mês de Referência</label>
                  <input 
                    type="month" 
                    required
                    value={editListMonth}
                    onChange={e => setEditListMonth(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <Dialog.Close asChild>
                    <button type="button" className="flex-1 px-5 py-3 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-2xl transition-colors">
                      Cancelar
                    </button>
                  </Dialog.Close>
                  <button 
                    type="submit"
                    disabled={!editListName.trim()}
                    className="flex-1 px-5 py-3 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 rounded-2xl shadow-lg shadow-indigo-100 transition-colors"
                  >
                    Salvar
                  </button>
                </div>
              </form>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation Modal */}
      <Dialog.Root open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-full max-sm:w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] gap-6 border border-slate-100 bg-white p-8 shadow-2xl duration-200 rounded-3xl outline-none">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4 text-red-500">
                <Trash2 size={28} />
              </div>
              <Dialog.Title className="text-xl font-bold text-slate-800 mb-2">Excluir Lista?</Dialog.Title>
              <Dialog.Description className="text-slate-500 font-medium">
                Tem certeza que deseja excluir a lista <span className="text-slate-800 font-bold">&quot;{listToDelete?.name}&quot;</span>? Todos os itens internos serão perdidos.
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

      {/* Reports Modal */}
      <Dialog.Root open={isReportModalOpen} onOpenChange={setIsReportModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] border border-slate-100 bg-white shadow-2xl duration-200 rounded-[2.5rem] outline-none max-h-[90vh] flex flex-col overflow-hidden p-4">
            <div className="p-4 sm:p-6 pb-0 shrink-0">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-100 p-2.5 rounded-2xl text-indigo-600">
                    <BarChart2 size={24} />
                  </div>
                  <div>
                    <Dialog.Title className="text-xl font-bold text-slate-800">Relatório de Gastos</Dialog.Title>
                    <Dialog.Description className="text-slate-500 font-medium text-sm">
                      Acompanhamento mensal de suas compras.
                    </Dialog.Description>
                  </div>
                </div>
                <Dialog.Close className="p-2 hover:bg-slate-50 rounded-xl transition-colors">
                  <Plus className="rotate-45 text-slate-400" size={24} />
                </Dialog.Close>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6">
              <div className="p-4 sm:p-6 pt-2 space-y-6">
              {/* Calculate monthly aggregated data */}
              {(() => {
                const monthlyGroups: Record<string, ShoppingList[]> = {};
                lists.forEach(list => {
                  const m = list.month || list.updatedAt?.toDate().toISOString().slice(0, 7) || new Date().toISOString().slice(0, 7);
                  if (!monthlyGroups[m]) monthlyGroups[m] = [];
                  monthlyGroups[m].push(list);
                });

                const sortedMonths = Object.keys(monthlyGroups).sort().reverse();

                if (sortedMonths.length === 0) {
                  return (
                    <div className="text-center py-12 text-slate-400 font-medium">
                      Dados insuficientes para gerar relatório.
                    </div>
                  );
                }

                return (
                  <div className="grid gap-6">
                    {sortedMonths.map((m, idx) => {
                      const monthLists = monthlyGroups[m];
                      const total = monthLists.reduce((sum, l) => sum + (l.totalValue || 0), 0);
                      
                      const prevMonth = sortedMonths[idx + 1];
                      const prevTotal = prevMonth 
                        ? monthlyGroups[prevMonth].reduce((sum, l) => sum + (l.totalValue || 0), 0) 
                        : null;
                      
                      const diff = prevTotal !== null ? total - prevTotal : 0;
                      const percent = prevTotal ? (diff / prevTotal) * 100 : 0;

                      return (
                        <div key={m} className="bg-slate-50 border border-slate-100 rounded-[2.5rem] p-6 space-y-6 transition-all duration-300">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center shadow-sm">
                                <span className="text-[10px] font-black text-slate-400 uppercase leading-none">
                                  {new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(m + "-02")).replace('.', '')}
                                </span>
                                <span className="text-xs font-bold text-indigo-600 leading-none mt-1">
                                  {m.split('-')[0]}
                                </span>
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-1">Total do Mês</h4>
                                <p className="text-2xl font-black text-slate-800 tracking-tight">
                                  R$ {total.toFixed(2).replace('.', ',')}
                                </p>
                              </div>
                            </div>

                            {prevTotal !== null && (
                              <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border ${
                                diff > 0 
                                  ? "bg-red-50 border-red-100 text-red-600" 
                                  : "bg-emerald-50 border-emerald-100 text-emerald-600"
                              }`}>
                                {diff > 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black uppercase tracking-wider leading-none">
                                    {diff > 0 ? "Aumento" : "Economia"}
                                  </span>
                                  <span className="text-sm font-bold leading-none mt-1">
                                    {percent.toFixed(1).replace('.', ',')}% (R$ {Math.abs(diff).toFixed(2).replace('.', ',')})
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="space-y-4">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 mb-3">Distribuição por Categoria</h5>
                            
                            {(() => {
                              const aggregatedCatTotals: Record<string, number> = {};
                              monthLists.forEach(l => {
                                if (l.categoryTotals) {
                                  Object.entries(l.categoryTotals).forEach(([cat, val]) => {
                                    aggregatedCatTotals[cat] = (aggregatedCatTotals[cat] || 0) + val;
                                  });
                                }
                              });

                              const categories = Object.entries(aggregatedCatTotals).sort((a, b) => b[1] - a[1]);
                              const totalMonthValue = categories.reduce((sum, [_, val]) => sum + val, 0);

                              if (totalMonthValue === 0) return <p className="text-xs text-slate-400 px-2 italic">Nenhum gasto registrado com preço.</p>;

                              const colors = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"];
                              
                              let currentPercent = 0;
                              const gradientParts = categories.map(([cat, val], idx) => {
                                const percent = (val / totalMonthValue) * 100;
                                const start = currentPercent;
                                currentPercent += percent;
                                return `${colors[idx % colors.length]} ${start}% ${currentPercent}%`;
                              });

                              return (
                                <div className="flex flex-col md:flex-row items-center gap-8 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                                  {/* Pie Chart */}
                                  <div 
                                    className="w-32 h-32 rounded-full shrink-0 shadow-inner relative"
                                    style={{ 
                                      background: `conic-gradient(${gradientParts.join(', ')})`,
                                    }}
                                  >
                                    <div className="absolute inset-4 bg-white rounded-full shadow-sm flex items-center justify-center">
                                      <BarChart2 size={24} className="text-slate-100" />
                                    </div>
                                  </div>

                                  {/* Legend */}
                                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 w-full">
                                    {categories.map(([cat, val], idx) => (
                                      <div key={cat} className="flex items-center justify-between gap-3 group">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }} />
                                          <span className="text-xs font-bold text-slate-600 truncate">{cat}</span>
                                        </div>
                                        <div className="text-right">
                                          <span className="text-xs font-black text-slate-800">
                                            {((val / totalMonthValue) * 100).toFixed(0)}%
                                          </span>
                                          <span className="text-[10px] font-bold text-slate-400 block -mt-0.5">
                                            R$ {val.toFixed(2).replace('.', ',')}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          <div className="space-y-2">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 mb-3">Listas do Período</h5>
                            {monthLists.map(list => (
                              <div key={list.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-100 shadow-sm group hover:border-indigo-100 transition-colors">
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-700 truncate">{list.name}</p>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                    {list.updatedAt ? new Intl.DateTimeFormat('pt-BR').format(list.updatedAt.toDate()) : ''}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-black text-slate-800">
                                    R$ {(list.totalValue || 0).toFixed(2).replace('.', ',')}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div className="mt-4 p-5 bg-indigo-50/50 rounded-[2rem] border border-indigo-100/50">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                    <Calendar className="text-indigo-600" size={16} />
                  </div>
                  <p className="text-xs text-indigo-700/80 font-medium leading-relaxed">
                    Os relatórios são baseados no **Mês de Referência** configurado em cada lista. Para organizar suas compras antigas, edite a lista e ajuste o mês corretamente.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
