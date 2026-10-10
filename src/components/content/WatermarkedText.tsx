"use client";

import { useEffect, useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";

function isEditable(target: EventTarget | null) {
  const element = target instanceof Element ? target : null;
  return !!element?.closest("textarea, input, select, [contenteditable='true']");
}

function hitsProtected(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return !!element?.closest("[data-cu-protected]");
}

function selectionHitsProtected() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const range = selection.getRangeAt(0);
  return (
    hitsProtected(range.startContainer) ||
    hitsProtected(range.endContainer) ||
    hitsProtected(range.commonAncestorContainer)
  );
}

function clearClipboard(event: ClipboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.clipboardData?.setData("text/plain", "");
  event.clipboardData?.setData("text/html", "");
}

function onDocumentCopy(event: ClipboardEvent) {
  if (isEditable(event.target)) return;
  const inside = event.target instanceof Element && !!event.target.closest("[data-cu-protected]");
  if (!inside && !selectionHitsProtected()) return;
  clearClipboard(event);
}

function onDocumentSelectStart(event: Event) {
  if (isEditable(event.target)) return;
  if (event.target instanceof Element && event.target.closest("[data-cu-protected]")) {
    event.preventDefault();
  }
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (isEditable(event.target)) return;
  if (!document.querySelector("[data-cu-protected]")) return;
  const key = event.key.toLowerCase();
  const combo = (event.ctrlKey || event.metaKey) && (key === "c" || key === "x" || key === "a" || key === "insert");
  if (!combo) return;
  if (key === "a") {
    event.preventDefault();
    return;
  }
  const inside = event.target instanceof Element && !!event.target.closest("[data-cu-protected]");
  if (inside || selectionHitsProtected()) event.preventDefault();
}

let guards = 0;

function useCopyGuard() {
  useEffect(() => {
    if (guards === 0) {
      document.addEventListener("copy", onDocumentCopy, true);
      document.addEventListener("cut", onDocumentCopy, true);
      document.addEventListener("selectstart", onDocumentSelectStart, true);
      document.addEventListener("contextmenu", onDocumentSelectStart, true);
      document.addEventListener("dragstart", onDocumentSelectStart, true);
      document.addEventListener("keydown", onDocumentKeyDown, true);
    }
    guards += 1;
    return () => {
      guards -= 1;
      if (guards > 0) return;
      document.removeEventListener("copy", onDocumentCopy, true);
      document.removeEventListener("cut", onDocumentCopy, true);
      document.removeEventListener("selectstart", onDocumentSelectStart, true);
      document.removeEventListener("contextmenu", onDocumentSelectStart, true);
      document.removeEventListener("dragstart", onDocumentSelectStart, true);
      document.removeEventListener("keydown", onDocumentKeyDown, true);
    };
  }, []);
}

function blockEvent(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function WordCanvas({ word, tick }: { word: string; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const style = getComputedStyle(parent);
    const fontSize = parseFloat(style.fontSize) || 16;
    const font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    const rtl = /[\u0600-\u06FF\u0750-\u077F]/.test(word);
    ctx.font = font;
    const width = Math.max(1, Math.ceil(ctx.measureText(word).width) + 2);
    const height = Math.max(1, Math.ceil(fontSize * 1.55));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.font = font;
    ctx.fillStyle = style.color || "#111827";
    ctx.direction = rtl ? "rtl" : "ltr";
    ctx.textAlign = rtl ? "right" : "left";
    ctx.textBaseline = "middle";
    ctx.fillText(word, rtl ? width - 1 : 1, height / 2 + 0.5);
  }, [word, tick]);

  return <canvas ref={ref} aria-hidden="true" draggable={false} />;
}

/** Draws exam text as separate canvases so it is not selectable HTML text. */
export function WatermarkedText({ text }: { text: string }) {
  useCopyGuard();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [tick, setTick] = useState(0);
  const value = String(text ?? "");
  const rtl = /[\u0600-\u06FF\u0750-\u077F]/.test(value);
  const words = value.split(/\s+/).filter(Boolean);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const bump = () => setTick((n) => n + 1);
    const resize = new ResizeObserver(bump);
    resize.observe(wrap);
    const theme = new MutationObserver(bump);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    document.fonts?.ready.then(bump);
    return () => {
      resize.disconnect();
      theme.disconnect();
    };
  }, [value]);

  if (!words.length) return null;

  return (
    <span
      ref={wrapRef}
      data-cu-protected="1"
      dir={rtl ? "rtl" : "ltr"}
      className="cu-locked"
      onCopy={blockEvent}
      onCut={blockEvent}
      onContextMenu={blockEvent}
      onDragStart={blockEvent}
    >
      {words.map((word, index) => (
        <WordCanvas key={`${index}-${word}`} word={word} tick={tick} />
      ))}
    </span>
  );
}
