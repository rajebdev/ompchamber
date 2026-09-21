import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'preact/compat';
import { useRef as useRefBase } from 'preact/hooks';
import type { ComponentChildren, RefObject } from 'preact';
import type { CSSProperties, TargetedPointerEvent } from 'preact';
import { clamp, toPx, transfer } from '@/client/components/layout/desktop-layout/resizer/utils';

/**
 * Hand-rolled resizable panel group (the Preact-native replacement for
 * react-resizable-panels in this app's two horizontal layouts).
 *
 * Model: every Panel is a flex child sized by `flex: 0 1 auto` plus a px
 * width/height held in state; exactly one panel per group is the FILLER
 * (`filler` prop) and takes `flex: 1 1 0`, absorbing the remaining space. A
 * Separator drag transfers pixels between the two panels adjacent to it,
 * clamped by both neighbors' min/max constraints, and commits once per drag
 * through `onLayoutChanged(_, { isUserInteraction: true })`.
 *
 * The filler's `minSize` is a real CSS floor, which is what makes a shrinking
 * window push the resizable panels toward their own floors instead of
 * collapsing the filler to nothing (a zero flex basis absorbs no negative free
 * space). Once every panel sits at its floor the row is narrower than its
 * container and the surplus is clipped — the layout has no panel to give up.
 *
 * The imperative API mirrors what this app used from the old library:
 * `panelRef.resize(px)`, `panelRef.getSize() -> { inPixels }`, and the
 * group's `setLayout` as a batch px resize.
 */

export type GroupOrientation = 'horizontal' | 'vertical';

export interface LayoutMeta {
  isUserInteraction: boolean;
}

export interface PanelImperativeHandle {
  /** Set this panel's size in pixels (clamped to its min/max). */
  resize: (px: number) => void;
  /** Current rendered size in pixels, or null while unmounted. */
  getSize: () => { inPixels: number } | null;
}

export interface GroupImperativeHandle {
  /** Batch resize of the named panels, in pixels. */
  setLayout: (layout: Record<string, number>) => void;
}

export type LayoutChangedHandler = (layout: Record<string, number>, meta: LayoutMeta) => void;

interface PanelState {
  id: string;
  isFiller: boolean;
  minSize: number;
  maxSize: number;
  /** Push a new px size into the owning Panel's state (declarative render). */
  setSize: (px: number) => void;
  /** Latest committed px size; null for the filler. */
  getSize: () => number | null;
}

