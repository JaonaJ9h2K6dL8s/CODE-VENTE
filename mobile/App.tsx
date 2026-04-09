import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { StatusBar } from 'expo-status-bar';
import JSZip from 'jszip';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import {
  createOrder,
  deleteClient,
  deleteOrder,
  getAvailableDiskSpace,
  getClients,
  getDeliveryStats,
  getLastImportMeta,
  getOrders,
  importMobileFile,
  initStorage,
  listImportHistory,
  reimportByHistoryId,
  saveCurrentImportSnapshot,
  updateClient,
  updateOrder,
} from './src/storage';
import type { ClientItem, DeliveryStat, ImportHistoryItem, MobileOrder, MobileUser } from './src/types';

type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Vente: undefined;
  ProfessionalLife: undefined;
  Presence: undefined;
  DeliveryStats: undefined;
  Clients: undefined;
  Orders: undefined;
  ImportHistory: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const USERS_KEY = 'mobile_users_v1';
const SESSION_KEY = 'mobile_session_v1';
const BRAND = {
  primary: '#2E7D6F',
  primaryDark: '#1F5A50',
  primarySoft: '#E8F5F1',
  accent: '#FF6B35',
  bg: '#F5F7FA',
  card: '#FFFFFF',
  text: '#1A2138',
  muted: '#6B7A99',
  border: 'rgba(0,0,0,0.08)',
};

function getRequestErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

type RequestUiEntry = {
  requestName: string;
  status: 'start' | 'ok' | 'error';
  message: string;
  timestamp: number;
};

let requestUiListener: ((entry: RequestUiEntry) => void) | null = null;

function publishRequestUi(entry: RequestUiEntry) {
  if (requestUiListener) {
    requestUiListener(entry);
  }
}

function logRequestStart(requestName: string) {
  console.info(`[REQ][START] ${requestName}`);
  publishRequestUi({
    requestName,
    status: 'start',
    message: `[${requestName}] Requête en cours...`,
    timestamp: Date.now(),
  });
}

function logRequestSuccess(requestName: string) {
  console.info(`[REQ][OK] ${requestName}`);
  publishRequestUi({
    requestName,
    status: 'ok',
    message: `[${requestName}] Requête réussie`,
    timestamp: Date.now(),
  });
}

function logRequestError(requestName: string, error: unknown, fallback: string) {
  const message = getRequestErrorMessage(error, fallback);
  console.error(`[REQ][ERR] ${requestName}: ${message}`, error);
  publishRequestUi({
    requestName,
    status: 'error',
    message: `[${requestName}] ${message}`,
    timestamp: Date.now(),
  });
  Alert.alert('Erreur', `[${requestName}] ${message}`);
}

function AppHeader({
  title,
  subtitle,
  rightText,
}: {
  title: string;
  subtitle?: string;
  rightText?: string;
}) {
  return (
    <View style={styles.headerWrap}>
      <View>
        <Text style={styles.headerTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
      </View>
      {!!rightText && (
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{rightText}</Text>
        </View>
      )}
    </View>
  );
}

function AppButton({
  title,
  onPress,
  icon,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.button,
        variant === 'primary' ? styles.buttonPrimary : null,
        variant === 'secondary' ? styles.buttonSecondary : null,
        variant === 'danger' ? styles.buttonDanger : null,
      ]}
    >
      <View style={styles.buttonInner}>
        {icon}
        <Text style={styles.buttonText}>{title}</Text>
      </View>
    </Pressable>
  );
}

