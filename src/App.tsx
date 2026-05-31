import { useEffect, useState, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { usePetStore } from './stores/petStore';
import PetCanvas from './components/PetCanvas';
import ApprovalModal from './components/ApprovalModal';
import SettingsWindow from './components/SettingsWindow';

const STORAGE_KEY = 'pet-settings';

interface PendingData {
  tool: string;
  command: string;
  cwd: string;
  sessionId: string;
}

function App() {
  const [windowLabel, setWindowLabel] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  const { clearApproval, setOpacity, setClickThrough } = usePetStore();
  const lastPendingRef = useRef<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const win = getCurrentWindow();
      setWindowLabel(win.label);
      setIsReady(true);
    };
    init();
  }, []);

  useEffect(() => {
    const loadSettings = () => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const settings = JSON.parse(saved);
          if (settings.opacity !== undefined) {
            setOpacity(settings.opacity);
          }
          if (settings.clickThrough !== undefined) {
            setClickThrough(settings.clickThrough);
            invoke('set_click_through', { enabled: settings.clickThrough }).catch(console.error);
          }
        } catch (e) {
          console.error('Failed to load settings:', e);
        }
      }
    };
    loadSettings();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const settings = JSON.parse(e.newValue);
          if (settings.opacity !== undefined) {
            setOpacity(settings.opacity);
          }
          if (settings.clickThrough !== undefined) {
            setClickThrough(settings.clickThrough);
            invoke('set_click_through', { enabled: settings.clickThrough }).catch(console.error);
          }
        } catch (e) {
          console.error('Failed to parse settings:', e);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Main window: poll for pending approval and show bubble window
  useEffect(() => {
    if (windowLabel !== 'main') return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:10425/tf-pending', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.pending) {
            const key = `${data.tool_name}:${data.command}:${data.timestamp}`;
            console.log('Main window polling pending approval:', data, 'key:', key, 'lastKey:', lastPendingRef.current);
            if (lastPendingRef.current === key) {
              return;
            }
            lastPendingRef.current = key;
            console.log('Creating bubble window...');
            await invoke('show_bubble_window');
            console.log('Bubble window created');
          }
        }
      } catch (e) {
        console.error('Poll error:', e);
      }
    }, 500);

    return () => clearInterval(pollInterval);
  }, [windowLabel]);

  // Bubble window: poll for pending approval to display
  const [bubblePending, setBubblePending] = useState<PendingData | null>(null);

  useEffect(() => {
    if (!windowLabel.startsWith('bubble')) return;

    // Listen for show-bubble event from backend
    const unlistenPromise = listen<{tool_name: string; command?: string; cwd?: string; session_id?: string}>('show-bubble', (event) => {
      console.log('Bubble received show-bubble event:', event.payload);
      setBubblePending({
        tool: event.payload.tool_name,
        command: event.payload.command || '',
        cwd: event.payload.cwd || '',
        sessionId: event.payload.session_id || '',
      });
    });

    // Also poll as fallback
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:10425/tf-pending', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.pending) {
            const key = `${data.tool_name}:${data.command}:${data.timestamp}`;
            if (lastPendingRef.current === key) {
              return;
            }
            lastPendingRef.current = key;
            console.log('Bubble window polling pending approval:', data);
            setBubblePending({
              tool: data.tool_name,
              command: data.command || '',
              cwd: data.cwd || '',
              sessionId: data.session_id || '',
            });
          }
        }
      } catch (e) {
        // Silently ignore polling errors
      }
    }, 300);

    return () => {
      unlistenPromise.then(unlisten => unlisten());
      clearInterval(pollInterval);
    };
  }, [windowLabel]);

  const handleApproval = async (approved: boolean) => {
    try {
      await invoke('submit_approval', { approved });
    } catch (e) {
      console.error('Failed to submit approval:', e);
    }
    lastPendingRef.current = null;
    clearApproval();
    setBubblePending(null);
    // Close bubble window
    await invoke('hide_bubble_window');
  };

  if (!isReady) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
        <div style={{ width: 24, height: 24, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (windowLabel === 'settings') {
    return <SettingsWindow />;
  }

  if (windowLabel === 'main') {
    return <PetCanvas />;
  }

  if (windowLabel.startsWith('bubble')) {
    if (!bubblePending) {
      return null;
    }
    return (
      <ApprovalModal
        pendingApproval={bubblePending}
        onApprove={() => handleApproval(true)}
        onDeny={() => handleApproval(false)}
      />
    );
  }

  return null;
}

export default App;