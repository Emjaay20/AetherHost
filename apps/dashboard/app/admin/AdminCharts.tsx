'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export function MrrChart({ data }: { data: { month: string; dollars: number }[] }) {
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground">No data available.</p>;

  return (
    <div className="h-48 w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
          <XAxis 
            dataKey="month" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#888' }} 
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#888' }}
            tickFormatter={(value) => `$${value}`}
            width={40}
          />
          <Tooltip 
            cursor={{ fill: '#222' }}
            contentStyle={{ backgroundColor: '#111', borderColor: '#333', fontSize: '12px', borderRadius: '8px' }}
            formatter={(value: any) => [`$${Number(value || 0).toFixed(2)}`, 'Revenue']}
          />
          <Bar dataKey="dollars" fill="#4ade80" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CohortChart({ data }: { data: { month: string; newTenants: number }[] }) {
  if (!data || data.length === 0) return <p className="text-xs text-muted-foreground">No data available.</p>;

  // Reverse so chronological order is left to right
  const sorted = [...data].reverse();

  return (
    <div className="h-48 w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
          <XAxis 
            dataKey="month" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#888' }} 
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#888' }}
            width={30}
          />
          <Tooltip 
            cursor={{ fill: '#222' }}
            contentStyle={{ backgroundColor: '#111', borderColor: '#333', fontSize: '12px', borderRadius: '8px' }}
            formatter={(value: any) => [Number(value || 0), 'New Tenants']}
          />
          <Bar dataKey="newTenants" fill="#60a5fa" radius={[4, 4, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
