'use client';

import Header from '@/components/layout/Header';
import Sidebar from '@/components/layout/Sidebar';
import { useAuthStore } from '@/stores/authStore';
import {
  Download,
  CloudUpload,
  Image as ImageIcon,
  Person,
  Search,
} from '@mui/icons-material';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  InputAdornment,
  LinearProgress,
  TextField,
  Typography,
} from '@mui/material';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { useSnackbar } from 'notistack';
import { ChangeEvent, useMemo, useRef, useState } from 'react';

type ImportedImageEntry = {
  orderId: string;
  clientName: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

type ImportedImagesPayload = {
  schemaVersion: number;
  exportedAt: string;
  images: ImportedImageEntry[];
};

type DisplayImage = ImportedImageEntry & {
  previewSrc: string;
};

type ClientGroup = {
  key: string;
  clientName: string;
  images: DisplayImage[];
};

const STORAGE_KEY_BASE = 'client-coordinates-images-json';

const sanitizeFilePart = (value: string) => (
  value
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '_')
);

const extFromMime = (mimeType: string) => {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('bmp')) return 'bmp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  return 'jpg';
};

const base64ToUint8Array = (base64: string) => {
  const normalized = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const toBase64DataUrl = (mimeType: string, dataBase64: string) => {
  if (!dataBase64) return '';
  if (dataBase64.startsWith('data:')) return dataBase64;
  const mime = mimeType?.trim() || 'image/jpeg';
  return `data:${mime};base64,${dataBase64}`;
};

const isValidEntry = (entry: unknown): entry is ImportedImageEntry => {
  if (!entry || typeof entry !== 'object') return false;
  const row = entry as Record<string, unknown>;
  return (
    typeof row.orderId === 'string'
    && typeof row.clientName === 'string'
    && typeof row.fileName === 'string'
    && typeof row.mimeType === 'string'
    && typeof row.dataBase64 === 'string'
  );
};

export default function ClientCoordinatesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const selectedUserId = useAuthStore((state) => state.selectedUserId || 'global');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [loadingImport, setLoadingImport] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [exportedAt, setExportedAt] = useState('');
  const [schemaVersion, setSchemaVersion] = useState<number | null>(null);
  const [images, setImages] = useState<DisplayImage[]>([]);
  const [searchClient, setSearchClient] = useState('');

  const storageKey = `${STORAGE_KEY_BASE}:${selectedUserId}`;

  const groups = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
    for (const image of images) {
      const key = image.clientName.trim().toLowerCase() || 'client-inconnu';
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          clientName: image.clientName || 'Client inconnu',
          images: [image],
        });
        continue;
      }
      existing.images.push(image);
    }
    const term = searchClient.trim().toLowerCase();
    const all = Array.from(map.values()).sort((a, b) => a.clientName.localeCompare(b.clientName, 'fr'));
    if (!term) return all;
    return all.filter((group) => group.clientName.toLowerCase().includes(term));
  }, [images, searchClient]);

  const totalClients = groups.length;
  const totalImages = groups.reduce((sum, group) => sum + group.images.length, 0);

  const persistPayload = (payload: ImportedImagesPayload) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore localStorage quota errors
    }
  };

  const hydratePayload = (payload: ImportedImagesPayload) => {
    const list: DisplayImage[] = [];
    const invalidClients: string[] = [];

    for (const raw of payload.images) {
      const previewSrc = toBase64DataUrl(raw.mimeType, raw.dataBase64);
      if (!previewSrc) {
        invalidClients.push(raw.clientName || raw.orderId || 'inconnu');
        continue;
      }
      list.push({
        ...raw,
        previewSrc,
      });
    }

    setSchemaVersion(Number.isFinite(payload.schemaVersion) ? payload.schemaVersion : 1);
    setExportedAt(payload.exportedAt || '');
    setImages(list);

    if (invalidClients.length > 0) {
      enqueueSnackbar(`${invalidClients.length} image(s) invalide(s) ignorée(s)`, { variant: 'warning' });
    }
  };

  const importFromText = (jsonText: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error('JSON invalide');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Format JSON non reconnu');
    }
    const payload = parsed as Partial<ImportedImagesPayload>;
    if (!Array.isArray(payload.images)) {
      throw new Error('Le fichier doit contenir une liste "images"');
    }

    const validEntries = payload.images.filter(isValidEntry);
    if (validEntries.length === 0) {
      throw new Error('Aucune image exploitable dans le fichier');
    }

    const normalized: ImportedImagesPayload = {
      schemaVersion: Number(payload.schemaVersion || 1),
      exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : new Date().toISOString(),
      images: validEntries,
    };

    hydratePayload(normalized);
    persistPayload(normalized);
  };

  const onPickFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoadingImport(true);
    try {
      const text = await file.text();
      importFromText(text);
      enqueueSnackbar('Fichier JSON importé avec succès', { variant: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import impossible';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setLoadingImport(false);
      event.target.value = '';
    }
  };

  const loadSavedData = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        enqueueSnackbar('Aucune donnée sauvegardée pour cet utilisateur', { variant: 'info' });
        return;
      }
      importFromText(raw);
      enqueueSnackbar('Données sauvegardées chargées', { variant: 'success' });
    } catch {
      enqueueSnackbar('Impossible de charger les données sauvegardées', { variant: 'error' });
    }
  };

  const exportImagesZip = async () => {
    if (images.length === 0) {
      enqueueSnackbar('Aucune image à exporter', { variant: 'warning' });
      return;
    }

    setExportingZip(true);
    try {
      const zip = new JSZip();
      const nameCount = new Map<string, number>();
      let added = 0;

      for (const img of images) {
        if (!img.dataBase64) continue;
        const baseClient = sanitizeFilePart(img.clientName || 'client');
        const current = nameCount.get(baseClient) || 0;
        const next = current + 1;
        nameCount.set(baseClient, next);

        const ext = extFromMime(img.mimeType);
        const fileName = `${baseClient} - ${next}.${ext}`;

        try {
          zip.file(fileName, base64ToUint8Array(img.dataBase64));
          added += 1;
        } catch {
          // ignore invalid image and continue with others
        }
      }

      if (added === 0) {
        throw new Error('Aucune image valide à mettre dans le ZIP');
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const datePart = new Date().toISOString().slice(0, 10);
      saveAs(content, `coordonner-client-images-${datePart}.zip`);
      enqueueSnackbar(`ZIP exporté (${added} image(s))`, { variant: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export ZIP impossible';
      enqueueSnackbar(message, { variant: 'error' });
    } finally {
      setExportingZip(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default', overflow: 'hidden' }}>
      <Sidebar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header
          title="Coordonner de client"
          subtitle="Importer et visualiser les images clients depuis le JSON mobile"
        />
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loadingImport && <LinearProgress />}
          <Box sx={{ p: 3 }}>
            <Card sx={{ mb: 2 }}>
              <CardContent sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
                <Button
                  variant="contained"
                  startIcon={<CloudUpload />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Importer JSON images
                </Button>
                <Button variant="outlined" onClick={loadSavedData}>
                  Recharger dernière importation
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<Download />}
                  onClick={exportImagesZip}
                  disabled={exportingZip || images.length === 0}
                >
                  {exportingZip ? 'Export ZIP...' : 'Exporter images ZIP'}
                </Button>
                <TextField
                  size="small"
                  placeholder="Filtrer par nom client..."
                  value={searchClient}
                  onChange={(e) => setSearchClient(e.target.value)}
                  sx={{ minWidth: 280 }}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search />
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                {schemaVersion !== null && <Chip label={`Schema v${schemaVersion}`} />}
                {exportedAt && <Chip label={`Exporté: ${new Date(exportedAt).toLocaleString('fr-FR')}`} />}
                <Chip icon={<Person />} label={`Clients: ${totalClients}`} />
                <Chip icon={<ImageIcon />} label={`Images: ${totalImages}`} />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={onPickFile}
                />
              </CardContent>
            </Card>

            {groups.length === 0 && (
              <Card>
                <CardContent>
                  <Typography color="text.secondary">
                    Aucune image importée. Cliquez sur &quot;Importer JSON images&quot; pour commencer.
                  </Typography>
                </CardContent>
              </Card>
            )}

            <Grid container spacing={2}>
              {groups.map((group) => (
                <Grid key={group.key} size={{ xs: 12, md: 6, lg: 4 }}>
                  <Card sx={{ height: '100%' }}>
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 1 }}>
                        {group.clientName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {group.images.length} image(s)
                      </Typography>

                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
                        {group.images.map((img) => (
                          <Box key={`${img.orderId}-${img.fileName}`} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 0.75 }}>
                            <Box
                              component="img"
                              src={img.previewSrc}
                              alt={img.fileName}
                              sx={{
                                width: '100%',
                                height: 120,
                                objectFit: 'cover',
                                borderRadius: 1,
                                mb: 0.5,
                                bgcolor: 'grey.100',
                              }}
                            />
                            <Typography variant="caption" display="block" noWrap title={img.fileName}>
                              {img.fileName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block" noWrap title={img.orderId}>
                              Cmd: {img.orderId}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
