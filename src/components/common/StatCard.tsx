'use client';

import { TrendingDown, TrendingUp } from '@mui/icons-material';
import { Avatar, Box, Card, CardContent, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  color: string;
  bgColor: string;
  trend?: number;
  subtitle?: string;
}

export default function StatCard({ title, value, icon, color, bgColor, trend, subtitle }: StatCardProps) {
  return (
    <Card
      sx={{
        height: '100%',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        },
      }}
    >
      <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" fontWeight={700} sx={{ mb: 0.5 }}>
              {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
            </Typography>
            {trend !== undefined && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {trend >= 0 ? (
                  <TrendingUp sx={{ fontSize: 16, color: 'success.main' }} />
                ) : (
                  <TrendingDown sx={{ fontSize: 16, color: 'error.main' }} />
                )}
                <Typography
                  variant="caption"
                  sx={{ color: trend >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
                >
                  {trend >= 0 ? '+' : ''}{trend}%
                </Typography>
                {subtitle && (
                  <Typography variant="caption" color="text.secondary">
                    {subtitle}
                  </Typography>
                )}
              </Box>
            )}
          </Box>
          <Avatar
            sx={{
              bgcolor: bgColor,
              color: color,
              width: 52,
              height: 52,
              borderRadius: 3,
            }}
          >
            {icon}
          </Avatar>
        </Box>
      </CardContent>
    </Card>
  );
}
