import React, { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

const CanvasEditor = ({ onAddMemo, canvasSize, scale = 1, translate = { x: 0, y: 0 } }) => {
  const [content, setContent] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const textareaRef = useRef(null);
  const containerRef = useRef(null);

  // 自动调整高度
  useEffect(() => {
    const adjustHeight = () => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 96); // 最大约 3 行
      textarea.style.height = `${newHeight}px`;
      // 应用后读取实际高度（包含内边距与边框），用于同步按钮高度
      const measured = textarea.offsetHeight || newHeight;
      setInputHeight(measured);
    };

    adjustHeight();

    // 窗口尺寸变化时也重新测量，避免换行导致高度改变
    window.addEventListener('resize', adjustHeight);
    return () => window.removeEventListener('resize', adjustHeight);
  }, [content]);

  // 初次挂载也测量一次，确保初始高度一致
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      const measured = textarea.offsetHeight || 40;
      setInputHeight(measured);
    }
  }, []);

  // 点击外部区域时取消输入框聚焦
  useEffect(() => {
    const handlePointerDown = (event) => {
      const container = containerRef.current;
      const textarea = textareaRef.current;

      if (!container || !textarea) return;

      // 检查点击是否在容器外部
      const isClickOutside = !container.contains(event.target);

      // 只有当文本框当前处于聚焦状态且点击外部时才取消聚焦
      if (isClickOutside && document.activeElement === textarea) {
        // 延迟到下一个事件循环，确保点击事件先完成
        setTimeout(() => {
          textarea.blur();
        }, 0);
      }
    };

    // 使用 pointerdown 替代 mousedown，对触屏设备更友好
    document.addEventListener('pointerdown', handlePointerDown, true); // 使用捕获阶段
    // 保留 touchstart 以兼容旧设备
    document.addEventListener('touchstart', handlePointerDown, { passive: true });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  const handleSubmit = () => {
    if (content.trim()) {
      // 计算世界坐标中心位置（将屏幕中心转换为世界坐标）
      const screenCenterX = canvasSize.width / 2;
      const screenCenterY = canvasSize.height / 2;
      const worldX = (screenCenterX - translate.x) / scale;
      const worldY = (screenCenterY - translate.y) / scale;

      const newMemo = {
        id: Date.now(),
        content: content.trim(),
        tags: [],
        canvasX: worldX,
        canvasY: worldY,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      onAddMemo(newMemo);
      setContent('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 canvas-ui" style={{ pointerEvents: 'auto' }}>
      {/* 去掉外层矩形框，仅保留输入与按钮本身样式 */}
    <div ref={containerRef} className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入笔记内容...（Enter 发送，Shift+Enter 换行）"
          className="w-80 md:w-[520px] px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-xl resize-none bg-white/80 dark:bg-gray-700/80 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-inner [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ minHeight: '40px', maxHeight: '96px' }}
          rows={1}
        />
        
        <button
          onClick={handleSubmit}
          disabled={!content.trim()}
      className="rounded-lg bg-slate-600 hover:bg-slate-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white shadow-md px-3 flex items-center justify-center transition-colors"
      style={{ height: inputHeight }}
          title="发送笔记"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default CanvasEditor;