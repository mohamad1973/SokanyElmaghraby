"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  CART_STORAGE_KEY,
  getMaxOrderQuantity,
  parseCartItems,
  type CartItem,
} from "@/lib/cart";

type AddToCartInput = Omit<CartItem, "qty"> & { qty?: number };

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  addItem: (input: AddToCartInput) => { ok: boolean; message?: string };
  updateQty: (productId: number, qty: number) => void;
  removeItem: (productId: number) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function clampQty(item: Pick<CartItem, "stockStatus" | "stockQuantity">, qty: number) {
  const max = getMaxOrderQuantity(item);
  if (max < 1) {
    return 0;
  }

  return Math.min(max, Math.max(1, Math.floor(qty)));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      setItems(parseCartItems(parsed));
    } catch {
      setItems([]);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [hydrated, items]);

  const addItem = useCallback((input: AddToCartInput) => {
    const addQty = Math.max(1, Math.floor(input.qty ?? 1));
    const max = getMaxOrderQuantity(input);

    if (max < 1 || input.stockStatus === "outofstock") {
      return { ok: false, message: "المنتج غير متوفر حالياً" };
    }

    let result: { ok: boolean; message?: string } = { ok: true };

    setItems((current) => {
      const existing = current.find((item) => item.id === input.id);
      const desired = (existing?.qty ?? 0) + addQty;
      const nextQty = clampQty(input, desired);

      if (nextQty < 1) {
        result = { ok: false, message: "المنتج غير متوفر حالياً" };
        return current;
      }

      if (desired > max) {
        result = { ok: true, message: `الحد الأقصى المتاح ${max} قطعة` };
      }

      const nextItem: CartItem = {
        id: input.id,
        slug: input.slug,
        name: input.name,
        price: input.price,
        image: input.image,
        qty: nextQty,
        stockStatus: input.stockStatus,
        stockQuantity: input.stockQuantity,
      };

      if (existing) {
        return current.map((item) => (item.id === input.id ? nextItem : item));
      }

      return [...current, nextItem];
    });

    return result;
  }, []);

  const updateQty = useCallback((productId: number, qty: number) => {
    setItems((current) =>
      current
        .map((item) => {
          if (item.id !== productId) {
            return item;
          }

          const nextQty = clampQty(item, qty);
          if (nextQty < 1) {
            return null;
          }

          return { ...item, qty: nextQty };
        })
        .filter((item): item is CartItem => Boolean(item)),
    );
  }, []);

  const removeItem = useCallback((productId: number) => {
    setItems((current) => current.filter((item) => item.id !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      itemCount: items.reduce((sum, item) => sum + item.qty, 0),
      addItem,
      updateQty,
      removeItem,
      clearCart,
    }),
    [items, addItem, updateQty, removeItem, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }

  return context;
}
