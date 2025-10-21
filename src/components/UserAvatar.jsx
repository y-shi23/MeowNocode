import React, { useState, useRef, useEffect } from 'react';
import { User, Settings as SettingsIcon } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';
import { Badge } from '@/components/ui/badge';

const UserAvatar = ({ onOpenSettings }) => {
  const { cloudSyncEnabled, avatarConfig } = useSettings();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const avatarRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) &&
          avatarRef.current && !avatarRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleAvatarClick = () => {
    setIsDropdownOpen((prev) => !prev);
  };

  const getAvatarUrl = () => {
    if (avatarConfig && avatarConfig.imageUrl) {
      return avatarConfig.imageUrl;
    }
    return null;
  };

  const handleOpenSettings = () => {
    setIsDropdownOpen(false);
    onOpenSettings?.();
  };

  return (
    <div className="relative">
      <button
        ref={avatarRef}
        onClick={handleAvatarClick}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden transition-all duration-300 hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 dark:hover:ring-offset-gray-800"
        aria-label="用户菜单"
        title="打开用户菜单"
      >
        {getAvatarUrl() ? (
          <img
            src={getAvatarUrl()}
            alt="用户头像"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700 dark:text-gray-300">
            <User className="h-5 w-5" />
          </div>
        )}
      </button>

      {cloudSyncEnabled && (
        <Badge
          variant="secondary"
          className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs font-medium bg-yellow-500 text-white hover:bg-yellow-600"
        >
          β
        </Badge>
      )}

      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50"
        >
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                {getAvatarUrl() ? (
                  <img
                    src={getAvatarUrl()}
                    alt="用户头像"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-700 dark:text-gray-300">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  Meow 用户
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 break-words">
                  欢迎回来
                </p>
              </div>
            </div>
          </div>

          <div className="py-1">
            <button
              onClick={handleOpenSettings}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <SettingsIcon className="h-4 w-4" />
              <span>设置</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAvatar;
