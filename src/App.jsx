import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { navItems } from "./nav-items";
import { ThemeProvider } from "@/context/ThemeContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { MusicProvider } from "@/context/MusicContext";
import Index from "@/pages/Index";
import StickyMemoWindow from "@/pages/StickyMemoWindow";
import { isTauri } from "@/lib/utils";

const queryClient = new QueryClient();

const App = () => {
  useEffect(() => {
    if (!isTauri()) return undefined;

    let removeDpiListener;
    let removeWindowStateListener;

    const updateFullscreenClass = (isFullscreen) => {
      const method = isFullscreen ? 'add' : 'remove';
      document.body.classList[method]('tauri-window-fullscreen');
      document.documentElement.classList[method]('tauri-window-fullscreen');
    };

    const registerListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        removeDpiListener = await listen('app://dpi-changed', () => {
          window.dispatchEvent(new Event('resize'));
          requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
          });
        });
        removeWindowStateListener = await listen('app://window-state', (event) => {
          const payload = event?.payload || {};
          const isFullscreen = Boolean(payload.fullscreen) || Boolean(payload.maximized);
          updateFullscreenClass(isFullscreen);
        });
      } catch (error) {
        console.error('failed to register Tauri listeners', error);
      }
    };

    const syncWindowState = async () => {
      try {
        const { appWindow } = await import('@tauri-apps/api/window');
        const [fullscreen, maximized] = await Promise.all([
          appWindow.isFullscreen(),
          appWindow.isMaximized()
        ]);
        updateFullscreenClass(fullscreen || maximized);
      } catch (error) {
        console.error('failed to sync window state', error);
      }
    };

    registerListeners();
    syncWindowState();

    document.body.classList.add('tauri-window');
    document.documentElement.classList.add('tauri-window');

    return () => {
      document.body.classList.remove('tauri-window');
      document.documentElement.classList.remove('tauri-window');
      document.body.classList.remove('tauri-window-fullscreen');
      document.documentElement.classList.remove('tauri-window-fullscreen');

      if (typeof removeDpiListener === 'function') {
        removeDpiListener();
      }
      if (typeof removeWindowStateListener === 'function') {
        removeWindowStateListener();
      }
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SettingsProvider>
          <MusicProvider>
            <TooltipProvider>
              <Toaster />
              <HashRouter>
                <Routes>
                  {navItems.map(({ to, page }) => (
                    <Route key={to} path={to} element={page} />
                  ))}
                  <Route path="/sticky/:memoId" element={<StickyMemoWindow />} />
                  <Route path="*" element={<Index />} />
                </Routes>
              </HashRouter>
            </TooltipProvider>
          </MusicProvider>
        </SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
