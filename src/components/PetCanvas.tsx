import { useEffect, useRef, useState } from 'react';
import { usePetStore } from '../stores/petStore';
import { getCurrentWindow } from '@tauri-apps/api/window';
import * as PIXI from 'pixi.js';
import petsData from '../data/pets.json';

interface PetConfig {
  id: string;
  name: string;
  spritePath: string;
  frameWidth: number;
  frameHeight: number;
  animations: {
    idle: { row: number; frames: number };
    hover: { row: number; frames: number };
    click: { row: number; frames: number };
  };
}

const pets: PetConfig[] = petsData.pets;
const FRAME_SPEED = 0.05;
const WINDOW_WIDTH = 135;
const WINDOW_HEIGHT = 175;

function PetCanvas() {
  const storePetId = usePetStore((state) => state.currentPetId);
  const { opacity, clickThrough } = usePetStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const playClickRef = useRef<(() => void) | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const spriteRef = useRef<PIXI.Sprite | null>(null);
  const animRef = useRef<{
    current: 'idle' | 'hover' | 'click';
    frame: number;
    elapsed: number;
  } | null>(null);
  const [currentPetId, setCurrentPetId] = useState<string>(() => {
    return localStorage.getItem('currentPetId') || storePetId;
  });

  const pet = pets.find(p => p.id === currentPetId) || pets[0];

  // 监听 localStorage 变化（来自设置窗口）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'currentPetId' && e.newValue) {
        setCurrentPetId(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const pollInterval = setInterval(() => {
      const stored = localStorage.getItem('currentPetId');
      if (stored && stored !== currentPetId) {
        setCurrentPetId(stored);
      }
    }, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollInterval);
    };
  }, [currentPetId]);

  useEffect(() => {
    if (!containerRef.current) return;

    console.log('[PetCanvas] Switching to pet:', pet.id);

    if (appRef.current) {
      appRef.current.destroy(true);
      appRef.current = null;
      spriteRef.current = null;
      animRef.current = null;
    }

    // 使用固定窗口尺寸
    const app = new PIXI.Application({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      backgroundAlpha: 0,
    });
    containerRef.current.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;

    // 计算缩放比例，让宠物完整显示在窗口内
    const scaleX = WINDOW_WIDTH / pet.frameWidth;
    const scaleY = WINDOW_HEIGHT / pet.frameHeight;
    const scale = Math.min(scaleX, scaleY); // 用较小的确保完整显示

    const spritePath = `/resources/pets/${pet.id}/sprite.png?t=${Date.now()}`;
    console.log('[PetCanvas] Loading texture from:', spritePath);
    const baseTexture = PIXI.BaseTexture.from(spritePath);

    let mounted = true;

    baseTexture.on('loaded', () => {
      if (!mounted || !containerRef.current) return;

      const texture = new PIXI.Texture(baseTexture);
      const sprite = new PIXI.Sprite(texture);
      spriteRef.current = sprite;

      // 应用缩放，让宠物适应窗口
      sprite.scale.set(scale);

      // 居中显示
      const scaledWidth = pet.frameWidth * scale;
      const scaledHeight = pet.frameHeight * scale;
      sprite.x = (WINDOW_WIDTH - scaledWidth) / 2;
      sprite.y = (WINDOW_HEIGHT - scaledHeight) / 2;

      animRef.current = {
        current: 'idle',
        frame: 0,
        elapsed: 0,
      };

      const updateFrame = () => {
        if (!animRef.current || !spriteRef.current) return;
        const { row } = pet.animations[animRef.current.current];
        spriteRef.current.texture.frame = new PIXI.Rectangle(
          animRef.current.frame * pet.frameWidth,
          row * pet.frameHeight,
          pet.frameWidth,
          pet.frameHeight
        );
        spriteRef.current.texture.update();
      };

      const play = (name: 'idle' | 'hover' | 'click') => {
        if (!animRef.current) return;
        animRef.current.current = name;
        animRef.current.frame = 0;
        animRef.current.elapsed = 0;
        updateFrame();
      };

      playClickRef.current = () => play('click');

      play('idle');
      app.stage.addChild(sprite);
      setLoaded(true);

      app.ticker.add((delta) => {
        if (!animRef.current) return;
        animRef.current.elapsed += delta * 0.016;
        if (animRef.current.elapsed >= FRAME_SPEED) {
          animRef.current.elapsed = 0;
          animRef.current.frame++;

          const config = pet.animations[animRef.current.current];
          if (animRef.current.frame >= config.frames) {
            if (animRef.current.current === 'click') {
              play('idle');
              return;
            } else {
              animRef.current.frame = 0;
            }
          }

          updateFrame();
        }
      });

      const container = containerRef.current;
      container.addEventListener('mouseenter', () => play('hover'));
      container.addEventListener('mouseleave', () => play('idle'));
    });

    baseTexture.on('error', () => {
      console.error('Failed to load sprite texture:', spritePath);
      setLoaded(false);
    });

    return () => {
      mounted = false;
      if (appRef.current) {
        appRef.current.destroy(true);
        appRef.current = null;
      }
    };
  }, [currentPetId, pet.id, pet.frameWidth, pet.frameHeight]);

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (clickThrough) return;
    e.preventDefault();
    setIsDragging(true);

    setTimeout(async () => {
      try {
        const win = getCurrentWindow();
        await win.startDragging();
      } catch (err) {
        console.error('Failed to start dragging:', err);
      }
    }, 50);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (playClickRef.current) {
      playClickRef.current();
    }
  };

  const handleDoubleClick = () => console.log('Pet double-clicked!');

  const containerStyle: React.CSSProperties = {
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    opacity,
    cursor: isDragging ? 'grabbing' : clickThrough ? 'default' : 'grab',
    pointerEvents: clickThrough ? 'none' : 'auto',
    background: loaded ? 'transparent' : 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    userSelect: 'none',
  };

  return (
    <div
      ref={containerRef}
      className="pet-canvas"
      style={containerStyle}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    />
  );
}

export default PetCanvas;