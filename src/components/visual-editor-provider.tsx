"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { ThemeSettings, VisualTextAlign, VisualTextDeviceStyle, VisualTextStyle } from "@/lib/theme-settings";

type VisualEditorDevice = "mobile" | "desktop";

type VisualEditorContextValue = {
  isAdmin: boolean;
  editMode: boolean;
  device: VisualEditorDevice;
  selectedKey: string | null;
  styles: Record<string, VisualTextStyle>;
  content: Record<string, string>;
  setEditMode: (value: boolean) => void;
  selectText: (key: string) => void;
  updateStyle: (key: string, style: VisualTextStyle) => void;
  moveText: (key: string, deltaX: number, deltaY: number, device?: VisualEditorDevice) => void;
  setTextAlign: (key: string, align: VisualTextAlign, device?: VisualEditorDevice) => void;
  updateContent: (key: string, value: string) => void;
  resetSelected: () => void;
  save: () => Promise<void>;
  status: string;
  isSaving: boolean;
};

const defaultDeviceStyle: VisualTextDeviceStyle = {
  x: 0,
  y: 0,
  fontSizeDelta: 0,
  align: "inherit",
};

const VisualEditorContext = createContext<VisualEditorContextValue | null>(null);

export function useVisualEditor() {
  return useContext(VisualEditorContext);
}

function normalizeDeviceStyle(style: Partial<VisualTextDeviceStyle> | undefined, fallback: VisualTextDeviceStyle) {
  return {
    x: typeof style?.x === "number" ? style.x : fallback.x,
    y: typeof style?.y === "number" ? style.y : fallback.y,
    fontSizeDelta: typeof style?.fontSizeDelta === "number" ? style.fontSizeDelta : fallback.fontSizeDelta,
    align: ["right", "center", "left", "inherit"].includes(style?.align || "")
      ? style?.align || fallback.align
      : fallback.align,
  };
}

export function getVisualTextStyle(style?: VisualTextStyle) {
  const legacyStyle = normalizeDeviceStyle(style, defaultDeviceStyle);

  return {
    desktop: normalizeDeviceStyle(style?.desktop, legacyStyle),
    mobile: normalizeDeviceStyle(style?.mobile, legacyStyle),
  };
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
  const [device, setDevice] = useState<VisualEditorDevice>("desktop");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [styles, setStyles] = useState(settings.visualTextStyles || {});
  const [content, setContent] = useState(settings.visualTextContent || {});
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasPendingChangesRef = useRef(false);
  const visualEditorEnabled = settings.visualEditor.enabled;

  useEffect(() => {
    function updateDevice() {
      setDevice(window.matchMedia("(min-width: 640px)").matches ? "desktop" : "mobile");
    }

    updateDevice();
    window.addEventListener("resize", updateDevice);

    return () => window.removeEventListener("resize", updateDevice);
  }, []);

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

  const moveText = useCallback((key: string, deltaX: number, deltaY: number, targetDevice?: VisualEditorDevice) => {
    const activeDevice = targetDevice || device;

    setStyles((currentStyles) => {
      const currentStyle = getVisualTextStyle(currentStyles[key]);
      const currentDeviceStyle = currentStyle[activeDevice];

      return {
        ...currentStyles,
        [key]: {
          ...currentStyles[key],
          [activeDevice]: {
            ...currentDeviceStyle,
            x: currentDeviceStyle.x + deltaX,
            y: currentDeviceStyle.y + deltaY,
          },
        },
      };
    });
    hasPendingChangesRef.current = true;
  }, [device]);

  const setTextAlign = useCallback((key: string, align: VisualTextAlign, targetDevice?: VisualEditorDevice) => {
    const activeDevice = targetDevice || device;

    setStyles((currentStyles) => {
      const currentStyle = getVisualTextStyle(currentStyles[key]);

      return {
        ...currentStyles,
        [key]: {
          ...currentStyles[key],
          [activeDevice]: {
            ...currentStyle[activeDevice],
            align,
          },
        },
      };
    });
    hasPendingChangesRef.current = true;
  }, [device]);

  const resetSelected = useCallback(() => {
    if (!selectedKey) {
      return;
    }

    updateStyle(selectedKey, {
      desktop: defaultDeviceStyle,
      mobile: defaultDeviceStyle,
    });
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
        const currentDeviceStyle = currentStyle[device];
        const step = event.shiftKey ? 10 : 2;

        if (event.ctrlKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          return {
            ...currentStyles,
            [activeKey]: {
              ...currentStyles[activeKey],
              [device]: {
                ...currentDeviceStyle,
                fontSizeDelta: currentDeviceStyle.fontSizeDelta + (event.key === "ArrowUp" ? 1 : -1),
              },
            },
          };
        }

        const nextStyle = {
          ...currentDeviceStyle,
          x: currentDeviceStyle.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
          y: currentDeviceStyle.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0),
        };

        return {
          ...currentStyles,
          [activeKey]: {
            ...currentStyles[activeKey],
            [device]: nextStyle,
          },
        };
      });
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [device, editMode, selectedKey]);

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
      device,
      selectedKey,
      styles,
      content,
      setEditMode,
      selectText,
      updateStyle,
      moveText,
      setTextAlign,
      updateContent,
      resetSelected,
      save,
      status,
      isSaving,
    }),
    [content, device, editMode, isAdmin, isSaving, moveText, resetSelected, save, selectText, selectedKey, setTextAlign, status, styles, updateContent, updateStyle],
  );

  return <VisualEditorContext.Provider value={value}>{children}</VisualEditorContext.Provider>;
}
