
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { navItems } from "./nav-items";
import { ThemeProvider } from "@/context/ThemeContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { MusicProvider } from "@/context/MusicContext";
import { PasswordAuthProvider, usePasswordAuth } from "@/context/PasswordAuthContext";
import Login from "@/pages/Login";
import LoginDialog from "@/components/LoginDialog";

// S3代理功能已移除，现在直接使用AWS SDK

const queryClient = new QueryClient();

// 主应用内容组件
const AppContent = () => {
  const { isAuthenticated, requiresAuth, isLoading } = usePasswordAuth();

  // 加载中显示loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">正在初始化...</p>
        </div>
      </div>
    );
  }

  // 未登录且需要认证时，除登录页外统一展示登录
  return (
    <>
      <HashRouter>
        <Routes>
          {navItems.map(({ to, page }) => (
            <Route
              key={to}
              path={to}
              element={
                requiresAuth && !isAuthenticated && to !== '/login'
                  ? <Login />
                  : page
              }
            />
          ))}
          {requiresAuth && !isAuthenticated && (
            <Route path="*" element={<Login />} />
          )}
        </Routes>
      </HashRouter>
      <LoginDialog />
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <PasswordAuthProvider>
      <ThemeProvider>
        <SettingsProvider>
          <MusicProvider>
            <TooltipProvider>
              <Toaster />
              <AppContent />
            </TooltipProvider>
          </MusicProvider>
        </SettingsProvider>
      </ThemeProvider>
    </PasswordAuthProvider>
  </QueryClientProvider>
);

export default App;
