"use client";

import { useAuth } from "@/hooks/use-auth";
import { LogIn, Plus, Trash2, Users, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc, Timestamp, updateDoc } from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "@/lib/firebase";
import { ShoppingList } from "@/lib/types";
import Link from "next/link";
import * as Dialog from '@radix-ui/react-dialog';

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

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;

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
    setIsEditModalOpen(true);
  };

  const handleUpdateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!listToEdit || !editListName.trim()) return;

    try {
      await updateDoc(doc(db, "lists", listToEdit.id), {
        name: editListName.trim(),
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
            <div key={list.id} className="bg-white rounded-3xl shadow-sm border border-slate-100 p-5 flex flex-col group hover:border-indigo-200 transition-all">
              <Link href={`/lists/${list.id}`} className="flex-1 mb-4">
                <h2 className="text-lg font-bold text-slate-800 mb-3 truncate group-hover:text-indigo-600 transition-colors">
                  {list.name}
                </h2>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider">
                    <Users size={12} />
                    {list.members.length} {list.members.length === 1 ? 'Membro' : 'Membros'}
                  </span>
                </div>
              </Link>
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
                <span className="text-[10px] text-slate-400 font-medium">
                  {list.updatedAt ? new Intl.DateTimeFormat('pt-BR').format(list.updatedAt.toDate()) : ''}
                </span>
                <div className="flex gap-1 items-center">
                  {list.ownerId === user.uid && (
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        handleOpenEditModal(list);
                      }}
                      className="text-slate-300 hover:text-indigo-600 transition-colors p-1"
                      title="Editar nome"
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  {list.ownerId === user.uid && (
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        handleDeleteList(list);
                      }}
                      className="text-slate-300 hover:text-red-500 transition-colors p-1"
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
    </div>
  );
}
