import React from 'react';

interface AudioLevelMeterProps {
  label: string;
  level: number; // 0-1
}

export default function AudioLevelMeter({ label, level }: AudioLevelMeterProps) {
  const width = Math.max(0, Math.min(1, level)) * 100;

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-[10px] text-dim font-medium tracking-wider uppercase">{label}</span>
      <div className="w-24 h-1.5 rounded-full bg-input overflow-hidden">
        <div
          className="h-full rounded-full bg-accent/60 transition-all duration-75"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
