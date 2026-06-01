import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { notification } from 'antd';
import { usePetStore } from '../stores/petStore';
import petsData from '../data/pets.json';

interface PetStats {
  current_pet_id: string;
  mood: number;
  fullness: number;
  affection: number;
  owner_title: string;
}

interface Pet {
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

interface MountResult {
  success: boolean;
  backup_path: string | null;
  message: string;
}

interface UnmountResult {
  success: boolean;
  backup_path: string | null;
  message: string;
}

const pets: Pet[] = petsData.pets;

const StatusBadge = ({ status, text }: { status: 'success' | 'error' | 'default'; text: string }) => {
  const c = status === 'success' ? { bg: '#f6ffed', text: '#52c41a' } : status === 'error' ? { bg: '#fff2f0', text: '#ff4d4f' } : { bg: '#f5f5f5', text: '#8c8c8c' };
  return (
    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 500, background: c.bg, color: c.text }}>
      {text}
    </span>
  );
};

function HomePage() {
  const { currentPetId, setCurrentPetId } = usePetStore();

  // 同步到 localStorage 供主窗口读取
  useEffect(() => {
    localStorage.setItem('currentPetId', currentPetId);
  }, [currentPetId]);
  const [processCount, setProcessCount] = useState<number>(0);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [hasHook, setHasHook] = useState<boolean | null>(null);
  const [petStats, setPetStats] = useState<PetStats>({ current_pet_id: 'alice', mood: 100, fullness: 100, affection: 100, owner_title: '主人' });
  const [ownerTitle, setOwnerTitle] = useState<string>('主人');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [mountMsg, setMountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isMounting, setIsMounting] = useState(false);

  useEffect(() => {
    const scanProcesses = async () => {
      try {
        const count = await invoke<number>('get_claude_code_process_count');
        setProcessCount(count);
      } catch (e) { console.error(e); }
    };
    scanProcesses();
    const interval = setInterval(scanProcesses, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const path = await invoke<string | null>('get_claude_config_path');
        setConfigPath(path);
        if (path) {
          const result = await invoke<boolean | null>('check_claude_config_has_hook', { configPath: path });
          setHasHook(result ?? false);
        } else {
          setHasHook(null);
        }
      } catch (e) { console.error(e); }
    };
    checkConfig();
  }, []);

  useEffect(() => {
    const loadPetStats = async () => {
      try {
        const stats = await invoke<PetStats>('get_pet_stats');
        setPetStats(stats);
        setOwnerTitle(stats.owner_title);
        setCurrentPetId(stats.current_pet_id);
      } catch (e) { console.error(e); }
    };
    loadPetStats();
  }, []);

  useEffect(() => {
    const decreaseStats = async () => {
      try {
        const newMood = Math.max(0, petStats.mood - 1);
        const newFullness = Math.max(0, petStats.fullness - 1);
        const newAffection = Math.max(0, petStats.affection - 1);
        await invoke('update_pet_stats', { mood: newMood, fullness: newFullness, affection: newAffection });
        setPetStats({ ...petStats, mood: newMood, fullness: newFullness, affection: newAffection });
      } catch (e) { console.error(e); }
    };
    const interval = setInterval(decreaseStats, 60000);
    return () => clearInterval(interval);
  }, [petStats]);

  const handleSaveTitle = async () => {
    try {
      await invoke('update_pet_stats', { ownerTitle });
      setPetStats({ ...petStats, owner_title: ownerTitle });
      setIsEditingTitle(false);
      notification.success({ message: '保存成功', description: `称谓已更新为 "${ownerTitle}"` });
    } catch (e) {
      notification.error({ message: '保存失败', description: String(e) });
    }
  };

  const handleMountHook = async () => {
    setIsMounting(true);
    setMountMsg(null);
    try {
      const result = await invoke<MountResult>('mount_hook');
      if (result.success) {
        setBackupPath(result.backup_path);
        setMountMsg({ type: 'success', text: '挂载成功！' });
        setHasHook(true);
        notification.success({ message: '挂载成功', description: 'Hook 已成功挂载到 Claude Code 配置' });
      } else {
        setMountMsg({ type: 'error', text: result.message });
        notification.error({ message: '挂载失败', description: result.message });
      }
    } catch (e) {
      setMountMsg({ type: 'error', text: String(e) });
      notification.error({ message: '挂载失败', description: String(e) });
    }
    setIsMounting(false);
  };

  const handleUnmountHook = async () => {
    setIsMounting(true);
    setMountMsg(null);
    try {
      const result = await invoke<UnmountResult>('unmount_hook');
      if (result.success) {
        setBackupPath(result.backup_path);
        setMountMsg({ type: 'success', text: '解除成功' });
        setHasHook(false);
        notification.success({ message: '解除成功', description: 'Hook 已从 Claude Code 配置中移除' });
      } else {
        setMountMsg({ type: 'error', text: result.message });
        notification.error({ message: '解除失败', description: result.message });
      }
    } catch (e) {
      setMountMsg({ type: 'error', text: String(e) });
      notification.error({ message: '解除失败', description: String(e) });
    }
    setIsMounting(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0 16px 12px' }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1f1f1f', margin: '14px 0 12px', paddingBottom: 10, borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>主页概览</span>
        <button
          onClick={() => {
            notification.info({ message: '正在退出', description: '程序即将关闭' });
            invoke('quit_app');
          }}
          style={{ padding: '4px 12px', background: 'linear-gradient(135deg, #ff4d4f, #d93636)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', boxShadow: '0 1px 3px rgba(255,77,79,0.2)' }}
        >
          结束程序
        </button>
      </h2>

      {/* 左右两栏布局 */}
      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>

        {/* 左栏 - ClaudeCode 状态 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: 12, color: '#1890ff', fontWeight: 500, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🔗</span> Claude Code 状态
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>运行进程</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: processCount > 0 ? '#1890ff' : '#ff4d4f', lineHeight: 1 }}>{processCount}</span>
                  <span style={{ fontSize: 11, color: '#8c8c8c' }}>个</span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>Hook 状态</div>
                <div style={{ marginTop: 4 }}>
                  <StatusBadge status={hasHook === true ? 'success' : hasHook === false ? 'error' : 'default'} text={hasHook === true ? '已配置' : hasHook === false ? '未配置' : '检测中'} />
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>配置文件</div>
              {configPath ? (
                <div style={{ background: '#f5f5f5', padding: '6px 10px', borderRadius: 4, fontSize: 11, color: '#595959', wordBreak: 'break-all', fontFamily: 'monospace', border: '1px solid #e8e8e8' }}>
                  {configPath}
                </div>
              ) : (
                <div style={{ color: '#ff4d4f', fontSize: 12 }}>配置文件不存在</div>
              )}
            </div>
            {backupPath && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>备份配置</div>
                <div style={{ background: '#f6ffed', padding: '6px 10px', borderRadius: 4, fontSize: 11, color: '#52c41a', wordBreak: 'break-all', fontFamily: 'monospace', border: '1px solid #b7eb8f' }}>
                  {backupPath}
                </div>
              </div>
            )}
            {mountMsg && (
              <div style={{
                marginBottom: 8,
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: 12,
                background: mountMsg.type === 'success' ? '#f6ffed' : '#fff2f0',
                color: mountMsg.type === 'success' ? '#52c41a' : '#ff4d4f',
                border: `1px solid ${mountMsg.type === 'success' ? '#b7eb8f' : '#ffccc7'}`,
              }}>
                {mountMsg.text}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
              <button
                onClick={handleMountHook}
                disabled={isMounting || !configPath}
                style={{ flex: 1, padding: '8px', background: isMounting || !configPath ? '#ccc' : 'linear-gradient(135deg, #1890ff, #096dd9)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: isMounting || !configPath ? 'not-allowed' : 'pointer', boxShadow: '0 2px 4px rgba(24,144,255,0.25)' }}
              >
                {isMounting ? '处理中...' : '自动挂载 Hook'}
              </button>
              <button
                onClick={handleUnmountHook}
                disabled={isMounting || !hasHook}
                style={{ flex: 1, padding: '8px', background: isMounting || !hasHook ? '#ccc' : 'linear-gradient(135deg, #ff4d4f, #d93636)', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: isMounting || !hasHook ? 'not-allowed' : 'pointer', boxShadow: '0 2px 4px rgba(255,77,79,0.25)' }}
              >
                解除 Hook
              </button>
            </div>
          </div>
        </div>

        {/* 右栏 - 宠物信息 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ fontSize: 12, color: '#1890ff', fontWeight: 500, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>🐱</span> 宠物信息
          </div>
          <div style={{ flex: 1, background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ marginBottom: 10 }}>
              <select value={currentPetId} onChange={async (e) => {
                const newPetId = e.target.value;
                setCurrentPetId(newPetId);
                try {
                  await invoke('update_pet_stats', { currentPetId: newPetId });
                  const petName = pets.find(p => p.id === newPetId)?.name || newPetId;
                  notification.success({ message: '切换成功', description: `已切换为 ${petName}` });
                } catch (e) {
                  notification.error({ message: '切换失败', description: String(e) });
                }
              }} style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d9d9d9', fontSize: 13, outline: 'none', cursor: 'pointer' }}>
                {pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.name}</option>)}
              </select>
            </div>

            <div style={{ background: '#fafafa', borderRadius: 6, padding: '10px 12px', border: '1px solid #f0f0f0' }}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: '#595959' }}>心情</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#262626' }}>{petStats.mood}</span>
                </div>
                <div style={{ height: 4, background: '#e8e8e8', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${petStats.mood}%`, height: '100%', background: petStats.mood > 60 ? '#52c41a' : petStats.mood > 30 ? '#faad14' : '#ff4d4f', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: '#595959' }}>饱腹度</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#262626' }}>{petStats.fullness}</span>
                </div>
                <div style={{ height: 4, background: '#e8e8e8', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${petStats.fullness}%`, height: '100%', background: petStats.fullness > 60 ? '#1890ff' : petStats.fullness > 30 ? '#faad14' : '#ff4d4f', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: '#595959' }}>好感度</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#262626' }}>{petStats.affection}</span>
                </div>
                <div style={{ height: 4, background: '#e8e8e8', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${petStats.affection}%`, height: '100%', background: petStats.affection > 60 ? '#722ed1' : petStats.affection > 30 ? '#faad14' : '#ff4d4f', borderRadius: 2, transition: 'width 0.3s' }} />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>对主人的称谓</div>
              {isEditingTitle ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" value={ownerTitle} onChange={(e) => setOwnerTitle(e.target.value)} autoFocus style={{ flex: 1, padding: '5px 8px', borderRadius: 4, border: '1px solid #1890ff', fontSize: 12, outline: 'none' }} onKeyDown={(e) => e.key === 'Enter' && handleSaveTitle()} />
                  <button onClick={handleSaveTitle} style={{ padding: '5px 10px', background: '#52c41a', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>保存</button>
                  <button onClick={() => { setOwnerTitle(petStats.owner_title); setIsEditingTitle(false); }} style={{ padding: '5px 10px', background: '#fff', color: '#595959', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>取消</button>
                </div>
              ) : (
                <div onClick={() => setIsEditingTitle(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#f0f5ff', borderRadius: 4, fontSize: 12, color: '#1890ff', cursor: 'pointer', border: '1px dashed #91caff' }}>
                  {petStats.owner_title} <span style={{ fontSize: 10, opacity: 0.7 }}>点击修改</span>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default HomePage;