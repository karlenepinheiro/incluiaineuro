import React from 'react';

export const Badge = ({ children, color = 'gray' }: { children: React.ReactNode; color?: string }) => {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    purple: 'bg-purple-100 text-purple-700',
    gray: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide ${colors[color] ?? colors.gray}`}>
      {children}
    </span>
  );
};