function LoginScreen({
  onLoginSuccess,
  navigation,
}: {
  onLoginSuccess: (username: string) => Promise<void>;
  navigation: { navigate: (screen: 'Register') => void };
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    const req = 'LOGIN';
    try {
      logRequestStart(req);
      const userRaw = await AsyncStorage.getItem(USERS_KEY);
      const users: MobileUser[] = userRaw ? JSON.parse(userRaw) : [];
      const found = users.find((u) => u.username === username && u.password === password);
      if (!found) {
        Alert.alert('Erreur', '[LOGIN] Identifiants invalides');
        return;
      }
      await onLoginSuccess(found.username);
      logRequestSuccess(req);
    } catch (error) {
      logRequestError(req, error, 'Connexion impossible');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Vente en Ligne" subtitle="Connexion mobile" />
      <View style={styles.card}>
        <Text style={styles.title}>Connexion</Text>
        <TextInput
          placeholder="Nom d'utilisateur"
          value={username}
          onChangeText={setUsername}
          style={styles.input}
          autoCapitalize="none"
        />
        <TextInput
          placeholder="Mot de passe"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
        <AppButton
          title="Se connecter"
          onPress={handleLogin}
          icon={<Ionicons name="log-in-outline" size={16} color="#fff" />}
        />
        <AppButton
          title="Créer un compte"
          onPress={() => navigation.navigate('Register')}
          variant="secondary"
          icon={<Ionicons name="person-add-outline" size={16} color="#fff" />}
        />
      </View>
    </SafeAreaView>
  );
}

function RegisterScreen({
  navigation,
}: {
  navigation: { goBack: () => void };
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleRegister = async () => {
    const req = 'REGISTER';
    try {
      logRequestStart(req);
      if (!username.trim() || password.length < 6) {
        Alert.alert('Erreur', '[REGISTER] Nom requis et mot de passe minimum 6 caracteres');
        return;
      }
      const userRaw = await AsyncStorage.getItem(USERS_KEY);
      const users: MobileUser[] = userRaw ? JSON.parse(userRaw) : [];
      const exists = users.some((u) => u.username === username.trim());
      if (exists) {
        Alert.alert('Erreur', "[REGISTER] Ce nom d'utilisateur existe deja");
        return;
      }
      const nextUsers = [...users, { username: username.trim(), password }];
      await AsyncStorage.setItem(USERS_KEY, JSON.stringify(nextUsers));
      logRequestSuccess(req);
      Alert.alert('Succes', '[REGISTER] Inscription terminee');
      navigation.goBack();
    } catch (error) {
      logRequestError(req, error, 'Inscription impossible');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Vente en Ligne" subtitle="Inscription mobile" />
      <View style={styles.card}>
        <Text style={styles.title}>Inscription</Text>
        <TextInput
          placeholder="Nom d'utilisateur"
          value={username}
          onChangeText={setUsername}
          style={styles.input}
          autoCapitalize="none"
        />
        <TextInput
          placeholder="Mot de passe (min 6)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
        <AppButton
          title="S'inscrire"
          onPress={handleRegister}
          icon={<Ionicons name="person-add-outline" size={16} color="#fff" />}
        />
      </View>
    </SafeAreaView>
  );
}

function VenteScreen({
  onImportFile,
  onLogout,
  navigation,
  username: _username,
  importInfo,
  freeSpaceLabel: _freeSpaceLabel,
}: {
  onImportFile: () => Promise<void>;
  onLogout: () => Promise<void>;
  navigation: { navigate: (screen: 'ProfessionalLife' | 'Presence' | 'DeliveryStats' | 'Clients' | 'Orders' | 'ImportHistory') => void };
  username: string;
  importInfo: {
    importedAt: string;
    archivePath: string;
    totalAmount?: number;
    deliveryPersonFilter?: string;
  } | null;
  freeSpaceLabel: string;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.discoverContainer}>
        <ScrollView contentContainerStyle={styles.discoverScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Espace Vente Mobile</Text>
            <Text style={styles.heroSub}>
              Dernier import: {importInfo?.importedAt ? new Date(importInfo.importedAt).toLocaleString() : 'Aucun'}
            </Text>
            <Text style={styles.heroSub}>
              Total importé: {Number(importInfo?.totalAmount || 0).toLocaleString('fr-FR')} MGA
            </Text>
            <Text style={styles.heroSub}>
              Livreur: {importInfo?.deliveryPersonFilter ? importInfo.deliveryPersonFilter : 'Tous'}
            </Text>
          </View>
          <View style={styles.cleanActionsWrap}>
            <Pressable style={styles.cleanActionCard} onPress={() => void onImportFile()}>
              <Ionicons name="cloud-upload-outline" size={20} color={BRAND.primaryDark} />
              <Text style={styles.cleanActionTitle}>Importer Fichier</Text>
              <Text style={styles.cleanActionSub}>
                Dernier import: {importInfo?.importedAt ? new Date(importInfo.importedAt).toLocaleString() : 'Aucun'}
              </Text>
            </Pressable>

            <Pressable style={styles.cleanActionCard} onPress={() => navigation.navigate('DeliveryStats')}>
              <MaterialIcons name="insights" size={20} color={BRAND.primaryDark} />
              <Text style={styles.cleanActionTitle}>Statistique de livraison</Text>
              <Text style={styles.cleanActionSub}>Consulter les stats journalières</Text>
            </Pressable>

            <Pressable style={styles.cleanActionCard} onPress={() => navigation.navigate('Clients')}>
              <Ionicons name="people-outline" size={20} color={BRAND.primaryDark} />
              <Text style={styles.cleanActionTitle}>Clients</Text>
              <Text style={styles.cleanActionSub}>Rechercher et parcourir la liste</Text>
            </Pressable>
            <Pressable style={styles.cleanActionCard} onPress={() => navigation.navigate('Orders')}>
              <Ionicons name="receipt-outline" size={20} color={BRAND.primaryDark} />
              <Text style={styles.cleanActionTitle}>Commandes</Text>
              <Text style={styles.cleanActionSub}>Voir, modifier ou supprimer</Text>
            </Pressable>
            <Pressable style={styles.cleanActionCard} onPress={() => navigation.navigate('ImportHistory')}>
              <Ionicons name="folder-open-outline" size={20} color={BRAND.primaryDark} />
              <Text style={styles.cleanActionTitle}>Fichiers importés</Text>
              <Text style={styles.cleanActionSub}>Réimporter rapidement un ancien fichier</Text>
            </Pressable>
          </View>
        </ScrollView>

        <View style={styles.bottomNav}>
          <Pressable style={styles.navItem}>
            <View style={styles.navActivePill}>
              <Ionicons name="home" size={20} color="#4F46E5" />
            </View>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('ProfessionalLife')}>
            <Ionicons name="briefcase-outline" size={20} color="#94A3B8" />
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('Presence')}>
            <Ionicons name="finger-print-outline" size={20} color="#94A3B8" />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

type ProProject = {
  id: string;
  name: string;
  manager: string;
  createdAt: string;
};

type ProTask = {
  id: string;
  projectId: string;
  title: string;
  employee: string;
  status: 'todo' | 'done';
  createdAt: string;
};

type ProNote = {
  id: string;
  text: string;
  objective: string;
  createdAt: string;
};

type ProStorageState = {
  projects: ProProject[];
  tasks: ProTask[];
  notes: ProNote[];
};

const PROFESSIONAL_WORK_KEY = 'mobile_professional_work_v1';
const PRESENCE_KEY = 'mobile_presence_v1';

type ProEmployee = {
  id: string;
  name: string;
  role: string;
  fingerprintCode?: string;
  pinCode?: string;
  photoUri?: string;
  createdAt: string;
};

type PresenceRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  action: 'in' | 'out';
  createdAt: string;
};

type PresenceStorageState = {
  employees: ProEmployee[];
  records: PresenceRecord[];
};

async function loadPresenceState(): Promise<PresenceStorageState> {
  const raw = await AsyncStorage.getItem(PRESENCE_KEY);
  if (!raw) return { employees: [], records: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<PresenceStorageState>;
    return {
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
      records: Array.isArray(parsed.records) ? parsed.records : [],
    };
  } catch {
    return { employees: [], records: [] };
  }
}

async function savePresenceState(state: PresenceStorageState) {
  await AsyncStorage.setItem(PRESENCE_KEY, JSON.stringify(state));
}

function ProfessionalLifeScreen({
  navigation,
}: {
  navigation: { navigate: (screen: 'Vente' | 'DeliveryStats' | 'Clients' | 'ProfessionalLife' | 'Presence') => void };
}) {
  const [activeQuick, setActiveQuick] = useState<'project' | 'task' | 'contacts' | 'money' | 'notes'>('project');
  const [projects, setProjects] = useState<ProProject[]>([]);
  const [tasks, setTasks] = useState<ProTask[]>([]);
  const [notes, setNotes] = useState<ProNote[]>([]);
  const [employees, setEmployees] = useState<ProEmployee[]>([]);
  const [contacts, setContacts] = useState<ClientItem[]>([]);
  const [moneyOrders, setMoneyOrders] = useState<MobileOrder[]>([]);
  const [contactsQuery, setContactsQuery] = useState('');
  const [selectedTaskProjectId, setSelectedTaskProjectId] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [projectManager, setProjectManager] = useState('');
  const [openProjectManagerSelect, setOpenProjectManagerSelect] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskEmployee, setTaskEmployee] = useState('');
  const [openTaskProjectSelect, setOpenTaskProjectSelect] = useState(false);
  const [openTaskEmployeeSelect, setOpenTaskEmployeeSelect] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteObjective, setNoteObjective] = useState('');
  const [selectedMoneyCourier, setSelectedMoneyCourier] = useState('__all__');
  const [openMoneyCourierSelect, setOpenMoneyCourierSelect] = useState(false);

  const quickActions = [
    {
      key: 'project' as const,
      title: 'Projet',
      subtitle: 'Créer et suivre les projets',
      icon: <Ionicons name="folder-open-outline" size={22} color="#0F766E" />,
    },
    {
      key: 'task' as const,
      title: 'Tâche',
      subtitle: 'Tâches liées aux projets',
      icon: <Ionicons name="checkmark-done-outline" size={22} color="#0F766E" />,
    },
    {
      key: 'contacts' as const,
      title: 'Contacts',
      subtitle: 'Clients importés automatiquement',
      icon: <Ionicons name="people-outline" size={22} color="#0F766E" />,
    },
    {
      key: 'notes' as const,
      title: 'Note',
      subtitle: 'Notes et objectifs clés',
      icon: <Ionicons name="document-text-outline" size={22} color="#0F766E" />,
    },
    {
      key: 'money' as const,
      title: 'Argent',
      subtitle: 'Montants importés + filtre livreur',
      icon: <Ionicons name="cash-outline" size={22} color="#0F766E" />,
    },
  ];

  const saveProState = async (nextProjects: ProProject[], nextTasks: ProTask[], nextNotes: ProNote[]) => {
    const payload: ProStorageState = {
      projects: nextProjects,
      tasks: nextTasks,
      notes: nextNotes,
    };
    await AsyncStorage.setItem(PROFESSIONAL_WORK_KEY, JSON.stringify(payload));
  };

  const loadProfessionalData = useCallback(async () => {
    const req = 'LOAD_PRO_WORK';
    try {
      logRequestStart(req);
      const [savedRaw, clientRows, orderRows, presenceState] = await Promise.all([
        AsyncStorage.getItem(PROFESSIONAL_WORK_KEY),
        getClients(),
        getOrders(),
        loadPresenceState(),
      ]);
      if (savedRaw) {
        try {
          const saved = JSON.parse(savedRaw) as Partial<ProStorageState>;
          setProjects(Array.isArray(saved.projects) ? saved.projects : []);
          setTasks(Array.isArray(saved.tasks) ? saved.tasks : []);
          setNotes(Array.isArray(saved.notes) ? saved.notes : []);
        } catch {
          setProjects([]);
          setTasks([]);
          setNotes([]);
        }
      } else {
        setProjects([]);
        setTasks([]);
        setNotes([]);
      }
      setContacts(clientRows);
      setMoneyOrders(orderRows);
      setEmployees(presenceState.employees || []);
      logRequestSuccess(req);
    } catch (error) {
      logRequestError(req, error, 'Chargement travail professionnel impossible');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfessionalData();
    }, [loadProfessionalData])
  );

  useEffect(() => {
    if (!selectedTaskProjectId && projects.length > 0) {
      setSelectedTaskProjectId(projects[0].id);
    }
  }, [projects, selectedTaskProjectId]);

  useEffect(() => {
    if (!projectManager && employees.length > 0) {
      setProjectManager(employees[0].name);
    }
    if (!taskEmployee && employees.length > 0) {
      setTaskEmployee(employees[0].name);
    }
  }, [employees, projectManager, taskEmployee]);

  const addProject = async () => {
    if (!projectName.trim()) {
      Alert.alert('Erreur', 'Nom du projet requis');
      return;
    }
    if (!projectManager.trim()) {
      Alert.alert('Erreur', 'Chef de projet requis');
      return;
    }
    const nextProject: ProProject = {
      id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: projectName.trim(),
      manager: projectManager.trim(),
      createdAt: new Date().toISOString(),
    };
    const nextProjects = [nextProject, ...projects];
    setProjects(nextProjects);
    if (!selectedTaskProjectId) {
      setSelectedTaskProjectId(nextProject.id);
    }
    await saveProState(nextProjects, tasks, notes);
    setProjectName('');
    setProjectManager('');
  };

  const addTask = async () => {
    if (!selectedTaskProjectId) {
      Alert.alert('Erreur', 'Choisissez un projet');
      return;
    }
    if (!taskTitle.trim()) {
      Alert.alert('Erreur', 'Nom de la tâche requis');
      return;
    }
    if (!taskEmployee.trim()) {
      Alert.alert('Erreur', 'Employé requis');
      return;
    }
    const nextTask: ProTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      projectId: selectedTaskProjectId,
      title: taskTitle.trim(),
      employee: taskEmployee.trim(),
      status: 'todo',
      createdAt: new Date().toISOString(),
    };
    const nextTasks = [nextTask, ...tasks];
    setTasks(nextTasks);
    await saveProState(projects, nextTasks, notes);
    setTaskTitle('');
    setTaskEmployee('');
  };

  const toggleTaskStatus = async (taskId: string) => {
    const nextTasks = tasks.map((task) => (
      task.id === taskId
        ? { ...task, status: task.status === 'done' ? 'todo' : 'done' }
        : task
    ));
    setTasks(nextTasks);
    await saveProState(projects, nextTasks, notes);
  };

  const addNote = async () => {
    if (!noteText.trim() && !noteObjective.trim()) {
      Alert.alert('Erreur', 'Ajoutez au moins une note ou un objectif clé');
      return;
    }
    const nextNote: ProNote = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: noteText.trim(),
      objective: noteObjective.trim(),
      createdAt: new Date().toISOString(),
    };
    const nextNotes = [nextNote, ...notes];
    setNotes(nextNotes);
    await saveProState(projects, tasks, nextNotes);
    setNoteText('');
    setNoteObjective('');
  };

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const tasksForSelectedProject = selectedTaskProjectId
    ? tasks.filter((task) => task.projectId === selectedTaskProjectId)
    : tasks;
  const filteredContacts = contactsQuery.trim()
    ? contacts.filter((c) => {
        const q = contactsQuery.trim().toLowerCase();
        return (c.name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q);
      })
    : contacts;

  const moneyCouriers = Array.from(
    new Set(
      moneyOrders
        .map((o) => String(o.deliveryPerson || '').trim())
        .filter((name) => Boolean(name))
    )
  ).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  const filteredMoneyOrders = selectedMoneyCourier === '__all__'
    ? moneyOrders
    : moneyOrders.filter((o) => String(o.deliveryPerson || '').trim() === selectedMoneyCourier);
  const cancelledStatus = (status?: string) => ['annuler', 'annulé', 'cancelled'].includes(String(status || '').trim().toLowerCase());
  const moneyTotal = filteredMoneyOrders
    .filter((o) => !cancelledStatus(o.status))
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.discoverContainer}>
        <ScrollView contentContainerStyle={styles.discoverScrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.proHeader}>
            <Text style={styles.sectionTitle}>Travail professionnel</Text>
            <Text style={styles.proHeaderSub}>Organiser votre journée</Text>
          </View>

          <View style={styles.proGrid}>
            {quickActions.map((item) => {
              const active = activeQuick === item.key;
              return (
                <Pressable
                  key={item.key}
                  style={[styles.proCard, item.key === 'money' ? styles.proCardFull : null, active ? styles.proCardActive : null]}
                  onPress={() => setActiveQuick(item.key)}
                >
                  <View style={styles.proIconWrap}>{item.icon}</View>
                  <Text style={styles.proTitle}>{item.title}</Text>
                  <Text style={styles.proSub}>{item.subtitle}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.cleanActionsWrap}>
            {activeQuick === 'project' ? (
              <View style={styles.listItem}>
                <Text style={styles.listTitle}>Créer un projet</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nom du projet"
                  value={projectName}
                  onChangeText={setProjectName}
                />
                <Text style={styles.selectFilterLabel}>Chef de projet (sélection)</Text>
                <Pressable
                  style={styles.selectInput}
                  onPress={() => setOpenProjectManagerSelect((v) => !v)}
                >
                  <Text style={styles.selectInputText}>{projectManager || 'Choisir employé'}</Text>
                  <Ionicons name="chevron-down" size={16} color={BRAND.muted} />
                </Pressable>
                {openProjectManagerSelect ? (
                  <View style={styles.inlineSelectMenu}>
                    {employees.map((employee) => (
                      <Pressable
                        key={employee.id}
                        style={[styles.selectOption, projectManager === employee.name ? styles.selectOptionActive : null]}
                        onPress={() => {
                          setProjectManager(employee.name);
                          setOpenProjectManagerSelect(false);
                        }}
                      >
                        <Text style={[styles.selectOptionText, projectManager === employee.name ? styles.selectOptionTextActive : null]}>
                          {employee.name} ({employee.role})
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {employees.length === 0 ? (
                  <Text style={styles.emptyText}>Ajoutez des employés dans la page Présence d&apos;abord.</Text>
                ) : null}
                <AppButton title="Ajouter projet" onPress={() => void addProject()} />
                <Text style={styles.proBlockCaption}>Projets existants: {projects.length}</Text>
                {projects.map((project) => (
                  <View key={project.id} style={styles.proListRow}>
                    <Text style={styles.listTitle}>{project.name}</Text>
                    <Text style={styles.listValue}>Chef: {project.manager}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {activeQuick === 'task' ? (
              <View style={styles.listItem}>
                <Text style={styles.listTitle}>Tâches liées au projet</Text>
                {projects.length === 0 ? (
                  <Text style={styles.emptyText}>Créez d&apos;abord un projet.</Text>
                ) : (
                  <>
                    <Text style={styles.selectFilterLabel}>Projet sélectionné</Text>
                    <Pressable
                      style={styles.selectInput}
                      onPress={() => {
                        setOpenTaskProjectSelect((v) => !v);
                        setOpenTaskEmployeeSelect(false);
                      }}
                    >
                      <Text style={styles.selectInputText}>{projectById.get(selectedTaskProjectId)?.name || 'Choisir projet'}</Text>
                      <Ionicons name="chevron-down" size={16} color={BRAND.muted} />
                    </Pressable>
                    {openTaskProjectSelect ? (
                      <View style={styles.inlineSelectMenu}>
                        {projects.map((project) => (
                          <Pressable
                            key={project.id}
                            style={[styles.selectOption, selectedTaskProjectId === project.id ? styles.selectOptionActive : null]}
                            onPress={() => {
                              setSelectedTaskProjectId(project.id);
                              setOpenTaskProjectSelect(false);
                            }}
                          >
                            <Text style={[styles.selectOptionText, selectedTaskProjectId === project.id ? styles.selectOptionTextActive : null]}>
                              {project.name}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <TextInput
                      style={styles.input}
                      placeholder="Nom de la tâche"
                      value={taskTitle}
                      onChangeText={setTaskTitle}
                    />
                    <Text style={styles.selectFilterLabel}>Employé affecté (sélection)</Text>
                    <Pressable
                      style={styles.selectInput}
                      onPress={() => {
                        setOpenTaskEmployeeSelect((v) => !v);
                        setOpenTaskProjectSelect(false);
                      }}
                    >
                      <Text style={styles.selectInputText}>{taskEmployee || 'Choisir employé'}</Text>
                      <Ionicons name="chevron-down" size={16} color={BRAND.muted} />
                    </Pressable>
                    {openTaskEmployeeSelect ? (
                      <View style={styles.inlineSelectMenu}>
                        {employees.map((employee) => (
                          <Pressable
                            key={employee.id}
                            style={[styles.selectOption, taskEmployee === employee.name ? styles.selectOptionActive : null]}
                            onPress={() => {
                              setTaskEmployee(employee.name);
                              setOpenTaskEmployeeSelect(false);
                            }}
                          >
                            <Text style={[styles.selectOptionText, taskEmployee === employee.name ? styles.selectOptionTextActive : null]}>
                              {employee.name} ({employee.role})
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    {employees.length === 0 ? (
                      <Text style={styles.emptyText}>Ajoutez des employés dans la page Présence d&apos;abord.</Text>
                    ) : null}
                    <AppButton title="Ajouter tâche" onPress={() => void addTask()} />
                    <Text style={styles.proBlockCaption}>Tâches du projet: {tasksForSelectedProject.length}</Text>
                    {tasksForSelectedProject.map((task) => (
                      <View key={task.id} style={styles.proListRow}>
                        <Text style={styles.listTitle}>{task.title}</Text>
                        <Text style={styles.listValue}>Employé: {task.employee}</Text>
                        <Pressable onPress={() => void toggleTaskStatus(task.id)} style={styles.proBadgeBtn}>
                          <Text style={styles.proBadgeBtnText}>{task.status === 'done' ? 'Terminé' : 'À faire'}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </>
                )}
              </View>
            ) : null}

            {activeQuick === 'contacts' ? (
              <View style={styles.listItem}>
                <Text style={styles.listTitle}>Contacts clients (auto import JSON)</Text>
                <View style={styles.searchWrap}>
                  <Ionicons name="search-outline" size={17} color={BRAND.muted} />
                  <TextInput
                    placeholder="Filtrer client..."
                    value={contactsQuery}
                    onChangeText={setContactsQuery}
                    style={styles.searchInput}
                  />
                </View>
                <Text style={styles.proBlockCaption}>Total contacts: {filteredContacts.length}</Text>
                {filteredContacts.slice(0, 80).map((client) => (
                  <View key={client.id} style={styles.proListRow}>
                    <Text style={styles.listTitle}>{client.name}</Text>
                    <Text style={styles.listValue}>Téléphone: {client.phone || '-'}</Text>
                    <Text style={styles.listValue}>Adresse: {client.address || '-'}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {activeQuick === 'notes' ? (
              <View style={styles.listItem}>
                <Text style={styles.listTitle}>Note / Objectif clé</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ajouter une note"
                  value={noteText}
                  onChangeText={setNoteText}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Objectif clé"
                  value={noteObjective}
                  onChangeText={setNoteObjective}
                />
                <AppButton title="Ajouter note" onPress={() => void addNote()} />
                <Text style={styles.proBlockCaption}>Notes: {notes.length}</Text>
                {notes.map((note) => (
                  <View key={note.id} style={styles.proListRow}>
                    {!!note.text && <Text style={styles.listTitle}>{note.text}</Text>}
                    {!!note.objective && <Text style={styles.listValue}>Objectif: {note.objective}</Text>}
                    <Text style={styles.listValue}>{new Date(note.createdAt).toLocaleString('fr-FR')}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {activeQuick === 'money' ? (
              <View style={styles.listItem}>
                <Text style={styles.listTitle}>Argent (auto import JSON commandes)</Text>
                <View style={styles.selectFilterBlock}>
                  <Text style={styles.selectFilterLabel}>Filtrer par livreur</Text>
                  <Pressable
                    style={styles.selectInput}
                    onPress={() => setOpenMoneyCourierSelect((v) => !v)}
                  >
                    <Text style={styles.selectInputText}>
                      {selectedMoneyCourier === '__all__' ? 'Tous livreurs' : selectedMoneyCourier}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={BRAND.muted} />
                  </Pressable>
                  {openMoneyCourierSelect ? (
                    <View style={styles.inlineSelectMenu}>
                      <Pressable
                        style={[styles.selectOption, selectedMoneyCourier === '__all__' ? styles.selectOptionActive : null]}
                        onPress={() => {
                          setSelectedMoneyCourier('__all__');
                          setOpenMoneyCourierSelect(false);
                        }}
                      >
                        <Text style={[styles.selectOptionText, selectedMoneyCourier === '__all__' ? styles.selectOptionTextActive : null]}>
                          Tous livreurs
                        </Text>
                      </Pressable>
                      {moneyCouriers.map((name) => (
                        <Pressable
                          key={name}
                          style={[styles.selectOption, selectedMoneyCourier === name ? styles.selectOptionActive : null]}
                          onPress={() => {
                            setSelectedMoneyCourier(name);
                            setOpenMoneyCourierSelect(false);
                          }}
                        >
                          <Text style={[styles.selectOptionText, selectedMoneyCourier === name ? styles.selectOptionTextActive : null]}>
                            {name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
                <Text style={styles.proMoneyTotal}>
                  Total filtré: {moneyTotal.toLocaleString('fr-FR')} MGA ({filteredMoneyOrders.length} commande(s))
                </Text>
                {filteredMoneyOrders.slice(0, 80).map((order) => (
                  <View key={order.id} style={styles.proListRow}>
                    <Text style={styles.listTitle}>{order.clientName || 'Client'}</Text>
                    <Text style={styles.listValue}>Livreur: {order.deliveryPerson || '-'}</Text>
                    <Text style={styles.listValue}>Statut: {order.status || '-'}</Text>
                    <Text style={styles.listValue}>Montant: {Number(order.totalAmount || 0).toLocaleString('fr-FR')} MGA</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.bottomNav}>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('Vente')}>
            <Ionicons name="home-outline" size={20} color="#94A3B8" />
          </Pressable>
          <Pressable style={styles.navItem}>
            <View style={styles.navActivePill}>
              <Ionicons name="briefcase" size={20} color="#4F46E5" />
            </View>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => navigation.navigate('Presence')}>
            <Ionicons name="finger-print-outline" size={20} color="#94A3B8" />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function DeliveryStatsScreen() {
  const [stats, setStats] = useState<DeliveryStat[]>([]);

  useEffect(() => {
    const load = async () => {
      const rows = await getDeliveryStats();
      setStats(rows);
    };
    void load();
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Statistique de livraison" subtitle="Vue journaliere" />
      {stats.length === 0 ? (
        <Text style={styles.emptyText}>Aucune donnee. Importez un fichier mobile export.</Text>
      ) : (
        <FlatList
          data={stats}
          keyExtractor={(item) => item.date}
          renderItem={({ item }) => (
            <View style={styles.listItem}>
              <Text style={styles.listTitle}>{item.date}</Text>
              <Text style={styles.listValue}>Livraisons en attente: {item.pendingCount}</Text>
              <Text style={styles.listValue}>Montant paye: {Number(item.paidAmount || 0).toLocaleString('fr-FR')} MGA</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function PresenceScreen({
  navigation,
}: {
  navigation: { navigate: (screen: 'Vente' | 'ProfessionalLife' | 'Presence') => void };
}) {
  const [employees, setEmployees] = useState<ProEmployee[]>([]);
  const [records, setRecords] = useState<PresenceRecord[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [openEmployeeSelect, setOpenEmployeeSelect] = useState(false);

  const loadPresence = useCallback(async () => {
    const req = 'LOAD_PRESENCE';
    try {
      logRequestStart(req);
      const state = await loadPresenceState();
      setEmployees(state.employees || []);
      setRecords((state.records || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)));
      if (!selectedEmployeeId && (state.employees || []).length > 0) {
        setSelectedEmployeeId(state.employees[0].id);
      }
      logRequestSuccess(req);
    } catch (error) {
      logRequestError(req, error, 'Chargement présence impossible');
    }
  }, [selectedEmployeeId]);

  useFocusEffect(
    useCallback(() => {
      void loadPresence();
    }, [loadPresence])
  );

  const addEmployee = async () => {
    if (!name.trim() || !role.trim()) {
      Alert.alert('Erreur', 'Nom et poste sont requis');
      return;
    }
    if (employees.some((e) => (e.name || '').trim().toLowerCase() === name.trim().toLowerCase())) {
      Alert.alert('Erreur', 'Cet employé existe déjà');
      return;
    }
    const nextEmployee: ProEmployee = {
      id: `emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      role: role.trim(),
      createdAt: new Date().toISOString(),
    };
    const nextEmployees = [nextEmployee, ...employees];
    const nextState: PresenceStorageState = { employees: nextEmployees, records };
    await savePresenceState(nextState);
    setEmployees(nextEmployees);
    setName('');
    setRole('');
    if (!selectedEmployeeId) {
      setSelectedEmployeeId(nextEmployee.id);
    }
  };

  const savePointingRecord = async (employee: ProEmployee, action: 'in' | 'out') => {
    const nextRecord: PresenceRecord = {
      id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      employeeId: employee.id,
      employeeName: employee.name,
      action,
      createdAt: new Date().toISOString(),
    };
    const nextRecords = [nextRecord, ...records];
    const nextState: PresenceStorageState = { employees, records: nextRecords };
    await savePresenceState(nextState);
    setRecords(nextRecords);
    Alert.alert('Succès', `Pointage ${action === 'in' ? 'entrée' : 'sortie'} enregistré pour ${employee.name}`);
  };

  const pointBySelectedEmployee = async (action: 'in' | 'out') => {
    const employee = employees.find((e) => e.id === selectedEmployeeId);
    if (!employee) {
      Alert.alert('Erreur', 'Choisissez un employé');
      return;
    }
    await savePointingRecord(employee, action);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Présence" subtitle="Pointage des employés par empreinte" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.listItem}>
          <Text style={styles.listTitle}>Ajouter employé</Text>
          <TextInput style={styles.input} placeholder="Nom employé" value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Poste" value={role} onChangeText={setRole} />
          <AppButton title="Ajouter employé" onPress={() => void addEmployee()} />
        </View>

        <View style={styles.listItem}>
          <Text style={styles.listTitle}>Pointage employé</Text>
          <Text style={styles.selectFilterLabel}>Employé</Text>
          <Pressable
            style={styles.selectInput}
            onPress={() => setOpenEmployeeSelect((v) => !v)}
          >
            <Text style={styles.selectInputText}>
              {employees.find((e) => e.id === selectedEmployeeId)?.name || 'Choisir employé'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={BRAND.muted} />
          </Pressable>
          {openEmployeeSelect ? (
            <View style={styles.inlineSelectMenu}>
              {employees.map((employee) => (
                <Pressable
                  key={employee.id}
                  style={[styles.selectOption, selectedEmployeeId === employee.id ? styles.selectOptionActive : null]}
                  onPress={() => {
                    setSelectedEmployeeId(employee.id);
                    setOpenEmployeeSelect(false);
                  }}
                >
                  <Text style={[styles.selectOptionText, selectedEmployeeId === employee.id ? styles.selectOptionTextActive : null]}>
                    {employee.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.inlineRow}>
            <AppButton title="Entrée" onPress={() => void pointBySelectedEmployee('in')} />
            <AppButton title="Sortie" onPress={() => void pointBySelectedEmployee('out')} variant="secondary" />
          </View>
        </View>

        <View style={styles.listItem}>
          <Text style={[styles.listTitle, { marginBottom: 8 }]}>Employés ({employees.length})</Text>
          {employees.map((item) => (
            <View key={item.id} style={styles.proListRow}>
              <View>
                <Text style={styles.listTitle}>{item.name}</Text>
                <Text style={styles.listValue}>Poste: {item.role}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.listItem}>
          <Text style={[styles.listTitle, { marginBottom: 8 }]}>Historique pointage ({records.length})</Text>
          {records.slice(0, 40).map((record) => (
            <View key={record.id} style={styles.proListRow}>
              <Text style={styles.listTitle}>
                {record.employeeName} - {record.action === 'in' ? 'Entrée' : 'Sortie'}
              </Text>
              <Text style={styles.listValue}>{new Date(record.createdAt).toLocaleString('fr-FR')}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        <Pressable style={styles.navItem} onPress={() => navigation.navigate('Vente')}>
          <Ionicons name="home-outline" size={20} color="#94A3B8" />
        </Pressable>
        <Pressable style={styles.navItem} onPress={() => navigation.navigate('ProfessionalLife')}>
          <Ionicons name="briefcase-outline" size={20} color="#94A3B8" />
        </Pressable>
        <Pressable style={styles.navItem}>
          <View style={styles.navActivePill}>
            <Ionicons name="finger-print" size={20} color="#4F46E5" />
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function ClientsScreen() {
  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');

  const loadClients = async () => {
    const req = 'LOAD_CLIENTS';
    try {
      logRequestStart(req);
      const rows = await getClients(query);
      setClients(rows);
      logRequestSuccess(req);
    } catch (error) {
      logRequestError(req, error, 'Chargement clients impossible');
    }
  };

  useEffect(() => {
    void loadClients();
  }, [query]);

  const startEdit = (client: ClientItem) => {
    setEditingClientId(client.id);
    setEditName(client.name || '');
    setEditPhone(client.phone || '');
    setEditAddress(client.address || '');
  };

  const saveEdit = async (base: ClientItem) => {
    if (!editName.trim()) {
      Alert.alert('Erreur', 'Nom client requis');
      return;
    }
    const req = 'UPDATE_CLIENT';
    try {
      logRequestStart(req);
      await updateClient({
        ...base,
        name: editName.trim(),
        phone: editPhone.trim(),
        address: editAddress.trim(),
      });
      setEditingClientId(null);
      await loadClients();
      logRequestSuccess(req);
      Alert.alert('Succès', '[UPDATE_CLIENT] Client modifié');
    } catch (error) {
      logRequestError(req, error, 'Modification client impossible');
    }
  };

  const removeClient = (id: string) => {
    Alert.alert('Confirmer', 'Supprimer ce client ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const req = 'DELETE_CLIENT';
          try {
            logRequestStart(req);
            await deleteClient(id);
            await loadClients();
            logRequestSuccess(req);
          } catch (error) {
            logRequestError(req, error, 'Suppression client impossible');
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Client" subtitle="Liste des clients" />
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={17} color={BRAND.muted} />
        <TextInput
          placeholder="Rechercher client..."
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
        />
      </View>
      {clients.length === 0 ? (
        <Text style={styles.emptyText}>Aucun client. Importez un fichier mobile export.</Text>
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.listItem}>
              {editingClientId === item.id ? (
                <>
                  <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholder="Nom client" />
                  <TextInput style={styles.input} value={editPhone} onChangeText={setEditPhone} placeholder="Téléphone" />
                  <TextInput style={styles.input} value={editAddress} onChangeText={setEditAddress} placeholder="Adresse" />
                  <View style={styles.inlineRow}>
                    <AppButton title="Enregistrer" onPress={() => void saveEdit(item)} />
                    <AppButton title="Annuler" onPress={() => setEditingClientId(null)} variant="secondary" />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.listTitle}>{item.name}</Text>
                  <Text style={styles.listValue}>Telephone: {item.phone || '-'}</Text>
                  <Text style={styles.listValue}>Adresse: {item.address || '-'}</Text>
                  <Text style={styles.listValue}>
                    Achats: {item.totalPurchases || 0} | Total: {Number(item.totalSpent || 0).toLocaleString('fr-FR')} MGA
                  </Text>
                  <View style={styles.inlineRow}>
                    <AppButton title="Modifier" onPress={() => startEdit(item)} variant="secondary" />
                    <AppButton title="Supprimer" onPress={() => removeClient(item.id)} variant="danger" />
                  </View>
                </>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function OrdersScreen() {
  const { width } = useWindowDimensions();
  const isNarrow = width < 520;
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<MobileOrder[]>([]);
  const [selectedOrderTab, setSelectedOrderTab] = useState<'all' | 'annuler' | 'confirmer' | 'payer' | 'livrer'>('all');
  const [selectedCourier, setSelectedCourier] = useState<string>('__all__');
  const [openStatusSelect, setOpenStatusSelect] = useState(false);
  const [openCourierSelect, setOpenCourierSelect] = useState(false);
  const [metaInfo, setMetaInfo] = useState<{ importId: number; totalAmount: number; deliveryPersonFilter: string } | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [openEditStatusSelect, setOpenEditStatusSelect] = useState(false);
  const [addingOrder, setAddingOrder] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPersonalTransport, setEditPersonalTransport] = useState(false);
  const [editProofImageUri, setEditProofImageUri] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newStatus, setNewStatus] = useState('pending');
  const [newAmount, setNewAmount] = useState('');
  const [newArticles, setNewArticles] = useState('1');
  const [newAddress, setNewAddress] = useState('');
  const [newTypeColis, setNewTypeColis] = useState(false);
  const [newProofImageUri, setNewProofImageUri] = useState('');
  const PARCEL_DISCOUNT = 4000;
  const todayISO = new Date().toISOString().slice(0, 10);

  const loadOrders = async () => {
    const req = 'LOAD_ORDERS';
    try {
      logRequestStart(req);
      const rows = await getOrders(query);
      setOrders(rows);
      const meta = await getLastImportMeta();
      if (meta) {
        setMetaInfo({
          importId: Number(meta.id || 0),
          totalAmount: Number(meta.totalAmount || 0),
          deliveryPersonFilter: meta.deliveryPersonFilter || '',
        });
      }
      logRequestSuccess(req);
    } catch (error) {
      logRequestError(req, error, 'Chargement commandes impossible');
    }
  };

  useEffect(() => {
    void loadOrders();
  }, [query]);

  const startEdit = (order: MobileOrder) => {
    setEditingOrderId(order.id);
    setEditStatus(order.status || '');
    setOpenEditStatusSelect(false);
    setEditAmount(String(order.totalAmount || 0));
    setEditAddress(order.shippingAddress || '');
    setEditPersonalTransport(Boolean(order.isPersonalTransportParcel));
    setEditProofImageUri(order.proofImageUri || '');
  };

  const saveEdit = async (base: MobileOrder) => {
    const req = 'UPDATE_ORDER';
    try {
      logRequestStart(req);
      await updateOrder({
        ...base,
        status: canonicalStatus(editStatus.trim() || base.status),
        shippingAddress: editAddress.trim(),
        isPersonalTransportParcel: editPersonalTransport,
        proofImageUri: editProofImageUri || '',
        totalAmount: Number(editAmount || 0),
      });
      setEditingOrderId(null);
      setOpenEditStatusSelect(false);
      await loadOrders();
      logRequestSuccess(req);
      Alert.alert('Succès', '[UPDATE_ORDER] Commande modifiée');
    } catch (error) {
      logRequestError(req, error, 'Modification commande impossible');
    }
  };

  const removeOrder = (id: string) => {
    Alert.alert('Confirmer', 'Supprimer cette commande ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          const req = 'DELETE_ORDER';
          try {
            logRequestStart(req);
            await deleteOrder(id);
            await loadOrders();
            logRequestSuccess(req);
          } catch (error) {
            logRequestError(req, error, 'Suppression commande impossible');
          }
        },
      },
    ]);
  };

  const handleCreateOrder = async () => {
    if (!newClientName.trim()) {
      Alert.alert('Erreur', 'Nom du client requis');
      return;
    }
    const articlesCount = Math.max(1, Number(newArticles || 1));
    const amount = Number(newAmount || 0);
    const itemUnit = articlesCount > 0 ? amount / articlesCount : amount;
    const items = Array.from({ length: articlesCount }).map((_, idx) => ({
      id: `new-${Date.now()}-${idx}`,
      productId: '',
      variantId: '',
      productName: `Article ${idx + 1}`,
      variantSize: '',
      variantColor: '',
      quantity: 1,
      unitPrice: itemUnit,
      totalPrice: itemUnit,
    }));
    const req = 'CREATE_ORDER';
    try {
      logRequestStart(req);
      await createOrder({
        orderNumber: `MOB-${Date.now().toString().slice(-6)}`,
        clientName: newClientName.trim(),
        clientPhone: '',
        deliveryDate: todayISO,
        shippingAddress: newAddress.trim(),
        status: newStatus.trim() || 'pending',
        paymentMethod: '',
        paymentReference: '',
        deliveryPerson: '',
        isPersonalTransportParcel: newTypeColis,
        proofImageUri: newProofImageUri || '',
        totalAmount: amount,
        items,
      });
      setAddingOrder(false);
      setNewClientName('');
      setNewStatus('pending');
      setNewAmount('');
      setNewArticles('1');
      setNewAddress('');
      setNewTypeColis(false);
      setNewProofImageUri('');
      await loadOrders();
      logRequestSuccess(req);
      Alert.alert('Succès', '[CREATE_ORDER] Commande ajoutée');
    } catch (error) {
      logRequestError(req, error, 'Ajout commande impossible');
    }
  };

  const handleSaveCurrentFile = async () => {
    const req = 'SAVE_FILE';
    try {
      logRequestStart(req);
      const result = await saveCurrentImportSnapshot(metaInfo?.importId);
      await loadOrders();
      logRequestSuccess(req);
      Alert.alert(
        'Succès',
        `[${req}] Fichier enregistré.
Commandes: ${result.ordersCount}
Clients: ${result.clientsCount}
Total: ${Number(result.totalAmount || 0).toLocaleString('fr-FR')} MGA`
      );
    } catch (error) {
      logRequestError(req, error, 'Enregistrement impossible');
    }
  };

  const pickOrderImage = async (mode: 'edit' | 'new') => {
    const req = 'PICK_IMAGE';
    try {
      logRequestStart(req);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/jpg'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const uri = result.assets[0]?.uri || '';
      if (!uri) return;
      if (mode === 'edit') {
        setEditProofImageUri(uri);
      } else {
        setNewProofImageUri(uri);
      }
      logRequestSuccess(req);
    } catch (error) {
      logRequestError(req, error, 'Import image impossible');
    }
  };

  const exportCurrentOrders = async () => {
    const req = 'EXPORT_SOFTWARE_JSON';
    try {
      logRequestStart(req);
      const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      source: 'mobile-orders',
      orders,
      summary: {
        totalAmount: orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0),
        checkedParcels: orders.filter((o) => Boolean(o.isPersonalTransportParcel)).length,
      },
    };
      const fileName = `software-update-orders-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      logRequestSuccess(req);
      Alert.alert('Succès', `[${req}] Export JSON de mise à jour des commandes généré`);
    } catch (error) {
      logRequestError(req, error, 'Export impossible');
    }
  };

  const exportOrderImagesJsonForSoftware = async () => {
    const req = 'EXPORT_IMAGES_JSON_SOFTWARE';
    try {
      logRequestStart(req);
      const withImage = orders.filter((o) => Boolean((o.proofImageUri || '').trim()));
      if (withImage.length === 0) {
        throw new Error('Aucune image à exporter');
      }

      const failed: string[] = [];
      let index = 1;

      const cleanName = (value: string) => value
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const guessExt = (uri: string) => {
        const path = (uri || '').split('?')[0].toLowerCase();
        if (path.endsWith('.png')) return 'png';
        if (path.endsWith('.jpeg')) return 'jpeg';
        if (path.endsWith('.webp')) return 'webp';
        if (path.endsWith('.gif')) return 'gif';
        return 'jpg';
      };
      const blobToBase64 = async (blob: Blob) => await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = String(reader.result || '');
          const base64 = result.includes(',') ? result.split(',')[1] : '';
          if (!base64) reject(new Error('Base64 invalide'));
          else resolve(base64);
        };
        reader.onerror = () => reject(new Error('Lecture image impossible'));
        reader.readAsDataURL(blob);
      });

      const images: Array<{
        orderId: string;
        clientName: string;
        fileName: string;
        mimeType: string;
        dataBase64: string;
      }> = [];

      for (const order of withImage) {
        const uri = (order.proofImageUri || '').trim();
        if (!uri) continue;
        try {
          const response = await fetch(uri);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const blob = await response.blob();
          const ext = guessExt(uri);
          const baseName = cleanName(order.clientName || 'client');
          const fileName = `N°${index} - ${baseName}.${ext}`;
          const mimeType = blob.type || (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`);
          const dataBase64 = await blobToBase64(blob);
          images.push({
            orderId: order.id,
            clientName: order.clientName || '',
            fileName,
            mimeType,
            dataBase64,
          });
          index += 1;
        } catch {
          failed.push(order.clientName || order.orderNumber || order.id);
        }
      }

      if (images.length === 0) {
        throw new Error('Impossible de lire les images sélectionnées');
      }

      const payload = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        images,
      };
      const fileName = `software-order-images-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      logRequestSuccess(req);
      if (failed.length > 0) {
        Alert.alert('Succès partiel', `[${req}] JSON généré (${images.length} image(s)). Images ignorées: ${failed.length}`);
      } else {
        Alert.alert('Succès', `[${req}] JSON généré (${images.length} image(s))`);
      }
    } catch (error) {
      logRequestError(req, error, 'Export JSON images impossible');
    }
  };

  const normalizeStatus = (status: string) => status.trim().toLowerCase();
  const canonicalStatus = (status: string): 'annuler' | 'confirmer' | 'payer' | 'livrer' => {
    const s = normalizeStatus(status || '');
    if (['annuler', 'annulé', 'cancelled'].includes(s)) return 'annuler';
    if (['confirmer', 'confirmé', 'confirmed'].includes(s)) return 'confirmer';
    if (['payer', 'paid', 'processing', 'en cours', 'in_progress'].includes(s)) return 'payer';
    if (['livrer', 'livré', 'delivered', 'done'].includes(s)) return 'livrer';
    return 'confirmer';
  };
  const isCancelledStatus = (status: string) => canonicalStatus(status) === 'annuler';
  const isConfirmedStatus = (status: string) => canonicalStatus(status) === 'confirmer';
  const isPaidStatus = (status: string) => canonicalStatus(status) === 'payer';
  const isDeliveredStatus = (status: string) => canonicalStatus(status) === 'livrer';
  const getStatusTone = (status: string) => {
    const cs = canonicalStatus(status);
    if (cs === 'annuler') return { label: 'Annuler', bg: '#FEE2E2', color: '#B91C1C' };
    if (cs === 'confirmer') return { label: 'Confirmer', bg: '#E0E7FF', color: '#3730A3' };
    if (cs === 'payer') return { label: 'Payer', bg: '#FEF3C7', color: '#92400E' };
    return { label: 'Livrer', bg: '#DCFCE7', color: '#166534' };
  };
  const ordersForSelectedCourier = selectedCourier === '__all__'
    ? orders
    : orders.filter((o) => (o.deliveryPerson || '').trim() === selectedCourier);
  const countAll = ordersForSelectedCourier.length;
  const countCancelled = ordersForSelectedCourier.filter((o) => isCancelledStatus(o.status || '')).length;
  const countConfirmed = ordersForSelectedCourier.filter((o) => isConfirmedStatus(o.status || '')).length;
  const countPaid = ordersForSelectedCourier.filter((o) => isPaidStatus(o.status || '')).length;
  const countDelivered = ordersForSelectedCourier.filter((o) => isDeliveredStatus(o.status || '')).length;
  const statusOptions: Array<{ value: 'all' | 'annuler' | 'confirmer' | 'payer' | 'livrer'; label: string }> = [
    { value: 'all', label: `Tous (${countAll})` },
    { value: 'annuler', label: `Annuler (${countCancelled})` },
    { value: 'confirmer', label: `Confirmer (${countConfirmed})` },
    { value: 'payer', label: `Payer (${countPaid})` },
    { value: 'livrer', label: `Livrer (${countDelivered})` },
  ];
  const courierOptions = Array.from(
    new Set(
      orders
        .map((o) => (o.deliveryPerson || '').trim())
        .filter((name) => Boolean(name))
    )
  ).sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  const selectedStatusLabel = statusOptions.find((s) => s.value === selectedOrderTab)?.label || 'Tous';
  const selectedCourierLabel = selectedCourier === '__all__' ? 'Tous livreurs' : selectedCourier;
  const editStatusOptions: Array<'annuler' | 'confirmer' | 'payer' | 'livrer'> = ['annuler', 'confirmer', 'payer', 'livrer'];
  const filteredOrders = orders.filter((o) => {
    if (selectedCourier !== '__all__' && (o.deliveryPerson || '').trim() !== selectedCourier) return false;
    if (selectedOrderTab === 'all') return true;
    if (selectedOrderTab === 'annuler') return isCancelledStatus(o.status || '');
    if (selectedOrderTab === 'confirmer') return isConfirmedStatus(o.status || '');
    if (selectedOrderTab === 'payer') return isPaidStatus(o.status || '');
    return isDeliveredStatus(o.status || '');
  });
  const activeOrdersForTotal = ordersForSelectedCourier.filter((o) => !isCancelledStatus(o.status || ''));
  const grossActiveTotal = activeOrdersForTotal.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const activeParcelCount = activeOrdersForTotal.filter((o) => Boolean(o.isPersonalTransportParcel)).length;
  const totalNet = Math.max(0, grossActiveTotal - (activeParcelCount * PARCEL_DISCOUNT));

  const quickSetOrderStatus = async (order: MobileOrder, status: string) => {
    const req = 'QUICK_STATUS_UPDATE';
    try {
      logRequestStart(req);
      await updateOrder({
        ...order,
        status,
      });
      await loadOrders();
      logRequestSuccess(req);
    } catch (error) {
      logRequestError(req, error, 'Mise à jour rapide impossible');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader
        title="Commandes"
        subtitle={`Total net: ${totalNet.toLocaleString('fr-FR')} MGA | Colis cochés: ${activeParcelCount} (-${(activeParcelCount * PARCEL_DISCOUNT).toLocaleString('fr-FR')} Ar)${metaInfo?.deliveryPersonFilter ? ` | Livreur: ${metaInfo.deliveryPersonFilter}` : ''}`}
      />
      {!addingOrder ? (
        <View style={styles.ordersToolbar}>
          <AppButton title="Ajouter commande" onPress={() => setAddingOrder(true)} />
          <AppButton title="Enregistrer ce fichier" onPress={() => void handleSaveCurrentFile()} />
          <AppButton title="Exporter logiciel JSON" onPress={() => void exportCurrentOrders()} variant="secondary" />
          <AppButton title="Exporter images JSON" onPress={() => void exportOrderImagesJsonForSoftware()} variant="secondary" />
        </View>
      ) : (
        <View style={[styles.listItem, styles.formCard]}>
          <Text style={styles.listTitle}>Nouvelle commande</Text>
          <TextInput style={styles.input} value={newClientName} onChangeText={setNewClientName} placeholder="Nom du client" />
          <Text style={styles.listValue}>Date automatique: {todayISO}</Text>
          <TextInput style={styles.input} value={newStatus} onChangeText={setNewStatus} placeholder="Statut" />
          <TextInput style={styles.input} value={newAmount} onChangeText={setNewAmount} placeholder="Montant" keyboardType="numeric" />
          <TextInput style={styles.input} value={newArticles} onChangeText={setNewArticles} placeholder="Articles (nombre)" keyboardType="numeric" />
          <TextInput style={styles.input} value={newAddress} onChangeText={setNewAddress} placeholder="Adresse" />
          <Pressable style={styles.cleanActionCard} onPress={() => void pickOrderImage('new')}>
            <Text style={styles.cleanActionTitle}>Ajouter photo (JPG/PNG)</Text>
            {newProofImageUri ? (
              <View style={styles.imagePreviewRow}>
                <Image source={{ uri: newProofImageUri }} style={styles.imagePreviewThumb} />
                <Text style={styles.cleanActionSub}>{newProofImageUri.split('/').pop() || 'Image sélectionnée'}</Text>
              </View>
            ) : (
              <Text style={styles.cleanActionSub}>Aucune image</Text>
            )}
          </Pressable>
          <Pressable style={styles.toggleRow} onPress={() => setNewTypeColis((v) => !v)}>
            <Ionicons name={newTypeColis ? 'checkbox' : 'square-outline'} size={20} color={BRAND.primaryDark} />
            <Text style={styles.toggleText}>Type: Colis (transport personnel)</Text>
          </Pressable>
          <View style={styles.inlineRow}>
            <AppButton title="Ajouter" onPress={() => void handleCreateOrder()} />
            <AppButton title="Annuler" onPress={() => setAddingOrder(false)} variant="secondary" />
          </View>
        </View>
      )}
      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={17} color={BRAND.muted} />
        <TextInput
          placeholder="Rechercher commande/client..."
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
        />
      </View>
      <View style={styles.selectFiltersRow}>
        <View style={styles.selectFilterBlock}>
          <Text style={styles.selectFilterLabel}>Statut</Text>
          <Pressable
            style={styles.selectInput}
            onPress={() => {
              setOpenStatusSelect((v) => !v);
              setOpenCourierSelect(false);
            }}
          >
            <Text style={styles.selectInputText}>{selectedStatusLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={BRAND.muted} />
          </Pressable>
          {openStatusSelect ? (
            <View style={styles.selectMenu}>
              {statusOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[styles.selectOption, selectedOrderTab === option.value ? styles.selectOptionActive : null]}
                  onPress={() => {
                    setSelectedOrderTab(option.value);
                    setOpenStatusSelect(false);
                  }}
                >
                  <Text style={[styles.selectOptionText, selectedOrderTab === option.value ? styles.selectOptionTextActive : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.selectFilterBlock}>
          <Text style={styles.selectFilterLabel}>Livreur</Text>
          <Pressable
            style={styles.selectInput}
            onPress={() => {
              setOpenCourierSelect((v) => !v);
              setOpenStatusSelect(false);
            }}
          >
            <Text style={styles.selectInputText}>{selectedCourierLabel}</Text>
            <Ionicons name="chevron-down" size={16} color={BRAND.muted} />
          </Pressable>
          {openCourierSelect ? (
            <View style={styles.selectMenu}>
              <Pressable
                style={[styles.selectOption, selectedCourier === '__all__' ? styles.selectOptionActive : null]}
                onPress={() => {
                  setSelectedCourier('__all__');
                  setOpenCourierSelect(false);
                }}
              >
                <Text style={[styles.selectOptionText, selectedCourier === '__all__' ? styles.selectOptionTextActive : null]}>
                  Tous livreurs
                </Text>
              </Pressable>
              {courierOptions.map((name) => (
                <Pressable
                  key={name}
                  style={[styles.selectOption, selectedCourier === name ? styles.selectOptionActive : null]}
                  onPress={() => {
                    setSelectedCourier(name);
                    setOpenCourierSelect(false);
                  }}
                >
                  <Text style={[styles.selectOptionText, selectedCourier === name ? styles.selectOptionTextActive : null]}>
                    {name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {filteredOrders.length === 0 ? (
        <Text style={styles.emptyText}>Aucune commande. Importez un fichier mobile export.</Text>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.ordersCardList}
          renderItem={({ item }) => (
            <View style={styles.orderCard}>
              <View style={styles.orderCardHead}>
                <View style={styles.orderCardTitleWrap}>
                  <Text style={[styles.orderCardId, isNarrow ? styles.orderCardIdNarrow : null]} numberOfLines={1}>
                    Order # {item.orderNumber || item.id.slice(0, 8)}
                  </Text>
                  <View style={[styles.orderStatusBadge, { backgroundColor: getStatusTone(item.status || '').bg }]}>
                    <Text style={[styles.orderStatusBadgeText, { color: getStatusTone(item.status || '').color }]}>{getStatusTone(item.status || '').label}</Text>
                  </View>
                </View>
                <Text style={styles.orderCardDate}>{item.deliveryDate || '-'}</Text>
              </View>
              <View style={[styles.orderMetricsRow, isNarrow ? styles.orderMetricsRowNarrow : null]}>
                <View style={[styles.orderMetricCard, isNarrow ? styles.orderMetricCardHalf : null]}>
                  <Text style={styles.orderMetricLabel}>Client</Text>
                  <Text style={styles.orderMetricValue}>{item.clientName}</Text>
                </View>
                <View style={[styles.orderMetricCard, isNarrow ? styles.orderMetricCardHalf : null]}>
                  <Text style={styles.orderMetricLabel}>Numéro client</Text>
                  <Text style={styles.orderMetricValue}>{item.clientPhone || '-'}</Text>
                </View>
                <View style={[styles.orderMetricCard, isNarrow ? styles.orderMetricCardFull : null]}>
                  <Text style={styles.orderMetricLabel}>Payment</Text>
                  <Text style={styles.orderMetricValue}>{item.paymentMethod || 'Cash'}</Text>
                </View>
                <View style={[styles.orderMetricCard, isNarrow ? styles.orderMetricCardFull : null]}>
                  <Text style={styles.orderMetricLabel}>Total</Text>
                  <Text style={styles.orderMetricValue}>{Number(item.totalAmount || 0).toLocaleString('fr-FR')} MGA</Text>
                </View>
              </View>
              <Text style={styles.orderCardLine}>
                Produits: <Text style={styles.orderCardProducts}>{(item.items || []).slice(0, 3).map((it) => `${it.productName || 'Article'} x${it.quantity || 1}`).join(' , ') || `${(item.items || []).length} article(s)`}</Text>
              </Text>
              <Text style={styles.orderCardLine}>Type: <Text style={styles.orderCardValue}>{item.isPersonalTransportParcel ? 'Colis perso' : 'Standard'}</Text></Text>
              <Text style={styles.orderCardLine}>Adresse: <Text style={styles.orderCardValue}>{item.shippingAddress || '-'}</Text></Text>
              {editingOrderId === item.id ? (
                <>
                  <View style={styles.inlineSelectWrap}>
                    <Text style={styles.selectFilterLabel}>Statut</Text>
                    <Pressable
                      style={styles.selectInput}
                      onPress={() => setOpenEditStatusSelect((v) => !v)}
                    >
                      <Text style={styles.selectInputText}>{canonicalStatus(editStatus || item.status || 'confirmer')}</Text>
                      <Ionicons name="chevron-down" size={16} color={BRAND.muted} />
                    </Pressable>
                    {openEditStatusSelect ? (
                      <View style={styles.inlineSelectMenu}>
                        {editStatusOptions.map((status) => (
                          <Pressable
                            key={status}
                            style={[styles.selectOption, canonicalStatus(editStatus || item.status || 'confirmer') === status ? styles.selectOptionActive : null]}
                            onPress={() => {
                              setEditStatus(status);
                              setOpenEditStatusSelect(false);
                            }}
                          >
                            <Text style={[styles.selectOptionText, canonicalStatus(editStatus || item.status || 'confirmer') === status ? styles.selectOptionTextActive : null]}>
                              {status}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <TextInput style={styles.input} value={editAmount} onChangeText={setEditAmount} placeholder="Montant" keyboardType="numeric" />
                  <TextInput style={styles.input} value={editAddress} onChangeText={setEditAddress} placeholder="Adresse livraison" />
                  <Pressable style={[styles.cleanActionCard, styles.photoPickerCard]} onPress={() => void pickOrderImage('edit')}>
                    <Text style={styles.cleanActionTitle}>Importer photo (JPG/PNG)</Text>
                    {editProofImageUri ? (
                      <View style={styles.imagePreviewRow}>
                        <Image source={{ uri: editProofImageUri }} style={styles.imagePreviewThumb} />
                        <Text style={styles.cleanActionSub}>{editProofImageUri.split('/').pop() || 'Image sélectionnée'}</Text>
                      </View>
                    ) : (
                      <Text style={styles.cleanActionSub}>Aucune image</Text>
                    )}
                  </Pressable>
                  <Pressable style={styles.toggleRow} onPress={() => setEditPersonalTransport((v) => !v)}>
                    <Ionicons name={editPersonalTransport ? 'checkbox' : 'square-outline'} size={20} color={BRAND.primaryDark} />
                    <Text style={styles.toggleText}>Colis (transport personnel)</Text>
                  </Pressable>
                  <View style={styles.inlineRow}>
                    <AppButton title="Enregistrer" onPress={() => void saveEdit(item)} />
                    <AppButton title="Annuler" onPress={() => { setEditingOrderId(null); setOpenEditStatusSelect(false); }} variant="secondary" />
                  </View>
                </>
              ) : (
                <View style={[styles.orderCardActions, isNarrow ? styles.orderCardActionsNarrow : null]}>
                  {isCancelledStatus(item.status || '') ? (
                    <Pressable style={[styles.orderActionBtn, styles.orderActionAccept, isNarrow ? styles.orderActionBtnNarrow : null]} onPress={() => void quickSetOrderStatus(item, 'livrer')}>
                      <Ionicons name="checkmark-circle-outline" size={15} color="#FFFFFF" />
                      <Text style={styles.orderActionTextLight}>Livrer</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={[styles.orderActionBtn, styles.orderActionReject, isNarrow ? styles.orderActionBtnNarrow : null]} onPress={() => void quickSetOrderStatus(item, 'annuler')}>
                      <Ionicons name="close-circle-outline" size={15} color="#FFFFFF" />
                      <Text style={styles.orderActionTextLight}>Annuler</Text>
                    </Pressable>
                  )}
                  <Pressable style={[styles.orderActionBtn, styles.orderActionDetails, isNarrow ? styles.orderActionBtnNarrow : null]} onPress={() => startEdit(item)}>
                    <Ionicons name="create-outline" size={15} color="#0F172A" />
                    <Text style={styles.orderActionTextDark}>Détails</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ImportHistoryScreen({
  onReimport,
}: {
  onReimport: (historyId: number) => Promise<void>;
}) {
  const [items, setItems] = useState<ImportHistoryItem[]>([]);

  const loadHistory = async () => {
    const req = 'LOAD_IMPORT_HISTORY';
    try {
      logRequestStart(req);
      const rows = await listImportHistory();
      setItems(rows);
      logRequestSuccess(req);
    } catch (error) {
      logRequestError(req, error, 'Chargement historique impossible');
    }
  };

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [])
  );

  return (
    <SafeAreaView style={styles.screen}>
      <AppHeader title="Fichiers importés" subtitle="Historique des imports mobile" />
      {items.length === 0 ? (
        <Text style={styles.emptyText}>Aucun historique pour le moment.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.listItem}>
              <Text style={styles.listTitle}>{item.fileName || 'Export mobile'}</Text>
              <Text style={styles.listValue}>Importé: {new Date(item.importedAt).toLocaleString()}</Text>
              <Text style={styles.listValue}>
                Livreur: {item.deliveryPersonFilter ? item.deliveryPersonFilter : 'Tous'}
              </Text>
              <Text style={styles.listValue}>
                Total: {Number(item.totalAmount || 0).toLocaleString('fr-FR')} MGA
              </Text>
              <View style={styles.inlineRow}>
                <AppButton title="Réimporter" onPress={() => void onReimport(Number(item.id))} />
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<{
    id?: number;
    importedAt: string;
    archivePath: string;
    totalAmount?: number;
    deliveryPersonFilter?: string;
  } | null>(null);
  const [freeSpaceLabel, setFreeSpaceLabel] = useState('-');
  const [ready, setReady] = useState(false);
  const [requestUiEntry, setRequestUiEntry] = useState<RequestUiEntry | null>(null);
  const requestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestUiListener = (entry) => {
      setRequestUiEntry(entry);
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
      }
      requestTimeoutRef.current = setTimeout(() => {
        setRequestUiEntry(null);
      }, entry.status === 'error' ? 6500 : 2200);
    };
    return () => {
      requestUiListener = null;
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      const req = 'APP_BOOTSTRAP';
      try {
        logRequestStart(req);
        await initStorage();
        const session = await AsyncStorage.getItem(SESSION_KEY);
        if (session) setCurrentUser(session);
        const meta = await getLastImportMeta();
        if (meta) {
          setImportInfo({
            id: Number(meta.id || 0),
            importedAt: meta.importedAt,
            archivePath: meta.archivePath,
            totalAmount: Number(meta.totalAmount || 0),
            deliveryPersonFilter: meta.deliveryPersonFilter || '',
          });
        }
        const free = getAvailableDiskSpace();
        if (free > 0) {
          setFreeSpaceLabel(formatBytes(free));
        }
        setReady(true);
        logRequestSuccess(req);
      } catch (error) {
        logRequestError(req, error, 'Initialisation impossible');
      }
    };
    void bootstrap();
  }, []);

  const handleLoginSuccess = async (username: string) => {
    await AsyncStorage.setItem(SESSION_KEY, username);
    setCurrentUser(username);
  };

  const handleLogout = async () => {
    await AsyncStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
  };

  const handleImportFile = async () => {
    const req = 'IMPORT_FILE';
    try {
      logRequestStart(req);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'application/gzip', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const summary = await importMobileFile({
        uri: asset.uri,
        fileName: asset.name || 'mobile-export.json',
        fileSize: asset.size,
      });
      setImportInfo({
        id: Number(summary.currentImportId || 0),
        importedAt: summary.importedAt,
        archivePath: summary.archivePath,
        totalAmount: Number(summary.totalAmount || 0),
        deliveryPersonFilter: summary.deliveryPersonFilter || '',
      });
      const free = getAvailableDiskSpace();
      if (free > 0) {
        setFreeSpaceLabel(formatBytes(free));
      }
      logRequestSuccess(req);
      Alert.alert(
        'Succes',
        `[${req}] Import termine.
Clients: ${summary.clientsCount}
Livraisons: ${summary.pendingCount}
Stats: ${summary.statsCount}
Commandes: ${summary.ordersCount || 0}
Total commandes: ${Number(summary.totalAmount || 0).toLocaleString('fr-FR')} MGA
Livreur: ${summary.deliveryPersonFilter || 'Tous'}`
      );
    } catch (error) {
      logRequestError(req, error, 'Impossible de lire/importer le fichier');
    }
  };

  const handleReimportHistory = async (historyId: number) => {
    const req = 'REIMPORT_HISTORY';
    try {
      logRequestStart(req);
      const summary = await reimportByHistoryId(historyId);
      setImportInfo({
        id: Number(summary.currentImportId || 0),
        importedAt: summary.importedAt,
        archivePath: summary.archivePath,
        totalAmount: Number(summary.totalAmount || 0),
        deliveryPersonFilter: summary.deliveryPersonFilter || '',
      });
      logRequestSuccess(req);
      Alert.alert(
        'Succès',
        `[${req}] Réimport terminé.
Commandes: ${summary.ordersCount || 0}
Total: ${Number(summary.totalAmount || 0).toLocaleString('fr-FR')} MGA`
      );
    } catch (error) {
      logRequestError(req, error, 'Réimport impossible');
    }
  };

  if (!ready) {
    return (
      <SafeAreaView style={styles.screen}>
        <Text style={styles.emptyText}>Chargement...</Text>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="dark" />
      <View style={styles.navRoot}>
        {requestUiEntry ? (
          <View
            style={[
              styles.requestBanner,
              requestUiEntry.status === 'start' ? styles.requestBannerStart : null,
              requestUiEntry.status === 'ok' ? styles.requestBannerOk : null,
              requestUiEntry.status === 'error' ? styles.requestBannerError : null,
            ]}
          >
            <Text style={styles.requestBannerText}>{requestUiEntry.message}</Text>
          </View>
        ) : null}
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: BRAND.card },
            headerTintColor: BRAND.text,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: BRAND.bg },
          }}
        >
          {currentUser ? (
            <>
              <Stack.Screen name="Vente" options={{ title: 'Vente Mobile' }}>
                {(props) => (
                  <VenteScreen
                    {...props}
                    username={currentUser}
                    importInfo={importInfo}
                    freeSpaceLabel={freeSpaceLabel}
                    onImportFile={handleImportFile}
                    onLogout={handleLogout}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="ProfessionalLife" options={{ title: 'Travail professionnel' }}>
                {(props) => <ProfessionalLifeScreen {...props} />}
              </Stack.Screen>
              <Stack.Screen name="Presence" options={{ title: 'Présence empreinte' }}>
                {(props) => <PresenceScreen {...props} />}
              </Stack.Screen>
              <Stack.Screen name="DeliveryStats" options={{ title: 'Statistique de livraison' }}>
                {() => <DeliveryStatsScreen />}
              </Stack.Screen>
              <Stack.Screen name="Clients" options={{ title: 'Client' }}>
                {() => <ClientsScreen />}
              </Stack.Screen>
              <Stack.Screen name="Orders" options={{ title: 'Commandes' }}>
                {() => <OrdersScreen />}
              </Stack.Screen>
              <Stack.Screen name="ImportHistory" options={{ title: 'Fichiers importés' }}>
                {() => <ImportHistoryScreen onReimport={handleReimportHistory} />}
              </Stack.Screen>
            </>
          ) : (
            <>
              <Stack.Screen name="Login" options={{ title: 'Connexion' }}>
                {(props) => <LoginScreen {...props} onLoginSuccess={handleLoginSuccess} />}
              </Stack.Screen>
              <Stack.Screen name="Register" options={{ title: 'Inscription' }}>
                {(props) => <RegisterScreen {...props} />}
              </Stack.Screen>
            </>
          )}
        </Stack.Navigator>
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  navRoot: {
    flex: 1,
  },
  requestBanner: {
    position: 'absolute',
    top: 8,
    left: 10,
    right: 10,
    zIndex: 50,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  requestBannerStart: {
    backgroundColor: '#E0ECFF',
    borderColor: '#93C5FD',
  },
  requestBannerOk: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  requestBannerError: {
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
  },
  requestBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  screen: {
    flex: 1,
    backgroundColor: BRAND.bg,
  },
  discoverContainer: {
    flex: 1,
    backgroundColor: BRAND.card,
    borderRadius: 26,
    margin: 8,
    overflow: 'hidden',
  },
  discoverScrollContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 100,
  },
  heroCard: {
    borderRadius: 16,
    backgroundColor: BRAND.primarySoft,
    borderWidth: 1,
    borderColor: '#BDE0D8',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  heroTitle: {
    color: BRAND.primaryDark,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  heroSub: {
    color: BRAND.primaryDark,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  cleanActionsWrap: {
    marginTop: 12,
    gap: 10,
  },
  cleanActionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND.border,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  cleanActionTitle: {
    color: BRAND.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cleanActionSub: {
    color: BRAND.muted,
    fontSize: 12,
  },
  proGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  proHeader: {
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  proHeaderSub: {
    color: BRAND.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  proCard: {
    width: '48.5%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 14,
    padding: 12,
    minHeight: 120,
  },
  proCardFull: {
    width: '100%',
    minHeight: 105,
  },
  proCardActive: {
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },
  proIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  proTitle: {
    color: BRAND.text,
    fontSize: 15,
    fontWeight: '700',
  },
  proSub: {
    marginTop: 4,
    color: BRAND.muted,
    fontSize: 12,
  },
  proBlockCaption: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6,
  },
  proListRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
    gap: 2,
  },
  proBadgeBtn: {
    alignSelf: 'flex-start',
    marginTop: 5,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  proBadgeBtnText: {
    color: '#065F46',
    fontWeight: '800',
    fontSize: 12,
  },
  proMoneyTotal: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '800',
  },
  bottomNav: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    backgroundColor: '#fff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
  },
  navItem: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navActivePill: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerWrap: {
    backgroundColor: BRAND.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BRAND.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: BRAND.text,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    marginTop: 2,
    color: BRAND.muted,
    fontSize: 12,
    fontWeight: '500',
  },
  headerBadge: {
    backgroundColor: '#E8F5F1',
    borderWidth: 1,
    borderColor: '#BDE0D8',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '42%',
  },
  headerBadgeText: {
    color: BRAND.primaryDark,
    fontSize: 11,
    fontWeight: '700',
  },
  card: {
    backgroundColor: BRAND.card,
    borderRadius: 16,
    padding: 16,
    borderColor: BRAND.border,
    borderWidth: 1,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: BRAND.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: BRAND.muted,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  input: {
    borderColor: BRAND.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: BRAND.card,
    marginBottom: 8,
    color: BRAND.text,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: BRAND.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: BRAND.card,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: BRAND.text,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
  },
  buttonPrimary: {
    backgroundColor: BRAND.primary,
  },
  buttonSecondary: {
    backgroundColor: BRAND.accent,
  },
  buttonDanger: {
    backgroundColor: '#DC2626',
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: BRAND.card,
    fontWeight: '700',
    fontSize: 14,
  },
  listItem: {
    backgroundColor: BRAND.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BRAND.border,
    padding: 12,
    marginBottom: 8,
  },
  formCard: {
    borderColor: '#D7E3FC',
    backgroundColor: '#FCFDFF',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND.text,
    marginBottom: 4,
  },
  listValue: {
    fontSize: 13,
    color: BRAND.muted,
  },
  emptyText: {
    fontSize: 14,
    color: BRAND.muted,
  },
  inlineRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  ordersToolbar: {
    marginBottom: 8,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  selectFiltersRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    zIndex: 20,
    flexWrap: 'wrap',
  },
  selectFilterBlock: {
    minWidth: 170,
    flex: 1,
    position: 'relative',
    zIndex: 25,
  },
  inlineSelectWrap: {
    marginBottom: 8,
    position: 'relative',
    zIndex: 30,
  },
  selectFilterLabel: {
    color: BRAND.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  selectInput: {
    height: 40,
    borderWidth: 1,
    borderColor: '#DCE4F3',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectInputText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '700',
  },
  selectMenu: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 66,
    borderWidth: 1,
    borderColor: '#DCE4F3',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 40,
  },
  inlineSelectMenu: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#DCE4F3',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 4,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 40,
  },
  selectOption: {
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  selectOptionActive: {
    backgroundColor: '#EFF6FF',
  },
  selectOptionText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
  },
  selectOptionTextActive: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  ordersCardList: {
    paddingBottom: 16,
    paddingHorizontal: 2,
  },
  orderCard: {
    backgroundColor: '#FDFEFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE4F3',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  orderCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  orderCardTitleWrap: {
    flexDirection: 'column',
    gap: 6,
    maxWidth: '78%',
  },
  orderCardId: {
    color: BRAND.text,
    fontSize: 22,
    fontWeight: '800',
  },
  orderCardIdNarrow: {
    fontSize: 18,
  },
  orderStatusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  orderStatusBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  orderCardDate: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '800',
  },
  orderMetricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  orderMetricsRowNarrow: {
    gap: 6,
  },
  orderMetricCard: {
    minWidth: 120,
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  orderMetricCardHalf: {
    minWidth: 0,
    flexBasis: '48%',
  },
  orderMetricCardFull: {
    minWidth: 0,
    flexBasis: '100%',
  },
  orderMetricLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  orderMetricValue: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  orderCardLine: {
    color: '#64748B',
    fontSize: 13,
    marginBottom: 4,
    lineHeight: 19,
  },
  orderCardValue: {
    color: '#0F172A',
    fontWeight: '800',
  },
  orderCardProducts: {
    color: '#0F172A',
    fontWeight: '800',
  },
  orderCardActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  orderCardActionsNarrow: {
    gap: 6,
  },
  orderActionBtn: {
    minWidth: 110,
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    borderWidth: 1,
  },
  orderActionBtnNarrow: {
    flexBasis: '100%',
  },
  orderActionAccept: {
    backgroundColor: '#16A34A',
    borderColor: '#15803D',
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 1,
  },
  orderActionReject: {
    backgroundColor: '#EF4444',
    borderColor: '#DC2626',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 1,
  },
  orderActionDetails: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  orderActionTextLight: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  orderActionTextDark: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 12,
  },
  photoPickerCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D7E3FC',
  },
  imagePreviewRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  imagePreviewThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F8FAFC',
  },
  tableWrap: {
    borderWidth: 1,
    borderColor: BRAND.border,
    borderRadius: 12,
    backgroundColor: BRAND.card,
  },
  tableHeaderRow: {
    backgroundColor: '#F8FAFC',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BRAND.border,
    alignItems: 'center',
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: BRAND.text,
    fontSize: 12,
    borderRightWidth: 1,
    borderRightColor: BRAND.border,
  },
  tableCellNo: {
    width: 110,
    fontWeight: '700',
  },
  tableCellClient: {
    width: 180,
    fontWeight: '600',
  },
  tableCellStatus: {
    width: 120,
  },
  tableCellDate: {
    width: 130,
  },
  tableCellAmount: {
    width: 140,
    fontWeight: '700',
  },
  tableCellItems: {
    width: 80,
    textAlign: 'center',
  },
  tableCellType: {
    width: 130,
  },
  tableCellAddress: {
    width: 230,
  },
  tableCellActions: {
    width: 280,
    borderRightWidth: 0,
  },
  tableInput: {
    borderColor: BRAND.border,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  toggleText: {
    color: BRAND.text,
    fontSize: 12,
    fontWeight: '600',
  },
});

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}
