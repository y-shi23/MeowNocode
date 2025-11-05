import React, { useState, useRef, useEffect } from 'react';
import DraggableMemo from './DraggableMemo';
import CanvasEditor from './CanvasEditor';
import CanvasToolbar from './CanvasToolbar';
import ToolOptionsPanel from './ToolOptionsPanel';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const CanvasMode = ({ 
  memos = [], 
  pinnedMemos = [], 
  onAddMemo,
  onUpdateMemo,
  onDeleteMemo,
  onTogglePin,
  onToolPanelVisibleChange
}) => {
  const [draggingId, setDraggingId] = useState(null);
  const [connections, setConnections] = useState([]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  // 画布视图（缩放/平移）
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const panTranslateStartRef = useRef({ x: 0, y: 0 });
  
  // 缩放提示tooltip
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0 });

  // 绘图工具状态
  const [selectedTool, setSelectedTool] = useState(null); // 'rectangle' | 'ellipse' | 'text' | 'arrow' | 'line' | 'pencil' | 'eraser'
  const [toolOptions, setToolOptions] = useState({
    // 通用
  stroke: '#3b82f6',
    fill: 'transparent',
    strokeWidth: 2,
    strokeStyle: 'solid', // solid|dashed|dotted
    cornerRadius: 8,
    opacity: 1,
    // 文本
    color: '#111827',
    fontSize: 16,
  textAlign: 'left',
  // 橡皮擦
  eraseType: (typeof window !== 'undefined' && localStorage.getItem('canvas.eraseType')) || 'partial',
  });
  const [shapes, setShapes] = useState([]); // {id, type, props, z}
  // 按图形聚合的擦除点：shapeId -> {x,y,r}[]，更稳定地提交局部擦除
  const [eraseByShape, setEraseByShape] = useState({});
  const [activeShapeId, setActiveShapeId] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  // 对象擦除预览：高亮当前命中的对象（id 集合）
  const [erasePreviewIds, setErasePreviewIds] = useState(null);
  // 框选与选中
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null); // world coords
  const [selectionRect, setSelectionRect] = useState(null); // {x,y,w,h}
  const [selectedIds, setSelectedIds] = useState(new Set());
  const selectionRectRef = useRef(null);
  const selectionStartRef = useRef(null);
  // Ctrl 增量选择支持
  const selectionAddModeRef = useRef(false);
  const selectionBaseIdsRef = useRef(new Set());
  // 全局拖拽图片提示
  const [showGlobalDropHint, setShowGlobalDropHint] = useState(false);
  // 选中对象拖动
  const [isMovingSelection, setIsMovingSelection] = useState(false);
  const isMovingSelectionRef = useRef(isMovingSelection);
  const moveStartRef = useRef(null); // world coords
  const movingIdsRef = useRef(null);
  const moveOriginalPropsRef = useRef(new Map()); // id -> shallow copy of props
  const moveOriginalEraseRef = useRef(new Map()); // id -> erase points snapshot
  const moveShapesSnapshotRef = useRef([]); // shapes array snapshot at drag start

  // refs to avoid stale closures in event handlers
  const selectedToolRef = useRef(selectedTool);
  const translateRef = useRef(translate);
  const scaleRef = useRef(scale);
  const toolOptionsRef = useRef(toolOptions);
  const shapesRef = useRef(shapes);
  const activeShapeIdRef = useRef(activeShapeId);
  const isDrawingRef = useRef(isDrawing);
  const drawStartRef = useRef(drawStart);
  // 绘制一次后的“下一次点击退出工具”开关（橡皮擦例外）
  const awaitingExitRef = useRef(false);
  // 当前橡皮擦拖拽的点集合（避免 setState 异步导致抬起时读取到旧值）
  const eraserPointsRef = useRef(null);

  useEffect(() => { selectedToolRef.current = selectedTool; }, [selectedTool]);
  useEffect(() => { translateRef.current = translate; }, [translate]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { toolOptionsRef.current = toolOptions; }, [toolOptions]);
  // 本地持久化：仅存储橡皮擦类型（不云同步）
  useEffect(() => {
    try {
      if (toolOptions.eraseType) localStorage.setItem('canvas.eraseType', toolOptions.eraseType);
    } catch {}
  }, [toolOptions.eraseType]);
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { activeShapeIdRef.current = activeShapeId; }, [activeShapeId]);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);
  useEffect(() => { drawStartRef.current = drawStart; }, [drawStart]);
  const eraseByShapeRef = useRef(eraseByShape);
  useEffect(() => { eraseByShapeRef.current = eraseByShape; }, [eraseByShape]);
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
  useEffect(() => { selectionRectRef.current = selectionRect; }, [selectionRect]);
  useEffect(() => { selectionStartRef.current = selectionStart; }, [selectionStart]);

  // 本地持久化：加载 canvasState（shapes/eraseByShape/viewport）。memoPositions 在 Index.jsx 中维护
  useEffect(() => {
    try {
      const raw = localStorage.getItem('canvasState');
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state && Array.isArray(state.shapes)) {
        // 过滤掉临时的 eraser 形状
        const restored = state.shapes.filter(s => s && s.type !== 'eraser');
        setShapes(restored);
      }
      if (state && state.eraseByShape && typeof state.eraseByShape === 'object') {
        setEraseByShape(state.eraseByShape);
      }
      if (state && state.viewport) {
        const vp = state.viewport;
        if (typeof vp.scale === 'number') setScale(clamp(vp.scale, 0.5, 2.5));
        if (vp.translate && typeof vp.translate.x === 'number' && typeof vp.translate.y === 'number') {
          setTranslate({ x: vp.translate.x, y: vp.translate.y });
        }
      }
    } catch {}
  }, []);

  // 从页面外部拖入图片：显示提示并支持直接放置插入
  useEffect(() => {
    const acceptDrag = (e) => {
      const dt = e.dataTransfer;
      if (!dt) return false;
      if (dt.types && dt.types.includes && dt.types.includes('Files')) return true;
      if (dt.types && dt.types.includes && dt.types.includes('text/uri-list')) return true;
      return false;
    };

    const onDragOver = (e) => {
      if (!acceptDrag(e)) return;
      e.preventDefault();
      setShowGlobalDropHint(true);
    };
    const onDragEnter = (e) => {
      if (!acceptDrag(e)) return;
      e.preventDefault();
      setShowGlobalDropHint(true);
    };
    const onDragLeave = (e) => {
      // 当拖拽离开窗口时隐藏提示
      setShowGlobalDropHint(false);
    };
    const onDrop = async (e) => {
      if (!acceptDrag(e)) return;
      e.preventDefault();
      setShowGlobalDropHint(false);
      const dt = e.dataTransfer;
      if (!dt) return;
      // 优先文件
      if (dt.files && dt.files.length > 0) {
        const file = Array.from(dt.files).find(f => f.type && f.type.startsWith('image/')) || dt.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result;
            if (typeof dataUrl === 'string') {
              insertImageAtCenter(dataUrl);
            }
          };
          reader.readAsDataURL(file);
          return;
        }
      }
      // 其次 URL
      const text = dt.getData('text/uri-list') || dt.getData('text/plain');
      if (text && /^(data:image\/|https?:\/\/).+/i.test(text)) {
        insertImageAtCenter(text.trim());
      }
    };

    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // 在视口中心插入图片形状
  const insertImageAtCenter = (src) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const t = translateRef.current;
    const s = scaleRef.current;
    const cxWorld = (rect.width / 2 - t.x) / s;
    const cyWorld = (rect.height / 2 - t.y) / s;

    // 读取图片尺寸以适配大小
    const img = new Image();
    img.onload = () => {
      const maxW = 360;
      const maxH = 260;
      let w = img.naturalWidth || 240;
      let h = img.naturalHeight || 180;
      const scale = Math.min(1, maxW / w, maxH / h);
      w = Math.max(40, Math.round(w * scale));
      h = Math.max(40, Math.round(h * scale));
      const id = `shape_${Date.now()}`;
      const initialOpacity = (toolOptionsRef.current?.opacity ?? 1);
      const shape = { id, type: 'image', z: shapesRef.current.length, props: { x: cxWorld - w/2, y: cyWorld - h/2, w, h, src, opacity: initialOpacity } };
      setShapes(prev => [...prev, shape]);
      shapesRef.current = [...shapesRef.current, shape];
      setSelectedIds(new Set([id]));
      setActiveShapeId(id);
      // 插入后退出图片工具
      setSelectedTool(null);
    };
    img.onerror = () => {
      // 失败时用默认尺寸
      const w = 240, h = 180;
      const id = `shape_${Date.now()}`;
      const initialOpacity = (toolOptionsRef.current?.opacity ?? 1);
      const shape = { id, type: 'image', z: shapesRef.current.length, props: { x: cxWorld - w/2, y: cyWorld - h/2, w, h, src, opacity: initialOpacity } };
      setShapes(prev => [...prev, shape]);
      shapesRef.current = [...shapesRef.current, shape];
      setSelectedIds(new Set([id]));
      setActiveShapeId(id);
      setSelectedTool(null);
    };
    img.src = src;
  };

  const handleImagePicked = (val) => {
    if (!val) return;
    // 如果当前单选且是图片，则替换其 src
    const ids = selectedIdsRef.current;
    if (ids && ids.size === 1) {
      const id = Array.from(ids)[0];
      const target = (shapesRef.current || []).find(s => s.id === id);
      if (target && target.type === 'image') {
        setShapes(prev => prev.map(s => s.id === id ? { ...s, props: { ...s.props, src: val } } : s));
        return;
      }
    }
    // 否则插入到中心
    insertImageAtCenter(val);
  };

  // 本地持久化：保存 canvasState（shapes/eraseByShape/viewport），去除临时 eraser
  const saveTimerRef = useRef(null);
  useEffect(() => {
    // debounce 300ms
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        const raw = localStorage.getItem('canvasState');
        const prev = raw ? JSON.parse(raw) : {};
        const next = { ...prev };
        const safeShapes = (shapes || []).filter(s => s && s.type !== 'eraser');
        // 清理不存在图形的擦除点
        const validIds = new Set(safeShapes.map(s => s.id));
        const cleanedErase = {};
        Object.entries(eraseByShape || {}).forEach(([id, pts]) => {
          if (validIds.has(id)) cleanedErase[id] = Array.isArray(pts) ? pts : [];
        });
        next.shapes = safeShapes;
        next.eraseByShape = cleanedErase;
        next.viewport = { scale, translate };
        // memoPositions 由 Index.jsx 负责合并
        localStorage.setItem('canvasState', JSON.stringify(next));
  try { window.dispatchEvent(new CustomEvent('app:dataChanged', { detail: { part: 'canvas.state' } })); } catch {}
      } catch {}
    }, 300);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [shapes, eraseByShape, scale, translate]);

  // 合并所有 memos
  const allMemos = [...memos, ...pinnedMemos];

  // 更新画布大小
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // 同步工具面板可见性到外部（用于屏蔽左侧栏 hover）：工具激活或单对象选中时
  useEffect(() => {
    if (typeof onToolPanelVisibleChange === 'function') {
      const visible = !!selectedTool || (selectedIds && selectedIds.size === 1);
      onToolPanelVisibleChange(visible);
      return () => onToolPanelVisibleChange(false);
    }
  }, [selectedTool, selectedIds, onToolPanelVisibleChange]);

  // 连接计算
  const checkConnections = (draggedId, draggedPos) => {
    const newConnections = [];
    const connectionDistance = 160;
    allMemos.forEach(memo => {
      if (memo.id !== draggedId) {
        const distance = Math.hypot(draggedPos.x - (memo.canvasX || 0), draggedPos.y - (memo.canvasY || 0));
        if (distance < connectionDistance) newConnections.push({ from: draggedId, to: memo.id, distance });
      }
    });
    setConnections(newConnections);
  };

  // 拖拽回调
  const handleDragStart = (id) => setDraggingId(id);
  const handleDrag = (id, position) => {
    if (draggingId === id) checkConnections(id, position);
  };
  const handleDragEnd = (id, position) => {
    onUpdateMemo(id, { canvasX: position.x, canvasY: position.y });
    setDraggingId(null);
    setConnections([]);
  };

  // 双击创建
  const handleCanvasDoubleClick = (e) => {
    // 忽略在memo上的双击（兼容 SVG/HTML 元素）
    const targetEl = e.target instanceof Element ? e.target : null;
  if (targetEl && (targetEl.closest('.draggable-memo') || targetEl.closest('.canvas-ui'))) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    // 将屏幕坐标反映射到世界坐标（考虑平移与缩放）
    const sx = e.clientX - rect.left - translate.x;
    const sy = e.clientY - rect.top - translate.y;
    const x = sx / scale;
    const y = sy / scale;
    
    if (selectedTool === 'text') {
      // 新建文本形状，后续可在 ContentEditable 中编辑
      const id = `shape_${Date.now()}`;
      setShapes((prev) => ([
        ...prev,
        { 
          id, 
          type: 'text', 
          z: prev.length, 
          props: { 
            x, 
            y, 
            text: '双击编辑', 
            color: toolOptions.color || '#111827', 
            fontSize: toolOptions.fontSize || 16, 
            textAlign: toolOptions.textAlign || 'left', 
            opacity: toolOptions.opacity || 1 
          } 
        }
      ]));
      setActiveShapeId(id);
  // 文本创建后，下一次点击退出工具
  awaitingExitRef.current = true;
      
      // 延迟一下让文本元素渲染完成后再进入编辑模式
      setTimeout(() => {
        const textElement = document.querySelector(`[data-shape-id="${id}"]`);
        if (textElement) {
          textElement.focus();
          // 选中所有文本
          const range = document.createRange();
          range.selectNodeContents(textElement);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }, 100);
    } else {
      // 原有的创建备忘录逻辑
      const newMemo = {
        id: Date.now(),
        content: '',
        tags: [],
        canvasX: x,
        canvasY: y,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isNew: true
      };
      onAddMemo(newMemo);
    }
  };

  // 初始化位置
  const initializeMemoPositions = () => {
    const updatedMemos = allMemos.map((memo, index) => {
      if (!memo.canvasX || !memo.canvasY) {
        const angle = (index / Math.max(allMemos.length, 1)) * 2 * Math.PI;
        const radius = 220;
        const centerX = canvasSize.width / 2;
        const centerY = canvasSize.height / 2;
        return { ...memo, canvasX: centerX + Math.cos(angle) * radius, canvasY: centerY + Math.sin(angle) * radius };
      }
      return memo;
    });
    updatedMemos.forEach(memo => {
      if (memo.canvasX !== undefined && memo.canvasY !== undefined) {
        onUpdateMemo(memo.id, { canvasX: memo.canvasX, canvasY: memo.canvasY });
      }
    });
  };

  useEffect(() => {
    if (canvasSize.width > 0 && canvasSize.height > 0) initializeMemoPositions();
  }, [canvasSize]);

  // 显示缩放提示
  const showTooltip = (e) => {
    const rect = e.target.getBoundingClientRect();
    const tooltipWidth = 160;
    const tooltipHeight = 30;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let x = rect.left + rect.width / 2 - tooltipWidth / 2;
    let y = rect.top - tooltipHeight - 10;

    // 边界检查
    if (x < 10) {
      x = 10;
    } else if (x + tooltipWidth > viewportWidth - 10) {
      x = viewportWidth - tooltipWidth - 10;
    }

    if (y < 10) {
      y = rect.bottom + 10;
    }

    setTooltip({
      show: true,
      x,
      y
    });
  };

  // 隐藏缩放提示
  const hideTooltip = () => {
    setTooltip({ ...tooltip, show: false });
  };

  // 画布缩放（滚轮 / Ctrl+滚轮 / 触控板）
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onWheel = (e) => {
      // 支持 Ctrl+滚轮缩放；触控板双指缩放会带有 ctrlKey
      if (!e.ctrlKey) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const prevScale = scale;
      const nextScale = clamp(prevScale * (e.deltaY < 0 ? 1.1 : 0.9), 0.5, 2.5);

      // 缩放围绕鼠标点，调整 translate 保持该点在屏幕位置不变
      const worldX = (mouseX - translate.x) / prevScale;
      const worldY = (mouseY - translate.y) / prevScale;
      const newTranslateX = mouseX - worldX * nextScale;
      const newTranslateY = mouseY - worldY * nextScale;

      setScale(nextScale);
      setTranslate({ x: newTranslateX, y: newTranslateY });
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scale, translate]);

  // 画布平移（鼠标中键拖拽）
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onPointerDown = (e) => {
      // 只处理鼠标中键（button === 1）
      if (e.button !== 1) return;
      
      // 忽略从 memo 上开始的拖拽（让 memo 自己处理）
  const targetEl = e.target instanceof Element ? e.target : null;
  if (targetEl && (targetEl.closest('.draggable-memo') || targetEl.closest('.canvas-ui'))) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panTranslateStartRef.current = { ...translate };
      
      const onPointerMove = (e) => {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setTranslate({ x: panTranslateStartRef.current.x + dx, y: panTranslateStartRef.current.y + dy });
      };

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      };
      
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
    };

    el.addEventListener('pointerdown', onPointerDown);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
    };
  }, [translate]);

  // 绘图手势（左键在画布上绘制形状，忽略拖拽 memo）
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onPointerDown = (e) => {
      if (e.button !== 0) return; // 只处理左键
      const targetEl = e.target instanceof Element ? e.target : null;
  // 忽略在 memo 或 UI 面板/工具栏上的点击
  if (targetEl && (targetEl.closest('.draggable-memo') || targetEl.closest('.canvas-ui') || targetEl.closest('[data-shape-root="1"]'))) return;
      // 如果上一次绘制完成后处于“等待退出”状态，且当前工具不是橡皮擦，则本次点击先退出工具
      if (awaitingExitRef.current && selectedToolRef.current && selectedToolRef.current !== 'eraser') {
        awaitingExitRef.current = false;
        setSelectedTool(null);
        return;
      }
      const currentTool = selectedToolRef.current;
  if (!currentTool || currentTool === 'text' || currentTool === 'image') return; // 文字/图片工具由双击或面板处理
      
      e.preventDefault();
      e.stopPropagation();
      
      const rect = el.getBoundingClientRect();
      const t = translateRef.current;
      const s = scaleRef.current;
      const sx = e.clientX - rect.left - t.x;
      const sy = e.clientY - rect.top - t.y;
      const x = sx / s;
      const y = sy / s;
      
      setIsDrawing(true);
      setDrawStart({ x, y });
      isDrawingRef.current = true;
      drawStartRef.current = { x, y };
      
      const id = `shape_${Date.now()}`;
      const opts = toolOptionsRef.current;
      const zIndex = shapesRef.current.length;
      let shape = null;
      
  if (currentTool === 'rectangle' || currentTool === 'ellipse') {
        shape = {
          id, type: currentTool, z: zIndex, props: {
            x, y, w: 1, h: 1,
      stroke: opts.stroke || '#3b82f6', fill: opts.fill,
            strokeWidth: opts.strokeWidth, strokeStyle: opts.strokeStyle,
            cornerRadius: opts.cornerRadius, opacity: opts.opacity
          }
        };
  } else if (currentTool === 'line' || currentTool === 'arrow') {
        shape = { 
          id, 
          type: currentTool, 
          z: zIndex, 
          props: { 
            x1: x, 
            y1: y, 
            x2: x, 
            y2: y, 
    stroke: opts.stroke || '#3b82f6', 
            strokeWidth: opts.strokeWidth, 
            strokeStyle: opts.strokeStyle, 
            opacity: opts.opacity 
          } 
        };
      } else if (currentTool === 'pencil' || currentTool === 'eraser') {
        // 橡皮擦采用 mask 擦除：记录点与半径，不直接绘制白色线条
  const baseRadius = currentTool === 'eraser' ? Math.max(14, (opts.strokeWidth || 2) * 6) : (opts.strokeWidth || 2);
        if (currentTool === 'eraser') {
          // 创建一个临时的当前擦除段（未提交），保存到 active eraser shape 仅用于显示尾巴（不参与实际擦除）
          shape = { 
            id, 
            type: 'eraser', 
            z: zIndex, 
            props: { points: [{ x, y }], radius: baseRadius, opacity: 1 }
          };
      // 启动本次擦除的点集合记录
      eraserPointsRef.current = [{ x, y, r: baseRadius }];
        } else {
          shape = { 
            id, 
            type: 'pencil', 
            z: zIndex, 
            props: { points: [{ x, y }], stroke: opts.stroke || '#3b82f6', strokeWidth: opts.strokeWidth || 2, opacity: opts.opacity }
          };
        }
      }
      
      if (shape) {
        setShapes(prev => [...prev, shape]);
        setActiveShapeId(id);
        shapesRef.current = [...shapesRef.current, shape];
        activeShapeIdRef.current = id;
      }
      const onMove = (e) => {
      if (!isDrawingRef.current || !activeShapeIdRef.current || !drawStartRef.current) return;
      
      const rect = el.getBoundingClientRect();
      const t = translateRef.current;
      const s = scaleRef.current;
      const sx = e.clientX - rect.left - t.x;
      const sy = e.clientY - rect.top - t.y;
      const x = sx / s;
      const y = sy / s;

      setShapes(prev => {
        const idx = prev.findIndex(sh => sh.id === activeShapeIdRef.current);
        if (idx === -1) return prev;
        
        const clone = [...prev];
        const sh = { ...clone[idx], props: { ...clone[idx].props } };
        
        if (sh.type === 'rectangle' || sh.type === 'ellipse') {
          const sx0 = drawStartRef.current.x; 
          const sy0 = drawStartRef.current.y;
          sh.props.x = Math.min(sx0, x);
          sh.props.y = Math.min(sy0, y);
          sh.props.w = Math.max(1, Math.abs(x - sx0));
          sh.props.h = Math.max(1, Math.abs(y - sy0));
        } else if (sh.type === 'line' || sh.type === 'arrow') {
          sh.props.x2 = x; 
          sh.props.y2 = y;
        } else if (sh.type === 'pencil' || sh.type === 'eraser') {
          sh.props.points = [...(sh.props.points || []), { x, y }];
          if (sh.type === 'eraser' && eraserPointsRef.current) {
            const baseR = sh.props.radius || Math.max(14, (toolOptionsRef.current.strokeWidth || 2) * 6);
            eraserPointsRef.current.push({ x, y, r: baseR });
          }
        }
        
        clone[idx] = sh;
        return clone;
      });

      // 对象擦除：计算实时预览命中对象
      if (selectedToolRef.current === 'eraser' && (toolOptionsRef.current.eraseType || 'partial') === 'object') {
        const current = shapesRef.current.find(sh => sh.id === activeShapeIdRef.current && sh.type === 'eraser');
        const points = (eraserPointsRef.current && eraserPointsRef.current.length ? eraserPointsRef.current : (current?.props?.points || []).map(p => ({ x: p.x, y: p.y, r: current?.props?.radius || 15 })));
        const samples = points.slice(-12); // 采样最后若干点，避免过多计算
        const targets = shapesRef.current.filter(s => s.type !== 'eraser');
        const hit = new Set();
        samples.forEach(pt => {
          const r = pt.r || 15;
          targets.forEach(s => { if (isHitShape(s, pt.x, pt.y, r)) hit.add(s.id); });
        });
        setErasePreviewIds(hit);
      } else {
        if (erasePreviewIds) setErasePreviewIds(null);
      }
      };

      const onUpOrCancel = () => {
        if (isDrawingRef.current) {
          setIsDrawing(false);
          setDrawStart(null);
          isDrawingRef.current = false;
          drawStartRef.current = null;
          // 若是橡皮擦：在抬起时生成一个"擦除段"，只作用于抬起瞬间的目标图形集合
          if (selectedToolRef.current === 'eraser') {
            const current = shapesRef.current.find(sh => sh.id === activeShapeIdRef.current && sh.type === 'eraser');
            // 目标集合：根据配置决定
            const eraseType = (toolOptionsRef.current.eraseType || 'partial');
            const targets = shapesRef.current.filter(s => s.type !== 'eraser');
            const eraserPoints = eraserPointsRef.current || (current?.props?.points || []).map(p => ({ x: p.x, y: p.y, r: current?.props?.radius || 15 }));
            
            if (eraseType === 'object') {
              // 对象擦除：完全删除被碰到的图形
              if (eraserPoints && eraserPoints.length > 0) {
                const hitIds = new Set();
                eraserPoints.forEach(pt => {
                  const r = pt.r || 15;
                  targets.forEach(s => {
                    if (isHitShape(s, pt.x, pt.y, r)) hitIds.add(s.id);
                  });
                });
                if (hitIds.size > 0) {
                  setShapes(prev => {
                    const newShapes = prev.filter(s => !hitIds.has(s.id));
                    shapesRef.current = newShapes;
                    return newShapes;
                  });
                }
              }
            } else {
              // 局部擦除：创建擦除段，只包含当前存在的图形
              const pts = (eraserPoints || []).map(p => ({ x: p.x, y: p.y, r: p.r || 15 }));
              if (pts.length > 0) {
                setEraseByShape(prev => {
                  const next = { ...prev };
                  for (const s of targets) {
                    const list = next[s.id] ? next[s.id].slice() : [];
                    list.push(...pts);
                    next[s.id] = list;
                  }
                  eraseByShapeRef.current = next;
                  return next;
                });
              }
            }
            // 擦除段提交后，移除临时 eraser shape 并清空临时点
            if (current) {
              setShapes(prev => prev.filter(s => s.id !== current.id));
              shapesRef.current = shapesRef.current.filter(s => s.id !== current.id);
            }
            eraserPointsRef.current = null;
            // 清除预览
            if (erasePreviewIds) setErasePreviewIds(null);
          }
        }
        // 橡皮擦不会触发“下一次点击退出”
        if (selectedToolRef.current && selectedToolRef.current !== 'eraser') {
          awaitingExitRef.current = true;
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUpOrCancel);
        window.removeEventListener('pointercancel', onUpOrCancel);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUpOrCancel);
      window.addEventListener('pointercancel', onUpOrCancel);
    };

    el.addEventListener('pointerdown', onPointerDown);
  // pointermove/up/cancel 都由 window 级监听（onPointerDown 内部注册）统一处理，避免竞争条件

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  // 框选（左键拖拽，未选择绘图工具时）
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      if (selectedToolRef.current) return; // 有工具时，不启用框选
      const targetEl = e.target instanceof Element ? e.target : null;
      if (targetEl && (targetEl.closest('.draggable-memo') || targetEl.closest('.canvas-ui') || targetEl.closest('[data-shape-root="1"]'))) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const t = translateRef.current;
      const s = scaleRef.current;
      const sx = e.clientX - rect.left - t.x;
      const sy = e.clientY - rect.top - t.y;
      const x = sx / s;
      const y = sy / s;

      setIsSelecting(true);
  const start = { x, y };
  setSelectionStart(start);
  const initRect = { x, y, w: 0, h: 0 };
  setSelectionRect(initRect);
  selectionStartRef.current = start;
  selectionRectRef.current = initRect;
  // 记录是否为增量框选及基准选择集
  selectionAddModeRef.current = !!e.ctrlKey;
  selectionBaseIdsRef.current = new Set(selectedIdsRef.current ? Array.from(selectedIdsRef.current) : []);

      const onMove = (ev) => {
        const r = el.getBoundingClientRect();
        const tt = translateRef.current;
        const sc = scaleRef.current;
        const msx = ev.clientX - r.left - tt.x;
        const msy = ev.clientY - r.top - tt.y;
        const mx = msx / sc;
        const my = msy / sc;
  const ss = selectionStartRef.current || { x, y };
  const x0 = ss.x;
  const y0 = ss.y;
        const nx = Math.min(x0, mx);
        const ny = Math.min(y0, my);
        const nw = Math.abs(mx - x0);
        const nh = Math.abs(my - y0);
        const rectWorld = { x: nx, y: ny, w: nw, h: nh };
        setSelectionRect(rectWorld);
  selectionRectRef.current = rectWorld;

        const hit = new Set();
        shapesRef.current.forEach(s => {
          const bb = getShapeBBox(s);
          if (!bb) return;
          if (rectsIntersect(rectWorld, bb)) hit.add(s.id);
        });
        // 增量模式预览：基线 ∪ 命中
        const preview = selectionAddModeRef.current
          ? new Set([...Array.from(selectionBaseIdsRef.current), ...Array.from(hit)])
          : hit;
        setSelectedIds(preview);
        if (preview.size === 1) {
          setActiveShapeId(Array.from(preview)[0]);
        } else {
          setActiveShapeId(null);
        }
      };

      const onUp = (ev) => {
        setIsSelecting(false);
  // 极小移动视为点击：命中顶部图形
  const curRect = selectionRectRef.current;
  const dx = Math.abs(curRect?.w || 0);
  const dy = Math.abs(curRect?.h || 0);
        if (dx < 3 && dy < 3) {
          const r = el.getBoundingClientRect();
          const tt = translateRef.current;
          const sc = scaleRef.current;
          const msx = ev.clientX - r.left - tt.x;
          const msy = ev.clientY - r.top - tt.y;
          const mx = msx / sc;
          const my = msy / sc;
          const sorted = [...shapesRef.current].sort((a, b) => (b.z || 0) - (a.z || 0));
          const found = sorted.find(s => isHitShape(s, mx, my, 0));
          if (found) {
            if (ev.ctrlKey) {
              const base = new Set(selectedIdsRef.current ? Array.from(selectedIdsRef.current) : []);
              if (base.has(found.id)) base.delete(found.id); else base.add(found.id);
              setSelectedIds(base);
              setActiveShapeId(base.size === 1 ? Array.from(base)[0] : null);
            } else {
              setSelectedIds(new Set([found.id]));
              setActiveShapeId(found.id);
            }
          } else {
            if (!ev.ctrlKey) {
              setSelectedIds(new Set());
              setActiveShapeId(null);
            }
          }
        }
        else {
          // 框选合并：根据增量模式
          const rectWorld = selectionRectRef.current;
          const hitFinal = new Set();
          shapesRef.current.forEach(s => {
            const bb = getShapeBBox(s);
            if (!bb) return;
            if (rectsIntersect(rectWorld, bb)) hitFinal.add(s.id);
          });
          const finalSel = selectionAddModeRef.current
            ? new Set([...Array.from(selectionBaseIdsRef.current), ...Array.from(hitFinal)])
            : hitFinal;
          setSelectedIds(finalSel);
          setActiveShapeId(finalSel.size === 1 ? Array.from(finalSel)[0] : null);
        }
  setSelectionStart(null);
  setSelectionRect(null);
  selectionStartRef.current = null;
  selectionRectRef.current = null;
        selectionAddModeRef.current = false;
        selectionBaseIdsRef.current = new Set();

        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
      window.addEventListener('pointercancel', onUp, { once: true });
    };

    el.addEventListener('pointerdown', onPointerDown);
    return () => el.removeEventListener('pointerdown', onPointerDown);
  }, []);

  // 键盘删除选中
  useEffect(() => {
    const onKeyDown = (e) => {
      const ae = document.activeElement;
      const isEditing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || (ae.getAttribute && ae.getAttribute('contenteditable') === 'true'));
      // ESC：清除选中/取消框选/停止移动
      if (e.key === 'Escape') {
        if (isEditing) return; // 让文本输入的 ESC 走元素自身逻辑（如 blur）
        setIsSelecting(false);
        setSelectionRect(null);
        setSelectionStart(null);
        selectionRectRef.current = null;
        selectionStartRef.current = null;
        setSelectedIds(new Set());
        setActiveShapeId(null);
        // 停止移动（监听会在 pointerup 清理，onMove 将被 ref 拦截）
        if (isMovingSelectionRef?.current) {
          isMovingSelectionRef.current = false;
          setIsMovingSelection(false);
        }
        return;
      }
      // Delete/Backspace：删除选中
      if (!(e.key === 'Delete' || e.key === 'Backspace')) return;
      if (isEditing) return;
      const ids = selectedIdsRef.current;
      if (!ids || ids.size === 0) return;
      e.preventDefault();
      setShapes(prev => {
        const next = prev.filter(s => !ids.has(s.id));
        shapesRef.current = next;
        return next;
      });
      setEraseByShape(prev => {
        const cp = { ...prev };
        ids.forEach(id => { delete cp[id]; });
        return cp;
      });
      setSelectedIds(new Set());
      setActiveShapeId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLayerAction = (action) => {
    if (!activeShapeId) return;
    setShapes(prev => {
      const idx = prev.findIndex(s => s.id === activeShapeId);
      if (idx === -1) return prev;
      const list = [...prev];
      if (action === 'up' && idx < list.length - 1) {
        [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
      } else if (action === 'down' && idx > 0) {
        [list[idx], list[idx - 1]] = [list[idx - 1], list[idx]];
      } else if (action === 'to-front') {
        const [item] = list.splice(idx, 1);
        list.push(item);
      } else if (action === 'to-back') {
        const [item] = list.splice(idx, 1);
        list.unshift(item);
      }
      return list.map((s, i) => ({ ...s, z: i }));
    });
  };

  // 面板：绘图时显示工具选项；无工具但单选对象时显示对象属性
  const singleSelectedId = selectedIds && selectedIds.size === 1 ? Array.from(selectedIds)[0] : null;
  const singleSelectedShape = singleSelectedId ? shapes.find(s => s.id === singleSelectedId) : null;

  const buildOptionsFromShape = (s) => {
    if (!s) return toolOptions;
    if (s.type === 'text') {
      return {
        color: s.props.color ?? '#111827',
        fontSize: s.props.fontSize ?? 16,
        textAlign: s.props.textAlign ?? 'left',
        opacity: s.props.opacity ?? 1,
      };
    }
    const base = {
      stroke: s.props.stroke ?? '#3b82f6',
      fill: s.props.fill ?? 'transparent',
      strokeWidth: s.props.strokeWidth ?? 2,
      strokeStyle: s.props.strokeStyle ?? 'solid',
      opacity: s.props.opacity ?? 1,
    };
    if (s.type === 'rectangle') base.cornerRadius = s.props.cornerRadius ?? 8;
    return base;
  };

  const applyShapeOptions = (opts) => {
    if (!singleSelectedShape) return;
    setShapes(prev => prev.map(s => {
      if (s.id !== singleSelectedShape.id) return s;
      if (s.type === 'text') {
        return { ...s, props: { ...s.props, color: opts.color, fontSize: opts.fontSize, textAlign: opts.textAlign, opacity: opts.opacity } };
      }
      const patch = {
        stroke: opts.stroke,
        fill: opts.fill,
        strokeWidth: opts.strokeWidth,
        strokeStyle: opts.strokeStyle,
        opacity: opts.opacity,
      };
      if (s.type === 'rectangle') patch.cornerRadius = opts.cornerRadius;
      return { ...s, props: { ...s.props, ...patch } };
    }));
  };

  // 图片工具使用自定义上传面板，不显示通用工具设置
  const panelVisible = !!selectedTool || (!!singleSelectedShape && !selectedTool);
  const panelTool = selectedTool || (singleSelectedShape ? singleSelectedShape.type : null);
  const panelOptions = selectedTool ? toolOptions : buildOptionsFromShape(singleSelectedShape);
  const panelOnChange = selectedTool ? setToolOptions : applyShapeOptions;
  // keep ref in sync to avoid stale closures
  useEffect(() => { isMovingSelectionRef.current = isMovingSelection; }, [isMovingSelection]);

  return (
  <div className="relative w-full h-full bg-gray-50 dark:bg-gray-900 overflow-hidden" style={{ cursor: isMovingSelection ? 'move' : undefined }}>
      {/* 背景层（网格） */}
      <div 
        ref={canvasRef}
        className="absolute inset-0"
        onDoubleClick={handleCanvasDoubleClick}
      >
  {/* 顶部工具栏 */}
  <CanvasToolbar selectedTool={selectedTool} onSelectTool={setSelectedTool} />
  {/* 左侧工具设置：绘图工具或单对象选中时可见 */}
  <ToolOptionsPanel visible={panelVisible} tool={panelTool} options={panelOptions} onChange={panelOnChange} onLayer={handleLayerAction} onImagePicked={handleImagePicked} />
  {/* 屏蔽左侧 hover 区域：当工具面板可见时，拦截左侧靠边触发悬浮的鼠标事件 */}
  {selectedTool && (
    <div
      className="absolute top-0 left-0 h-full z-30"
      style={{ width: 360, pointerEvents: 'auto' }}
      onMouseEnter={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onMouseLeave={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    />
  )}
        {/* 变换容器：包含连接线 + memos */}
        <div
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`, transformOrigin: '0 0' }}
        >
          {/* 无限网格背景 - 巨大背景区域，始终覆盖可视区域 */}
          <div
            className="absolute"
            style={{
              // 创建巨大无比的世界坐标网格区域
              width: '1000000px',
              height: '1000000px',
              // 相对于变换容器居中（世界坐标原点）
              left: '-500000px',
              top: '-500000px',
              // 确保在所有缩放级别下都有网格（网格线间距固定，不随缩放变化）
              backgroundImage: [
                // 主网格线 - 每100px一条（较粗）
                `repeating-linear-gradient(to right, rgba(107,114,128,0.15) 0, rgba(107,114,128,0.15) 1px, transparent 1px, transparent 100px)`,
                `repeating-linear-gradient(to bottom, rgba(107,114,128,0.15) 0, rgba(107,114,128,0.15) 1px, transparent 1px, transparent 100px)`,
                // 次网格线 - 每20px一条（较细）
                `repeating-linear-gradient(to right, rgba(107,114,128,0.06) 0, rgba(107,114,128,0.06) 1px, transparent 1px, transparent 20px)`,
                `repeating-linear-gradient(to bottom, rgba(107,114,128,0.06) 0, rgba(107,114,128,0.06) 1px, transparent 1px, transparent 20px)`
              ].join(', '),
              // 让背景跟随变换（缩放和平移）
              pointerEvents: 'none'
            }}
          />

          {/* 连接线（世界坐标） */}
          <svg 
            className="absolute inset-0"
            style={{ zIndex: 1, width: '100%', height: '100%', pointerEvents: 'auto' }}
          >
            {/* 定义：箭头标记与局部擦除段遮罩 */}
            <defs>
              {shapes.filter(s => s.type === 'arrow').map(s => (
                <marker key={`arrow-${s.id}`} id={`arrow-${s.id}`} markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" fill={s.props.stroke} />
                </marker>
              ))}
              {/* 为每个图形生成合成遮罩（白=保留，黑=擦除） */}
              {shapes.filter(s => s.type !== 'eraser').map(s => {
                // 历史擦除点：来自按图形聚合的列表
                const relatedPoints = (eraseByShape[s.id] || []);
                // 实时预览：当工具为局部擦除且正在拖拽时，将当前橡皮擦路径也加入遮罩
                const showPreview = selectedTool === 'eraser' && (toolOptions.eraseType || 'partial') === 'partial' && isDrawing;
                let previewPoints = [];
                if (showPreview && activeShapeId) {
                  const currentEraser = shapes.find(sh => sh.id === activeShapeId && sh.type === 'eraser');
                  const baseR = currentEraser?.props?.radius || Math.max(15, (toolOptions.strokeWidth || 2) * 5);
                  const pts = (currentEraser?.props?.points || []).map(p => ({ x: p.x, y: p.y, r: baseR }));
                  if (pts.length) previewPoints = pts;
                }
                const allPoints = relatedPoints.concat(previewPoints);
                if (!allPoints.length) return null;
                return (
                  <mask
                    key={`mask-shape-${s.id}`}
                    id={`mask-shape-${s.id}`}
                    maskUnits="userSpaceOnUse"
                    maskContentUnits="userSpaceOnUse"
                    maskType="luminance"
                    x="-100000"
                    y="-100000"
                    width="200000"
                    height="200000"
                  >
                    <rect x="-100000" y="-100000" width="200000" height="200000" fill="white" />
                    {allPoints.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="black" />
                    ))}
                  </mask>
                );
              })}
            </defs>
            
            {connections.map((connection, index) => {
              const fromMemo = allMemos.find(m => m.id === connection.from);
              const toMemo = allMemos.find(m => m.id === connection.to);
              if (fromMemo && toMemo) {
                return (
                  <line
                    key={index}
                    x1={fromMemo.canvasX}
                    y1={fromMemo.canvasY}
                    x2={toMemo.canvasX}
                    y2={toMemo.canvasY}
                    stroke="rgba(59, 130, 246, 0.45)"
                    strokeWidth="2"
                    strokeDasharray="4 6"
                  />
                );
              }
              return null;
            })}

            {/* 绘制的形状层：每个图形应用其合成遮罩 */}
            {shapes.filter(s => s.type !== 'eraser').map((s) => {
              const previewHit = !!(erasePreviewIds && erasePreviewIds.has && erasePreviewIds.has(s.id));
              // 与 <defs> 中一致地汇总该图形的所有擦除点（历史 + 预览）
              const relatedPoints = (eraseByShape[s.id] || []);
              let previewPoints = [];
              if (selectedTool === 'eraser' && (toolOptions.eraseType || 'partial') === 'partial' && isDrawing && activeShapeId) {
                const currentEraser = shapes.find(sh => sh.id === activeShapeId && sh.type === 'eraser');
                const baseR = currentEraser?.props?.radius || Math.max(15, (toolOptions.strokeWidth || 2) * 5);
                const pts = (currentEraser?.props?.points || []).map(p => ({ x: p.x, y: p.y, r: baseR }));
                if (pts.length) previewPoints = pts;
              }
              const allPoints = relatedPoints.concat(previewPoints);
              const hasMask = allPoints.length > 0;
              const maybeWrap = (node) => hasMask ? (
                <g key={`wrap-${s.id}`} mask={`url(#mask-shape-${s.id})`}>{node}</g>
              ) : node;
              const baseOpacity = s.props.opacity ?? 1;
              const opacity = previewHit ? Math.max(0.25, baseOpacity * 0.4) : baseOpacity;
              const isSelected = selectedIds && selectedIds.has && selectedIds.has(s.id);
              const highlightStroke = '#3b82f6';
              const highlightDash = '4 4';
              const onSelectPointerDown = (ev) => {
                if (selectedToolRef.current) return; // 绘图状态不处理
                ev.stopPropagation();
                // 防止文本形状内触发选区/光标，专注移动
                ev.preventDefault();
                // Ctrl 点击：切换该图形的选中状态，不进入拖动
                if (ev.ctrlKey) {
                  const cur = new Set(selectedIdsRef.current ? Array.from(selectedIdsRef.current) : []);
                  if (cur.has(s.id)) {
                    cur.delete(s.id);
                    if (activeShapeIdRef.current === s.id) setActiveShapeId(null);
                  } else {
                    cur.add(s.id);
                  }
                  setSelectedIds(cur);
                  return;
                }
                // 计算世界坐标
                const svgRect = canvasRef.current.getBoundingClientRect();
                const t = translateRef.current;
                const sc = scaleRef.current;
                const sx = ev.clientX - svgRect.left - t.x;
                const sy = ev.clientY - svgRect.top - t.y;
                const wx = sx / sc;
                const wy = sy / sc;

                // 确定将要移动的 id 集合
                const currentSel = selectedIdsRef.current || new Set();
                const movingSet = currentSel.has(s.id) && currentSel.size > 0 ? new Set(currentSel) : new Set([s.id]);
                if (!(currentSel.has(s.id) && currentSel.size > 0)) {
                  setSelectedIds(movingSet);
                }
                setActiveShapeId(s.id);

                // 初始化拖动快照
                setIsMovingSelection(true);
                isMovingSelectionRef.current = true;
                moveStartRef.current = { x: wx, y: wy };
                movingIdsRef.current = movingSet;
                moveShapesSnapshotRef.current = [...shapesRef.current];
                moveOriginalPropsRef.current = new Map();
                moveOriginalEraseRef.current = new Map();
                // 记录每个移动对象的原始属性与擦除点
                moveShapesSnapshotRef.current.forEach(sh => {
                  if (!movingSet.has(sh.id)) return;
                  const p = sh.props || {};
                  // 浅拷贝数值属性即可
                  if (sh.type === 'rectangle' || sh.type === 'ellipse' || sh.type === 'image') {
                    moveOriginalPropsRef.current.set(sh.id, { x: p.x, y: p.y, w: p.w, h: p.h });
                  } else if (sh.type === 'line' || sh.type === 'arrow') {
                    moveOriginalPropsRef.current.set(sh.id, { x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2 });
                  } else if (sh.type === 'pencil') {
                    moveOriginalPropsRef.current.set(sh.id, { points: (p.points || []).map(pt => ({ x: pt.x, y: pt.y })) });
                  } else if (sh.type === 'text') {
                    moveOriginalPropsRef.current.set(sh.id, { x: p.x, y: p.y });
                  }
                  const ep = (eraseByShapeRef.current && eraseByShapeRef.current[sh.id]) || [];
                  // 存储原始擦除点（世界坐标）
                  moveOriginalEraseRef.current.set(sh.id, ep.map(pt => ({ x: pt.x, y: pt.y, r: pt.r })));
                });

                const onMove = (e2) => {
                  if (!isMovingSelectionRef.current) return;
                  const r = canvasRef.current.getBoundingClientRect();
                  const tt = translateRef.current;
                  const sc2 = scaleRef.current;
                  const msx = e2.clientX - r.left - tt.x;
                  const msy = e2.clientY - r.top - tt.y;
                  const mx = msx / sc2;
                  const my = msy / sc2;
                  const dx = mx - moveStartRef.current.x;
                  const dy = my - moveStartRef.current.y;

                  // 更新形状位置（基于快照与原始属性）
                  const movingIds = movingIdsRef.current || new Set();
                  const newShapes = moveShapesSnapshotRef.current.map(sh => {
                    if (!movingIds.has(sh.id)) return sh;
                    const base = moveOriginalPropsRef.current.get(sh.id) || {};
                    if (sh.type === 'rectangle' || sh.type === 'ellipse' || sh.type === 'image') {
                      return { ...sh, props: { ...sh.props, x: base.x + dx, y: base.y + dy } };
                    } else if (sh.type === 'line' || sh.type === 'arrow') {
                      return { ...sh, props: { ...sh.props, x1: base.x1 + dx, y1: base.y1 + dy, x2: base.x2 + dx, y2: base.y2 + dy } };
                    } else if (sh.type === 'pencil') {
                      const movedPts = (base.points || []).map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
                      return { ...sh, props: { ...sh.props, points: movedPts } };
                    } else if (sh.type === 'text') {
                      return { ...sh, props: { ...sh.props, x: base.x + dx, y: base.y + dy } };
                    }
                    return sh;
                  });
                  setShapes(newShapes);
                  shapesRef.current = newShapes;

                  // 同步移动已擦除的蒙版点，使擦除效果随图形移动
                  const newErase = { ...eraseByShapeRef.current };
                  movingIds.forEach(id => {
                    const orig = moveOriginalEraseRef.current.get(id) || [];
                    newErase[id] = orig.map(pt => ({ x: pt.x + dx, y: pt.y + dy, r: pt.r }));
                  });
                  setEraseByShape(newErase);
                  eraseByShapeRef.current = newErase;
                };

                const onUp = () => {
                  setIsMovingSelection(false);
                  isMovingSelectionRef.current = false;
                  moveStartRef.current = null;
                  movingIdsRef.current = null;
                  moveOriginalPropsRef.current = new Map();
                  moveOriginalEraseRef.current = new Map();
                  moveShapesSnapshotRef.current = [];
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  window.removeEventListener('pointercancel', onUp);
                };

                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
                window.addEventListener('pointercancel', onUp);
              };
              if (s.type === 'rectangle') {
                const dash = s.props.strokeStyle === 'dashed' ? '6 6' : s.props.strokeStyle === 'dotted' ? '2 6' : undefined;
                const node = (
                  <rect x={s.props.x} y={s.props.y} width={Math.abs(s.props.w)} height={Math.abs(s.props.h)} rx={s.props.cornerRadius || 0}
                    fill={s.props.fill === 'transparent' ? 'none' : s.props.fill}
                    stroke={s.props.stroke}
                    strokeWidth={s.props.strokeWidth}
                    strokeDasharray={dash}
                    opacity={opacity}
                  />
                );
                return (
                  <g key={s.id} data-shape-root="1" onPointerDown={onSelectPointerDown} style={{ cursor: (!selectedTool && selectedIds && selectedIds.has && selectedIds.has(s.id)) ? 'move' : undefined }}>
                    {maybeWrap(node)}
                    {isSelected && (
                      <rect x={s.props.x} y={s.props.y} width={Math.abs(s.props.w)} height={Math.abs(s.props.h)} rx={s.props.cornerRadius || 0}
                        fill="none" stroke={highlightStroke} strokeWidth={(s.props.strokeWidth || 2) + 2} strokeDasharray={highlightDash} opacity={0.9} pointerEvents="none" />
                    )}
                  </g>
                );
              }
              if (s.type === 'image') {
                const node = (
                  <image href={s.props.src} x={s.props.x} y={s.props.y} width={Math.abs(s.props.w)} height={Math.abs(s.props.h)} opacity={opacity} preserveAspectRatio="xMidYMid meet" />
                );
                return (
                  <g key={s.id} data-shape-root="1" onPointerDown={onSelectPointerDown} style={{ cursor: (!selectedTool && selectedIds && selectedIds.has && selectedIds.has(s.id)) ? 'move' : undefined }}>
                    {maybeWrap(node)}
                    {isSelected && (
                      <rect x={s.props.x} y={s.props.y} width={Math.abs(s.props.w)} height={Math.abs(s.props.h)} fill="none" stroke={highlightStroke} strokeWidth={2} strokeDasharray={highlightDash} opacity={0.9} pointerEvents="none" />
                    )}
                  </g>
                );
              }
              if (s.type === 'ellipse') {
                const dash = s.props.strokeStyle === 'dashed' ? '6 6' : s.props.strokeStyle === 'dotted' ? '2 6' : undefined;
                const node = (
                  <ellipse cx={s.props.x + Math.abs(s.props.w)/2} cy={s.props.y + Math.abs(s.props.h)/2} rx={Math.abs(s.props.w)/2} ry={Math.abs(s.props.h)/2}
                    fill={s.props.fill === 'transparent' ? 'none' : s.props.fill}
                    stroke={s.props.stroke}
                    strokeWidth={s.props.strokeWidth}
                    strokeDasharray={dash}
                    opacity={opacity}
                  />
                );
                const cx = s.props.x + Math.abs(s.props.w)/2;
                const cy = s.props.y + Math.abs(s.props.h)/2;
                return (
                  <g key={s.id} data-shape-root="1" onPointerDown={onSelectPointerDown} style={{ cursor: (!selectedTool && selectedIds && selectedIds.has && selectedIds.has(s.id)) ? 'move' : undefined }}>
                    {maybeWrap(node)}
                    {isSelected && (
                      <ellipse cx={cx} cy={cy} rx={Math.abs(s.props.w)/2} ry={Math.abs(s.props.h)/2}
                        fill="none" stroke={highlightStroke} strokeWidth={(s.props.strokeWidth || 2) + 2} strokeDasharray={highlightDash} opacity={0.9} pointerEvents="none" />
                    )}
                  </g>
                );
              }
              if (s.type === 'line' || s.type === 'arrow') {
                const dash = s.props.strokeStyle === 'dashed' ? '6 6' : s.props.strokeStyle === 'dotted' ? '2 6' : undefined;
                const node = (
                  <line x1={s.props.x1} y1={s.props.y1} x2={s.props.x2} y2={s.props.y2}
                    stroke={s.props.stroke} strokeWidth={s.props.strokeWidth} strokeDasharray={dash} opacity={opacity}
                    markerEnd={s.type === 'arrow' ? `url(#arrow-${s.id})` : undefined}
                  />
                );
                return (
                  <g key={s.id} data-shape-root="1" onPointerDown={onSelectPointerDown} style={{ cursor: (!selectedTool && selectedIds && selectedIds.has && selectedIds.has(s.id)) ? 'move' : undefined }}>
                    {maybeWrap(node)}
                    {isSelected && (
                      <line x1={s.props.x1} y1={s.props.y1} x2={s.props.x2} y2={s.props.y2}
                        stroke={highlightStroke} strokeWidth={(s.props.strokeWidth || 2) + 2} strokeDasharray={highlightDash} opacity={0.9} pointerEvents="none" />
                    )}
                  </g>
                );
              }
              if (s.type === 'pencil') {
                const d = (s.props.points || []).map((p, i) => `${i===0?'M':'L'} ${p.x} ${p.y}`).join(' ');
                const node = (
                  <path d={d} fill="none" stroke={s.props.stroke} strokeWidth={s.props.strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={opacity} />
                );
                return (
                  <g key={s.id} data-shape-root="1" onPointerDown={onSelectPointerDown} style={{ cursor: (!selectedTool && selectedIds && selectedIds.has && selectedIds.has(s.id)) ? 'move' : undefined }}>
                    {maybeWrap(node)}
                    {isSelected && (
                      <path d={d} fill="none" stroke={highlightStroke} strokeWidth={(s.props.strokeWidth || 2) + 2} strokeDasharray={highlightDash} opacity={0.9} pointerEvents="none" />
                    )}
                  </g>
                );
              }
              if (s.type === 'text') {
                const node = (
                  <foreignObject x={s.props.x} y={s.props.y} width="200" height="50" opacity={s.props.opacity ?? 1}>
                    <div
                      data-shape-id={s.id}
                      contentEditable
                      suppressContentEditableWarning
                      style={{
                        color: s.props.color,
                        fontSize: `${s.props.fontSize}px`,
                        textAlign: s.props.textAlign,
                        fontFamily: 'inherit',
                        lineHeight: '1.2',
                        outline: 'none',
                        cursor: 'text',
                        padding: '2px 4px',
                        borderRadius: '2px',
                        border: activeShapeId === s.id ? '1px dashed #3b82f6' : '1px solid transparent',
                        minWidth: '50px',
                        minHeight: '20px'
                      }}
                      onFocus={(e) => setActiveShapeId(s.id)}
                      onBlur={(e) => {
                        const newText = e.target.textContent || '双击编辑';
                        setShapes(prev => prev.map(shape => 
                          shape.id === s.id 
                            ? { ...shape, props: { ...shape.props, text: newText } }
                            : shape
                        ));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.target.blur();
                        }
                      }}
                    >
                      {s.props.text}
                    </div>
                  </foreignObject>
                );
                return (
                  <g key={s.id} data-shape-root="1" onPointerDown={onSelectPointerDown} style={{ cursor: (!selectedTool && selectedIds && selectedIds.has && selectedIds.has(s.id)) ? 'move' : undefined }}>
                    {maybeWrap(node)}
                    {isSelected && (
                      <rect x={s.props.x} y={s.props.y} width={200} height={50} fill="none" stroke={highlightStroke} strokeDasharray={highlightDash} strokeWidth={2} pointerEvents="none" />
                    )}
                  </g>
                );
              }
              return null;
            })}

            {/* 橡皮擦可视化（当前拖动时的白色半透明圆+更长尾巴，静止自动淡出） */}
            {activeShapeId && (() => {
              const erasing = shapes.find(sh => sh.id === activeShapeId && sh.type === 'eraser');
              if (!erasing) return null;
              const pts = erasing.props.points || [];
              const baseR = erasing.props.radius || 12;
              const tailCount = Math.min(32, pts.length); // 加长尾迹
              const tail = pts.slice(-tailCount);
              // 静止淡出：根据是否绘制中控制整体透明度
              const groupOpacity = isDrawingRef.current ? 1 : 0; // 通过 CSS 过渡由 1 -> 0
              return (
                <g className="pointer-events-none transition-opacity duration-400" style={{ opacity: groupOpacity }}>
                  {tail.map((p, i) => {
                    const t = (i + 1) / tail.length; // 0..1
                    const r = baseR * (0.28 + 0.72 * t); // 逐渐变小
                    const opacity = 0.12 + 0.28 * t; // 尾巴更透明
                    return <circle key={i} cx={p.x} cy={p.y} r={r} fill="#ffffff" opacity={opacity} />;
                  })}
                </g>
              );
            })()}
          </svg>

          {/* 框选矩形（世界坐标） */}
          {isSelecting && selectionRect && (
            <svg className="absolute inset-0" style={{ zIndex: 2, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <rect
                x={selectionRect.x}
                y={selectionRect.y}
                width={selectionRect.w}
                height={selectionRect.h}
                fill="rgba(59,130,246,0.08)"
                stroke="#3b82f6"
                strokeDasharray="4 4"
                strokeWidth="1.5"
              />
            </svg>
          )}

          {/* Memo 项 */}
          {allMemos.map(memo => (
            <DraggableMemo
              key={memo.id}
              memo={memo}
              onDragStart={handleDragStart}
              onDrag={handleDrag}
              onDragEnd={handleDragEnd}
              onUpdate={onUpdateMemo}
              onDelete={onDeleteMemo}
              onTogglePin={onTogglePin}
              scale={scale}
              style={{
                position: 'absolute',
                left: memo.canvasX || 0,
                top: memo.canvasY || 0,
                zIndex: draggingId === memo.id ? 10 : 5
              }}
            />
          ))}
        </div>

        {/* 底部编辑器（固定在屏幕坐标，不随画布缩放） */}
        <CanvasEditor onAddMemo={onAddMemo} canvasSize={canvasSize} scale={scale} translate={translate} />

  {/* 图片上传改为左侧工具配置面板中呈现 */}

        {/* 右下角工具条（不缩放，固定屏幕 UI） */}
        <div className="absolute right-4 bottom-4 z-30 flex flex-col items-end gap-2">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 shadow px-2 py-1 flex items-center gap-1">
            <button className="px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded" onClick={() => setScale(s => clamp(s * 0.9, 0.5, 2.5))}>-</button>
            <div
              className="px-2 text-sm tabular-nums text-gray-600 dark:text-gray-300 cursor-help relative"
              onMouseEnter={showTooltip}
              onMouseLeave={hideTooltip}
            >
              {Math.round(scale * 100)}%
            </div>
            <button className="px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded" onClick={() => setScale(s => clamp(s * 1.1, 0.5, 2.5))}>+</button>
            <button className="ml-1 px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded" onClick={() => { setScale(1); setTranslate({ x: 0, y: 0 }); }}>重置</button>
          </div>
        </div>

        {/* 缩放提示tooltip */}
        <div
          className={`fixed bg-gray-900 dark:bg-gray-800 text-white p-2 rounded text-xs pointer-events-none transition-opacity whitespace-nowrap shadow-lg border border-gray-700 ${
            tooltip.show ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            zIndex: 50,
            transform: tooltip.show ? 'scale(1)' : 'scale(0.95)',
            transition: 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out'
          }}
        >
          鼠标中键拖拽画布，Ctrl+滚轮缩放
        </div>
        {/* 全局拖拽提示 */}
        {showGlobalDropHint && (
          <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center">
            <div className="rounded-xl border border-blue-300/70 bg-blue-500/10 px-4 py-2 text-sm text-blue-700 dark:text-blue-200 shadow">
              松开以上传图片到画布
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 命中测试：判断 (x,y) 是否命中图形（用于对象擦除）
function isHitShape(shape, x, y, eraserR = 0) {
  if (!shape || !shape.props) return false;
  const p = shape.props;
  if (shape.type === 'rectangle') {
  const x0 = p.x;
  const y0 = p.y;
  const w = Math.abs(p.w);
  const h = Math.abs(p.h);
  const x1 = x0 + w;
  const y1 = y0 + h;
  const hasFill = p.fill && p.fill !== 'transparent' && p.fill !== 'none';
  const strokeW = p.strokeWidth || 2;
  const tol = strokeW / 2 + 4 + eraserR;
  // 如果有填充，内部即命中
  if (hasFill && x >= x0 && y >= y0 && x <= x1 && y <= y1) return true;
  // 否则/另外：检测边框邻近（到四条边的距离）
  const clampedX = Math.max(x0, Math.min(x, x1));
  const clampedY = Math.max(y0, Math.min(y, y1));
  const dx = Math.min(Math.abs(x - x0), Math.abs(x - x1));
  const dy = Math.min(Math.abs(y - y0), Math.abs(y - y1));
  const nearHorizontal = (y >= y0 - tol && y <= y0 + tol && x >= x0 - tol && x <= x1 + tol) ||
               (y >= y1 - tol && y <= y1 + tol && x >= x0 - tol && x <= x1 + tol);
  const nearVertical = (x >= x0 - tol && x <= x0 + tol && y >= y0 - tol && y <= y1 + tol) ||
             (x >= x1 - tol && x <= x1 + tol && y >= y0 - tol && y <= y1 + tol);
  return nearHorizontal || nearVertical || (Math.min(dx, dy) <= tol && x >= x0 - tol && x <= x1 + tol && y >= y0 - tol && y <= y1 + tol);
  }
  if (shape.type === 'ellipse') {
  const cx = p.x + Math.abs(p.w) / 2;
  const cy = p.y + Math.abs(p.h) / 2;
  const rx = Math.abs(p.w) / 2;
  const ry = Math.abs(p.h) / 2;
  if (rx === 0 || ry === 0) return false;
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  const r2 = nx * nx + ny * ny;
  const hasFill = p.fill && p.fill !== 'transparent' && p.fill !== 'none';
  if (hasFill && r2 <= 1) return true; // 内部命中
  // 边框命中：接近椭圆边界 r ~= 1
  const strokeW = p.strokeWidth || 2;
  const tol = (strokeW / Math.min(rx, ry)) + 0.1 + (eraserR / Math.min(rx, ry)); // 粗略容差
  const r = Math.sqrt(r2);
  return Math.abs(r - 1) <= tol;
  }
  if (shape.type === 'line' || shape.type === 'arrow') {
    // 点到线段距离
    const { x1, y1, x2, y2 } = p;
    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    const t = len_sq !== 0 ? Math.max(0, Math.min(1, dot / len_sq)) : 0;
    const projX = x1 + t * C;
    const projY = y1 + t * D;
    const dist = Math.hypot(x - projX, y - projY);
  const tol = (p.strokeWidth || 4) + 4 + eraserR;
    return dist <= tol;
  }
  if (shape.type === 'pencil') {
    // 到折线最近距离（简单取最近点）
    const pts = p.points || [];
  const tol = (p.strokeWidth || 2) + 6 + eraserR;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const A = x - a.x;
      const B = y - a.y;
      const C = b.x - a.x;
      const D = b.y - a.y;
      const dot = A * C + B * D;
      const len_sq = C * C + D * D;
      const t = len_sq !== 0 ? Math.max(0, Math.min(1, dot / len_sq)) : 0;
      const projX = a.x + t * C;
      const projY = a.y + t * D;
      if (Math.hypot(x - projX, y - projY) <= tol) return true;
    }
    return false;
  }
  if (shape.type === 'image') {
    const x0 = p.x, y0 = p.y, w = Math.abs(p.w || 0), h = Math.abs(p.h || 0);
    const x1 = x0 + w, y1 = y0 + h;
    // 视作填充矩形命中
    if (x >= x0 - eraserR && y >= y0 - eraserR && x <= x1 + eraserR && y <= y1 + eraserR) return true;
    return false;
  }
  if (shape.type === 'text') {
    // 使用一个简易包围盒
    const w = 200;
    const h = 50;
    return x >= p.x && y >= p.y && x <= p.x + w && y <= p.y + h;
  }
  return false;
}

// 获取图形的包围盒（世界坐标，用于框选相交判断）
function getShapeBBox(shape) {
  if (!shape || !shape.props) return null;
  const p = shape.props;
  if (shape.type === 'rectangle' || shape.type === 'ellipse') {
    return { x: p.x, y: p.y, w: Math.abs(p.w || 0), h: Math.abs(p.h || 0) };
  }
  if (shape.type === 'line' || shape.type === 'arrow') {
    const x0 = Math.min(p.x1, p.x2);
    const y0 = Math.min(p.y1, p.y2);
    const w = Math.abs((p.x2 ?? p.x1) - p.x1);
    const h = Math.abs((p.y2 ?? p.y1) - p.y1);
    return { x: x0, y: y0, w, h };
  }
  if (shape.type === 'pencil') {
    const pts = p.points || [];
    if (!pts.length) return null;
    let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
    for (let i = 1; i < pts.length; i++) {
      const pt = pts[i];
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (shape.type === 'image') {
    return { x: p.x, y: p.y, w: Math.abs(p.w || 0), h: Math.abs(p.h || 0) };
  }
  if (shape.type === 'text') {
    // 与渲染时 foreignObject 的大小一致
    return { x: p.x, y: p.y, w: 200, h: 50 };
  }
  return null;
}

function rectsIntersect(a, b) {
  if (!a || !b) return false;
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

export default CanvasMode;