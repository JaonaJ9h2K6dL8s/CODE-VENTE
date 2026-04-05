'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import { THEME_COLORS, useThemeStore, type ReceiptTemplate, type ThemeColor } from '@/stores/themeStore';
import {
    AdminPanelSettings,
    Business,
    CleaningServices,
    CloudUpload,
    ColorLens,
    DarkMode,
    Delete,
    DeleteSweep,
    Download,
    ErrorOutline,
    History,
    Info,
    Inventory2,
    LightMode,
    People,
    PersonAdd,
    Save,
    Security,
    Settings,
    ShoppingCart,
    Storage,
    TrendingUp,
    Visibility,
    VisibilityOff,
    WarningAmber,
} from '@mui/icons-material';
import {
    Alert,
    Avatar,
    Badge,
    Box,
    Button,
    Card, CardContent,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputLabel,
    LinearProgress,
    MenuItem,
    Select,
    Switch,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useCallback, useEffect, useState } from 'react';

interface SystemStats {
  users: Array<{ id: string; username: string; role: string; createdAt: string }>;
  totalUsers: number;
  totalClients: number;
  totalProducts: number;
  activeProducts: number;
  totalVariants: number;
  totalOrders: number;
  totalRevenue: number;
  totalOrderItems: number;
  totalLogs: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingOrders: number;
  confirmedOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  avgOrderAmount: number;
  recentLogs: Array<{ id: string; username: string; action: string; entity: string; details: string; createdAt: string }>;
  oldestOrder: string | null;
  newestOrder: string | null;
  topCategories: Array<{ category: string; count: number }>;
  dbSizeBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ACTION_LABELS: Record<string, string> = {
  create: '➕ Création',
  update: '✏️ Modification',
  delete: '🗑️ Suppression',
  login: '🔑 Connexion',
};

const RECEIPT_TEMPLATE_OPTIONS: Array<{ id: ReceiptTemplate; label: string; subtitle: string; accent: string }> = [
  { id: 'blue-grid', label: 'Bleu Grille', subtitle: 'Style bordereau classique', accent: '#0B4F9C' },
  { id: 'clean-light', label: 'Clair Pro', subtitle: 'Minimal et lisible', accent: '#4F46E5' },
  { id: 'emerald-pro', label: 'Émeraude', subtitle: 'Contraste doux et premium', accent: '#047857' },
  { id: 'mono-dark', label: 'Noir Moderne', subtitle: 'Style sombre élégant', accent: '#111827' },
  { id: 'delivery-sheet', label: 'Bon Livraison', subtitle: 'Avec paiement et livreur', accent: '#0B4F9C' },
  { id: 'pink-invoice', label: 'Invoice Rose', subtitle: 'Fond stylé + couleurs personnalisées', accent: '#D979A8' },
];

const RECEIPT_ACCENT_OPTIONS = [
  { label: 'Rose', value: '#D979A8' },
  { label: 'Lavande', value: '#9A74D8' },
  { label: 'Pêche', value: '#E68C79' },
  { label: 'Bleu Ciel', value: '#5D8DE4' },
  { label: 'Turquoise', value: '#34B3A0' },
];

export default function SettingsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { mode, toggleTheme, accentColor, setAccentColor, company, setCompany } = useThemeStore();
  const { user, selectedUserId, startDataLoading, endDataLoading, setDataError } = useAuthStore();

  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('seller');
  const [deleteUserOpen, setDeleteUserOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: string; username: string } | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [cleanLogsOpen, setCleanLogsOpen] = useState(false);
  const [cleanLogsDays, setCleanLogsDays] = useState(90);
  const [actionLoading, setActionLoading] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);

  // Company edit state
  const [companyName, setCompanyName] = useState(company.name);
  const [companySubtitle, setCompanySubtitle] = useState(company.subtitle);
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(company.logoUrl);
  const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplate>(company.receiptTemplate || 'blue-grid');
  const [receiptAccentColor, setReceiptAccentColor] = useState(company.receiptAccentColor || '#D979A8');
  const [browserPort, setBrowserPort] = useState('-');
  const [mounted, setMounted] = useState(false);

  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message;
    return fallback;
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      if (!selectedUserId) return;
      startDataLoading();
      const res = await fetch(`/api/settings?type=system&userId=${selectedUserId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Erreur serveur');
      }
      setStats(data);
      setDataError(null);
    } catch (error) {
      enqueueSnackbar('Erreur de chargement', { variant: 'error' });
      setDataError(getErrorMessage(error, 'Erreur chargement paramètres'));
    } finally {
      setLoading(false);
      endDataLoading();
    }
  }, [enqueueSnackbar, selectedUserId, startDataLoading, endDataLoading, setDataError, getErrorMessage]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    setMounted(true);
    setBrowserPort(window.location.port || '80');
  }, []);

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) { enqueueSnackbar('Remplissez tous les champs', { variant: 'warning' }); return; }
    if (newPassword !== confirmPassword) { enqueueSnackbar('Les mots de passe ne correspondent pas', { variant: 'error' }); return; }
    if (newPassword.length < 6) { enqueueSnackbar('Minimum 6 caractères', { variant: 'warning' }); return; }
    setActionLoading(true);
    try {
      const res = await fetch('/api/auth', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id, currentPassword, newPassword }) });
      const data = await res.json();
      if (res.ok) { enqueueSnackbar('Mot de passe modifié', { variant: 'success' }); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }
      else { enqueueSnackbar(data.error || 'Erreur', { variant: 'error' }); }
    } catch { enqueueSnackbar('Erreur serveur', { variant: 'error' }); }
    finally { setActionLoading(false); }
  };

  const handleCreateUser = async () => {
    if (!newUsername || !newUserPassword) { enqueueSnackbar('Remplissez tous les champs', { variant: 'warning' }); return; }
    setActionLoading(true);
    try {
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createUser', username: newUsername, password: newUserPassword, role: newUserRole }) });
      const data = await res.json();
      if (res.ok) { enqueueSnackbar(`Utilisateur "${newUsername}" créé`, { variant: 'success' }); setCreateUserOpen(false); setNewUsername(''); setNewUserPassword(''); setNewUserRole('seller'); fetchStats(); }
      else { enqueueSnackbar(data.error || 'Erreur', { variant: 'error' }); }
    } catch { enqueueSnackbar('Erreur serveur', { variant: 'error' }); }
    finally { setActionLoading(false); }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteUser', userId: userToDelete.id }) });
      const data = await res.json();
      if (res.ok) { enqueueSnackbar(`Utilisateur supprimé`, { variant: 'success' }); setDeleteUserOpen(false); setUserToDelete(null); fetchStats(); }
      else { enqueueSnackbar(data.error || 'Erreur', { variant: 'error' }); }
    } catch { enqueueSnackbar('Erreur serveur', { variant: 'error' }); }
    finally { setActionLoading(false); }
  };

  const handleExportData = async () => {
    setActionLoading(true);
    try {
      if (!selectedUserId) { enqueueSnackbar('Utilisateur requis', { variant: 'error' }); return; }
      const res = await fetch(`/api/settings?type=export&userId=${selectedUserId}`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `vente-en-ligne-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click(); URL.revokeObjectURL(url);
      enqueueSnackbar('Données exportées', { variant: 'success' });
    } catch { enqueueSnackbar('Erreur export', { variant: 'error' }); }
    finally { setActionLoading(false); }
  };

  const handlePurgeCancelled = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purgeCancelled', userId: selectedUserId, username: user?.username }) });
      const data = await res.json();
      if (res.ok) { enqueueSnackbar(`${data.deleted} commande(s) purgée(s)`, { variant: 'success' }); setPurgeOpen(false); fetchStats(); }
      else { enqueueSnackbar(data.error || 'Erreur', { variant: 'error' }); }
    } catch { enqueueSnackbar('Erreur', { variant: 'error' }); }
    finally { setActionLoading(false); }
  };

  const handleCleanLogs = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cleanLogs', days: cleanLogsDays, userId: selectedUserId }) });
      const data = await res.json();
      if (res.ok) { enqueueSnackbar(`${data.deleted} log(s) supprimé(s)`, { variant: 'success' }); setCleanLogsOpen(false); fetchStats(); }
      else { enqueueSnackbar(data.error || 'Erreur', { variant: 'error' }); }
    } catch { enqueueSnackbar('Erreur', { variant: 'error' }); }
    finally { setActionLoading(false); }
  };

  const handleClearAllData = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clearAllData', userId: selectedUserId, username: user?.username }),
      });
      const data = await res.json();
      if (res.ok) {
        enqueueSnackbar('Toutes les données ont été supprimées', { variant: 'success' });
        setClearAllOpen(false);
        fetchStats();
      } else {
        enqueueSnackbar(data.error || 'Erreur', { variant: 'error' });
      }
    } catch {
      enqueueSnackbar('Erreur serveur', { variant: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512 * 1024) {
      enqueueSnackbar('Image trop lourde (max 512 Ko)', { variant: 'warning' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setCompanyLogoPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCompany = () => {
    setCompany({ name: companyName, subtitle: companySubtitle, logoUrl: companyLogoPreview, receiptTemplate, receiptAccentColor });
    enqueueSnackbar('Informations de l\'entreprise enregistrées', { variant: 'success' });
  };

  const handleRemoveLogo = () => {
    setCompanyLogoPreview(null);
    setCompany({ logoUrl: null });
    enqueueSnackbar('Logo supprimé', { variant: 'info' });
  };

  const MiniStat = ({ label, value, color = 'text.primary' }: { label: string; value: string | number; color?: string }) => (
    <Box sx={{ textAlign: 'center', p: 1.5 }}>
      <Typography variant="h5" fontWeight={800} color={color}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Box>
  );

  const ReceiptTemplatePreview = ({ templateId }: { templateId: ReceiptTemplate }) => {
    const selected = receiptTemplate === templateId;
    const template = RECEIPT_TEMPLATE_OPTIONS.find((opt) => opt.id === templateId) || RECEIPT_TEMPLATE_OPTIONS[0];
    const isDark = templateId === 'mono-dark';
    const isPinkInvoice = templateId === 'pink-invoice';
    const accent = isPinkInvoice ? receiptAccentColor : template.accent;
    const bg = isDark ? '#111827' : isPinkInvoice ? '#FFF5FA' : '#FFFFFF';
    const text = isDark ? '#F9FAFB' : '#0F172A';
    const border = isDark ? '#374151' : '#CBD5E1';
    const muted = isDark ? '#D1D5DB' : '#64748B';
    return (
      <Card
        variant="outlined"
        onClick={() => setReceiptTemplate(templateId)}
        sx={{
          p: 1,
          cursor: 'pointer',
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? 'primary.main' : 'divider',
          boxShadow: selected ? 3 : 0,
          transition: 'all 0.2s ease',
          '&:hover': { boxShadow: 2, transform: 'translateY(-2px)' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography variant="subtitle2" fontWeight={700}>{template.label}</Typography>
          {selected && <Chip size="small" color="primary" label="Actif" />}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {template.subtitle}
        </Typography>
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden', background: isPinkInvoice ? `linear-gradient(135deg, ${accent}22 0%, #FFFFFF 50%, ${accent}18 100%)` : 'transparent' }}>
          <Box sx={{ bgcolor: accent, color: '#fff', px: 1, py: 0.5, fontSize: '0.58rem', fontWeight: 700, textAlign: 'center' }}>
            BON DE LIVRAISON
          </Box>
          <Box sx={{ bgcolor: bg, color: text, p: 0.75 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.55rem', fontWeight: 700 }}>Client N°1: Rakoto</Typography>
              <Typography sx={{ fontSize: '0.55rem', color: muted }}>{templateId === 'blue-grid' ? 'live 26 mars 2025' : '26 mars 2025'}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.52rem', color: muted, mb: 0.5 }}>Adresse: Antananarivo • Contact: 034 00 000 00</Typography>
            <Box sx={{ border: '1px solid', borderColor: border }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1.8fr .5fr .9fr .9fr', bgcolor: accent, color: '#fff' }}>
                {['Article', 'Qté', 'P.U', 'Total'].map((h) => (
                  <Box key={h} sx={{ px: 0.4, py: 0.25, borderRight: '1px solid rgba(255,255,255,0.35)', fontSize: '0.5rem', fontWeight: 700 }}>{h}</Box>
                ))}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1.8fr .5fr .9fr .9fr', borderTop: '1px solid', borderColor: border }}>
                {['T-shirt M', '2', '25 000', '50 000'].map((v, idx) => (
                  <Box key={`${templateId}-${idx}`} sx={{ px: 0.4, py: 0.25, borderRight: idx < 3 ? '1px solid' : 'none', borderColor: border, fontSize: '0.5rem' }}>{v}</Box>
                ))}
              </Box>
            </Box>
            <Box sx={{ mt: 0.7, ml: 'auto', width: '72%' }}>
              {[
                ['Sous-total', '50 000 Ar'],
                ['Frais livraison', '4 000 Ar'],
                ['Total', '54 000 Ar'],
              ].map(([k, v]) => (
                <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: '0.5rem', color: muted }}>{k}</Typography>
                  <Typography sx={{ fontSize: '0.5rem', fontWeight: 700 }}>{v}</Typography>
                </Box>
              ))}
            </Box>
            {(templateId === 'delivery-sheet' || templateId === 'pink-invoice') && (
              <Box sx={{ mt: 0.55, borderTop: '1px dashed', borderColor: border, pt: 0.45 }}>
                <Typography sx={{ fontSize: '0.5rem', color: muted }}>Paiement: MVola</Typography>
                <Typography sx={{ fontSize: '0.5rem', color: muted }}>Livreur: Jean</Typography>
              </Box>
            )}
          </Box>
        </Box>
      </Card>
    );
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden', bgcolor: 'background.default' }}>
      <Sidebar />
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Header title="Paramètres" subtitle="Configuration et administration" />
        {loading && <LinearProgress />}
        <Box sx={{ p: 3, maxWidth: 1000 }}>
          <Grid container spacing={3}>

            {/* PROFIL */}
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Settings fontSize="small" color="primary" /> Profil utilisateur
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Badge overlap="circular" anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      badgeContent={<Chip label={user?.role === 'admin' ? 'Admin' : 'Vendeur'} size="small" color={user?.role === 'admin' ? 'primary' : 'default'} sx={{ fontWeight: 700, fontSize: '0.65rem', height: 20 }} />}>
                      <Avatar sx={{ width: 80, height: 80, bgcolor: 'primary.main', fontSize: '2rem', fontWeight: 700 }}>
                        {user?.username?.charAt(0).toUpperCase() || 'U'}
                      </Avatar>
                    </Badge>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h5" fontWeight={700}>{user?.username || 'Utilisateur'}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Rôle : {user?.role === 'admin' ? '👑 Administrateur' : '🛒 Vendeur'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">ID : <code>{user?.id || '-'}</code></Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Inscrit le : {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '-'}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* ENTREPRISE */}
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Business fontSize="small" color="primary" /> Informations de l&apos;entreprise
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <Grid container spacing={3} alignItems="center">
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                        <Avatar
                          src={companyLogoPreview || undefined}
                          variant="rounded"
                          sx={{
                            width: 110,
                            height: 110,
                            borderRadius: 3,
                            bgcolor: 'primary.main',
                            fontSize: '2.5rem',
                            fontWeight: 800,
                            border: '3px dashed',
                            borderColor: companyLogoPreview ? 'primary.main' : 'divider',
                          }}
                        >
                          {!companyLogoPreview && (companyName?.charAt(0)?.toUpperCase() || 'E')}
                        </Avatar>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            component="label"
                            startIcon={<CloudUpload />}
                            sx={{ fontSize: '0.75rem' }}
                          >
                            {companyLogoPreview ? 'Changer' : 'Logo'}
                            <input type="file" hidden accept="image/*" onChange={handleLogoUpload} />
                          </Button>
                          {companyLogoPreview && (
                            <Button variant="outlined" size="small" color="error" onClick={handleRemoveLogo} sx={{ fontSize: '0.75rem' }}>
                              Supprimer
                            </Button>
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">PNG, JPG • Max 512 Ko</Typography>
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 8 }}>
                      <TextField
                        fullWidth
                        label="Nom de l'entreprise"
                        size="small"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        sx={{ mb: 2 }}
                        placeholder="Ex: Yanke Fashion"
                      />
                      <TextField
                        fullWidth
                        label="Sous-titre / Slogan"
                        size="small"
                        value={companySubtitle}
                        onChange={(e) => setCompanySubtitle(e.target.value)}
                        sx={{ mb: 2 }}
                        placeholder="Ex: Boutique en ligne"
                      />
                      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                        Template de récapitulation de commande
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                        Le choix appliquera le style sur les récapitulations dans Commande et Vente en live.
                      </Typography>
                      <Grid container spacing={1.25} sx={{ mb: 2.5 }}>
                        {RECEIPT_TEMPLATE_OPTIONS.map((template) => (
                          <Grid key={template.id} size={{ xs: 12, sm: 6 }}>
                            <ReceiptTemplatePreview templateId={template.id} />
                          </Grid>
                        ))}
                      </Grid>
                      {receiptTemplate === 'pink-invoice' && (
                        <Box sx={{ mb: 2.5 }}>
                          <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.75 }}>
                            Choix de couleur du template
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            Cette couleur pilote l&apos;entête, le tableau et l&apos;ambiance du fond stylé.
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {RECEIPT_ACCENT_OPTIONS.map((opt) => (
                              <Button
                                key={opt.value}
                                onClick={() => setReceiptAccentColor(opt.value)}
                                variant={receiptAccentColor === opt.value ? 'contained' : 'outlined'}
                                sx={{
                                  textTransform: 'none',
                                  borderColor: opt.value,
                                  color: receiptAccentColor === opt.value ? '#fff' : opt.value,
                                  bgcolor: receiptAccentColor === opt.value ? opt.value : 'transparent',
                                  '&:hover': { bgcolor: receiptAccentColor === opt.value ? opt.value : `${opt.value}12` },
                                }}
                              >
                                {opt.label}
                              </Button>
                            ))}
                          </Box>
                        </Box>
                      )}
                      <Button
                        variant="contained"
                        startIcon={<Save />}
                        onClick={handleSaveCompany}
                        disabled={!companyName}
                      >
                        Enregistrer
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* COULEUR DU THÈME */}
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ColorLens fontSize="small" color="primary" /> Couleur du thème
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Choisissez la couleur principale de l&apos;interface. Elle sera appliquée immédiatement sur tout le site.
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                    {(Object.entries(THEME_COLORS) as [ThemeColor, typeof THEME_COLORS[ThemeColor]][]).map(([key, color]) => (
                      <Tooltip key={key} title={color.label} arrow>
                        <Box
                          onClick={() => setAccentColor(key)}
                          sx={{
                            width: 56,
                            height: 56,
                            borderRadius: 2.5,
                            bgcolor: color.main,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s ease',
                            border: accentColor === key ? '3px solid' : '3px solid transparent',
                            borderColor: accentColor === key ? 'text.primary' : 'transparent',
                            boxShadow: accentColor === key ? '0 0 0 3px rgba(0,0,0,0.15)' : 'none',
                            transform: accentColor === key ? 'scale(1.12)' : 'scale(1)',
                            '&:hover': {
                              transform: 'scale(1.1)',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            },
                          }}
                        >
                          {accentColor === key && (
                            <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: '1.2rem' }}>✓</Typography>
                          )}
                        </Box>
                      </Tooltip>
                    ))}
                  </Box>
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: THEME_COLORS[accentColor].main }} />
                    <Box>
                      <Typography variant="body2" fontWeight={600}>
                        Couleur active : {THEME_COLORS[accentColor].label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {THEME_COLORS[accentColor].main}
                      </Typography>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* APPARENCE */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {mode === 'dark' ? <DarkMode fontSize="small" color="primary" /> : <LightMode fontSize="small" color="warning" />} Apparence
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <FormControlLabel
                    control={<Switch checked={mode === 'dark'} onChange={toggleTheme} color="primary" />}
                    label={<Box><Typography variant="body1" fontWeight={500}>Mode sombre</Typography><Typography variant="caption" color="text.secondary">Thème clair / sombre</Typography></Box>}
                  />
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Aperçu des couleurs</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                      {['primary', 'success', 'warning', 'error', 'info'].map((c) => (
                        <Chip key={c} label={c} color={c as 'primary'} size="small" />
                      ))}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* SÉCURITÉ */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Security fontSize="small" color="primary" /> Sécurité
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <TextField fullWidth label="Mot de passe actuel" size="small" sx={{ mb: 1.5 }}
                    type={showCurrentPw ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)}
                    slotProps={{ input: { endAdornment: <IconButton size="small" onClick={() => setShowCurrentPw(!showCurrentPw)}>{showCurrentPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}</IconButton> }}} />
                  <TextField fullWidth label="Nouveau mot de passe" size="small" sx={{ mb: 1.5 }}
                    type={showNewPw ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    slotProps={{ input: { endAdornment: <IconButton size="small" onClick={() => setShowNewPw(!showNewPw)}>{showNewPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}</IconButton> }}} />
                  <TextField fullWidth label="Confirmer" type="password" size="small" sx={{ mb: 2 }}
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    error={confirmPassword !== '' && confirmPassword !== newPassword}
                    helperText={confirmPassword !== '' && confirmPassword !== newPassword ? 'Ne correspond pas' : ''} />
                  <Button variant="contained" startIcon={<Save />} onClick={handleChangePassword} fullWidth
                    disabled={actionLoading || !currentPassword || !newPassword || newPassword !== confirmPassword}>
                    Modifier le mot de passe
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            {/* GESTION UTILISATEURS */}
            {user?.role === 'admin' && (
              <Grid size={12}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="h6" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AdminPanelSettings fontSize="small" color="primary" /> Gestion des utilisateurs
                      </Typography>
                      <Button variant="contained" size="small" startIcon={<PersonAdd />} onClick={() => setCreateUserOpen(true)}>
                        Ajouter
                      </Button>
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Utilisateur</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Rôle</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Créé le</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {stats?.users.map((u) => (
                            <TableRow key={u.id} hover>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                  <Avatar sx={{ width: 32, height: 32, bgcolor: u.role === 'admin' ? 'primary.main' : 'grey.400', fontSize: '0.85rem' }}>
                                    {u.username.charAt(0).toUpperCase()}
                                  </Avatar>
                                  <Box>
                                    <Typography variant="body2" fontWeight={600}>{u.username}</Typography>
                                    <Typography variant="caption" color="text.secondary">ID: {u.id.slice(0, 12)}...</Typography>
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Chip label={u.role === 'admin' ? '👑 Admin' : '🛒 Vendeur'} size="small"
                                  color={u.role === 'admin' ? 'primary' : 'default'} variant="outlined" sx={{ fontWeight: 600 }} />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">{new Date(u.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</Typography>
                              </TableCell>
                              <TableCell align="center">
                                {u.id !== user?.id ? (
                                  <Tooltip title="Supprimer">
                                    <IconButton size="small" color="error" onClick={() => { setUserToDelete({ id: u.id, username: u.username }); setDeleteUserOpen(true); }}>
                                      <Delete fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  <Chip label="Vous" size="small" variant="outlined" color="primary" sx={{ fontSize: '0.7rem' }} />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* BASE DE DONNÉES */}
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Storage fontSize="small" color="primary" /> Base de données — Vue d&apos;ensemble
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  {stats ? (<>
                    <Grid container spacing={1} sx={{ mb: 2 }}>
                      {[
                        { icon: <People sx={{ color: 'primary.main', mb: 0.5 }} />, val: stats.totalClients, label: 'Clients' },
                        { icon: <Inventory2 sx={{ color: 'info.main', mb: 0.5 }} />, val: stats.totalProducts, label: `Produits (${stats.activeProducts} actifs)` },
                        { icon: <ShoppingCart sx={{ color: 'success.main', mb: 0.5 }} />, val: stats.totalOrders, label: 'Commandes' },
                        { icon: <TrendingUp sx={{ color: 'warning.main', mb: 0.5 }} />, val: stats.totalRevenue.toLocaleString('fr-FR'), label: 'CA Total (MGA)' },
                      ].map((item, i) => (
                        <Grid key={i} size={{ xs: 6, sm: 3 }}>
                          <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, textAlign: 'center' }}>
                            {item.icon}
                            <Typography variant="h4" fontWeight={800}>{item.val}</Typography>
                            <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                          </Box>
                        </Grid>
                      ))}
                    </Grid>

                    <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, mb: 2 }}>
                      <Typography variant="subtitle2" fontWeight={700} gutterBottom>📊 Répartition des commandes</Typography>
                      <Grid container spacing={1}>
                        <Grid size={{ xs: 6, sm: 3 }}><MiniStat label="En attente" value={stats.pendingOrders} color="warning.main" /></Grid>
                        <Grid size={{ xs: 6, sm: 3 }}><MiniStat label="Confirmées" value={stats.confirmedOrders} color="info.main" /></Grid>
                        <Grid size={{ xs: 6, sm: 3 }}><MiniStat label="Livrées" value={stats.deliveredOrders} color="success.main" /></Grid>
                        <Grid size={{ xs: 6, sm: 3 }}><MiniStat label="Annulées" value={stats.cancelledOrders} color="error.main" /></Grid>
                      </Grid>
                      <Divider sx={{ my: 1.5 }} />
                      <Grid container spacing={1}>
                        <Grid size={{ xs: 6, sm: 4 }}><MiniStat label="Panier moyen" value={`${stats.avgOrderAmount.toLocaleString('fr-FR')} MGA`} /></Grid>
                        <Grid size={{ xs: 6, sm: 4 }}><MiniStat label="Articles vendus" value={stats.totalOrderItems} /></Grid>
                        <Grid size={{ xs: 12, sm: 4 }}><MiniStat label="Variantes en stock" value={stats.totalVariants} /></Grid>
                      </Grid>
                    </Box>

                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, height: '100%' }}>
                          <Typography variant="subtitle2" fontWeight={700} gutterBottom>⚠️ Alertes de stock</Typography>
                          <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                            <Box sx={{ flex: 1, p: 1.5, bgcolor: 'warning.light', borderRadius: 2, textAlign: 'center' }}>
                              <WarningAmber sx={{ color: 'warning.main', fontSize: 28 }} />
                              <Typography variant="h5" fontWeight={800} color="warning.main">{stats.lowStockCount}</Typography>
                              <Typography variant="caption">Stock faible (≤5)</Typography>
                            </Box>
                            <Box sx={{ flex: 1, p: 1.5, bgcolor: 'error.light', borderRadius: 2, textAlign: 'center' }}>
                              <ErrorOutline sx={{ color: 'error.main', fontSize: 28 }} />
                              <Typography variant="h5" fontWeight={800} color="error.main">{stats.outOfStockCount}</Typography>
                              <Typography variant="caption">Rupture de stock</Typography>
                            </Box>
                          </Box>
                        </Box>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 6 }}>
                        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 2, height: '100%' }}>
                          <Typography variant="subtitle2" fontWeight={700} gutterBottom>🏷️ Catégories</Typography>
                          {stats.topCategories.length > 0 ? (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                              {stats.topCategories.map((cat, i) => (
                                <Chip key={i} label={`${cat.category} (${cat.count})`} size="small" variant="outlined" />
                              ))}
                            </Box>
                          ) : <Typography variant="caption" color="text.secondary">Aucune catégorie</Typography>}
                          <Divider sx={{ my: 1.5 }} />
                          <Typography variant="caption" color="text.secondary">
                            📅 Du {stats.oldestOrder ? new Date(stats.oldestOrder).toLocaleDateString('fr-FR') : '-'}
                            {' au '}{stats.newestOrder ? new Date(stats.newestOrder).toLocaleDateString('fr-FR') : '-'}
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>

                    <Box sx={{ mt: 2, p: 1.5, display: 'flex', justifyContent: 'space-between', bgcolor: 'action.hover', borderRadius: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        💾 Taille : <strong>{formatBytes(stats.dbSizeBytes)}</strong> • {stats.totalLogs} logs • {stats.totalUsers} utilisateur(s)
                      </Typography>
                    </Box>
                  </>) : <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress /></Box>}
                </CardContent>
              </Card>
            </Grid>

            {/* JOURNAL D'ACTIVITÉ */}
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <History fontSize="small" color="primary" /> Journal d&apos;activité récent
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  {stats?.recentLogs && stats.recentLogs.length > 0 ? (
                    <TableContainer sx={{ maxHeight: 350 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Utilisateur</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Action</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Entité</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Détails</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {stats.recentLogs.map((log) => (
                            <TableRow key={log.id} hover>
                              <TableCell><Typography variant="caption">{formatDate(log.createdAt)}</Typography></TableCell>
                              <TableCell><Chip label={log.username || 'system'} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} /></TableCell>
                              <TableCell><Typography variant="caption">{ACTION_LABELS[log.action] || log.action}</Typography></TableCell>
                              <TableCell><Chip label={log.entity} size="small" sx={{ fontSize: '0.65rem', fontWeight: 600 }} /></TableCell>
                              <TableCell>
                                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 300, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {log.details}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>Aucune activité</Typography>}
                </CardContent>
              </Card>
            </Grid>

            {/* MAINTENANCE & EXPORT */}
            {user?.role === 'admin' && (
              <Grid size={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CleaningServices fontSize="small" color="primary" /> Maintenance & Export
                    </Typography>
                    <Divider sx={{ my: 2 }} />
                    <Grid container spacing={2}>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <Box>
                            <Download sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                            <Typography variant="subtitle2" fontWeight={700}>Exporter les données</Typography>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                              Backup JSON complet (clients, produits, commandes)
                            </Typography>
                          </Box>
                          <Button variant="outlined" startIcon={<Download />} onClick={handleExportData} disabled={actionLoading} fullWidth>
                            Exporter (.json)
                          </Button>
                        </Box>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <Box>
                            <DeleteSweep sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
                            <Typography variant="subtitle2" fontWeight={700}>Purger annulées</Typography>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                              Supprimer les commandes annulées
                            </Typography>
                            {stats && stats.cancelledOrders > 0 && <Chip label={`${stats.cancelledOrders} cmd`} size="small" color="warning" variant="outlined" sx={{ mb: 1 }} />}
                          </Box>
                          <Button variant="outlined" color="warning" startIcon={<DeleteSweep />}
                            onClick={() => setPurgeOpen(true)} disabled={actionLoading || !stats?.cancelledOrders} fullWidth>
                            Purger
                          </Button>
                        </Box>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <Box>
                            <CleaningServices sx={{ fontSize: 40, color: 'error.main', mb: 1 }} />
                            <Typography variant="subtitle2" fontWeight={700}>Nettoyer les logs</Typography>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                              Supprimer les anciens journaux
                            </Typography>
                            {stats && <Chip label={`${stats.totalLogs} entrées`} size="small" color="error" variant="outlined" sx={{ mb: 1 }} />}
                          </Box>
                          <Button variant="outlined" color="error" startIcon={<CleaningServices />}
                            onClick={() => setCleanLogsOpen(true)} disabled={actionLoading || !stats?.totalLogs} fullWidth>
                            Nettoyer
                          </Button>
                        </Box>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 4 }}>
                        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <Box>
                            <Delete sx={{ fontSize: 40, color: 'error.main', mb: 1 }} />
                            <Typography variant="subtitle2" fontWeight={700}>Supprimer toutes les données</Typography>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                              Nettoyage complet (clients, produits, commandes, stock, production)
                            </Typography>
                          </Box>
                          <Button variant="contained" color="error" startIcon={<Delete />}
                            onClick={() => setClearAllOpen(true)} disabled={actionLoading} fullWidth>
                            Tout supprimer
                          </Button>
                        </Box>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* À PROPOS */}
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Info fontSize="small" color="primary" /> À propos
                  </Typography>
                  <Divider sx={{ my: 2 }} />
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="body2" sx={{ mb: 1 }}><strong>📦 Vente en ligne</strong> — Gestion des commandes</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">Version :</Typography>
                        <Chip label="1.0.0" size="small" sx={{ fontSize: '0.7rem', height: 20 }} />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">Environnement :</Typography>
                        <Chip label="Development" size="small" color="warning" sx={{ fontSize: '0.7rem', height: 20 }} />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">Port :</Typography>
                        <Chip label={<span suppressHydrationWarning>{mounted ? browserPort : '-'}</span>} size="small" sx={{ fontSize: '0.7rem', height: 20 }} />
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 1 }}>🛠️ Stack technique</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {['Next.js 15', 'React 19', 'TypeScript', 'MUI v7', 'SQLite', 'Zustand', 'Turbopack'].map((t) => (
                          <Chip key={t} label={t} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                        ))}
                      </Box>
                    </Grid>
                  </Grid>
                  <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }} icon={<Storage />}>
                    Base SQLite locale — <code>data/vente-en-ligne.db</code>{stats && ` (${formatBytes(stats.dbSizeBytes)})`}
                  </Alert>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>

        {/* DIALOG: Créer utilisateur */}
        <Dialog open={createUserOpen} onClose={() => setCreateUserOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><PersonAdd color="primary" /> Nouvel utilisateur</DialogTitle>
          <DialogContent>
            <TextField fullWidth label="Nom d'utilisateur" size="small" sx={{ mt: 1, mb: 2 }} value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoFocus />
            <TextField fullWidth label="Mot de passe" type="password" size="small" sx={{ mb: 2 }} value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} helperText="Minimum 6 caractères" />
            <FormControl fullWidth size="small">
              <InputLabel>Rôle</InputLabel>
              <Select value={newUserRole} label="Rôle" onChange={(e) => setNewUserRole(e.target.value)}>
                <MenuItem value="seller">🛒 Vendeur</MenuItem>
                <MenuItem value="admin">👑 Administrateur</MenuItem>
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCreateUserOpen(false)}>Annuler</Button>
            <Button variant="contained" onClick={handleCreateUser} disabled={actionLoading || !newUsername || !newUserPassword}
              startIcon={actionLoading ? <CircularProgress size={18} /> : <PersonAdd />}>Créer</Button>
          </DialogActions>
        </Dialog>

        {/* DIALOG: Supprimer utilisateur */}
        <Dialog open={deleteUserOpen} onClose={() => setDeleteUserOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ color: 'error.main' }}>⚠️ Supprimer l&apos;utilisateur</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>Cette action est irréversible.</Alert>
            <Typography variant="body2">Supprimer <strong>&quot;{userToDelete?.username}&quot;</strong> ?</Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDeleteUserOpen(false)}>Annuler</Button>
            <Button variant="contained" color="error" onClick={handleDeleteUser} disabled={actionLoading}
              startIcon={actionLoading ? <CircularProgress size={18} /> : <Delete />}>Supprimer</Button>
          </DialogActions>
        </Dialog>

        {/* DIALOG: Purger */}
        <Dialog open={purgeOpen} onClose={() => setPurgeOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ color: 'warning.main' }}>⚠️ Purger commandes annulées</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Suppression définitive de <strong>{stats?.cancelledOrders || 0}</strong> commande(s) annulée(s).
            </Alert>
            <Typography variant="body2" color="text.secondary">Pensez à exporter vos données avant.</Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setPurgeOpen(false)}>Annuler</Button>
            <Button variant="contained" color="warning" onClick={handlePurgeCancelled} disabled={actionLoading}
              startIcon={actionLoading ? <CircularProgress size={18} /> : <DeleteSweep />}>Purger</Button>
          </DialogActions>
        </Dialog>

        {/* DIALOG: Nettoyer logs */}
        <Dialog open={cleanLogsOpen} onClose={() => setCleanLogsOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ color: 'error.main' }}>🗑️ Nettoyer le journal</DialogTitle>
          <DialogContent>
            <Typography variant="body2" sx={{ mb: 2 }}>Supprimer les logs de plus de :</Typography>
            <FormControl fullWidth size="small">
              <InputLabel>Période</InputLabel>
              <Select value={cleanLogsDays} label="Période" onChange={(e) => setCleanLogsDays(Number(e.target.value))}>
                <MenuItem value={7}>7 jours</MenuItem>
                <MenuItem value={30}>30 jours</MenuItem>
                <MenuItem value={60}>60 jours</MenuItem>
                <MenuItem value={90}>90 jours</MenuItem>
                <MenuItem value={180}>6 mois</MenuItem>
                <MenuItem value={365}>1 an</MenuItem>
              </Select>
            </FormControl>
            <Alert severity="info" sx={{ mt: 2 }}>Total actuel : <strong>{stats?.totalLogs || 0}</strong> entrée(s)</Alert>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setCleanLogsOpen(false)}>Annuler</Button>
            <Button variant="contained" color="error" onClick={handleCleanLogs} disabled={actionLoading}
              startIcon={actionLoading ? <CircularProgress size={18} /> : <CleaningServices />}>Nettoyer</Button>
          </DialogActions>
        </Dialog>

        <Dialog open={clearAllOpen} onClose={() => setClearAllOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle sx={{ color: 'error.main' }}>⚠️ Suppression totale des données</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb: 2 }}>
              Cette action supprime toutes les données (clients, produits, commandes, stocks, mouvements, production).
            </Alert>
            <Typography variant="body2">Confirmer la suppression totale ?</Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setClearAllOpen(false)}>Annuler</Button>
            <Button color="error" variant="contained" startIcon={actionLoading ? <CircularProgress size={18} /> : <Delete />} onClick={handleClearAllData}>
              Supprimer
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
