'use client';

import { flattenMenuItems, menuSections } from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { User } from '@/types';
import {
    DarkMode as DarkModeIcon,
    Fullscreen as FullscreenIcon,
    LightMode as LightModeIcon,
    Menu as MenuIcon,
    Notifications as NotificationsIcon,
    Search as SearchIcon,
} from '@mui/icons-material';
import {
    alpha,
    AppBar,
    Badge,
    Box,
    CircularProgress,
    FormControl,
    IconButton,
    InputBase,
    InputLabel,
    Menu,
    MenuItem,
    Select,
    Toolbar,
    Tooltip,
    Typography,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { memo, useEffect, useState } from 'react';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export default memo(function Header({ title, subtitle }: HeaderProps) {
  const { mode, toggleTheme } = useThemeStore();
  const { user, selectedUserId, setSelectedUserId, dataLoadingCount, lastDataError } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const isLoading = dataLoadingCount > 0;
  const router = useRouter();
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const isMenuOpen = Boolean(menuAnchorEl);

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
  };

  const handleNavigate = (path: string) => {
    handleCloseMenu();
    router.push(path);
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    if (!user) return;
    setUsers([user]);
    if (selectedUserId !== user.id) setSelectedUserId(user.id);
  }, [user, selectedUserId, setSelectedUserId]);

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: 'background.default',
        borderBottom: '1px solid',
        borderColor: 'divider',
        color: 'text.primary',
      }}
    >
      <Toolbar sx={{ px: { xs: 2, md: 3 }, gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
          <Tooltip title="Menu principal">
            <IconButton size="small" onClick={handleOpenMenu}>
              <MenuIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={menuAnchorEl}
            open={isMenuOpen}
            onClose={handleCloseMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}
          >
            {menuSections.map((section) => {
              const sectionItems = [
                ...(section.path ? [{ title: section.title, path: section.path }] : []),
                ...flattenMenuItems(section.children || []),
              ];

              return (
                <Box key={section.title} sx={{ py: 0.5 }}>
                  <MenuItem disabled sx={{ fontWeight: 700, opacity: 1 }}>
                    {section.title}
                  </MenuItem>
                  {sectionItems.map((item) => (
                    <MenuItem key={item.path} onClick={() => handleNavigate(item.path || '/') } sx={{ pl: 3 }}>
                      {item.title}
                    </MenuItem>
                  ))}
                </Box>
              );
            })}
          </Menu>
          <Typography variant="h5" fontWeight={700}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>

        {/* Search */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            bgcolor: (theme) => alpha(theme.palette.text.primary, 0.04),
            borderRadius: 2.5,
            px: 2,
            py: 0.5,
            minWidth: 220,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <SearchIcon sx={{ color: 'text.secondary', mr: 1, fontSize: 20 }} />
          <InputBase
            placeholder="Rechercher..."
            sx={{ fontSize: '0.875rem', flex: 1 }}
          />
        </Box>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Utilisateur</InputLabel>
          <Select
            label="Utilisateur"
            value={selectedUserId || ''}
            onChange={(e) => setSelectedUserId(String(e.target.value))}
            disabled
          >
            {users.map((u) => (
              <MenuItem key={u.id} value={u.id}>{u.username}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.5, borderRadius: 2, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
              <CircularProgress size={14} />
              <Typography variant="caption" fontWeight={600}>
                Chargement...
              </Typography>
            </Box>
          )}
          {lastDataError && (
            <Tooltip title={lastDataError}>
              <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 0.5, borderRadius: 2, bgcolor: 'error.light', color: 'error.contrastText' }}>
                <Typography variant="caption" fontWeight={600} noWrap sx={{ maxWidth: 200 }}>
                  Erreur données
                </Typography>
              </Box>
            </Tooltip>
          )}
        </Box>

        {/* Actions */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Notifications">
            <IconButton size="small">
              <Badge badgeContent={0} color="error">
                <NotificationsIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          <Tooltip title={mode === 'light' ? 'Mode sombre' : 'Mode clair'}>
            <IconButton size="small" onClick={toggleTheme}>
              {mode === 'light' ? <DarkModeIcon fontSize="small" /> : <LightModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Plein écran">
            <IconButton size="small" onClick={handleFullscreen}>
              <FullscreenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
});
