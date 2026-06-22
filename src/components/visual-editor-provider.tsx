"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { ThemeSettings, VisualTextStyle } from "@/lib/theme-settings";

type VisualEditorContextValue = {
  isAdmin: boolean;
  editMode: boolean;
  selectedKey: string | null;
  styles: Record<string, VisualTextStyle>;
  content: Record<string, string>;
  setEditMode: (value: boolean) => void;
  selectText: (key: string) => void;
  updateStyle: (key: string, style: VisualTextStyle) => void;
  updateContent: (key: string, value: string) => void;
  resetSelected: () => void;
  save: () => Promise<void>;
  status: string;
  isSaving: boolean;
};

const defaultStyle: VisualTextStyle = {
  x: 0,
  y: 0,
  fontSizeDelta: 0,
};

const VisualEditorContext = createContext<VisualEditorContextValue | null>(null);

export function useVisualEditor() {
  return useContext(VisualEditorContext);
}

export function getVisualTextStyle(style?: VisualTextStyle) {
  return style || defaultStyle;
}

export function VisualEditorProvider({
  children,
  settings,
}: {
  children: ReactNode;
  settings: ThemeSettings;
}) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [styles, setStyles] = useState(settings.visualTextStyles || {});
  const [content, setContent] = useState(settings.visualTextContent || {});
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasPendingChangesRef = useRef(false);
  const visualEditorEnabled = settings.visualEditor.enabled;

  useEffect(() => {
    let isMounted = true;

    async function checkAdminSession() {
      try {
        const response = await fetch("/api/admin/theme-settings", { cache: "no-store", credentials: "same-origin" });

        if (isMounted) {
          const canEdit = response.ok;
          setIsAdmin(canEdit);
          setEditMode(canEdit && visualEditorEnabled);

          if (!canEdit || !visualEditorEnabled) {
            setSelectedKey(null);
          }
        }
      } catch {
        if (isMounted) {
          setIsAdmin(false);
          setEditMode(false);
          setSelectedKey(null);
        }
      }
    }

    void checkAdminSession();

    return () => {
      isMounted = false;
    };
  }, [visualEditorEnabled]);

  const updateStyle = useCallback((key: string, style: VisualTextStyle) => {
    setStyles((currentStyles) => ({
      ...currentStyles,
      [key]: style,
    }));
    hasPendingChangesRef.current = true;
  }, []);

  const updateContent = useCallback((key: string, value: string) => {
    setContent((currentContent) => ({
      ...currentContent,
      [key]: value,
    }));
    hasPendingChangesRef.current = true;
  }, []);

  const selectText = useCallback((key: string) => {
    setSelectedKey(key);
  }, []);

  const resetSelected = useCallback(() => {
    if (!selectedKey) {
      return;
    }

    updateStyle(selectedKey, defaultStyle);
  }, [selectedKey, updateStyle]);

  const save = useCallback(async () => {
    setIsSaving(true);
    setStatus("");

    const response = await fetch("/api/admin/theme-settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...settings,
        visualTextStyles: styles,
        visualTextContent: content,
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      setStatus(payload?.message || "تعذر حفظ تعديلات النصوص.");
      return;
    }

    setStatus("تم حفظ تعديلات النصوص.");
  }, [content, settings, styles]);

  useEffect(() => {
    if (!editMode || !selectedKey) {
      return;
    }

    const activeKey = selectedKey;

    function handleKeyDown(event: KeyboardEvent) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      hasPendingChangesRef.current = true;

      setStyles((currentStyles) => {
        const currentStyle = getVisualTextStyle(currentStyles[activeKey]);
        const step = event.shiftKey ? 10 : 2;

        if (event.ctrlKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          return {
            ...currentStyles,
            [activeKey]: {
              ...currentStyle,
              fontSizeDelta: currentStyle.fontSizeDelta + (event.key === "ArrowUp" ? 1 : -1),
            },
          };
        }

        const nextStyle = {
          ...currentStyle,
          x: currentStyle.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
          y: currentStyle.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0),
        };

        return {
          ...currentStyles,
          [activeKey]: nextStyle,
        };
      });
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editMode, selectedKey]);

  useEffect(() => {
    if (!editMode || !isAdmin || !visualEditorEnabled || !hasPendingChangesRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      hasPendingChangesRef.current = false;
      void save();
    }, 900);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [content, editMode, isAdmin, save, styles, visualEditorEnabled]);

  const value = useMemo<VisualEditorContextValue>(
    () => ({
      isAdmin,
      editMode,
      selectedKey,
      styles,
      content,
      setEditMode,
      selectText,
      updateStyle,
      updateContent,
      resetSelected,
      save,
      status,
      isSaving,
    }),
    [content, editMode, isAdmin, isSaving, resetSelected, save, selectText, selectedKey, status, styles, updateContent, updateStyle],
  );

  return <VisualEditorContext.Provider value={value}>{children}</VisualEditorContext.Provider>;
}
