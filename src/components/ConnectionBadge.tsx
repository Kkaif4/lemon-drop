'use client';

type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

interface ConnectionBadgeProps {
  state: ConnectionState;
  isWarmingUp?: boolean;
}

const CONFIG: Record<ConnectionState, { dotClass: string; label: string }> = {
  new: { dotClass: 'bg-neutral-400', label: 'New' },
  connecting: { dotClass: 'bg-yellow-400 animate-pulse', label: 'Connecting' },
  connected: { dotClass: 'bg-green-400', label: 'Connected' },
  disconnected: { dotClass: 'bg-red-400', label: 'Disconnected' },
  failed: { dotClass: 'bg-red-500', label: 'Failed' },
  closed: { dotClass: 'bg-neutral-500', label: 'Closed' },
};

export default function ConnectionBadge({ state, isWarmingUp = false }: ConnectionBadgeProps) {
  const currentConfig = isWarmingUp
    ? { dotClass: 'bg-amber-400 animate-pulse', label: 'Server Starting...' }
    : CONFIG[state];

  const { dotClass, label } = currentConfig;

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-800/80 px-3 py-1 text-xs font-medium text-neutral-300">
      <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}
