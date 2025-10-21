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
    document.body.classList.add('tauri-window');
    document.documentElement.classList.add('tauri-window');
    return () => {
      document.body.classList.remove('tauri-window');
      document.documentElement.classList.remove('tauri-window');
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
