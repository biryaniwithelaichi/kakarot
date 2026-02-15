import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { useChatScroll } from '../hooks/useChatScroll';
import { useThinkingTimer } from '../hooks/useThinkingTimer';
import ThoughtTrace from './ThoughtTrace';
import {
  Users,
  Sparkles,
  AlertCircle,
  CheckCircle,
  X,
  Lightbulb,
  Rocket,
  Code,
  Briefcase,
  Calendar,
  Target,
  ListChecks,
  Plus,
  Info,
  Building2,
  Linkedin,
  ExternalLink,
  Globe,
  FileText,
  Edit,
  RotateCcw,
  Trash2,
  Clock,
  Mail,
  MessageSquare,
  TrendingUp,
  DollarSign,
  User,
  History,
  ChevronRight,
  Zap,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  Send,
  RefreshCw,
  Search,
} from 'lucide-react';
import leadershipCoachingImage from '../assets/Leadership coaching Branch .png';
import weeklyReportImage from '../assets/Weekly Report .png';
import monthlyReportImage from '../assets/Monthly Report.png';
import sortCalendarImage from '../assets/Sort my calendar branch.png';
import type {
  Person,
  Branch,
  CompanyInfo,
  CustomMeetingType,
  StandardMeetingTypeOverride,
  EnhancedMeetingPrepResult,
  EnhancedPrepParticipant,
  TimelineEvent,
  ActionItemStatus,
  CRMSnapshot,
  DynamicPrepResult,
  DynamicBrief,
  PrepInsight,
  DynamicPrepParticipant,
  ConversationalPrepResult,
  PrepConversation,
  PrepChatMessage,
  PrepChatResponse,
  MeetingSynthesis,
} from '@shared/types';
import { toast } from '../stores/toastStore';

interface PrepViewProps {
  onSelectTab?: (tab: 'notes' | 'prep') => void;
}

// Standard meeting objectives with full details for editing
const DEFAULT_STANDARD_TYPES = [
  {
    id: 'kick-off',
    title: 'Project Kick-Off',
    description: 'Project or initiative launch meetings',
    icon: Rocket,
    prompt: 'Set the stage for a new project with goals, timelines, and team alignment.',
    defaultRoles: ['Project Lead', 'Team Members', 'Stakeholders'],
    defaultObjectives: ['Define project scope', 'Assign responsibilities', 'Set timeline']
  },
  {
    id: 'product-update-sync',
    title: 'Product Update Sync',
    description: 'Progress reviews and checkpoint meetings',
    icon: FileText,
    prompt: 'Share project progress, blockers, and next steps effectively.',
    defaultRoles: ['Project Manager', 'Team Leads', 'Stakeholders'],
    defaultObjectives: ['Share progress', 'Identify blockers', 'Align on next steps']
  },
  {
    id: 'client',
    title: 'Regular client connect',
    description: 'External client meetings and relationship building',
    icon: Briefcase,
    prompt: 'Prepare for client interactions with context and talking points.',
    defaultRoles: ['Account Manager', 'Project Lead', 'Client'],
    defaultObjectives: ['Review deliverables', 'Address concerns', 'Plan next steps']
  }
];

// Form data for creating custom objectives
interface MeetingObjectiveFormData {
  name: string;
  description: string;
  attendeeRoles: string[];
  isExternal: boolean;
  objectives: string[];
  customPrompt: string;
}

const emptyFormData: MeetingObjectiveFormData = {
  name: '',
  description: '',
  attendeeRoles: [],
  isExternal: false,
  objectives: [],
  customPrompt: ''
};