interface GroupContextValue {
  orientation: GroupOrientation;
  panels: { current: Map<string, PanelState> };
  /** Latest group-level layout callback, kept fresh for drag commits. */
  onLayoutChanged: { current: LayoutChangedHandler | null };
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function Group(props: {
  orientation: GroupOrientation;
  id?: string;
  groupRef?: RefObject<GroupImperativeHandle | null>;
  onLayoutChanged?: LayoutChangedHandler;
  className?: string;
  children: ComponentChildren;
}) {
  const { orientation, id, groupRef, onLayoutChanged, className, children } = props;
  const panelsRef = useRefBase<Map<string, PanelState>>(new Map());
  // Latest callback without re-subscribing anything: separators and the
  // imperative handle read it through a ref.
  const changedRef = useRefBase<LayoutChangedHandler | null>(onLayoutChanged ?? null);
  changedRef.current = onLayoutChanged ?? null;

  const ctx = useMemo<GroupContextValue>(
    () => ({ orientation, panels: panelsRef, onLayoutChanged: changedRef }),
    [orientation],
  );

  const snapshot = () => {
    const layout: Record<string, number> = {};
    for (const [pid, state] of panelsRef.current) {
      const px = state.getSize();
      if (px != null) layout[pid] = px;
    }
    return layout;
  };

  useEffect(() => {
    if (!groupRef) return;
    groupRef.current = {
      setLayout: (layout) => {
        for (const [pid, px] of Object.entries(layout)) {
          const state = panelsRef.current.get(pid);
          if (!state || state.isFiller || typeof px !== 'number') continue;
          state.setSize(clamp(px, state.minSize, state.maxSize));
        }
        changedRef.current?.(snapshot(), { isUserInteraction: false });
      },
    };
    return () => {
      groupRef.current = null;
    };
  }, [groupRef]);

  return (
    <GroupContext.Provider value={ctx}>
      <div
        data-panel-group=""
        data-panel-group-id={id}
        className={className}
        style={{ display: 'flex', flex: '1 1 0%', flexDirection: orientation === 'horizontal' ? 'row' : 'column', minWidth: 0, minHeight: 0 } as CSSProperties}
      >
        {children}
      </div>
    </GroupContext.Provider>
  );
}

export function Panel(props: {
  id: string;
  panelRef?: RefObject<PanelImperativeHandle | null>;
  /** Initial size in px; ignored for the filler panel. */
  defaultSize?: number | string;
  minSize?: number | string;
  maxSize?: number | string;
  collapsible?: boolean;
  /** This panel absorbs the remaining space instead of holding its own px. */
  filler?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ComponentChildren;
}) {
  const { id, panelRef, defaultSize, minSize = 0, maxSize, filler = false, className, style, children } = props;
  const group = useContext(GroupContext);
  if (!group) {
    throw new Error(`<Panel id="${id}"> must be rendered inside a <Group>`);
  }
  const { orientation, panels } = group;

  const minPx = toPx(minSize, 0);
  const maxPx = maxSize != null ? toPx(maxSize, Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
  const elementRef = useRef<HTMLDivElement | null>(null);
  const [sizePx, setSizePx] = useState<number | null>(() =>
    filler ? null : clamp(toPx(defaultSize, minPx), minPx, maxPx),
  );
  const sizePxRef = useRef(sizePx);
  sizePxRef.current = sizePx;

  // Register with the group so separators and the imperative handle can find
  // this panel. Runs once per mount.
  useEffect(() => {
    const state: PanelState = {
      id,
      isFiller: filler,
      minSize: minPx,
      maxSize: maxPx,
      setSize: (px) => setSizePx(px),
      getSize: () => sizePxRef.current,
    };
    panels.current.set(id, state);
    return () => {
      panels.current.delete(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Constraints can change between renders (e.g. the right panel's min per
  // view); refresh the registry entry every render.
  useEffect(() => {
    const state = panels.current.get(id);
    if (state) {
      state.minSize = minPx;
      state.maxSize = maxPx;
    }
  });

  useEffect(() => {
    if (!panelRef) return;
    panelRef.current = {
      resize: (px) => {
        setSizePx(clamp(px, minPx, maxPx));
      },
      getSize: () => {
        const px = sizePxRef.current;
        return px != null ? { inPixels: px } : null;
      },
    };
    return () => {
      panelRef.current = null;
    };
  }, [panelRef, minPx, maxPx]);

  const baseStyle: CSSProperties = filler
    ? {
        flex: '1 1 0%',
        // The filler keeps its floor on the group's axis (and none across it,
        // where it is sized by the container): see the group model note above.
        minWidth: orientation === 'horizontal' ? minPx : 0,
        minHeight: orientation === 'horizontal' ? 0 : minPx,
        overflow: 'hidden',
        position: 'relative',
      }
    : {
        flex: '0 1 auto',
        width: orientation === 'horizontal' ? sizePx ?? undefined : undefined,
        height: orientation === 'horizontal' ? undefined : sizePx ?? undefined,
        minWidth: orientation === 'horizontal' ? minPx : undefined,
        minHeight: orientation === 'horizontal' ? undefined : minPx,
        maxWidth: maxSize != null ? maxPx : undefined,
        overflow: 'hidden',
        position: 'relative',
      };

  return (
    <div ref={elementRef} data-panel="" data-panel-id={id} className={className} style={{ ...baseStyle, ...style }}>
      {children}
    </div>
  );
}

/**
 * The drag handle between two panels. Dragging transfers pixels from the
 * previous sibling panel to the next sibling panel, clamped by both sides,
 * and commits one `onLayoutChanged(_, { isUserInteraction: true })` per drag.
 *
 * While a drag is active, a fixed overlay blocks pointer capture — most
 * importantly the browser panel's iframe, which would otherwise swallow
 * pointermove events mid-drag.
 */
export function Separator(props: { className?: string; style?: CSSProperties; children?: ComponentChildren }) {
  const { className, style, children } = props;
  const group = useContext(GroupContext);
  const [dragging, setDragging] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  // A drag owns two window listeners; if the separator unmounts mid-drag (a
  // layout switch) nothing else would ever remove them.
  useEffect(() => () => dragCleanupRef.current?.(), []);

  if (!group) {
    throw new Error('<Separator> must be rendered inside a <Group>');
  }
  const { orientation, panels, onLayoutChanged } = group;

  const handlePointerDown = (e: TargetedPointerEvent<HTMLDivElement>) => {
    const host = hostRef.current;
    if (!host || e.button !== 0) return;
    const previous = host.previousElementSibling as HTMLElement | null;
    const next = host.nextElementSibling as HTMLElement | null;
    const aId = previous?.getAttribute('data-panel-id');
    const bId = next?.getAttribute('data-panel-id');
    const a = aId ? panels.current.get(aId) : undefined;
    const b = bId ? panels.current.get(bId) : undefined;
    if (!a || !b || !previous || !next) return;

    e.preventDefault();
    setDragging(true);

    const startPos = orientation === 'horizontal' ? e.clientX : e.clientY;
    const measure = (el: HTMLElement) =>
      orientation === 'horizontal' ? el.getBoundingClientRect().width : el.getBoundingClientRect().height;
    // Measure, never ask the panel: a window narrow enough for flexbox to
    // shrink a panel below its specified width would otherwise start the drag
    // from a size the panel does not have on screen.
    const aStart = measure(previous);
    const bStart = measure(next);

    const onMove = (ev: PointerEvent) => {
      const pos = orientation === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = transfer(
        { size: aStart, min: a.minSize, max: a.maxSize },
        { size: bStart, min: b.minSize, max: b.maxSize },
        pos - startPos,
      );
      a.setSize(clamp(aStart + delta, a.minSize, a.maxSize));
      if (!b.isFiller) b.setSize(clamp(bStart - delta, b.minSize, b.maxSize));
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      dragCleanupRef.current = null;
      setDragging(false);
      const layout: Record<string, number> = {};
      for (const [pid, state] of panels.current) {
        const px = state.getSize();
        if (px != null) layout[pid] = px;
      }
      onLayoutChanged.current?.(layout, { isUserInteraction: true });
    };
    const onUp = () => cleanup();

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    dragCleanupRef.current = cleanup;
  };

  return (
    <>
      <div
        ref={hostRef}
        data-separator=""
        role="separator"
        aria-orientation={orientation === 'horizontal' ? 'vertical' : 'horizontal'}
        className={className}
        style={style}
        onPointerDown={handlePointerDown}
        onDragStart={(e: DragEvent) => e.preventDefault()}
      >
        {children}
      </div>
      {dragging && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            cursor: orientation === 'horizontal' ? 'col-resize' : 'row-resize',
          } as CSSProperties}
        />
      )}
    </>
  );
}
