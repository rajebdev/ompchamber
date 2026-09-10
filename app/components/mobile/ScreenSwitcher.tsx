import type { MobileScreen } from '@/components/mobile/LayoutWrapper';

interface MobileScreenSwitcherProps {
  currentScreen: MobileScreen;
  onSelectScreen: (screen: MobileScreen) => void;
  onDesktopToggle?: () => void;
}

export function MobileScreenSwitcher({
  currentScreen,
  onSelectScreen,
  onDesktopToggle,
}: MobileScreenSwitcherProps) {
  return (
    <div className="hidden sm:flex items-center justify-between px-3 py-1 bg-ink text-canvas text-[11px] z-50">
      <div className="flex items-center space-x-2">
        <span className="font-semibold">Mobile UI Preview</span>
        <span className="text-canvas/60">•</span>
        <span>
          Screen:{' '}
          {currentScreen === 'main'
            ? 'Gambar 1 (Main UI)'
            : currentScreen === 'session'
            ? 'Gambar 2 (Session Sidebar)'
            : 'Gambar 3 (Right Sidebar)'}
        </span>
      </div>
      <div className="flex items-center space-x-1.5">
        <button
          type="button"
          onClick={() => onSelectScreen('main')}
          className={`px-2 py-0.5 rounded text-[10px] ${
            currentScreen === 'main' ? 'bg-paper/20 font-bold' : 'hover:bg-paper/10'
          }`}
        >
          Gambar 1
        </button>
        <button
          type="button"
          onClick={() => onSelectScreen('session')}
          className={`px-2 py-0.5 rounded text-[10px] ${
            currentScreen === 'session' ? 'bg-paper/20 font-bold' : 'hover:bg-paper/10'
          }`}
        >
          Gambar 2
        </button>
        <button
          type="button"
          onClick={() => onSelectScreen('right')}
          className={`px-2 py-0.5 rounded text-[10px] ${
            currentScreen === 'right' ? 'bg-paper/20 font-bold' : 'hover:bg-paper/10'
          }`}
        >
          Gambar 3
        </button>
        {onDesktopToggle && (
          <button
            type="button"
            onClick={onDesktopToggle}
            className="ml-2 px-2 py-0.5 bg-ink/30 hover:bg-ink/50 text-canvas rounded text-[10px] border border-canvas/20"
          >
            Desktop View
          </button>
        )}
      </div>
    </div>
  );
}
