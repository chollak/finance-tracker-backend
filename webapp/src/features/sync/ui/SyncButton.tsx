/**
 * Sync Button Component
 * Triggers manual synchronization with the server
 */

import { useState } from 'react';
import { RefreshCw, Check, AlertCircle, Cloud, CloudOff } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { useUserStore, useIsTelegramUser } from '@/entities/user/model/store';
import { syncService } from '@/shared/lib/db/syncService';
import { cn } from '@/shared/lib/utils';

interface SyncButtonProps {
  className?: string;
  showLabel?: boolean;
}

export function SyncButton({ className, showLabel = false }: SyncButtonProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<'success' | 'error' | null>(null);

  const isTelegramUser = useIsTelegramUser();
  const { isOnline, pendingChangesCount, lastSyncAt } = useUserStore();

  const handleSync = async () => {
    if (!isTelegramUser || isSyncing) return;

    setIsSyncing(true);
    setLastResult(null);

    try {
      const result = await syncService.sync();

      if (result.success) {
        setLastResult('success');
        console.log('[SyncButton] Sync completed:', result);
      } else {
        setLastResult('error');
        console.error('[SyncButton] Sync failed:', result.errors);
      }

      // Reset result indicator after 3 seconds
      setTimeout(() => setLastResult(null), 3000);
    } catch (error) {
      setLastResult('error');
      console.error('[SyncButton] Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Don't show for guest users
  if (!isTelegramUser) {
    return null;
  }

  const getIcon = () => {
    if (!isOnline) return <CloudOff className="h-4 w-4 text-muted-foreground" />;
    if (isSyncing) return <RefreshCw className="h-4 w-4 animate-spin" />;
    if (lastResult === 'success') return <Check className="h-4 w-4 text-success" />;
    if (lastResult === 'error') return <AlertCircle className="h-4 w-4 text-expense" />;
    return <Cloud className="h-4 w-4" />;
  };

  const getLabel = () => {
    if (!isOnline) return 'Offline';
    if (isSyncing) return 'Syncing...';
    if (lastResult === 'success') return 'Synced';
    if (lastResult === 'error') return 'Sync failed';
    if (pendingChangesCount > 0) return `Sync (${pendingChangesCount})`;
    return 'Sync';
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleSync}
      disabled={isSyncing || !isOnline}
      className={cn('relative', className)}
      title={lastSyncAt ? `Last sync: ${new Date(lastSyncAt).toLocaleTimeString()}` : 'Never synced'}
    >
      {getIcon()}
      {showLabel && <span className="ml-2">{getLabel()}</span>}
      {pendingChangesCount > 0 && !showLabel && (
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
          {pendingChangesCount > 9 ? '9+' : pendingChangesCount}
        </span>
      )}
    </Button>
  );
}
