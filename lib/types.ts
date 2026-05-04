import { Timestamp } from "firebase/firestore";

export interface ShoppingList {
  id: string; // Document ID
  name: string;
  ownerId: string;
  members: string[]; // List of user.uid who have access
  categories: string[];
  budget?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type UnitType = 'pacote' | 'caixa' | 'unidade';

export interface ShoppingItem {
  id: string; // Document ID
  name: string;
  quantity: number;
  unit: UnitType;
  category: string;
  price: number;
  purchased: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  authorId: string;
}
