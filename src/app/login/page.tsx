'use client';

import { useAuthStore } from '@/stores/authStore';
import {
    Login as LoginIcon,
    StorefrontOutlined, Visibility, VisibilityOff,
    PersonAdd,
} from '@mui/icons-material';
import {
    Alert,
    Avatar,
    Box,
    Button,
    Card, CardContent,
    CircularProgress,
    IconButton,
    InputAdornment,
    TextField,
    Typography,
    Link,
} from '@mui/material';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const getErrorMessage = (err: unknown) => {
      if (err instanceof Error) return err.message;
      if (typeof err === 'string') return err;
      return 'Erreur inconnue';
    };

    try {
      if (isRegistering) {
        if (password !== confirmPassword) {
            setError('Les mots de passe ne correspondent pas');
            setLoading(false);
            return;
        }

        if (window.electron && window.electron.auth) {
            try {
                await window.electron.auth.register({ username, password });
                setSuccess('Compte créé avec succès ! Vous pouvez maintenant vous connecter.');
                setIsRegistering(false);
                setPassword('');
                setConfirmPassword('');
                setLoading(false);
                return;
            } catch (err: unknown) {
                console.error("IPC Register Error", err);
                const rawMessage = getErrorMessage(err);
                const errorMessage = rawMessage.includes('Error invoking remote method') 
                    ? rawMessage.split('Error: ')[1] || 'Erreur inconnue'
                    : rawMessage || 'Erreur d\'inscription IPC';
                setError(`Mode hors ligne: ${errorMessage}`);
                setLoading(false);
                return;
            }
        }

        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();

        if (!res.ok) {
            setError(data.error || 'Erreur lors de l\'inscription');
            return;
        }

        setSuccess('Compte créé avec succès ! Vous pouvez maintenant vous connecter.');
        setIsRegistering(false);
        setPassword('');
        setConfirmPassword('');
      } else {
        if (window.electron && window.electron.auth) {
            try {
                const user = await window.electron.auth.login({ username, password });
                login(user);
                router.push('/dashboard');
                return;
            } catch (err: unknown) {
                console.error("IPC Login Error", err);
                const rawMessage = getErrorMessage(err);
                const errorMessage = rawMessage.includes('Error invoking remote method') 
                    ? rawMessage.split('Error: ')[1] || 'Erreur inconnue'
                    : rawMessage || 'Erreur de connexion IPC';
                setError(`Mode hors ligne: ${errorMessage}`);
                // Don't fallback immediately if we have a specific auth error
                if (errorMessage.includes('Identifiants') || errorMessage.includes('Mot de passe')) {
                    setLoading(false);
                    return;
                }
            }
        }

        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const data = await res.json();

        if (!res.ok) {
            setError(data.error || 'Erreur de connexion');
            return;
        }

        login(data.user);
        router.push('/dashboard');
      }
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError('');
    setSuccess('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        background: (theme) =>
          theme.palette.mode === 'dark'
            ? 'linear-gradient(135deg, #0F1724 0%, #1A2332 50%, #0F1724 100%)'
            : 'linear-gradient(135deg, #F5F7FA 0%, #E8ECF2 50%, #F5F7FA 100%)',
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420, mx: 2 }}>
        <CardContent sx={{ p: 4 }}>
          {/* Logo */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Avatar
              sx={{
                bgcolor: 'primary.main',
                width: 64,
                height: 64,
                mx: 'auto',
                mb: 2,
                borderRadius: 3,
              }}
            >
              <StorefrontOutlined sx={{ fontSize: 32 }} />
            </Avatar>
            <Typography variant="h4" fontWeight={800}>
              Vente en ligne
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {isRegistering ? 'Créer un compte administrateur' : 'Gestion des commandes'}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
              {success}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Nom d'utilisateur"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              sx={{ mb: 2 }}
              autoFocus
              required
            />
            <TextField
              fullWidth
              label="Mot de passe"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{ mb: isRegistering ? 2 : 3 }}
              required
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            
            {isRegistering && (
                <TextField
                  fullWidth
                  label="Confirmer le mot de passe"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  sx={{ mb: 3 }}
                  required
                />
            )}

            <Button
              fullWidth
              type="submit"
              variant="contained"
              size="large"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : (isRegistering ? <PersonAdd /> : <LoginIcon />)}
              sx={{ py: 1.5, fontSize: '1rem' }}
            >
              {loading ? 'Chargement...' : (isRegistering ? 'S\'inscrire' : 'Se connecter')}
            </Button>
          </form>

          <Box sx={{ mt: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
                {isRegistering ? 'Déjà un compte ?' : 'Pas encore de compte ?'}
                <Link
                    component="button"
                    variant="body2"
                    onClick={toggleMode}
                    sx={{ ml: 1, fontWeight: 600 }}
                >
                    {isRegistering ? 'Se connecter' : 'Créer un compte'}
                </Link>
            </Typography>
          </Box>
          
          {!isRegistering && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
                Par défaut: admin / admin123
              </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
