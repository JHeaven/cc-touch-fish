import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { notification } from 'antd';
import { usePetStore } from '../stores/petStore';
import HomePage from './HomePage';

type TabType = 'home' | 'settings' | 'about' | 'hooks';

const STORAGE_KEY = 'pet-settings';

const tabs: { key: TabType; label: string; icon: string }[] = [
  { key: 'home', label: '首页', icon: '🏠' },
  { key: 'settings', label: '设置', icon: '⚙️' },
  { key: 'hooks', label: 'Hooks', icon: '🔗' },
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
      notification.success({ message: '设置成功', description: enabled ? '已开启点击穿透' : '已关闭点击穿透' });
    } catch (e) {
      notification.error({ message: '设置失败', description: String(e) });
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

        {activeTab === 'hooks' && <HooksSettings />}

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
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', margin: 0 }}>版本 0.1.2</p>
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
                  <span style={{ fontSize: 13, color: '#262626', fontWeight: 500 }}>0.1.2</span>
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
                  { icon: '⏱️', text: '自动审批倒计时功能' },
                  { icon: '📋', text: '工具规则配置（Hooks设置）' },
                  { icon: '🔔', text: '操作通知提示' },
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

// Hooks Settings Component
interface HookCommand {
  id: number;
  command_pattern: string;
  auto_approve: boolean;
}

interface HookTool {
  id: number;
  tool_name: string;
  auto_approve: boolean;
  commands: HookCommand[];
}

interface HookSettings {
  auto_approve_countdown: number;
  deny_countdown: number;
}

function HooksSettings() {
  const [settings, setSettings] = useState<HookSettings | null>(null);
  const [tools, setTools] = useState<HookTool[]>([]);
  const [newToolName, setNewToolName] = useState('');
  const [newCommandText, setNewCommandText] = useState<{ [key: number]: string }>({});
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [editingToolId, setEditingToolId] = useState<number | null>(null);
  const [editingToolName, setEditingToolName] = useState('');
  const [editingCommandId, setEditingCommandId] = useState<number | null>(null);
  const [editingCommandPattern, setEditingCommandPattern] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settingsData, rulesData] = await Promise.all([
        invoke<HookSettings>('get_hook_settings'),
        invoke<HookTool[]>('get_hook_rules'),
      ]);
      setSettings(settingsData);
      setTools(rulesData);
    } catch (e) {
      console.error('Failed to load hook data:', e);
    }
  };

  const handleSettingChange = async (key: 'auto_approve_countdown' | 'deny_countdown', value: number) => {
    try {
      if (key === 'auto_approve_countdown') {
        await invoke('update_hook_settings', { autoApproveCountdown: value });
        setSettings(prev => prev ? { ...prev, auto_approve_countdown: value } : null);
      } else {
        await invoke('update_hook_settings', { denyCountdown: value });
        setSettings(prev => prev ? { ...prev, deny_countdown: value } : null);
      }
    } catch (e) {
      console.error('Failed to update setting:', e);
    }
  };

  const handleAddTool = async () => {
    if (!newToolName.trim()) return;
    try {
      await invoke('add_hook_tool', { toolName: newToolName.trim() });
      setNewToolName('');
      notification.success({ message: '添加成功', description: `工具 "${newToolName.trim()}" 已添加` });
      loadData();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      notification.error({ message: '添加失败', description: errMsg });
    }
  };

  const handleRemoveTool = async (toolId: number) => {
    try {
      await invoke('remove_hook_tool', { toolId });
      notification.success({ message: '删除成功' });
      loadData();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      notification.error({ message: '删除失败', description: errMsg });
    }
  };

  const handleAddCommand = async (toolId: number) => {
    const pattern = newCommandText[toolId]?.trim();
    if (!pattern) return;
    try {
      await invoke('add_hook_command', { toolId, commandPattern: pattern });
      setNewCommandText(prev => ({ ...prev, [toolId]: '' }));
      notification.success({ message: '添加成功', description: `命令前缀 "${pattern}" 已添加` });
      loadData();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      notification.error({ message: '添加失败', description: errMsg });
    }
  };

  const handleRemoveCommand = async (commandId: number) => {
    try {
      await invoke('remove_hook_command', { commandId });
      notification.success({ message: '删除成功' });
      loadData();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      notification.error({ message: '删除失败', description: errMsg });
    }
  };

  const handleToolAutoApproveChange = async (tool: HookTool, checked: boolean) => {
    try {
      await invoke('update_tool_auto_approve', { toolId: tool.id, autoApprove: checked });
      notification.success({ message: '更新成功' });
      loadData();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      notification.error({ message: '更新失败', description: errMsg });
    }
  };

  const handleCommandAutoApproveChange = async (commandId: number, checked: boolean) => {
    try {
      await invoke('update_command_auto_approve', { commandId, autoApprove: checked });
      notification.success({ message: '更新成功' });
      loadData();
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      notification.error({ message: '更新失败', description: errMsg });
    }
  };

  const handleEditToolName = (tool: HookTool) => {
    setEditingToolId(tool.id);
    setEditingToolName(tool.tool_name);
    setEditingCommandId(null);
  };

  const handleSaveToolName = async () => {
    if (editingToolId === null || !editingToolName.trim()) return;
    try {
      await invoke('update_hook_tool_name', { toolId: editingToolId, toolName: editingToolName.trim() });
      setEditingToolId(null);
      loadData();
    } catch (e) {
      console.error('Failed to update tool name:', e);
    }
  };

  const handleEditCommandPattern = (cmd: HookCommand) => {
    setEditingCommandId(cmd.id);
    setEditingCommandPattern(cmd.command_pattern);
    setEditingToolId(null);
  };

  const handleSaveCommandPattern = async () => {
    if (editingCommandId === null || !editingCommandPattern.trim()) return;
    try {
      await invoke('update_hook_command_pattern', { commandId: editingCommandId, commandPattern: editingCommandPattern.trim() });
      setEditingCommandId(null);
      loadData();
    } catch (e) {
      console.error('Failed to update command pattern:', e);
    }
  };

  return (
    <div style={{ padding: '16px' }}>
      {/* 倒计时设置 */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '20px 24px',
        border: '1px solid #f0f0f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        marginBottom: 16,
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', margin: '0 0 12px', paddingBottom: 12, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>⏱️</span> 倒计时设置
        </h3>

        {/* 说明 */}
        <div style={{
          background: '#f0f5ff',
          border: '1px solid #adc6ff',
          borderRadius: 6,
          padding: '12px 14px',
          marginBottom: 20,
          fontSize: 12,
          color: '#666',
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600, color: '#1890ff', marginBottom: 4 }}>📌 功能说明</div>
          <div>审批弹窗出现后，按钮上会显示倒计时：</div>
          <div style={{ marginTop: 6 }}>
            <div>• <span style={{ color: '#52c41a', fontWeight: 600 }}>自动审批倒计时</span>：匹配到规则时，允许按钮会倒计时，倒计时结束自动执行</div>
            <div style={{ marginTop: 4 }}>• <span style={{ color: '#ff4d4f', fontWeight: 600 }}>拒绝倒计时</span>：未匹配到规则时，拒绝按钮会倒计时，倒计时结束自动关闭窗口</div>
          </div>
          <div style={{ marginTop: 8, color: '#8c8c8c' }}>💡 倒计时期间用户仍可手动点击按钮立即执行</div>
        </div>

        {settings && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#595959', marginBottom: 10, fontWeight: 500 }}>
                <span>自动审批倒计时</span>
                <span style={{ color: '#52c41a', fontWeight: 600 }}>{settings.auto_approve_countdown}秒</span>
              </label>
              <input
                type="range"
                min="1"
                max="60"
                value={settings.auto_approve_countdown}
                onChange={(e) => handleSettingChange('auto_approve_countdown', parseInt(e.target.value))}
                style={{ width: '100%', height: 6, borderRadius: 3, accentColor: '#52c41a' }}
              />
              <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>白名单工具+命令，倒计时结束后自动允许</div>
            </div>
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#595959', marginBottom: 10, fontWeight: 500 }}>
                <span>拒绝倒计时</span>
                <span style={{ color: '#ff4d4f', fontWeight: 600 }}>60秒</span>
              </label>
              <div style={{
                width: '100%',
                height: 6,
                borderRadius: 3,
                background: '#ff4d4f',
                opacity: 0.3,
              }} />
              <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>非白名单工具+命令，倒计时结束后关闭窗口</div>
            </div>
          </div>
        )}
      </div>

      {/* 工具规则设置 */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: '20px 24px',
        border: '1px solid #f0f0f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', margin: '0 0 12px', paddingBottom: 12, borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🔗</span> 工具审批规则
        </h3>

        {/* 说明 */}
        <div style={{
          background: '#f0f5ff',
          border: '1px solid #adc6ff',
          borderRadius: 6,
          padding: '12px 14px',
          marginBottom: 20,
          fontSize: 12,
          color: '#666',
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 600, color: '#1890ff', marginBottom: 4 }}>📌 规则说明</div>
          <div>当 Claude Code 执行工具时，会根据此处的规则判断是否自动审批：</div>
          <div style={{ marginTop: 6 }}>
            <div>1. 如果 <span style={{ fontWeight: 600, color: '#333' }}>工具名</span> + <span style={{ fontWeight: 600, color: '#333' }}>命令前缀</span> 匹配到规则，且开启自动审批 → <span style={{ color: '#52c41a', fontWeight: 600 }}>允许按钮显示倒计时</span></div>
            <div style={{ marginTop: 4 }}>2. 如果没有匹配到任何规则 → <span style={{ color: '#ff4d4f', fontWeight: 600 }}>拒绝按钮显示倒计时</span>，超时后窗口自动关闭</div>
          </div>
          <div style={{ marginTop: 8, color: '#8c8c8c' }}>💡 提示：已预置常用工具命令，勾选工具会自动将其所有命令设为自动审批</div>
        </div>

        {/* 添加工具 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <input
            type="text"
            value={newToolName}
            onChange={(e) => setNewToolName(e.target.value)}
            placeholder="输入工具名称 (如 Bash, WebSearch)"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #d9d9d9',
              borderRadius: 6,
              fontSize: 13,
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTool()}
          />
          <button
            onClick={handleAddTool}
            style={{
              background: '#1890ff',
              color: '#fff',
              border: 'none',
              padding: '8px 20px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            添加工具
          </button>
        </div>

        {/* 工具列表 */}
        <div style={{ display: 'grid', gap: 8 }}>
          {tools.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#8c8c8c' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔧</div>
              <div>暂无工具规则</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>添加工具后可配置命令前缀匹配规则</div>
            </div>
          ) : (
            tools.map(tool => (
              <div
                key={tool.id}
                style={{
                  border: '1px solid #e8e8e8',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {/* 工具行 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  background: tool.auto_approve ? '#f6ffed' : '#fafafa',
                  borderBottom: '1px solid #e8e8e8',
                }}>
                  <input
                    type="checkbox"
                    checked={tool.auto_approve}
                    onChange={(e) => handleToolAutoApproveChange(tool, e.target.checked)}
                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                  />
                  {editingToolId === tool.id ? (
                    <input
                      type="text"
                      value={editingToolName}
                      onChange={(e) => setEditingToolName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveToolName()}
                      onBlur={handleSaveToolName}
                      autoFocus
                      style={{
                        flex: 1,
                        padding: '4px 8px',
                        border: '1px solid #1890ff',
                        borderRadius: 4,
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                    />
                  ) : (
                    <span
                      style={{ flex: 1, fontWeight: 500, cursor: 'text' }}
                      onClick={() => handleEditToolName(tool)}
                      title="点击编辑"
                    >
                      {tool.tool_name}
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                    {tool.commands.filter(c => c.auto_approve).length}/{tool.commands.length} 自动审批
                  </span>
                  <button
                    onClick={() => handleRemoveTool(tool.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ff4d4f',
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: '4px 8px',
                    }}
                  >
                    删除
                  </button>
                  <button
                    onClick={() => {
                      const key = `tool-${tool.id}`;
                      setExpandedKeys(prev =>
                        prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                      );
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#1890ff',
                      cursor: 'pointer',
                      fontSize: 12,
                      padding: '4px 8px',
                    }}
                  >
                    {expandedKeys.includes(`tool-${tool.id}`) ? '收起' : '展开'}
                  </button>
                </div>

                {/* 命令列表 */}
                {expandedKeys.includes(`tool-${tool.id}`) && (
                  <div style={{ padding: '12px 16px 12px 48px', background: '#fff' }}>
                    {/* 添加命令输入框 */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        type="text"
                        value={newCommandText[tool.id] || ''}
                        onChange={(e) => setNewCommandText(prev => ({ ...prev, [tool.id]: e.target.value }))}
                        placeholder="输入命令前缀 (最多50字符)"
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          border: '1px solid #d9d9d9',
                          borderRadius: 4,
                          fontSize: 12,
                          fontFamily: 'monospace',
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCommand(tool.id)}
                      />
                      <button
                        onClick={() => handleAddCommand(tool.id)}
                        style={{
                          background: '#52c41a',
                          color: '#fff',
                          border: 'none',
                          padding: '6px 14px',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        添加
                      </button>
                    </div>

                    {/* 命令列表 */}
                    {tool.commands.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px 0', color: '#8c8c8c', fontSize: 12 }}>
                        暂无命令规则
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 6 }}>
                        {tool.commands.map(cmd => (
                          <div
                            key={cmd.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px',
                              background: cmd.auto_approve ? '#f6ffed' : '#fafafa',
                              borderRadius: 4,
                              border: `1px solid ${cmd.auto_approve ? '#b7eb8f' : '#e8e8e8'}`,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={cmd.auto_approve}
                              onChange={(e) => handleCommandAutoApproveChange(cmd.id, e.target.checked)}
                              style={{ cursor: 'pointer', width: 14, height: 14 }}
                            />
                            {editingCommandId === cmd.id ? (
                              <input
                                type="text"
                                value={editingCommandPattern}
                                onChange={(e) => setEditingCommandPattern(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSaveCommandPattern()}
                                onBlur={handleSaveCommandPattern}
                                autoFocus
                                style={{
                                  flex: 1,
                                  padding: '2px 6px',
                                  border: '1px solid #1890ff',
                                  borderRadius: 3,
                                  fontSize: 12,
                                  fontFamily: 'monospace',
                                }}
                              />
                            ) : (
                              <span
                                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: '#666', cursor: 'text' }}
                                onClick={() => handleEditCommandPattern(cmd)}
                                title="点击编辑"
                              >
                                {cmd.command_pattern}
                              </span>
                            )}
                            <button
                              onClick={() => handleRemoveCommand(cmd.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ff4d4f',
                                cursor: 'pointer',
                                fontSize: 11,
                                padding: '2px 6px',
                              }}
                            >
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsWindow;