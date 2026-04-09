'use client';

import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import {
    Dashboard as DashboardIcon,
    ExpandLess,
    ExpandMore,
    FiberManualRecord,
    History as HistoryIcon,
    Inventory as InventoryIcon,
    LocalMall,
    LocalShipping,
    LiveTv,
    Logout as LogoutIcon,
    ShoppingCart as OrdersIcon,
    People as PeopleIcon,
    Search,
    Settings as SettingsIcon,
    StorefrontOutlined,
} from '@mui/icons-material';
import {
    Avatar,
    Box,
    Divider,
    Drawer,
    IconButton,
    InputBase,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Tooltip,
    Typography,
} from '@mui/material';
import { usePathname, useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

const DRAWER_WIDTH = 260;

export interface MenuItem {
  title: string;
  path?: string;
  icon?: React.ReactNode;
  children?: MenuItem[];
}

export const menuSections: MenuItem[] = [
  {
    title: 'Tableau de bord',
    path: '/dashboard',
    icon: <DashboardIcon />,
  },
  {
    title: 'Vente',
    icon: <LocalMall />,
    children: [
      { title: 'Vente en live', path: '/live', icon: <LiveTv /> },
      { title: 'Clients', path: '/clients', icon: <PeopleIcon /> },
      { title: 'Coordonner de client', path: '/sales/client-coordinates', icon: <PeopleIcon /> },
      { title: 'Récapitulation client', path: '/sales/client-recap', icon: <PeopleIcon /> },
      { title: 'Offre spéciale', path: '/sales/special-offers', icon: <LocalMall /> },
      { title: 'Commande', path: '/orders', icon: <OrdersIcon /> },
      { title: 'Livraison en attente', path: '/sales/pending-deliveries', icon: <LocalShipping /> },
      { title: 'Statistique de livraison journalière', path: '/sales/delivery-daily' },
    ],
  },
  {
    title: 'Stock',
    icon: <InventoryIcon />,
    path: '/stock',
  },
  { title: 'Historique', path: '/history', icon: <HistoryIcon /> },
  { title: 'Paramètres', path: '/settings', icon: <SettingsIcon /> },
];

export const flattenMenuItems = (items: MenuItem[]): MenuItem[] => {
  const result: MenuItem[] = [];
  items.forEach((item) => {
    if (item.path) {
      result.push({ ...item, children: undefined });
    }
    if (item.children) {
      result.push(...flattenMenuItems(item.children));
    }
  });
  return result;
};

export default memo(function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { company } = useThemeStore();
  const [menuSearch, setMenuSearch] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const isPathActive = useCallback((path?: string) => {
    if (!path) return false;
    return pathname === path || pathname?.startsWith(`${path}/`);
  }, [pathname]);

  const isItemActive = useCallback((item: MenuItem): boolean => {
    if (item.path && isPathActive(item.path)) return true;
    return item.children?.some((child) => isItemActive(child)) ?? false;
  }, [isPathActive]);

  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      const openActiveParents = (items: MenuItem[]) => {
        items.forEach((item) => {
          if (item.children?.length) {
            if (isItemActive(item)) {
              next[item.title] = true;
            }
            openActiveParents(item.children);
          }
        });
      };
      openActiveParents(menuSections);
      return next;
    });
  }, [pathname, isItemActive]);

  const filteredMenuItems = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    if (!q) return menuSections;

    const filterItems = (items: MenuItem[]): MenuItem[] => {
      return items.flatMap((item) => {
        const titleMatch = item.title.toLowerCase().includes(q);
        if (item.children?.length) {
          const filteredChildren = filterItems(item.children);
          if (titleMatch) {
            return [{ ...item }];
          }
          if (filteredChildren.length) {
            return [{ ...item, children: filteredChildren }];
          }
          return [];
        }
        return titleMatch ? [item] : [];
      });
    };

    return filterItems(menuSections);
  }, [menuSearch]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
          borderRight: '1px solid',
          borderColor: 'divider',
        },
      }}
    >
      {/* Logo */}
      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {company.logoUrl ? (
          <Avatar
            src={company.logoUrl}
            variant="rounded"
            sx={{
              width: 42,
              height: 42,
              borderRadius: 2.5,
            }}
          />
        ) : (
          <Avatar
            sx={{
              bgcolor: 'primary.main',
              width: 42,
              height: 42,
              borderRadius: 2.5,
            }}
          >
            <StorefrontOutlined />
          </Avatar>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }} noWrap>
            {company.name || 'Vente'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {company.subtitle || 'En ligne'}
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ mx: 2 }} />

      {/* Navigation */}
      <Box sx={{ px: 2, pt: 2 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            px: 1.5,
            py: 0.5,
            bgcolor: 'background.default',
          }}
        >
          <Search sx={{ color: 'text.secondary', fontSize: 18, mr: 1 }} />
          <InputBase
            placeholder="Rechercher..."
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
            sx={{ fontSize: '0.8rem', flex: 1 }}
          />
        </Box>
      </Box>

      <List sx={{ px: 1.5, py: 2, flex: 1 }}>
        {filteredMenuItems.map((item) => {
          const renderItem = (menuItem: MenuItem, level: number) => {
            const hasChildren = Boolean(menuItem.children?.length);
            const isActive = isItemActive(menuItem);
            const isOpen = hasChildren ? openSections[menuItem.title] || Boolean(menuSearch) : false;
            const paddingLeft = 1.5 + level * 2.2;
            const iconNode = menuItem.icon ?? (level > 0 ? <FiberManualRecord sx={{ fontSize: 8 }} /> : undefined);

            return (
              <Box key={`${menuItem.title}-${menuItem.path || level}`} sx={{ mb: level === 0 ? 0.5 : 0 }}>
                <ListItemButton
                  onClick={() => {
                    if (menuItem.path && !isPathActive(menuItem.path)) {
                      router.push(menuItem.path);
                    }
                    if (hasChildren) {
                      setOpenSections((prev) => ({ ...prev, [menuItem.title]: !isOpen }));
                    }
                  }}
                  sx={{
                    borderRadius: 2.5,
                    mb: level === 0 ? 0.5 : 0,
                    py: level === 0 ? 1.2 : 0.9,
                    px: 1.5,
                    pl: paddingLeft,
                    bgcolor: isActive ? 'primary.main' : 'transparent',
                    color: isActive ? 'primary.contrastText' : 'text.secondary',
                    '&:hover': {
                      bgcolor: isActive ? 'primary.dark' : 'action.hover',
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: isActive ? 'primary.contrastText' : 'text.secondary',
                      minWidth: 36,
                    }}
                  >
                    {iconNode || <Box sx={{ width: 16 }} />}
                  </ListItemIcon>
                  <ListItemText
                    primary={menuItem.title}
                    primaryTypographyProps={{
                      fontWeight: isActive ? 600 : 500,
                      fontSize: level === 0 ? '0.9rem' : '0.82rem',
                    }}
                  />
                  {hasChildren && (isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />)}
                </ListItemButton>
                {hasChildren && (
                  <List disablePadding sx={{ ml: 0.5, display: isOpen ? 'block' : 'none' }}>
                    {menuItem.children?.map((child) => renderItem(child, level + 1))}
                  </List>
                )}
              </Box>
            );
          };

          return renderItem(item, 0);
        })}
      </List>

      <Divider sx={{ mx: 2 }} />

      {/* User Info */}
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ bgcolor: 'secondary.main', width: 36, height: 36, fontSize: '0.9rem' }}>
          {user?.username?.charAt(0).toUpperCase() || 'U'}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} noWrap>
            {user?.username || 'Utilisateur'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {user?.role === 'admin' ? 'Administrateur' : 'Vendeur'}
          </Typography>
        </Box>
        <Tooltip title="Déconnexion">
          <IconButton size="small" onClick={handleLogout} color="error">
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Drawer>
  );
});
