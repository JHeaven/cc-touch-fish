import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { usePetStore } from '../stores/petStore';
import HomePage from './HomePage';

type TabType = 'home' | 'settings' | 'about';

const STORAGE_KEY = 'pet-settings';

const tabs: { key: TabType; label: string; icon: string }[] = [
  { key: 'home', label: '首页', icon: '🏠' },
  { key: 'settings', label: '设置', icon: '⚙️' },
  { key: 'about', label: '关于', icon: 'ℹ️' },
];

function SettingsWindow() {
  const [isReady, setIsReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const {
    opacity,
    clickThrough,
    setOpacity,
    setClickThrough,
  } = usePetStore();

  useEffect(() => {
    const timer = setTimeout(() => setIsReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const unlisten = listen<string>('switch-tab', (event) => {
      if (event.payload === 'about') setActiveTab('about');
      else if (event.payload === 'settings') setActiveTab('settings');
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ opacity, clickThrough }));
  }, [opacity, clickThrough]);

  const handleClickThroughChange = async (enabled: boolean) => {
    setClickThrough(enabled);
    try {
      await invoke('set_click_through', { enabled });
    } catch (e) {
      console.error('Failed to set click through:', e);
    }
  };

  if (!isReady) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e8e8e8', borderTop: '3px solid #1890ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#fafafa', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>

      {/* 现代感 Tab 栏 */}
      <div style={{
        display: 'flex',
        padding: '12px 16px 0',
        gap: 4,
        background: '#fff',
        borderBottom: '1px solid #f0f0f0',
      }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 18px',
                border: 'none',
                borderRadius: '8px 8px 0 0',
                background: isActive ? '#fafafa' : 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#1890ff' : '#8c8c8c',
                position: 'relative',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = '#595959';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = '#8c8c8c';
              }}
            >
              <span style={{ fontSize: 14 }}>{tab.icon}</span>
              {tab.label}
              {isActive && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: '#1890ff',
                  borderRadius: '2px 2px 0 0',
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'auto', background: '#fafafa' }}>
        {activeTab === 'home' && <HomePage />}

        {activeTab === 'settings' && (
          <div style={{ padding: '16px' }}>
            <div style={{
              background: '#fff',
              borderRadius: 12,
              padding: '20px 24px',
              border: '1px solid #f0f0f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', margin: '0 0 20px', paddingBottom: 12, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>⚙️</span> 宠物设置
              </h3>

              {/* 透明度 */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#595959', marginBottom: 10, fontWeight: 500 }}>
                  <span>透明度</span>
                  <span style={{ color: '#1890ff', fontWeight: 600 }}>{Math.round(opacity * 100)}%</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="range"
                    min="0.3"
                    max="1"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                    style={{
                      width: '100%',
                      height: 6,
                      borderRadius: 3,
                      appearance: 'none',
                      background: `linear-gradient(to right, #1890ff ${(opacity - 0.3) / 0.7 * 100}%, #e8e8e8 ${(opacity - 0.3) / 0.7 * 100}%)`,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* 点击穿透 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                background: clickThrough ? '#f6ffed' : '#fafafa',
                borderRadius: 8,
                border: `1px solid ${clickThrough ? '#b7eb8f' : '#e8e8e8'}`,
                transition: 'all 0.2s',
              }}>
                <div>
                  <div style={{ fontSize: 14, color: '#262626', fontWeight: 500, marginBottom: 2 }}>点击穿透</div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>鼠标可以穿过宠物窗口</div>
                </div>
                <button
                  onClick={() => handleClickThroughChange(!clickThrough)}
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    border: 'none',
                    background: clickThrough ? '#52c41a' : '#d9d9d9',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    background: '#fff',
                    position: 'absolute',
                    top: 2,
                    left: clickThrough ? 22 : 2,
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div style={{ padding: '16px' }}>
            {/* Logo 区域 */}
            <div style={{
              background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
              borderRadius: 16,
              padding: '28px 24px',
              textAlign: 'center',
              marginBottom: 16,
              boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🐟</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>CC Touch Fish</h1>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: 0 }}>版本 0.1.0</p>
            </div>

            {/* 信息卡片 */}
            <div style={{
              background: '#fff',
              borderRadius: 12,
              padding: '20px 24px',
              border: '1px solid #f0f0f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              marginBottom: 16,
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1f1f1f', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>📋</span> 关于程序
              </h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: 13, color: '#8c8c8c' }}>程序名称</span>
                  <span style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>CC Touch Fish</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: 13, color: '#8c8c8c' }}>版本号</span>
                  <span style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>0.1.0</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ fontSize: 13, color: '#8c8c8c' }}>技术栈</span>
                  <span style={{ fontSize: 13, color: '#1890ff', fontWeight: 500 }}>Tauri + React</span>
                </div>
              </div>
            </div>

            {/* 功能特点 */}
            <div style={{
              background: '#fff',
              borderRadius: 12,
              padding: '20px 24px',
              border: '1px solid #f0f0f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1f1f1f', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>✨</span> 功能特点
              </h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {[
                  { icon: '🐱', text: '可爱的桌面宠物形象' },
                  { icon: '🔗', text: 'Claude Code PreToolUse Hook 集成' },
                  { icon: '🪟', text: '窗口透明与点击穿透' },
                  { icon: '📊', text: '宠物状态实时监控' },
                  { icon: '🖥️', text: '系统托盘控制' },
                ].map((item, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 14px',
                    background: '#fafafa',
                    borderRadius: 8,
                  }}>
                    <span style={{ fontSize: 18 }}>{item.icon}</span>
                    <span style={{ fontSize: 13, color: '#595959' }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsWindow;