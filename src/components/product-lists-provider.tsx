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
  COMPARE_MAX,
  COMPARE_STORAGE_KEY,
  mergeWishlistEntries,
  parseStoredEntries,
  type ProductListEntry,
  WISHLIST_STORAGE_KEY,
} from "@/lib/product-lists";

import { CompareReplaceModal } from "./compare-replace-modal";

type ProductListsContextValue = {
  wishlist: ProductListEntry[];
  compareList: ProductListEntry[];
  isWishlisted: (productId: number) => boolean;
  isInCompare: (productId: number) => boolean;
  getCompareOrder: (productId: number) => number | null;
  toggleWishlist: (entry: ProductListEntry) => void;
  removeFromWishlist: (productId: number) => void;
  toggleCompare: (entry: ProductListEntry) => void;
  removeFromCompare: (productId: number) => void;
  clearCompare: () => void;
  replaceCompareProduct: (replaceId: number, entry: ProductListEntry) => void;
};

const ProductListsContext = createContext<ProductListsContextValue | null>(null);

async function fetchServerWishlist(): Promise<ProductListEntry[]> {
  try {
    const response = await fetch("/api/account/wishlist", { cache: "no-store" });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { entries?: ProductListEntry[] };

    return Array.isArray(payload.entries) ? payload.entries : [];
  } catch {
    return [];
  }
}

async function saveServerWishlist(entries: ProductListEntry[]) {
  try {
    await fetch("/api/account/wishlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
  } catch {
    // Ignore sync errors for guests or offline users.
  }
}

export function ProductListsProvider({ children }: { children: ReactNode }) {
  const [wishlist, setWishlist] = useState<ProductListEntry[]>([]);
  const [compareList, setCompareList] = useState<ProductListEntry[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [pendingReplaceEntry, setPendingReplaceEntry] = useState<ProductListEntry | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const storedWishlist = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
    const storedCompare = window.localStorage.getItem(COMPARE_STORAGE_KEY);

    setWishlist(parseStoredEntries(storedWishlist));
    setCompareList(parseStoredEntries(storedCompare));
    setIsHydrated(true);

    fetch("/api/account/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        setIsLoggedIn(true);
        const serverEntries = await fetchServerWishlist();

        setWishlist((currentWishlist) => {
          const merged = mergeWishlistEntries(currentWishlist, serverEntries);
          window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(merged));
          void saveServerWishlist(merged);

          return merged;
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));

    if (isLoggedIn) {
      void saveServerWishlist(wishlist);
    }
  }, [wishlist, isHydrated, isLoggedIn]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(compareList));
  }, [compareList, isHydrated]);

  const isWishlisted = useCallback(
    (productId: number) => wishlist.some((entry) => entry.id === productId),
    [wishlist],
  );

  const isInCompare = useCallback(
    (productId: number) => compareList.some((entry) => entry.id === productId),
    [compareList],
  );

  const getCompareOrder = useCallback(
    (productId: number) => {
      const index = compareList.findIndex((entry) => entry.id === productId);

      return index === -1 ? null : index + 1;
    },
    [compareList],
  );

  const toggleWishlist = useCallback((entry: ProductListEntry) => {
    setWishlist((currentWishlist) => {
      const exists = currentWishlist.some((item) => item.id === entry.id);

      if (exists) {
        return currentWishlist.filter((item) => item.id !== entry.id);
      }

      return [...currentWishlist, entry];
    });
  }, []);

  const removeFromWishlist = useCallback((productId: number) => {
    setWishlist((currentWishlist) => currentWishlist.filter((item) => item.id !== productId));
  }, []);

  const removeFromCompare = useCallback((productId: number) => {
    setCompareList((currentCompareList) => currentCompareList.filter((item) => item.id !== productId));
  }, []);

  const clearCompare = useCallback(() => {
    setCompareList([]);
  }, []);

  const replaceCompareProduct = useCallback((replaceId: number, entry: ProductListEntry) => {
    setCompareList((currentCompareList) =>
      currentCompareList.map((item) => (item.id === replaceId ? entry : item)),
    );
    setPendingReplaceEntry(null);
  }, []);

  const toggleCompare = useCallback((entry: ProductListEntry) => {
    setCompareList((currentCompareList) => {
      const exists = currentCompareList.some((item) => item.id === entry.id);

      if (exists) {
        return currentCompareList.filter((item) => item.id !== entry.id);
      }

      if (currentCompareList.length >= COMPARE_MAX) {
        setPendingReplaceEntry(entry);
        return currentCompareList;
      }

      return [...currentCompareList, entry];
    });
  }, []);

  const value = useMemo(
    () => ({
      wishlist,
      compareList,
      isWishlisted,
      isInCompare,
      getCompareOrder,
      toggleWishlist,
      removeFromWishlist,
      toggleCompare,
      removeFromCompare,
      clearCompare,
      replaceCompareProduct,
    }),
    [
      wishlist,
      compareList,
      isWishlisted,
      isInCompare,
      getCompareOrder,
      toggleWishlist,
      removeFromWishlist,
      toggleCompare,
      removeFromCompare,
      clearCompare,
      replaceCompareProduct,
    ],
  );

  return (
    <ProductListsContext.Provider value={value}>
      {children}
      <CompareReplaceModal
        isOpen={Boolean(pendingReplaceEntry)}
        compareList={compareList}
        pendingEntry={pendingReplaceEntry}
        onClose={() => setPendingReplaceEntry(null)}
        onReplace={(replaceId) => {
          if (pendingReplaceEntry) {
            replaceCompareProduct(replaceId, pendingReplaceEntry);
          }
        }}
      />
    </ProductListsContext.Provider>
  );
}

export function useProductLists() {
  const context = useContext(ProductListsContext);

  if (!context) {
    throw new Error("useProductLists must be used within ProductListsProvider");
  }

  return context;
}
