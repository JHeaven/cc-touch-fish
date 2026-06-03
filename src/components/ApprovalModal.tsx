import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface ApprovalModalProps {
  pendingApproval: {
    tool: string;
    command: string;
    cwd: string;
    sessionId: string;
  };
  onApprove: () => void;
  onDeny: () => void;
}

interface HookSettings {
  auto_approve_countdown: number;
  deny_countdown: number;
}

interface AutoApproveCheckResult {
  should_auto_approve: boolean;
  matched: boolean;
}

// 气泡图片尺寸: 2448 x 2122, 比例约 1.1536
const BUBBLE_ASPECT = 2448 / 2122; // ~1.1536
const BUBBLE_WIDTH = 380;
const BUBBLE_HEIGHT = BUBBLE_WIDTH / BUBBLE_ASPECT; // ~329

function ApprovalModal({ pendingApproval, onApprove, onDeny }: ApprovalModalProps) {
  console.log('ApprovalModal showing bubble for:', pendingApproval.tool);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [isAutoApprove, setIsAutoApprove] = useState(false);
  const requestIdRef = useRef<number>(0);

  useEffect(() => {
    // Reset state when pendingApproval changes
    setCountdown(null);
    setIsAutoApprove(false);

    // Increment request ID to invalidate any pending countdown callbacks
    const currentRequestId = ++requestIdRef.current;

    const checkAndStartCountdown = async () => {
      // Check if this is still the current request
      if (requestIdRef.current !== currentRequestId) return;

      try {
        const [settingsResult, checkResult] = await Promise.all([
          invoke<HookSettings>('get_hook_settings'),
          invoke<AutoApproveCheckResult>('check_auto_approve', {
            toolName: pendingApproval.tool,
            command: pendingApproval.command,
          }),
        ]);

        // Check again after async call
        if (requestIdRef.current !== currentRequestId) return;

        const shouldAutoApprove = checkResult.should_auto_approve;
        setIsAutoApprove(shouldAutoApprove);

        const countdownSeconds = shouldAutoApprove
          ? settingsResult.auto_approve_countdown
          : settingsResult.deny_countdown;

        setCountdown(countdownSeconds);
      } catch (e) {
        console.error('Failed to check auto approve:', e);
        setCountdown(null);
      }
    };

    checkAndStartCountdown();
  }, [pendingApproval.tool, pendingApproval.command]);

  // Countdown timer effect
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const currentRequestId = requestIdRef.current;
    const intervalId = setInterval(() => {
      // Only update if this is still the current request
      if (requestIdRef.current !== currentRequestId) return;

      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [countdown]);

  // Handle countdown reaching 0
  useEffect(() => {
    if (countdown !== 0) return;

    if (isAutoApprove) {
      onApprove();
    } else {
      // Deny: submit approval then hide window
      invoke('submit_approval', { approved: false }).then(() => {
        invoke('hide_bubble_window');
      });
    }
  }, [countdown, isAutoApprove, onApprove]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear any pending interval when component unmounts
    };
  }, []);

  // Keyboard shortcuts: Y = approve, N = deny
  // Two layers: (1) JS keydown for fast path in non-IME scenarios,
  // (2) listen for events emitted by tauri-plugin-global-shortcut which
  // works at the OS level and bypasses Chinese/Japanese IMEs.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'KeyY') {
        onApprove();
      } else if (e.code === 'KeyN') {
        onDeny();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const unlistenYPromise = listen('bubble-shortcut-y', () => onApprove());
    const unlistenNPromise = listen('bubble-shortcut-n', () => onDeny());

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      unlistenYPromise.then(u => u());
      unlistenNPromise.then(u => u());
    };
  }, [onApprove, onDeny]);

  const handleApprove = () => {
    onApprove();
  };

  const handleDeny = () => {
    onDeny();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 10, // Above the pet
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        .approval-btn {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .approval-btn:hover {
          transform: scale(1.1);
        }
        .approval-btn-deny:hover {
          box-shadow: 0 4px 16px rgba(255,107,107,0.6);
        }
        .approval-btn-allow:hover {
          box-shadow: 0 4px 16px rgba(81,207,102,0.6);
        }
      `}</style>

      {/* 气泡背景 */}
      <div
        style={{
          width: BUBBLE_WIDTH,
          height: BUBBLE_HEIGHT,
          backgroundImage: 'url(/resources/images/paopao.png)',
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '75px 25px 15px 25px',
        }}
      >
        {/* 标题区域 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
            marginTop:10,
        }}>
          <span style={{ fontSize: 18 }}>💭</span>
          <span style={{
            fontSize: 17,
            fontWeight: 'bold',
            color: '#333',
          }}>
            Claude Code 授权确认
          </span>
        </div>

        {/* 工具信息 */}
        <div style={{
          width: '100%',
          background: 'rgba(255,255,255,0.7)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 8,
        }}>
          <div style={{
            fontSize: 11,
            color: '#666',
            marginBottom: 4,
          }}>
            工具
          </div>
          <div style={{
            fontSize: 14,
            fontWeight: 'bold',
            color: '#222',
          }}>
            {pendingApproval.tool}
          </div>
        </div>

        {/* 命令预览 */}
        <div className="command-preview" style={{
          width: '100%',
          background: 'rgba(0,0,0,0.05)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 10,
          maxHeight: 70,
          overflow: 'auto',
        }}>
          <div style={{
            fontSize: 11,
            color: '#666',
            marginBottom: 2,
          }}>
            命令
          </div>
          <div style={{
            fontSize: 11,
            color: '#444',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {pendingApproval.command || '(no command)'}
          </div>
        </div>

        {/* 按钮区域 */}
        <div style={{
          display: 'flex',
          gap: 20,
        }}>
          <button
            className="approval-btn approval-btn-deny"
            onClick={handleDeny}
            style={{
              background: '#ff6b6b',
              color: 'white',
              border: 'none',
              padding: '8px 24px',
              borderRadius: 20,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>✖</span>
            <span>拒绝</span>
            {countdown !== null && !isAutoApprove && (
              <span style={{ marginLeft: 4, fontSize: 12 }}>({countdown}s)</span>
            )}
          </button>
          <button
            className="approval-btn approval-btn-allow"
            onClick={handleApprove}
            style={{
              background: '#51cf66',
              color: 'white',
              border: 'none',
              padding: '8px 24px',
              borderRadius: 20,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>✔</span>
            <span>允许</span>
            {countdown !== null && isAutoApprove && (
              <span style={{ marginLeft: 4, fontSize: 12 }}>({countdown}s)</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApprovalModal;