// Generate unique ID
const generateId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export default function PrepView({ onSelectTab }: PrepViewProps) {
  const { settings, setSettings, initialPrepQuery, setInitialPrepQuery } = useAppStore();
  const [people, setPeople] = useState<Person[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeople, setSelectedPeople] = useState<Person[]>([]);
  const [, setIsLoadingPeople] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedObjectiveId, setSelectedObjectiveId] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingError, setGeneratingError] = useState<string | null>(null);
  const [briefingResult, setBriefingResult] = useState<EnhancedMeetingPrepResult | null>(null);
  const [dynamicPrepResult, setDynamicPrepResult] = useState<DynamicPrepResult | null>(null);
  const [useDynamicPrep, setUseDynamicPrep] = useState(true); // Default to new dynamic prep
  const [completedActionItems, setCompletedActionItems] = useState<Set<string>>(new Set());
  const [fetchingCompanyInfo, setFetchingCompanyInfo] = useState<string | null>(null);
  const [companyInfoCache, setCompanyInfoCache] = useState<Record<string, CompanyInfo | null>>({});

  // Quick prep mode state (Granola-style)
  const [prepMode, setPrepMode] = useState<'quick' | 'advanced'>('quick');
  const [quickPrepQuery, setQuickPrepQuery] = useState('');
  const [quickSearchResults, setQuickSearchResults] = useState<Person[]>([]);
  const [conversationalResult, setConversationalResult] = useState<ConversationalPrepResult | null>(null);
  const [showQuickSearchDropdown, setShowQuickSearchDropdown] = useState(false);

  // Omnibar chat state
  const [chatConversation, setChatConversation] = useState<PrepConversation | null>(null);
  const [chatHistory, setChatHistory] = useState<PrepConversation[]>([]);
  const [showPreviousChats, setShowPreviousChats] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [streamingText, setStreamingText] = useState(''); // For streaming response content
  const [streamingThinking, setStreamingThinking] = useState(''); // For streaming thinking/reasoning
  const [isStreamingThinking, setIsStreamingThinking] = useState(false); // Track if currently in thinking phase
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const chatInputRef = React.useRef<HTMLTextAreaElement>(null);
  const streamCleanupRef = React.useRef<(() => void) | null>(null);

  // Custom hooks for chat features
  const { scrollContainerRef, scrollAnchorRef, autoScrollToBottom } = useChatScroll({ enabled: true });
  const thinkingTimer = useThinkingTimer();

  // Modal state for creating/editing objectives
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState<MeetingObjectiveFormData>(emptyFormData);
  const [newRole, setNewRole] = useState('');
  const [newObjective, setNewObjective] = useState('');
  const [editingType, setEditingType] = useState<CustomMeetingType | null>(null);
  const [editingStandardId, setEditingStandardId] = useState<string | null>(null);

  // Get custom meeting objectives from settings
  const customObjectives = settings?.customMeetingTypesV2 || [];
  const objectiveUsage = settings?.meetingObjectiveUsage || [];
  const standardOverrides = settings?.standardMeetingTypeOverrides || [];

  // Consume initial prep query from app store (set by ManualNotesView Prep button)
  const saveConversationToHistory = useCallback((conv: PrepConversation) => {
    setChatHistory((prev) => {
      const idx = prev.findIndex((c) => c.id === conv.id);
      const updated = idx >= 0
        ? prev.map((c, i) => (i === idx ? conv : c))
        : [conv, ...prev];
      const trimmed = updated.slice(0, 50);
      try {
        localStorage.setItem('treeto-prep-chat-history', JSON.stringify(trimmed));
      } catch {
        // ignore storage errors
      }
      return trimmed;
    });
  }, []);

  const sendPrepMessage = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || isChatLoading) return;

      setChatInput('');
      setIsChatLoading(true);
      setGeneratingError(null);
      setStreamingText('');
      setStreamingThinking('');
      setIsStreamingThinking(true);
      setStreamingMessageId(null);

      thinkingTimer.reset();
      thinkingTimer.start();

      if (streamCleanupRef.current) {
        streamCleanupRef.current();
        streamCleanupRef.current = null;
      }

      try {
        const tempUserMsgId = `msg-${Date.now()}-user`;
        const tempAssistantMsgId = `msg-${Date.now()}-assistant`;
        setStreamingMessageId(tempAssistantMsgId);

        const userMsg: PrepChatMessage = {
          id: tempUserMsgId,
          role: 'user',
          content: trimmed,
          timestamp: new Date().toISOString(),
        };

        const tempConversation: PrepConversation = chatConversation
          ? {
              ...chatConversation,
              messages: [...chatConversation.messages, userMsg],
              updatedAt: new Date().toISOString(),
            }
          : {
              id: `conv-${Date.now()}`,
              messages: [userMsg],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };

        setChatConversation(tempConversation);

        setTimeout(() => {
          autoScrollToBottom();
        }, 50);

        const cleanup = window.kakarot.prep.chatStreamStart(
          { message: trimmed },
          chatConversation || undefined,
          {
            onChunk: (chunk: string) => {
              if (isStreamingThinking) {
                const thinkingDuration = thinkingTimer.stop();
                console.log(`Thinking phase complete: ${thinkingDuration}ms`);
                setIsStreamingThinking(false);
              }

              setStreamingText((prev) => prev + chunk);

              autoScrollToBottom();
            },
            onStart: (_metadata: { conversationId: string; meetingReferences: { meetingId: string; title: string; date: string }[] }) => {
              // Metadata received - could use for showing meeting references
            },
            onEnd: (response: PrepChatResponse) => {
              const finalDuration = thinkingTimer.elapsedMs;
              if (thinkingTimer.isRunning) {
                thinkingTimer.stop();
              }

              if (response.conversation && finalDuration > 0) {
                const lastMessage = response.conversation.messages[response.conversation.messages.length - 1];
                if (lastMessage && lastMessage.role === 'assistant') {
                  lastMessage.thinkingDuration = finalDuration;
                  lastMessage.thinking = `Processing your question and analyzing context (${Math.round(finalDuration / 1000)}s)`;
                }
              }

              setChatConversation(response.conversation || null);
              if (response.conversation) saveConversationToHistory(response.conversation);
              setStreamingText('');
              setStreamingThinking('');
              setIsStreamingThinking(false);
              setStreamingMessageId(null);
              setIsChatLoading(false);
              chatInputRef.current?.focus();
            },
            onError: (error: string) => {
              thinkingTimer.stop();
              setGeneratingError(error);
              setStreamingText('');
              setStreamingThinking('');
              setIsStreamingThinking(false);
              setStreamingMessageId(null);
              setIsChatLoading(false);
              chatInputRef.current?.focus();
            },
          }
        );

        streamCleanupRef.current = cleanup;
      } catch (error) {
        setGeneratingError(error instanceof Error ? error.message : 'Failed to send message');
        setIsChatLoading(false);
        setIsStreamingThinking(false);
        setStreamingMessageId(null);
      }
    },
    [
      autoScrollToBottom,
      chatConversation,
      isChatLoading,
      saveConversationToHistory,
      thinkingTimer,
    ]
  );

  const handleChatSend = useCallback(() => {
    sendPrepMessage(chatInput);
  }, [chatInput, sendPrepMessage]);

  useEffect(() => {
    if (!initialPrepQuery) {
      return;
    }

    setChatInput(initialPrepQuery);
    setInitialPrepQuery(null);
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);

    const timer = setTimeout(() => {
      sendPrepMessage(initialPrepQuery);
    }, 150);

    return () => clearTimeout(timer);
  }, [initialPrepQuery, setInitialPrepQuery, sendPrepMessage]);

  // Load chat history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('treeto-prep-chat-history');
      if (stored) setChatHistory(JSON.parse(stored));
    } catch {
      // ignore corrupt data
    }
  }, []);

  // Cleanup streaming on unmount
  useEffect(() => {
    return () => {
      if (streamCleanupRef.current) {
        streamCleanupRef.current();
      }
    };
  }, []);

  // Get override for standard type
  const getStandardOverride = (id: string) => {
    return standardOverrides.find(o => o.id === id);
  };

  // Check if standard type has been modified
  const isStandardModified = (id: string) => {
    return standardOverrides.some(o => o.id === id);
  };

  // Combine and sort meeting objectives by last used
  const sortedObjectives = useMemo(() => {
    // Create a unified list of all objectives
    const allObjectives: Array<{
      id: string;
      label: string;
      icon: React.ComponentType<any>;
      isCustom: boolean;
      isModified: boolean;
      lastUsedAt: number;
    }> = [];

    // Add standard objectives
    DEFAULT_STANDARD_TYPES.forEach(obj => {
      const usage = objectiveUsage.find(u => u.id === obj.id);
      allObjectives.push({
        id: obj.id,
        label: obj.title,
        icon: obj.icon,
        isCustom: false,
        isModified: isStandardModified(obj.id),
        lastUsedAt: usage?.lastUsedAt || 0
      });
    });

    // Add custom objectives
    customObjectives.forEach(obj => {
      allObjectives.push({
        id: obj.id,
        label: obj.name,
        icon: Sparkles,
        isCustom: true,
        isModified: false,
        lastUsedAt: obj.lastUsedAt || 0
      });
    });

    // Sort by last used (most recent first), then alphabetically for unused
    return allObjectives.sort((a, b) => {
      if (a.lastUsedAt === 0 && b.lastUsedAt === 0) {
        return a.label.localeCompare(b.label);
      }
      return b.lastUsedAt - a.lastUsedAt;
    });
  }, [customObjectives, objectiveUsage, standardOverrides]);

  // Get the selected objective's label for display
  const selectedObjectiveLabel = useMemo(() => {
    if (!selectedObjectiveId) return '';
    const obj = sortedObjectives.find(o => o.id === selectedObjectiveId);
    return obj?.label || selectedObjectiveId;
  }, [selectedObjectiveId, sortedObjectives]);

  // Handle action item completion toggle (new enhanced prep)
  const handleToggleActionItem = useCallback(async (actionItemId: string) => {
    const newCompleted = !completedActionItems.has(actionItemId);
    setCompletedActionItems(prev => {
      const next = new Set(prev);
      if (newCompleted) {
        next.add(actionItemId);
      } else {
        next.delete(actionItemId);
      }
      return next;
    });
    // Persist to backend
    try {
      await window.kakarot.prep.toggleActionItem(actionItemId, newCompleted);
    } catch (error) {
      console.error('Failed to toggle action item:', error);
    }
  }, [completedActionItems]);

  // Fetch company info for a participant
  const handleFetchCompanyInfo = useCallback(async (email: string) => {
    if (!email || fetchingCompanyInfo === email) return;
    setFetchingCompanyInfo(email);
    try {
      const info = await window.kakarot.prep.fetchCompanyInfo(email);
      setCompanyInfoCache(prev => ({ ...prev, [email]: info }));
    } catch (error) {
      console.error('Failed to fetch company info:', error);
      setCompanyInfoCache(prev => ({ ...prev, [email]: null }));
    } finally {
      setFetchingCompanyInfo(null);
    }
  }, [fetchingCompanyInfo]);

  // Show LinkedIn coming soon toast
  const handleLinkedInClick = useCallback(() => {
    alert('LinkedIn integration coming soon!');
  }, []);

  // Update meeting objective usage when generating briefing
  const updateObjectiveUsage = useCallback(async (objectiveId: string) => {
    const now = Date.now();
    const updatedUsage = [...objectiveUsage];
    const existingIndex = updatedUsage.findIndex(u => u.id === objectiveId);

    if (existingIndex >= 0) {
      updatedUsage[existingIndex] = { ...updatedUsage[existingIndex], lastUsedAt: now };
    } else {
      updatedUsage.push({ id: objectiveId, lastUsedAt: now });
    }

    // Also update lastUsedAt for custom objectives
    const customIndex = customObjectives.findIndex(c => c.id === objectiveId);
    if (customIndex >= 0) {
      const updatedCustom = [...customObjectives];
      updatedCustom[customIndex] = { ...updatedCustom[customIndex], lastUsedAt: now };
      await window.kakarot.settings.update({
        meetingObjectiveUsage: updatedUsage,
        customMeetingTypesV2: updatedCustom
      });
      setSettings({ ...settings!, meetingObjectiveUsage: updatedUsage, customMeetingTypesV2: updatedCustom });
    } else {
      await window.kakarot.settings.update({ meetingObjectiveUsage: updatedUsage });
      setSettings({ ...settings!, meetingObjectiveUsage: updatedUsage });
    }
  }, [objectiveUsage, customObjectives, settings, setSettings]);

  // Modal handlers
  const openCreateModal = useCallback(() => {
    setFormData(emptyFormData);
    setEditingType(null);
    setEditingStandardId(null);
    setShowCreateModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowCreateModal(false);
    setFormData(emptyFormData);
    setEditingType(null);
    setEditingStandardId(null);
    setNewRole('');
    setNewObjective('');
  }, []);

  // Open modal for editing standard type
  const openStandardEdit = useCallback((id: string) => {
    const defaultType = DEFAULT_STANDARD_TYPES.find(t => t.id === id);
    const override = getStandardOverride(id);

    if (defaultType) {
      setFormData({
        name: defaultType.title,
        description: override?.description || defaultType.description,
        attendeeRoles: override?.attendeeRoles || defaultType.defaultRoles,
        isExternal: false,
        objectives: override?.objectives || defaultType.defaultObjectives,
        customPrompt: override?.customPrompt || defaultType.prompt
      });
      setEditingStandardId(id);
      setEditingType(null);
      setShowCreateModal(true);
    }
  }, [standardOverrides]);

  // Open modal for editing custom type
  const openCustomEdit = useCallback((type: CustomMeetingType) => {
    setFormData({
      name: type.name,
      description: type.description || '',
      attendeeRoles: type.attendeeRoles,
      isExternal: type.isExternal,
      objectives: type.objectives,
      customPrompt: type.customPrompt || ''
    });
    setEditingType(type);
    setEditingStandardId(null);
    setShowCreateModal(true);
  }, []);

  const addRole = useCallback(() => {
    if (newRole.trim() && !formData.attendeeRoles.includes(newRole.trim())) {
      setFormData(prev => ({
        ...prev,
        attendeeRoles: [...prev.attendeeRoles, newRole.trim()]
      }));
      setNewRole('');
    }
  }, [newRole, formData.attendeeRoles]);

  const addObjectiveItem = useCallback(() => {
    if (newObjective.trim() && !formData.objectives.includes(newObjective.trim())) {
      setFormData(prev => ({
        ...prev,
        objectives: [...prev.objectives, newObjective.trim()]
      }));
      setNewObjective('');
    }
  }, [newObjective, formData.objectives]);

  // Save custom meeting objective (create or update)
  const saveCustomType = useCallback(async () => {
    if (!formData.name.trim()) return;

    const now = Date.now();
    let nextSettings;

    if (editingType) {
      // Update existing
      const updated: CustomMeetingType = {
        ...editingType,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        attendeeRoles: formData.attendeeRoles,
        isExternal: formData.isExternal,
        objectives: formData.objectives,
        customPrompt: formData.customPrompt.trim() || undefined,
        updatedAt: now
      };

      nextSettings = {
        ...settings!,
        customMeetingTypesV2: customObjectives.map(t => t.id === editingType.id ? updated : t)
      };
    } else {
      // Create new
      const newType: CustomMeetingType = {
        id: generateId(),
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        attendeeRoles: formData.attendeeRoles,
        isExternal: formData.isExternal,
        objectives: formData.objectives,
        customPrompt: formData.customPrompt.trim() || undefined,
        createdAt: now,
        updatedAt: now
      };

      nextSettings = {
        ...settings!,
        customMeetingTypesV2: [...customObjectives, newType]
      };
    }

    closeModal();

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success(editingType ? 'Meeting objective updated' : 'Meeting objective created');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save changes');
    }
  }, [formData, editingType, customObjectives, settings, setSettings, closeModal]);

  // Save standard type override
  const saveStandardOverride = useCallback(async () => {
    if (!editingStandardId) return;

    const override: StandardMeetingTypeOverride = {
      id: editingStandardId,
      description: formData.description.trim() || undefined,
      attendeeRoles: formData.attendeeRoles.length > 0 ? formData.attendeeRoles : undefined,
      objectives: formData.objectives.length > 0 ? formData.objectives : undefined,
      customPrompt: formData.customPrompt.trim() || undefined,
      updatedAt: Date.now()
    };

    const existingIndex = standardOverrides.findIndex(o => o.id === editingStandardId);
    const newOverrides = existingIndex >= 0
      ? standardOverrides.map(o => o.id === editingStandardId ? override : o)
      : [...standardOverrides, override];

    const nextSettings = {
      ...settings!,
      standardMeetingTypeOverrides: newOverrides
    };

    closeModal();

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success('Meeting objective updated');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save changes');
    }
  }, [editingStandardId, formData, standardOverrides, settings, setSettings, closeModal]);

  // Reset standard type to default
  const resetStandardToDefault = useCallback(async (id: string) => {
    const nextSettings = {
      ...settings!,
      standardMeetingTypeOverrides: standardOverrides.filter(o => o.id !== id)
    };

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success('Reset to default');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to reset');
    }
  }, [standardOverrides, settings, setSettings]);

  // Delete custom type
  const deleteCustomType = useCallback(async (id: string) => {
    const nextSettings = {
      ...settings!,
      customMeetingTypesV2: customObjectives.filter(t => t.id !== id)
    };

    closeModal();

    try {
      await window.kakarot.settings.update(nextSettings);
      setSettings(nextSettings);
      toast.success('Meeting objective deleted');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to delete');
    }
  }, [customObjectives, settings, setSettings, closeModal]);

  // Handle edit button click
  const handleEditObjective = useCallback((objectiveId: string, isCustom: boolean, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the objective

    if (isCustom) {
      const customType = customObjectives.find(c => c.id === objectiveId);
      if (customType) {
        openCustomEdit(customType);
      }
    } else {
      openStandardEdit(objectiveId);
    }
  }, [customObjectives, openCustomEdit, openStandardEdit]);

  useEffect(() => {
    loadPeople();
    loadBranches();
  }, []);

  const loadPeople = async () => {
    setIsLoadingPeople(true);
    try {
      const peopleList = await window.kakarot.people.list();
      setPeople(peopleList);
    } finally {
      setIsLoadingPeople(false);
    }
  };

  const loadBranches = async () => {
    try {
      const branchesList = await window.kakarot.branches.list();
      setBranches(branchesList);
    } catch (error) {
      console.error('Failed to load branches:', error);
    }
  };

  // Quick search effect with debounce
  useEffect(() => {
    if (quickPrepQuery.length < 2) {
      setQuickSearchResults([]);
      setShowQuickSearchDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const results = await window.kakarot.prep.quickSearchPerson(quickPrepQuery);
        setQuickSearchResults(results);
        setShowQuickSearchDropdown(results.length > 0);
      } catch (error) {
        console.error('Quick search failed:', error);
        setQuickSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [quickPrepQuery]);

  // Generate quick (conversational) prep
  const handleQuickPrep = useCallback(async (personQuery: string) => {
    if (!personQuery.trim()) {
      setGeneratingError('Please enter a name or email');
      return;
    }

    setIsGenerating(true);
    setGeneratingError(null);
    setConversationalResult(null);
    setShowQuickSearchDropdown(false);

    try {
      const result = await window.kakarot.prep.generateConversational({
        personQuery: personQuery.trim(),
      });
      setConversationalResult(result);
    } catch (error) {
      setGeneratingError(error instanceof Error ? error.message : 'Failed to generate prep');
      console.error('Quick prep failed:', error);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  // Handle person selection from quick search dropdown
  const handleSelectQuickSearchPerson = useCallback((person: Person) => {
    setQuickPrepQuery(person.name || person.email);
    setShowQuickSearchDropdown(false);
    handleQuickPrep(person.email || person.name || '');
  }, [handleQuickPrep]);

  const handleNewConversation = useCallback(() => {
    setChatConversation(null);
    setChatInput('');
    setGeneratingError(null);
    chatInputRef.current?.focus();
  }, []);

  // Handle branch execution - "Grow this Branch"
  const handleGrowBranch = useCallback(async (branch: Branch) => {
    // Close the modal
    setShowBranchModal(false);
    setSelectedBranch(null);

    // Send the branch prompt directly
    const userMessage = branch.prompt.trim();
    if (!userMessage || isChatLoading) return;

    setChatInput('');
    setIsChatLoading(true);
    setGeneratingError(null);
    setStreamingText('');
    setStreamingThinking('');
    setIsStreamingThinking(true);
    setStreamingMessageId(null);

    thinkingTimer.reset();
    thinkingTimer.start();

    if (streamCleanupRef.current) {
      streamCleanupRef.current();
      streamCleanupRef.current = null;
    }

    try {
      const tempUserMsgId = `msg-${Date.now()}-user`;
      const tempAssistantMsgId = `msg-${Date.now()}-assistant`;
      setStreamingMessageId(tempAssistantMsgId);

      // Display a clean message in the UI (not the full prompt)
      const displayMessage = `🌱 ${branch.name}`;

      const userMsg: PrepChatMessage = {
        id: tempUserMsgId,
        role: 'user',
        content: displayMessage, // Show clean message in UI
        timestamp: new Date().toISOString(),
      };

      const tempConversation: PrepConversation = chatConversation
        ? {
            ...chatConversation,
            messages: [...chatConversation.messages, userMsg],
            updatedAt: new Date().toISOString(),
          }
        : {
            id: `conv-${Date.now()}`,
            messages: [userMsg],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

      setChatConversation(tempConversation);

      setTimeout(() => {
        autoScrollToBottom();
      }, 50);

      const cleanup = window.kakarot.prep.chatStreamStart(
        { message: userMessage },
        chatConversation || undefined,
        {
          onChunk: (chunk: string) => {
            if (isStreamingThinking) {
              const thinkingDuration = thinkingTimer.stop();
              console.log(`Thinking phase complete: ${thinkingDuration}ms`);
              setIsStreamingThinking(false);
            }
            setStreamingText(prev => prev + chunk);
            autoScrollToBottom();
          },
          onStart: (_metadata: { conversationId: string; meetingReferences: { meetingId: string; title: string; date: string }[] }) => {
            // Metadata received
          },
          onEnd: (response: PrepChatResponse) => {
            const finalDuration = thinkingTimer.elapsedMs;
            if (thinkingTimer.isRunning) {
              thinkingTimer.stop();
            }

            if (response.conversation && finalDuration > 0) {
              const lastMessage = response.conversation.messages[response.conversation.messages.length - 1];
              if (lastMessage && lastMessage.role === 'assistant') {
                lastMessage.thinkingDuration = finalDuration;
                lastMessage.thinking = `Processing your question and analyzing context (${Math.round(finalDuration / 1000)}s)`;
              }
            }

            // Replace the full branch prompt with the clean display message
            if (response.conversation && response.conversation.messages.length >= 2) {
              const userMessageIndex = response.conversation.messages.length - 2;
              const userMessage = response.conversation.messages[userMessageIndex];
              if (userMessage && userMessage.role === 'user') {
                userMessage.content = displayMessage;
              }
            }

            setChatConversation(response.conversation || null);
            if (response.conversation) saveConversationToHistory(response.conversation);
            setStreamingText('');
            setStreamingThinking('');
            setIsStreamingThinking(false);
            setStreamingMessageId(null);
            setIsChatLoading(false);
            chatInputRef.current?.focus();
          },
          onError: (error: string) => {
            thinkingTimer.stop();
            setGeneratingError(error);
            setStreamingText('');
            setStreamingThinking('');
            setIsStreamingThinking(false);
            setStreamingMessageId(null);
            setIsChatLoading(false);
            chatInputRef.current?.focus();
          },
        }
      );

      streamCleanupRef.current = cleanup;
    } catch (error) {
      thinkingTimer.stop();
      setGeneratingError(error instanceof Error ? error.message : 'Failed to get response');
      console.error('Chat failed:', error);
      setIsChatLoading(false);
      chatInputRef.current?.focus();
    }
  }, [chatConversation, isChatLoading, autoScrollToBottom, thinkingTimer, isStreamingThinking]);

  // Handle Enter key in chat input
  const handleChatKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  }, [handleChatSend]);

  const filteredPeople = useMemo(() => {
    if (!searchQuery.trim()) return people;
    const query = searchQuery.toLowerCase();
    return people.filter(
      (p) =>
        p.name?.toLowerCase().includes(query) ||
        p.email.toLowerCase().includes(query) ||
        p.organization?.toLowerCase().includes(query)
    );
  }, [people, searchQuery]);

  const getDisplayName = (person: Person): string => {
    if (person.name && person.name.trim()) return person.name;
    const localPart = person.email.split('@')[0];
    const nameParts = localPart.split(/[._-]/).filter((part) => part.length > 0);
    return nameParts
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  };

  const getAvatarColor = (email: string) => {
    const colors = [
      'bg-blue-500',
      'bg-[#F0EBE3]',
      'bg-[#4ea8dd]',
      'bg-pink-500',
      'bg-[#4ea8dd]',
      'bg-yellow-500',
      'bg-red-500',
      'bg-teal-500',
    ];
    const hash = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  const getInitials = (person: Person) => {
    const displayName = getDisplayName(person);
    const nameParts = displayName.split(' ');
    if (nameParts.length >= 2) {
      return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  };

  const formatLastMeeting = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const togglePerson = (person: Person) => {
    const exists = selectedPeople.some((p) => p.email === person.email);
    setSelectedPeople((prev) =>
      exists ? prev.filter((p) => p.email !== person.email) : [...prev, person]
    );
    setSearchQuery('');
  };

  const handleGenerateBriefing = async () => {
    if (!selectedObjectiveId || selectedPeople.length === 0) {
      setGeneratingError('Please pick at least one participant and a meeting objective');
      return;
    }

    setIsGenerating(true);
    setGeneratingError(null);
    setBriefingResult(null);
    setDynamicPrepResult(null);

    try {
      const payload = {
        meeting: {
          meeting_type: selectedObjectiveLabel,
          objective: selectedObjectiveLabel,
        },
        participants: selectedPeople.map((person) => ({
          name: getDisplayName(person),
          email: person.email,
          company: person.organization || null,
          domain: person.email?.split('@')[1] || null,
        })),
      };

      if (useDynamicPrep) {
        // Use new dynamic prep API (signal-driven, role-agnostic)
        const result = await window.kakarot.prep.generateDynamic(payload);
        setDynamicPrepResult(result);
      } else {
        // Use enhanced briefing API (legacy)
        const result = await window.kakarot.prep.generateEnhancedBriefing(payload);
        setBriefingResult(result);
      }

      // Update usage tracking
      await updateObjectiveUsage(selectedObjectiveId);
    } catch (error) {
      setGeneratingError(error instanceof Error ? error.message : 'Failed to generate briefing');
      console.error('Failed to generate briefing:', error);
    } finally {
      setIsGenerating(false);
    }
  };


  const renderParticipantSelection = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
      <div className="relative bg-[#0C0C0C] border border-[#4ea8dd]/40 rounded-2xl p-5 shadow-[0_10px_50px_rgba(105,117,101,0.25)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <p className="text-sm text-[#4ea8dd] uppercase tracking-wide">Select Participants</p>
            <h3 className="text-xl font-semibold text-white">Who are you meeting?</h3>
          </div>
          <Sparkles className="w-5 h-5 text-[#4ea8dd]" />
        </div>

        <div className="flex flex-wrap gap-2 mb-3 min-h-[36px] flex-shrink-0">
          {selectedPeople.length === 0 && (
            <span className="text-sm text-slate-400">No participants selected yet</span>
          )}
          {selectedPeople.map((person) => (
            <button
              key={person.email}
              onClick={() => togglePerson(person)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-[#4ea8dd]/40 text-sm text-white hover:bg-[#4ea8dd]/30 transition"
            >
              <span className={`w-6 h-6 rounded-full ${getAvatarColor(person.email)} flex items-center justify-center text-white text-xs font-semibold`}>
                {getInitials(person)}
              </span>
              <span>{getDisplayName(person)}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>

        <div className="relative mb-4 flex-shrink-0">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1E1E1E] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4ea8dd]/60"
          />
          {searchQuery && filteredPeople.length > 0 && (
            <div className="absolute z-10 mt-2 w-full max-h-60 overflow-y-auto bg-[#0C0C0C] border border-white/10 rounded-xl shadow-2xl">
              {filteredPeople.slice(0, 8).map((person) => {
                const isSelected = selectedPeople.some((p) => p.email === person.email);
                return (
                  <button
                    key={person.email}
                    onClick={() => togglePerson(person)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/5 last:border-none transition ${
                      isSelected
                        ? 'bg-[#4ea8dd]/20'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    <span className={`w-8 h-8 rounded-full ${getAvatarColor(person.email)} flex items-center justify-center text-white text-sm font-semibold`}>
                      {getInitials(person)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{getDisplayName(person)}</p>
                      <p className="text-xs text-slate-400 truncate">{person.email}</p>
                    </div>
                    {isSelected && (
                      <span className="text-xs text-[#4ea8dd]">Selected</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-sm text-slate-400 mb-3 flex-shrink-0">Branches 🌱</p>
          <div className="grid grid-cols-2 gap-3 flex-1 overflow-y-auto pr-1">
            {branches.map((branch) => (
              <button
                key={branch.id}
                onClick={() => {
                  setSelectedBranch(branch);
                  setShowBranchModal(true);
                }}
                className="flex flex-col bg-white/5 hover:bg-white/10 border border-white/5 hover:border-[#4ea8dd]/50 rounded-xl transition-all p-3 text-left group"
              >
                <p className="text-sm text-white font-medium">{branch.name} 🌱</p>
                <p className="text-xs text-slate-400 mt-1 leading-snug">{branch.description}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Meeting Objective Selection */}
      <div className="bg-[#0C0C0C] border border-[#4ea8dd]/40 rounded-2xl p-5 shadow-[0_10px_50px_rgba(105,117,101,0.25)] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <p className="text-sm text-[#4ea8dd] uppercase tracking-wide">Meeting Objective</p>
            <h3 className="text-xl font-semibold text-white">What's the meeting about?</h3>
          </div>
          <Sparkles className="w-5 h-5 text-[#4ea8dd]" />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {sortedObjectives.map((objective) => {
            const Icon = objective.icon;
            const isActive = selectedObjectiveId === objective.id;
            return (
              <div
                key={objective.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition ${
                  isActive
                    ? 'border-[#4ea8dd] bg-[#4ea8dd]/20 shadow-[0_10px_30px_rgba(105,117,101,0.35)] border'
                    : 'bg-white/5 hover:bg-white/10 border border-white/5'
                }`}
              >
                <button
                  onClick={() => setSelectedObjectiveId(objective.id)}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <span className="p-2 rounded-lg bg-white/10 flex-shrink-0">
                    <Icon className="w-4 h-4 text-[#4ea8dd]" />
                  </span>
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-sm text-white block truncate">{objective.label}</span>
                    <div className="flex items-center gap-2">
                      {objective.isCustom && (
                        <span className="text-xs text-[#4ea8dd]">Custom</span>
                      )}
                      {objective.isModified && !objective.isCustom && (
                        <span className="text-xs text-amber-400">Modified</span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => handleEditObjective(objective.id, objective.isCustom, e)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
                  title="Edit objective"
                >
                  <Edit className="w-4 h-4 text-slate-400 hover:text-[#4ea8dd]" />
                </button>
              </div>
            );
          })}
        </div>

        <button
          onClick={openCreateModal}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:border-[#4ea8dd]/60 transition mt-4 flex-shrink-0"
        >
          <Plus className="w-4 h-4 text-[#4ea8dd]" />
          <span className="text-sm text-white">Add Custom Meeting Objective</span>
        </button>
      </div>
    </div>
  );

  // Helper to get timeline event icon
  const getTimelineIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'meeting': return <Calendar className="w-3.5 h-3.5" />;
      case 'email': return <Mail className="w-3.5 h-3.5" />;
      case 'note': return <MessageSquare className="w-3.5 h-3.5" />;
      case 'deal_update': return <TrendingUp className="w-3.5 h-3.5" />;
      case 'call': return <Users className="w-3.5 h-3.5" />;
      default: return <Clock className="w-3.5 h-3.5" />;
    }
  };

  // Helper to get timeline source color
  const getSourceColor = (source: TimelineEvent['source']) => {
    switch (source) {
      case 'Meeting Notes': return 'bg-[#4ea8dd]/20 text-[#3d96cb] dark:bg-[#4ea8dd]/30 dark:text-[#4ea8dd]';
      case 'HubSpot': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
      case 'Salesforce': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Email': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-[#F0EBE3]';
      default: return 'bg-[#161616] text-gray-700 dark:bg-[#2A2A2A]/30 dark:text-gray-300';
    }
  };

  // Helper to format relative date
  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Handle insight feedback for learning
  const handleInsightFeedback = useCallback(async (
    insightId: string,
    insightCategory: string,
    feedback: 'useful' | 'not_useful' | 'dismissed',
    participantEmail?: string
  ) => {
    try {
      await window.kakarot.prep.recordFeedback({
        insightId,
        insightCategory,
        feedback,
        participantEmail,
      });
      toast.success(feedback === 'useful' ? 'Thanks for the feedback!' : 'Got it, we\'ll adjust');
    } catch (error) {
      console.error('Failed to record feedback:', error);
    }
  }, []);

  // Get insight category color
  const getInsightCategoryColor = (category: string) => {
    switch (category) {
      case 'heads_up': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'pending_action': return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
      case 'risk': return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'deal': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'context': return 'bg-[#2A2A2A]/20 text-slate-300 border-slate-500/30';
      default: return 'bg-[#4ea8dd]/20 text-[#4ea8dd] border-[#4ea8dd]/30';
    }
  };

  // Get insight category icon
  const getInsightCategoryIcon = (category: string) => {
    switch (category) {
      case 'heads_up': return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'pending_action': return <ListChecks className="w-3.5 h-3.5" />;
      case 'risk': return <AlertCircle className="w-3.5 h-3.5" />;
      case 'deal': return <DollarSign className="w-3.5 h-3.5" />;
      case 'context': return <Info className="w-3.5 h-3.5" />;
      default: return <Lightbulb className="w-3.5 h-3.5" />;
    }
  };

  // DynamicBriefCard component - extracted to properly use React hooks
  const DynamicBriefCard = React.memo(({ participant, onFeedback }: {
    participant: DynamicPrepParticipant;
    onFeedback: (insightId: string, category: string, feedback: 'useful' | 'not_useful' | 'dismissed', email?: string) => void;
  }) => {
    const { brief } = participant;
    const [expanded, setExpanded] = useState(true);

    // Group insights by category
    const groupedInsights = useMemo(() => {
      return brief.insights.reduce((acc, insight) => {
        if (!acc[insight.category]) acc[insight.category] = [];
        acc[insight.category].push(insight);
        return acc;
      }, {} as Record<string, PrepInsight[]>);
    }, [brief.insights]);

    return (
      <div className="bg-gradient-to-r from-[#4ea8dd]/10 to-[#3d96cb]/10 rounded-xl p-4 mb-4 border border-[#4ea8dd]/30">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full"
        >
          <h4 className="text-sm font-semibold text-[#4ea8dd] uppercase tracking-wide flex items-center gap-2">
            <Zap className="w-4 h-4" />
            30-Second Brief
          </h4>
          <ChevronDown className={`w-4 h-4 text-[#4ea8dd] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            {/* Headline */}
            <p className="text-white font-medium">{brief.headline}</p>

            {/* Dynamic sections - only render if insights exist */}
            {groupedInsights['heads_up'] && (
              <div>
                <p className="text-xs text-yellow-400 uppercase mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Heads Up
                </p>
                <ul className="text-sm text-yellow-200 space-y-1">
                  {groupedInsights['heads_up'].map((insight) => (
                    <li key={insight.id} className="flex items-start justify-between gap-2">
                      <span className="flex items-start gap-2">
                        <AlertCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                        {insight.content}
                      </span>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => onFeedback(insight.id, insight.category, 'useful', participant.email || undefined)}
                          className="p-1 hover:bg-white/10 rounded"
                          title="Useful"
                        >
                          <ThumbsUp className="w-3 h-3 text-slate-400 hover:text-[#F0EBE3]" />
                        </button>
                        <button
                          onClick={() => onFeedback(insight.id, insight.category, 'not_useful', participant.email || undefined)}
                          className="p-1 hover:bg-white/10 rounded"
                          title="Not useful"
                        >
                          <ThumbsDown className="w-3 h-3 text-slate-400 hover:text-red-400" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {groupedInsights['pending_action'] && (
              <div>
                <p className="text-xs text-orange-400 uppercase mb-1 flex items-center gap-1">
                  <ListChecks className="w-3 h-3" />
                  Pending Actions
                </p>
                <ul className="text-sm text-orange-200 space-y-1">
                  {groupedInsights['pending_action'].map((insight) => (
                    <li key={insight.id} className="flex items-start gap-2">
                      <Target className="w-3 h-3 mt-1 flex-shrink-0" />
                      {insight.content}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {groupedInsights['deal'] && (
              <div>
                <p className="text-xs text-blue-400 uppercase mb-1 flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  Deal Context
                </p>
                <ul className="text-sm text-blue-200 space-y-1">
                  {groupedInsights['deal'].map((insight) => (
                    <li key={insight.id} className="flex items-start gap-2">
                      <TrendingUp className="w-3 h-3 mt-1 flex-shrink-0" />
                      {insight.content}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggested Actions */}
            {brief.suggestedActions.length > 0 && (
              <div className="pt-2 border-t border-white/10">
                <p className="text-xs text-[#F0EBE3] uppercase mb-1">Your Moves</p>
                <ul className="text-sm text-green-200 space-y-1">
                  {brief.suggestedActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Target className="w-3 h-3 mt-1 flex-shrink-0" />
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Bottom Line */}
            <div className="pt-2 border-t border-white/10">
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-[#4ea8dd]">Bottom Line: </span>
                {brief.bottomLine}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  });

  // SynthesisSection component - displays cross-participant analysis for multi-person prep
  const SynthesisSection: React.FC<{ synthesis: MeetingSynthesis }> = ({ synthesis }) => (
    <div className="mt-6 p-4 bg-[#4ea8dd]/10 rounded-xl border border-[#4ea8dd]/20">
      <h3 className="text-sm font-semibold text-[#4ea8dd] mb-4 flex items-center gap-2">
        <Sparkles className="w-4 h-4" />
        Meeting Synthesis
      </h3>

      {/* Likely Meeting Topics */}
      {synthesis.likelyTopics.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs text-slate-400 uppercase mb-2 tracking-wide">Likely Topics</h4>
          <div className="space-y-2">
            {synthesis.likelyTopics.map((topic, i) => (
              <div key={i} className="pl-3 border-l-2 border-[#4ea8dd]/40">
                <p className="text-sm text-slate-200 font-medium">{topic.topic}</p>
                <p className="text-xs text-slate-400 mt-1">{topic.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connecting Threads */}
      {synthesis.connectingThreads.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs text-slate-400 uppercase mb-2 tracking-wide">Connecting Threads</h4>
          <ul className="text-sm text-slate-300 space-y-1">
            {synthesis.connectingThreads.map((thread, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#4ea8dd] mt-0.5">•</span>
                <span>{thread}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Forward-Looking Actions */}
      {synthesis.forwardActions.length > 0 && (
        <div>
          <h4 className="text-xs text-slate-400 uppercase mb-2 tracking-wide">Preparation Points</h4>
          <ul className="text-sm text-slate-300 space-y-1">
            {synthesis.forwardActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#4ea8dd]">→</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Relationship Type Indicator */}
      <div className="mt-4 pt-3 border-t border-[#4ea8dd]/20">
        <span className="text-xs text-slate-500">
          Relationship: <span className="text-[#4ea8dd] capitalize">{synthesis.relationshipType.replace('-', ' ')}</span>
        </span>
      </div>
    </div>
  );

  // Render participant card with new 3-block structure
  const renderParticipantCard = (participant: EnhancedPrepParticipant, idx: number) => (
    <div key={idx} className="bg-[#0C0C0C] border border-[#4ea8dd]/30 rounded-2xl overflow-hidden">
      {/* Header with Last Seen Context */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-lg font-semibold text-white">{participant.name}</h4>
            {participant.email && (
              <p className="text-sm text-slate-400">{participant.email}</p>
            )}
          </div>
          {/* Confidence Badge with Source Attribution */}
          <div className="relative group">
            <div className={`text-xs px-3 py-1.5 rounded-full cursor-help ${
              participant.confidence.score >= 70
                ? 'bg-[#F0EBE3]/20 text-[#F0EBE3] border border-[#F0EBE3]/30'
                : participant.confidence.score >= 40
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                : 'bg-[#2A2A2A]/50 text-slate-400 border border-slate-600'
            }`}>
              {participant.confidence.score}% confidence
            </div>
            {/* Tooltip with source breakdown */}
            <div className="absolute right-0 top-full mt-2 w-48 p-3 bg-[#1E1E1E] border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <p className="text-xs text-slate-300 mb-2">{participant.confidence.explanation}</p>
              <div className="space-y-1 text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>Meetings:</span>
                  <span className="text-white">{participant.confidence.sources.meetings}</span>
                </div>
                <div className="flex justify-between">
                  <span>Emails:</span>
                  <span className="text-white">{participant.confidence.sources.emails}</span>
                </div>
                <div className="flex justify-between">
                  <span>CRM Notes:</span>
                  <span className="text-white">{participant.confidence.sources.crmNotes}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Last Seen Context */}
        {participant.lastSeen && (
          <div className="mt-3 p-3 bg-[#4ea8dd]/10 rounded-lg border border-[#4ea8dd]/20">
            <p className="text-sm text-[#4ea8dd]">
              <Clock className="w-3.5 h-3.5 inline mr-1.5" />
              We last spoke <span className="font-semibold">{participant.lastSeen.daysAgo} days ago</span> about "{participant.lastSeen.topic}"
              <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                participant.lastSeen.sentiment === 'Positive' ? 'bg-[#F0EBE3]/20 text-[#F0EBE3]' :
                participant.lastSeen.sentiment === 'Tense' ? 'bg-red-500/20 text-red-300' :
                'bg-[#2A2A2A]/50 text-slate-300'
              }`}>
                {participant.lastSeen.sentiment}
              </span>
            </p>
          </div>
        )}

        {/* First Meeting Notice */}
        {participant.isFirstMeeting && (
          <div className="mt-3 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <p className="text-sm text-amber-300">First meeting with {participant.name}</p>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleLinkedInClick}
                className="text-xs px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg hover:bg-blue-500/30 transition flex items-center gap-1.5"
              >
                <Linkedin className="w-3 h-3" />
                LinkedIn
              </button>
              {participant.email && (
                <button
                  onClick={() => handleFetchCompanyInfo(participant.email!)}
                  disabled={fetchingCompanyInfo === participant.email}
                  className="text-xs px-3 py-1.5 bg-[#F0EBE3]/20 text-[#F0EBE3] rounded-lg hover:bg-[#F0EBE3]/30 transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Building2 className="w-3 h-3" />
                  {fetchingCompanyInfo === participant.email ? 'Fetching...' : 'Company Info'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Block A: The "Who" (Participant Intel) - Only render if there's meaningful data */}
      {(participant.intel.persona || participant.intel.crmRole || participant.intel.personalFacts.length > 0 || participant.intel.recentActivity.length > 0) && (
        <div className="p-5 border-b border-white/10">
          <h5 className="text-sm font-semibold text-[#4ea8dd] uppercase tracking-wide mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            Participant Intel
          </h5>
          <div className="space-y-2">
            {participant.intel.persona && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-slate-500 w-24 flex-shrink-0">Persona</span>
                <span className={`text-xs px-2 py-1 rounded ${
                  participant.intel.persona === 'Technical' ? 'bg-blue-500/20 text-blue-300' :
                  participant.intel.persona === 'Executive' ? 'bg-[#4ea8dd]/20 text-[#4ea8dd]' :
                  participant.intel.persona === 'Skeptic' ? 'bg-red-500/20 text-red-300' :
                  participant.intel.persona === 'Champion' ? 'bg-[#F0EBE3]/20 text-[#F0EBE3]' :
                  'bg-[#2A2A2A]/50 text-slate-300'
                }`}>
                  {participant.intel.persona}
                </span>
              </div>
            )}
            {participant.intel.crmRole && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-slate-500 w-24 flex-shrink-0">CRM Role</span>
                <span className="text-sm text-white">{participant.intel.crmRole}</span>
              </div>
            )}
            {participant.intel.personalFacts.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-slate-500 w-24 flex-shrink-0">Personal</span>
                <span className="text-sm text-slate-300">{participant.intel.personalFacts.join(' • ')}</span>
              </div>
            )}
            {participant.intel.recentActivity.length > 0 && (
              <div className="flex items-start gap-3">
                <span className="text-xs text-slate-500 w-24 flex-shrink-0">Activity</span>
                <div className="space-y-1">
                  {participant.intel.recentActivity.map((activity, i) => (
                    <p key={i} className="text-sm text-slate-300">{activity}</p>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CRM Snapshot - Only render if there's meaningful CRM data (deal name, value, or stage) */}
      {participant.crmSnapshot && (participant.crmSnapshot.dealName || participant.crmSnapshot.dealValue || participant.crmSnapshot.dealStage) && (
        <div className="p-5 border-b border-white/10 bg-gradient-to-r from-[#4ea8dd]/5 to-transparent">
          <h5 className="text-sm font-semibold text-[#4ea8dd] uppercase tracking-wide mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            CRM Snapshot
            <span className="text-xs font-normal normal-case text-slate-500">
              via {participant.crmSnapshot.source === 'hubspot' ? 'HubSpot' : 'Salesforce'}
            </span>
          </h5>
          <div className="flex flex-wrap gap-6">
            {participant.crmSnapshot.dealName && (
              <div>
                <p className="text-xs text-slate-500">Deal</p>
                <p className="text-sm text-white font-medium">{participant.crmSnapshot.dealName}</p>
              </div>
            )}
            {participant.crmSnapshot.dealValue && (
              <div>
                <p className="text-xs text-slate-500">Value</p>
                <p className="text-sm text-white font-medium">
                  ${participant.crmSnapshot.dealValue.toLocaleString()}
                </p>
              </div>
            )}
            {participant.crmSnapshot.dealStage && (
              <div>
                <p className="text-xs text-slate-500">Stage</p>
                <p className="text-sm text-[#4ea8dd] font-medium">{participant.crmSnapshot.dealStage}</p>
              </div>
            )}
          </div>
          {participant.crmSnapshot.blockers && participant.crmSnapshot.blockers.length > 0 && (
            <div className="mt-3 p-2 bg-red-500/10 rounded border border-red-500/20">
              <p className="text-xs text-red-300">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                Blockers: {participant.crmSnapshot.blockers.join(', ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Block B: The "History" (Action Items) */}
      {participant.actionItems.length > 0 && (
        <div className="p-5 border-b border-white/10">
          <h5 className="text-sm font-semibold text-[#4ea8dd] uppercase tracking-wide mb-3 flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            Action Items
          </h5>
          <div className="space-y-2">
            {participant.actionItems.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-start gap-3 group">
                <input
                  type="checkbox"
                  checked={completedActionItems.has(item.id) || item.completed}
                  onChange={() => handleToggleActionItem(item.id)}
                  className="mt-1 rounded border-slate-600 bg-[#1E1E1E] text-[#4ea8dd] focus:ring-[#4ea8dd] focus:ring-offset-0"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${
                    completedActionItems.has(item.id) || item.completed
                      ? 'line-through text-slate-500'
                      : 'text-slate-300'
                  }`}>
                    {item.description}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs mr-2 ${
                      item.assignedTo === 'them' ? 'bg-orange-500/20 text-orange-300' : 'bg-blue-500/20 text-blue-300'
                    }`}>
                      {item.assignedTo === 'them' ? 'Their action' : 'Our action'}
                    </span>
                    {formatRelativeDate(item.meetingDate)} • {item.meetingTitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unresolved Threads */}
      {participant.unresolvedThreads.length > 0 && (
        <div className="p-5 border-b border-white/10 bg-amber-500/5">
          <h5 className="text-sm font-semibold text-amber-400 uppercase tracking-wide mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Unresolved Threads
          </h5>
          <div className="space-y-2">
            {participant.unresolvedThreads.map((thread) => (
              <div key={thread.id} className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <p className="text-sm text-amber-200">{thread.description}</p>
                <p className="text-xs text-amber-400/70 mt-1">
                  From {thread.originMeetingTitle} • {formatRelativeDate(thread.originMeetingDate)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Block C: Timeline */}
      {participant.timeline.length > 0 && (
        <div className="p-5">
          <h5 className="text-sm font-semibold text-[#4ea8dd] uppercase tracking-wide mb-3 flex items-center gap-2">
            <History className="w-4 h-4" />
            Timeline
          </h5>
          <div className="space-y-3">
            {participant.timeline.slice(0, 8).map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#1E1E1E] flex items-center justify-center text-slate-400">
                  {getTimelineIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500">{formatRelativeDate(event.date)}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getSourceColor(event.source)}`}>
                      {event.source}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300 mt-0.5">{event.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Company Info (fetched separately) */}
      {participant.email && companyInfoCache[participant.email] && (
        <div className="p-5 border-t border-white/10 bg-blue-500/5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-blue-300">
                {companyInfoCache[participant.email]!.name || companyInfoCache[participant.email]!.domain}
              </p>
              {companyInfoCache[participant.email]!.description && (
                <p className="text-xs text-blue-400/70 mt-1 line-clamp-2">
                  {companyInfoCache[participant.email]!.description}
                </p>
              )}
            </div>
            <a
              href={companyInfoCache[participant.email]!.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      )}
    </div>
  );

  // Render Conversational Prep Result (Granola-style)
  if (conversationalResult) {
    return (
      <div className="h-[calc(100vh-200px)] flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
          <div>
            <h1 className="text-2xl font-semibold text-white mb-1 flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#4ea8dd]" />
              Meeting Prep: {conversationalResult.participant.name}
            </h1>
            <p className="text-sm text-slate-400">
              {conversationalResult.participant.headline}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded ${
              conversationalResult.participant.dataQuality === 'rich' ? 'bg-[#F0EBE3]/20 text-[#F0EBE3]' :
              conversationalResult.participant.dataQuality === 'moderate' ? 'bg-yellow-500/20 text-yellow-300' :
              'bg-[#2A2A2A]/20 text-slate-300'
            }`}>
              {conversationalResult.participant.meetingCount} meetings analyzed
            </span>
            <button
              onClick={() => {
                setConversationalResult(null);
                setQuickPrepQuery('');
              }}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-[#2A2A2A] rounded-lg transition-colors border border-slate-600"
            >
              Prep Another
            </button>
          </div>
        </div>

        {/* Markdown Brief */}
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="bg-[#0C0C0C] border border-[#4ea8dd]/30 rounded-2xl p-6">
            <div className="prose prose-invert prose-sm max-w-none">
              {/* Render markdown as formatted content */}
              {conversationalResult.markdownBrief.split('\n').map((line, idx) => {
                // H2 headers
                if (line.startsWith('## ')) {
                  return (
                    <h2 key={idx} className="text-lg font-semibold text-[#4ea8dd] mt-6 mb-3 first:mt-0 flex items-center gap-2">
                      {line.startsWith('## Key Active') && <Target className="w-4 h-4" />}
                      {line.startsWith('## Quick Questions') && <MessageSquare className="w-4 h-4" />}
                      {line.startsWith('## Their Key') && <User className="w-4 h-4" />}
                      {line.startsWith('## Action Item') && <ListChecks className="w-4 h-4" />}
                      {line.replace('## ', '')}
                    </h2>
                  );
                }
                // Bold headers (project names)
                if (line.startsWith('**') && line.endsWith('**')) {
                  return (
                    <h3 key={idx} className="text-base font-semibold text-white mt-4 mb-2">
                      {line.replace(/\*\*/g, '')}
                    </h3>
                  );
                }
                // Waiting on them / You owe them headers
                if (line.startsWith('**Waiting on Them:') || line.startsWith('**You Owe Them:')) {
                  const isWaiting = line.includes('Waiting');
                  return (
                    <h4 key={idx} className={`text-sm font-semibold mt-4 mb-2 ${isWaiting ? 'text-orange-400' : 'text-blue-400'}`}>
                      {line.replace(/\*\*/g, '')}
                    </h4>
                  );
                }
                // Bullet points
                if (line.startsWith('- ')) {
                  // Extract citation if present
                  const citationMatch = line.match(/\[(?:from|context|since|committed):\s*([^\]]+)\]/i);
                  const mainContent = line.replace(/\[(?:from|context|since|committed):\s*[^\]]+\]/gi, '').replace('- ', '');
                  return (
                    <div key={idx} className="flex items-start gap-2 my-1.5 text-slate-300">
                      <span className="text-[#4ea8dd] mt-1">•</span>
                      <span>
                        {mainContent}
                        {citationMatch && (
                          <span className="text-xs text-slate-500 ml-1">
                            [{citationMatch[1]}]
                          </span>
                        )}
                      </span>
                    </div>
                  );
                }
                // Empty lines
                if (!line.trim()) {
                  return <div key={idx} className="h-2" />;
                }
                // Regular text
                return <p key={idx} className="text-slate-300 my-1">{line}</p>;
              })}
            </div>
          </div>
        </div>

        {/* Footer with timing */}
        <div className="mt-4 text-xs text-slate-500 text-right">
          Generated in {conversationalResult.processingTimeMs}ms
        </div>
      </div>
    );
  }

  // Render Dynamic Prep Result (new signal-driven approach)
  if (dynamicPrepResult) {
    return (
      <div className="h-[calc(100vh-200px)] flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
          <div>
            <h1 className="text-2xl font-semibold text-white mb-1">
              {dynamicPrepResult.meeting.inferred ? (
                <span className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-[#4ea8dd]" />
                  {dynamicPrepResult.meeting.objective || 'Meeting Prep'}
                </span>
              ) : (
                dynamicPrepResult.meeting.objective || 'Meeting Prep'
              )}
            </h1>
            <p className="text-sm text-slate-400">
              {dynamicPrepResult.participants.map((p, idx) => (
                <span key={idx}>
                  {p.name}
                  {idx < dynamicPrepResult.participants.length - 1 && ', '}
                </span>
              ))}
              {dynamicPrepResult.meeting.inferred && (
                <span className="ml-2 text-xs text-[#4ea8dd]">(AI inferred objective)</span>
              )}
            </p>
          </div>
          <button
            onClick={() => {
              setDynamicPrepResult(null);
              setSelectedObjectiveId('');
              setSelectedPeople([]);
              setCompletedActionItems(new Set());
            }}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-[#2A2A2A] rounded-lg transition-colors border border-slate-600"
          >
            Generate Another
          </button>
        </div>

        {/* Dynamic Participant Cards */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {dynamicPrepResult.participants.map((participant, idx) => (
            <div key={idx} className="bg-[#0C0C0C] border border-[#4ea8dd]/30 rounded-2xl overflow-hidden">
              {/* Participant Header */}
              <div className="p-5 border-b border-white/10">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-lg font-semibold text-white">{participant.name}</h4>
                    {participant.email && (
                      <p className="text-sm text-slate-400">{participant.email}</p>
                    )}
                  </div>
                  {/* Priority Score Badge */}
                  <div className={`text-xs px-3 py-1.5 rounded-full ${
                    participant.computedPriority >= 70
                      ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                      : participant.computedPriority >= 40
                      ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                      : 'bg-[#F0EBE3]/20 text-[#F0EBE3] border border-[#F0EBE3]/30'
                  }`}>
                    Priority: {participant.computedPriority}
                  </div>
                </div>
              </div>

              {/* 30-Second Brief Card */}
              <div className="p-5">
                <DynamicBriefCard
                  participant={participant}
                  onFeedback={handleInsightFeedback}
                />

                {/* Pending Actions Section */}
                {participant.pendingActions && (
                  (participant.pendingActions.theyOweUs.length > 0 || participant.pendingActions.weOweThem.length > 0) && (
                    <div className="mt-4 space-y-3">
                      {participant.pendingActions.theyOweUs.length > 0 && (
                        <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                          <p className="text-xs text-orange-400 uppercase mb-2 flex items-center gap-1">
                            <ListChecks className="w-3 h-3" />
                            Waiting On Them
                          </p>
                          <ul className="text-sm text-orange-200 space-y-1">
                            {participant.pendingActions.theyOweUs.map((item, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <Target className="w-3 h-3 mt-1 flex-shrink-0" />
                                {item.description}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {participant.pendingActions.weOweThem.length > 0 && (
                        <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                          <p className="text-xs text-blue-400 uppercase mb-2 flex items-center gap-1">
                            <ListChecks className="w-3 h-3" />
                            You Owe Them
                          </p>
                          <ul className="text-sm text-blue-200 space-y-1">
                            {participant.pendingActions.weOweThem.map((item, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <Target className="w-3 h-3 mt-1 flex-shrink-0" />
                                {item.description}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )
                )}

                {/* CRM Validations (discrepancies) */}
                {participant.crmValidations && participant.crmValidations.length > 0 && (
                  <div className="mt-4 p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                    <p className="text-xs text-amber-400 uppercase mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      CRM Discrepancies
                    </p>
                    <ul className="text-sm text-amber-200 space-y-1">
                      {participant.crmValidations.map((validation, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <AlertCircle className="w-3 h-3 mt-1 flex-shrink-0" />
                          {validation.discrepancyNote}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Signal Scores Debug (collapsible) */}
                {participant.signals && participant.signals.length > 0 && (
                  <details className="mt-4 text-xs">
                    <summary className="text-slate-500 cursor-pointer hover:text-slate-400">
                      View signal scores ({participant.signals.length} signals)
                    </summary>
                    <div className="mt-2 p-2 bg-[#1E1E1E]/50 rounded space-y-1">
                      {participant.signals.map((signal, i) => (
                        <div key={i} className="flex justify-between text-slate-400">
                          <span>{signal.category} ({signal.source})</span>
                          <span className="text-white">{(signal.normalizedScore * 100).toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))}

          {/* Synthesis Section - Cross-participant analysis for multi-person prep */}
          {dynamicPrepResult.synthesis && (
            <SynthesisSection synthesis={dynamicPrepResult.synthesis} />
          )}
        </div>
      </div>
    );
  }

  // Render Enhanced Prep Result (legacy)
  if (briefingResult) {
    return (
      <div className="h-[calc(100vh-200px)] flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700">
          <div>
            <h1 className="text-2xl font-semibold text-white mb-1">
              Prep Summary: {briefingResult.meeting.type}
            </h1>
            <p className="text-sm text-slate-400">
              {briefingResult.participants.map((p, idx) => (
                <span key={idx}>
                  {p.name}
                  {idx < briefingResult.participants.length - 1 && ', '}
                </span>
              ))}
            </p>
          </div>
          <button
            onClick={() => {
              setBriefingResult(null);
              setSelectedObjectiveId('');
              setSelectedPeople([]);
              setCompletedActionItems(new Set());
            }}
            className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-[#2A2A2A] rounded-lg transition-colors border border-slate-600"
          >
            Generate Another
          </button>
        </div>

        {/* Participant Cards */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-2">
          {briefingResult.participants.map((participant, idx) => renderParticipantCard(participant, idx))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full flex flex-col text-white overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 mb-2">
        <div>
          <h1 className="text-xl font-semibold">Treeto Co-pilot</h1>
          <p className="text-slate-400">
            {prepMode === 'quick'
              ? 'Search a human. Retrieve their secrets (the professional ones).'
              : 'Pick participants and set the objective before generating your briefing.'}
          </p>
        </div>
      </div>

      {/* Omnibar Prep Mode */}
      {prepMode === 'quick' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Chat Messages */}
          {chatConversation && chatConversation.messages.length > 0 ? (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Messages Container */}
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
              >
                {chatConversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-[#4ea8dd] text-white rounded-br-md'
                          : 'bg-[#2A2A2A] text-slate-200 rounded-bl-md border border-white/5'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          {/* Thought Trace - Collapsible Reasoning */}
                          {message.thinking && (
                            <ThoughtTrace
                              thinking={message.thinking}
                              thinkingDuration={message.thinkingDuration}
                            />
                          )}
                          {/* Render markdown content */}
                          {message.content.split('\n').map((line, idx) => {
                            // H2 headers
                            if (line.startsWith('## ')) {
                              return (
                                <h2 key={idx} className="text-base font-semibold text-[#4ea8dd] mt-4 mb-2 first:mt-0">
                                  {line.replace('## ', '')}
                                </h2>
                              );
                            }
                            // Bold text (entire line)
                            if (line.startsWith('**') && line.endsWith('**')) {
                              return (
                                <p key={idx} className="font-semibold text-white mt-3 mb-1">
                                  {line.replace(/\*\*/g, '')}
                                </p>
                              );
                            }
                            // Bullet points
                            if (line.startsWith('- ')) {
                              const content = line.replace('- ', '');
                              // Handle inline bold
                              const parts = content.split(/(\*\*[^*]+\*\*)/g);
                              return (
                                <div key={idx} className="flex items-start gap-2 my-1 text-slate-300">
                                  <span className="text-[#4ea8dd] mt-0.5">•</span>
                                  <span>
                                    {parts.map((part, i) =>
                                      part.startsWith('**') && part.endsWith('**') ? (
                                        <strong key={i} className="text-white font-medium">
                                          {part.replace(/\*\*/g, '')}
                                        </strong>
                                      ) : (
                                        <span key={i}>{part}</span>
                                      )
                                    )}
                                  </span>
                                </div>
                              );
                            }
                            // Empty lines
                            if (!line.trim()) {
                              return <div key={idx} className="h-2" />;
                            }
                            // Regular text with inline bold handling
                            const parts = line.split(/(\*\*[^*]+\*\*)/g);
                            return (
                              <p key={idx} className="text-slate-300 my-1">
                                {parts.map((part, i) =>
                                  part.startsWith('**') && part.endsWith('**') ? (
                                    <strong key={i} className="text-white font-medium">
                                      {part.replace(/\*\*/g, '')}
                                    </strong>
                                  ) : (
                                    <span key={i}>{part}</span>
                                  )
                                )}
                              </p>
                            );
                          })}
                          {/* Meeting References */}
                          {message.meetingReferences && message.meetingReferences.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-white/10">
                              <p className="text-xs text-slate-500 mb-1">Sources:</p>
                              <div className="flex flex-wrap gap-1">
                                {message.meetingReferences.map((ref, idx) => (
                                  <span
                                    key={ref.meetingId}
                                    className="text-xs px-2 py-0.5 bg-white/5 rounded text-slate-400"
                                  >
                                    [{idx + 1}] {ref.title} ({ref.date})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm">{message.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {/* Streaming response or loading indicator */}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] bg-[#2A2A2A] rounded-2xl rounded-bl-md px-4 py-3 border border-white/5">
                      {/* Show thinking timer - collapses to show duration once complete */}
                      <ThoughtTrace
                        thinking={isStreamingThinking ? '' : 'Processing your question and analyzing context'}
                        thinkingDuration={thinkingTimer.elapsedMs}
                        isStreaming={isStreamingThinking}
                      />
                      {streamingText ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          {/* Render streaming markdown content */}
                          {streamingText.split('\n').map((line, idx) => {
                            // H2 headers
                            if (line.startsWith('## ')) {
                              return (
                                <h2 key={idx} className="text-base font-semibold text-[#4ea8dd] mt-4 mb-2 first:mt-0">
                                  {line.replace('## ', '')}
                                </h2>
                              );
                            }
                            // Bold text (entire line)
                            if (line.startsWith('**') && line.endsWith('**')) {
                              return (
                                <p key={idx} className="font-semibold text-white mt-3 mb-1">
                                  {line.replace(/\*\*/g, '')}
                                </p>
                              );
                            }
                            // Bullet points
                            if (line.startsWith('- ')) {
                              const content = line.replace('- ', '');
                              const parts = content.split(/(\*\*[^*]+\*\*)/g);
                              return (
                                <div key={idx} className="flex items-start gap-2 my-1 text-slate-300">
                                  <span className="text-[#4ea8dd] mt-0.5">•</span>
                                  <span>
                                    {parts.map((part, i) =>
                                      part.startsWith('**') && part.endsWith('**') ? (
                                        <strong key={i} className="text-white font-medium">
                                          {part.replace(/\*\*/g, '')}
                                        </strong>
                                      ) : (
                                        <span key={i}>{part}</span>
                                      )
                                    )}
                                  </span>
                                </div>
                              );
                            }
                            // Empty lines
                            if (!line.trim()) {
                              return <div key={idx} className="h-2" />;
                            }
                            // Regular text
                            const parts = line.split(/(\*\*[^*]+\*\*)/g);
                            return (
                              <p key={idx} className="text-slate-300 my-1">
                                {parts.map((part, i) =>
                                  part.startsWith('**') && part.endsWith('**') ? (
                                    <strong key={i} className="text-white font-medium">
                                      {part.replace(/\*\*/g, '')}
                                    </strong>
                                  ) : (
                                    <span key={i}>{part}</span>
                                  )
                                )}
                              </p>
                            );
                          })}
                          {/* Typing cursor */}
                          <span className="inline-block w-2 h-4 bg-[#4ea8dd] animate-pulse ml-0.5" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-400">
                          <div className="w-2 h-2 bg-[#4ea8dd] rounded-full animate-pulse" />
                          <div className="w-2 h-2 bg-[#4ea8dd] rounded-full animate-pulse delay-150" />
                          <div className="w-2 h-2 bg-[#4ea8dd] rounded-full animate-pulse delay-300" />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {/* Scroll anchor for Intersection Observer */}
                <div ref={scrollAnchorRef} className="h-px" />
              </div>

              {/* Chat Input Bar */}
              <div className="p-4 border-t border-white/10">
                <div className="flex items-end gap-3">
                  <button
                    onClick={handleNewConversation}
                    className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    title="New conversation"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                  <div className="flex-1 relative">
                    <textarea
                      ref={chatInputRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder="Ask a follow-up question..."
                      rows={1}
                      className="w-full px-4 py-3 bg-[#0C0C0C] border border-white/10 rounded-xl text-white placeholder:text-slate-500 focus:border-[#4ea8dd]/50 focus:outline-none resize-none"
                      style={{ minHeight: '48px', maxHeight: '120px' }}
                    />
                  </div>
                  <button
                    onClick={handleChatSend}
                    disabled={isChatLoading || !chatInput.trim()}
                    className="p-2.5 bg-[#4ea8dd] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#3d8bb8] transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Empty State - Omnibar */
            <div className="flex-1 flex flex-col items-center justify-start pt-4 px-4">
              {/* Main Omnibar Input */}
              <div className="w-full max-w-2xl">
                <div className="relative">
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Hey, I have a meeting with..."
                    rows={2}
                    className="w-full px-5 py-4 bg-[#0C0C0C] border border-white/10 rounded-2xl text-white text-lg placeholder:text-slate-500 focus:border-[#4ea8dd]/50 focus:outline-none resize-none pr-16"
                    autoFocus
                  />
                  <button
                    onClick={handleChatSend}
                    disabled={isChatLoading || !chatInput.trim()}
                    className="absolute right-3 bottom-3 p-2.5 bg-[#4ea8dd] text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#3d8bb8] transition-colors"
                  >
                    {isChatLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>

                {/* Error Message */}
                {generatingError && (
                  <div className="mt-4">
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                      <p className="text-red-300">{generatingError}</p>
                    </div>
                  </div>
                )}

                {/* Ask Treeto */}
                <div className="mt-4">
                  <div className="flex items-center gap-2 text-slate-500 text-sm mb-3">
                    <Lightbulb className="w-4 h-4" />
                    <span>Try asking</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      'Help me prep for my meeting with',
                      'What did we discuss with',
                      'Any open items with',
                      'Search meetings about',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setChatInput(suggestion + ' ');
                          chatInputRef.current?.focus();
                        }}
                        className="px-3 py-2 bg-[#0C0C0C] border border-white/10 rounded-lg text-sm text-slate-400 hover:border-[#4ea8dd]/50 hover:text-[#4ea8dd] transition-colors text-left"
                      >
                        {suggestion}...
                      </button>
                    ))}
                  </div>
                </div>

                {/* Branches */}
                {branches.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <p className="text-xl font-semibold text-white mb-1">Branches</p>
                    <p className="text-sm text-slate-400 mb-3">Pre-perfected prompt that allows you to retrieve data that's Rooted in your transcripts</p>
                    <div className="grid grid-cols-4 gap-3">
                      {branches.map((branch) => (
                        <button
                          key={branch.id}
                          onClick={() => {
                            setSelectedBranch(branch);
                            setShowBranchModal(true);
                          }}
                          className="flex flex-col bg-[#0C0C0C] border border-white/10 hover:border-[#4ea8dd]/50 rounded-xl transition-all p-3 text-left group"
                        >
                          <p className="text-sm text-slate-300 group-hover:text-white font-medium transition-colors">{branch.name} 🌱</p>
                          <p className="text-xs text-slate-500 mt-1 leading-snug">{branch.description}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Previous Chats */}
                {chatHistory.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <button
                      onClick={() => setShowPreviousChats((v) => !v)}
                      className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors mb-3"
                    >
                      <History className="w-4 h-4" />
                      <span>Previous Chats</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${showPreviousChats ? 'rotate-180' : ''}`} />
                    </button>
                    {showPreviousChats && (
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                        {chatHistory.map((conv) => {
                          const firstUserMsg = conv.messages.find((m) => m.role === 'user');
                          const title = firstUserMsg?.content.replace(/^🌱\s*/, '').trim() || 'Untitled';
                          const date = new Date(conv.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                          return (
                            <button
                              key={conv.id}
                              onClick={() => {
                                setChatConversation(conv);
                                setShowPreviousChats(false);
                              }}
                              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left group"
                            >
                              <span className="text-sm text-slate-300 group-hover:text-white truncate flex-1 transition-colors">{title}</span>
                              <span className="text-xs text-slate-500 ml-3 flex-shrink-0">{date}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Prep Mode */}
      {prepMode === 'advanced' && (
        <>
          <div className="flex-1 min-h-0">
            {renderParticipantSelection()}
          </div>

          <div className="mt-3 bg-[#0C0C0C] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-[#4ea8dd]/20 text-[#4ea8dd]">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Summary</p>
                <p className="text-sm text-white">
                  {selectedPeople.length} participant{selectedPeople.length === 1 ? '' : 's'} · {selectedObjectiveLabel || 'No objective yet'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Prep Mode Toggle */}
              <button
                onClick={() => setUseDynamicPrep(!useDynamicPrep)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  useDynamicPrep
                    ? 'border-[#4ea8dd]/50 bg-[#4ea8dd]/10 text-[#4ea8dd]'
                    : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                }`}
                title={useDynamicPrep ? 'Using Dynamic Prep (signal-driven)' : 'Using Enhanced Prep (legacy)'}
              >
                <Zap className={`w-4 h-4 ${useDynamicPrep ? 'text-[#4ea8dd]' : 'text-slate-500'}`} />
                <span className="text-xs font-medium">{useDynamicPrep ? 'Dynamic' : 'Enhanced'}</span>
              </button>
              <button
                onClick={handleGenerateBriefing}
                disabled={isGenerating || selectedPeople.length === 0 || !selectedObjectiveId}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#3d96cb] to-[#4ea8dd] text-white font-semibold shadow-[0_12px_30px_rgba(105,117,101,0.35)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          {generatingError && (
            <p className="mt-2 text-sm text-amber-300">{generatingError}</p>
          )}
        </>
      )}

      {/* Create/Edit Meeting Objective Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2A2A2A] border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">
                {editingStandardId
                  ? 'Edit Standard Objective'
                  : editingType
                  ? 'Edit Meeting Objective'
                  : 'Create Meeting Objective'}
              </h3>
              <button onClick={closeModal} className="p-2 hover:bg-white/5 rounded-lg">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Name - only for custom objectives */}
              {!editingStandardId && (
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Customer Discovery Call"
                    className="w-full px-4 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-[#3d96cb] focus:outline-none"
                  />
                </div>
              )}

              {/* Description */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="What is this meeting objective for?"
                  rows={2}
                  className="w-full px-4 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-[#3d96cb] focus:outline-none resize-none"
                />
              </div>

              {/* Internal/External Toggle - only for custom objectives */}
              {!editingStandardId && (
                <div>
                  <label className="block text-sm text-slate-400 mb-2">Meeting Context</label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, isExternal: false }))}
                      className={`flex-1 px-4 py-3 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                        !formData.isExternal
                          ? 'border-[#3d96cb] bg-[#3d96cb]/20 text-white'
                          : 'border-white/10 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                      Internal
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, isExternal: true }))}
                      className={`flex-1 px-4 py-3 rounded-lg border flex items-center justify-center gap-2 transition-colors ${
                        formData.isExternal
                          ? 'border-[#3d96cb] bg-[#3d96cb]/20 text-white'
                          : 'border-white/10 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      <Globe className="w-4 h-4" />
                      External
                    </button>
                  </div>
                </div>
              )}

              {/* Attendee Roles */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Typical Attendee Roles</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.attendeeRoles.map((role, idx) => (
                    <span key={idx} className="px-3 py-1 bg-[#4ea8dd]/20 text-[#4ea8dd] rounded-full text-sm flex items-center gap-1">
                      {role}
                      <button onClick={() => setFormData(prev => ({
                        ...prev,
                        attendeeRoles: prev.attendeeRoles.filter((_, i) => i !== idx)
                      }))}>
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addRole())}
                    placeholder="Add role (e.g., Product Manager)"
                    className="flex-1 px-3 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 text-sm focus:border-[#3d96cb] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addRole}
                    className="px-3 py-2 bg-[#4ea8dd] text-white rounded-lg hover:bg-[#3d96cb] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Objectives */}
              <div>
                <label className="block text-sm text-slate-400 mb-2">Key Objectives</label>
                <div className="space-y-2 mb-2">
                  {formData.objectives.map((obj, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-[#F0EBE3] flex-shrink-0" />
                      <span className="flex-1 text-sm text-white">{obj}</span>
                      <button onClick={() => setFormData(prev => ({
                        ...prev,
                        objectives: prev.objectives.filter((_, i) => i !== idx)
                      }))}>
                        <X className="w-4 h-4 text-slate-400 hover:text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newObjective}
                    onChange={(e) => setNewObjective(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addObjectiveItem())}
                    placeholder="Add objective (e.g., Identify pain points)"
                    className="flex-1 px-3 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 text-sm focus:border-[#3d96cb] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={addObjectiveItem}
                    className="px-3 py-2 bg-[#4ea8dd] text-white rounded-lg hover:bg-[#3d96cb] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Custom Prompt */}
              <div>
                <label className="block text-sm text-slate-400 mb-1">AI Preparation Prompt</label>
                <textarea
                  value={formData.customPrompt}
                  onChange={(e) => setFormData(prev => ({ ...prev, customPrompt: e.target.value }))}
                  placeholder="Instructions for AI when preparing for this meeting..."
                  rows={3}
                  className="w-full px-4 py-2 bg-[#0D0D0D] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:border-[#3d96cb] focus:outline-none resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
              <div className="flex gap-2">
                {/* Reset to default button for standard objectives */}
                {editingStandardId && isStandardModified(editingStandardId) && (
                  <button
                    onClick={() => {
                      resetStandardToDefault(editingStandardId);
                      closeModal();
                    }}
                    className="px-4 py-2 text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset to Default
                  </button>
                )}
                {/* Delete button for custom objectives */}
                {editingType && (
                  <button
                    onClick={() => deleteCustomType(editingType.id)}
                    className="px-4 py-2 text-red-400 hover:text-red-300 transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={editingStandardId ? saveStandardOverride : saveCustomType}
                  disabled={!editingStandardId && !formData.name.trim()}
                  className="px-4 py-2 bg-[#3d96cb] hover:bg-[#566051] text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {editingStandardId ? 'Save Changes' : editingType ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Branch Modal */}
      {showBranchModal && selectedBranch && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => {
              setShowBranchModal(false);
              setSelectedBranch(null);
            }}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-[#161616] border border-[#2A2A2A] rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
              {/* Header */}
              <div className="p-6 border-b border-[#2A2A2A] bg-gradient-to-br from-[#4ea8dd]/10 to-[#3d96cb]/10">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Sparkles className="w-6 h-6 text-[#4ea8dd]" />
                      <h2 className="text-2xl font-semibold text-white">{selectedBranch.name}</h2>
                    </div>
                    <p className="text-sm text-slate-300">{selectedBranch.description}</p>
                  </div>
                  <button
                    onClick={() => {
                      setShowBranchModal(false);
                      setSelectedBranch(null);
                    }}
                    className="p-2 text-slate-400 hover:text-white hover:bg-[#161616] rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Thumbnail */}
                {selectedBranch.id === 'leadership-coaching' ? (
                  <div className="w-full h-48 rounded-xl border border-[#2A2A2A] overflow-hidden">
                    <img
                      src={leadershipCoachingImage}
                      alt="Leadership Coaching"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : selectedBranch.id === 'last-weeks-report' ? (
                  <div className="w-full h-48 rounded-xl border border-[#2A2A2A] overflow-hidden">
                    <img
                      src={weeklyReportImage}
                      alt="Last Week's Report"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : selectedBranch.id === 'monthly-recap' ? (
                  <div className="w-full h-48 rounded-xl border border-[#2A2A2A] overflow-hidden">
                    <img
                      src={monthlyReportImage}
                      alt="Monthly Recap"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : selectedBranch.id === 'sort-my-calendar' ? (
                  <div className="w-full h-48 rounded-xl border border-[#2A2A2A] overflow-hidden">
                    <img
                      src={sortCalendarImage}
                      alt="Sort my Calendar"
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full h-48 bg-gradient-to-br from-[#4ea8dd]/20 to-[#3d96cb]/20 rounded-xl border border-[#2A2A2A] flex items-center justify-center">
                    <Sparkles className="w-16 h-16 text-[#4ea8dd] opacity-50" />
                  </div>
                )}

                {/* Explanation */}
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">What this branch does</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">{selectedBranch.explanation}</p>
                </div>
              </div>

              {/* Footer with action button */}
              <div className="p-6 border-t border-[#2A2A2A] bg-[#0C0C0C]">
                <button
                  onClick={() => handleGrowBranch(selectedBranch)}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[#4ea8dd] to-[#3d96cb] hover:from-[#3d96cb] hover:to-[#3d96cb] text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl"
                >
                  <Zap className="w-5 h-5" />
                  Explore this Branch
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
