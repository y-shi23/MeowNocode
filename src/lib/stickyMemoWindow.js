import { isTauri } from '@/lib/utils';

let WebviewWindowCtor = null;

export const STICKY_WINDOW_WIDTH = 360;
export const STICKY_WINDOW_HEIGHT = 420;
const SAFE_MARGIN = 24;

async function ensureWindowCtor() {
  if (WebviewWindowCtor) return WebviewWindowCtor;
  const mod = await import('@tauri-apps/api/window');
  WebviewWindowCtor = mod.WebviewWindow;
  return WebviewWindowCtor;
}

function buildTitleFromMemo(memo) {
  const raw = (memo?.content || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '便签';
  return `便签｜${raw.slice(0, 18)}`;
}

export async function openStickyMemoWindow(memo, position = {}) {
  if (!isTauri()) {
    throw new Error('当前环境不支持便签窗口');
  }

  const WebviewWindow = await ensureWindowCtor();

  const memoId = memo?.id != null ? String(memo.id) : '';
  const urlId = memoId ? encodeURIComponent(memoId) : 'unknown';
  const instance = Date.now().toString(36);
  const url = `/#/sticky/${urlId}?instance=${instance}`;

  let screenX = Number(position.screenX);
  let screenY = Number(position.screenY);

  const hasValidScreenPosition = Number.isFinite(screenX) && Number.isFinite(screenY);

  const width = STICKY_WINDOW_WIDTH;
  const height = STICKY_WINDOW_HEIGHT;

  let x = hasValidScreenPosition ? Math.round(screenX - width / 2) : undefined;
  let y = hasValidScreenPosition ? Math.round(screenY - height / 2) : undefined;

  if (Number.isFinite(x)) {
    x = Math.max(SAFE_MARGIN, x);
  }
  if (Number.isFinite(y)) {
    y = Math.max(SAFE_MARGIN, y);
  }

  const label = `memo-${memoId || 'unknown'}-${Date.now().toString(36)}`;
  const options = {
    url,
    width,
    height,
    resizable: false,
    decorations: false,
    focus: true,
    transparent: true,
    alwaysOnTop: true,
    title: buildTitleFromMemo(memo),
    skipTaskbar: true,
  };

  if (Number.isFinite(x)) options.x = x;
  if (Number.isFinite(y)) options.y = y;

  const windowInstance = new WebviewWindow(label, options);

  await new Promise((resolve, reject) => {
    windowInstance.once('tauri://created', resolve);
    windowInstance.once('tauri://error', (event) => {
      const message = event?.payload || '创建便签窗口失败';
      reject(new Error(message));
    });
  });

  return windowInstance;
}
