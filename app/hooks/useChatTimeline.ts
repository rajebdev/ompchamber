import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from '@remix-run/react';
import type { Attachment, ChatMessageData } from '@/types';
import type { QueuedMessage } from '@/components/workspace/chat-timeline/QueueList';
import { triggerChatCompletionSound } from '@/hooks/useNotificationSound';
import { streamChatResponse } from '@/hooks/useChatStream';
import { useOmpAgent } from '@/hooks/useOmpAgent';
import { isTextAttachmentFile, composeMessageWithTextAttachments } from '@/lib/chat-attachments';

interface UseChatTimelineOptions {
  folders?: any[];
  appSettings?: Record<string, any>;
}

export function useChatTimeline({ folders = [], appSettings = {} }: UseChatTimelineOptions = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const folderId = searchParams.get('folderId');

  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);

  useEffect(() => {
    setSelectedFolderId(folderId ? parseInt(folderId, 10) : null);
  }, [folderId]);

  // Choosing a workspace context mirrors it to the `folderId` URL param so the
  // layout (right-panel scoping) can react to the same selection.
  const selectContextFolder = useCallback((id: number | null) => {
    setSelectedFolderId(id);
    setSearchParams(prev => {
      if (id) prev.set('folderId', String(id));
      else prev.delete('folderId');
      return prev;
    }, { replace: true });
  }, [setSearchParams]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight >= 100);
    setIsScrolling(true);
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => setIsScrolling(false), 600);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });
  }, []);

  const [inputValue, setInputValue] = useState('');
  const [inputAttachments, setInputAttachments] = useState<Attachment[]>([]);
  const [localMessages, setLocalMessages] = useState<ChatMessageData[]>([]);
  const [sessionData, setSessionData] = useState<{ id?: string; title?: string; model?: string | { provider: string; modelId: string }; thinkingLevel?: string; messages?: any[] } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const isGeneratingRef = useRef(false);
  // Single throat through which every generation state transition flows
  // (send, queue, steer, retry, undo, agent start/end, stream done/error).
  // Sidebar subscribes here to paint spinner/check on the session item.
  const setGenerating = (v: boolean) => {
    isGeneratingRef.current = v;
    setIsGenerating(v);
    if (sessionIdRef.current) {
      window.dispatchEvent(new CustomEvent('omp:session-processing', {
        detail: { sessionId: sessionIdRef.current, processing: v },
      }));
    }
  };
  const [generatingVerb, setGeneratingVerb] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevSessionIdRef = useRef<string | null>(null);

  // omp sessions are string UUIDs; chamber-created (mock/numeric) sessions are
  // integers. Only omp UUIDs route through the live agent bridge. Pending
  // client-side sessions ("new-…", created before the omp spawn) are treated
  // as not-yet-omp so executeSend spawns the real session on first send.
  const isOmpSession = Boolean(sessionId) && !String(sessionId).startsWith('new-') && Number.isNaN(Number(sessionId));
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  /** Re-fetch the session's title/metadata after the omp JSONL has been
   *  written (spawn or agent end) so the navbar and context panel show the
   *  real session title instead of the default. Retries (fast) until the JSONL
   *  actually carries messages (omp writes the user turn on agent start), so
   *  the sidebar refresh lands as soon as the first chunk arrives. */
  const refreshSessionMeta = useCallback((sid: string) => {
    if (new URLSearchParams(window.location.search).get('sessionId') !== sid) return;
    let attempts = 0;
    const tryFetch = () => {
      attempts += 1;
      fetch(`/api/chat/${encodeURIComponent(sid)}`)
        .then(res => res.json())
        .then(data => {
          if (!data?.session) return;
          setSessionData(data.session);
          // Only signal the sidebar once the JSONL carries the user turn, so
          // the item appears with its real title (not the default).
          if ((data.session.messages?.length ?? 0) > 0) {
            window.dispatchEvent(new CustomEvent('omp:session-updated', { detail: { sessionId: sid } }));
          } else if (attempts < 40) {
            // The omp JSONL may be written well after agent_start: keep
            // polling (20s) until the user turn lands so the sidebar item
            // appears as soon as the chunk arrives.
            setTimeout(tryFetch, 500);
          }
        })
        .catch(() => {});
    };
    tryFetch();
  }, []);

  // Fetch session messages and details from API
  useEffect(() => {
    let active = true;
    // Track the previous session id so a session switch (including "New
    // Session" → new-…) clears the timeline, while the optimistic spawn
    // transition (new-… → real UUID) keeps its bubbles.
    if (sessionId !== prevSessionIdRef.current) {
      const isSpawnAdopt = sessionId && !sessionId.startsWith('new-') && prevSessionIdRef.current?.startsWith('new-');
      if (!isSpawnAdopt) {
        setLocalMessages([]);
        setGenerating(false);
        adoptedSessionIdRef.current = null;
        metaRefreshedRef.current = null;
      }
      prevSessionIdRef.current = sessionId;
    }
    if (sessionId) {
      fetch(`/api/chat/${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (!active) return;
          if (data?.session) {
            setSessionData(data.session);
            // Only replace the timeline when the fetch actually has messages.
            // A pending "new-…" session or a just-spawned omp session whose
            // JSONL is not written yet must not wipe the optimistic bubbles.
            const fetched = data.session.messages || [];
            if (fetched.length > 0) {
              setLocalMessages(fetched);
            } else if (!sessionId.startsWith('new-') && !isGeneratingRef.current) {
              setLocalMessages([]);
            }
          } else {
            setSessionData(null);
            if (!isGeneratingRef.current) setLocalMessages([]);
          }
        })
        .catch(err => {
          console.error('Error loading session from API:', err);
          if (active && !isGeneratingRef.current) {
            setSessionData(null);
            setLocalMessages([]);
          }
        });
    } else {
      setSessionData(null);
      setLocalMessages([]);
    }
    return () => {
      active = false;
    };
  }, [sessionId]);

  const persistMessages = useCallback((messagesToSave: any[]) => {
    if (!sessionId) return;
    fetch(`/api/chat/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messagesToSave }),
    }).catch(err => console.error('Error persisting messages via API:', err));
  }, [sessionId]);

  // Auto-scroll to bottom instantly when session changes
  useEffect(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollToBottom('instant' as ScrollBehavior);
        setShowScrollBottom(false);
      }, 0);
    });
  }, [sessionId, localMessages.length, scrollToBottom]);

  const currentSession = useMemo(() => {
    if (!sessionId) return null;
    for (const folder of folders) {
      const session = folder.sessions?.find((s: any) => String(s.id) === String(sessionId));
      if (session) return session;
    }
    return null;
  }, [sessionId, folders]);

  const [messageQueue, setMessageQueueLocal] = useState<QueuedMessage[]>([]);

  // Initialize queue from DB on mount or session change
  useEffect(() => {
    if (currentSession && currentSession.queue_list) {
      setMessageQueueLocal(currentSession.queue_list);
    } else {
      setMessageQueueLocal([]);
    }
  }, [currentSession]);

  const setMessageQueue = useCallback((updater: React.SetStateAction<QueuedMessage[]>) => {
    setMessageQueueLocal(prev => {
      const newQueue = typeof updater === 'function' ? updater(prev) : updater;
      // Queue persistence targets the SQLite `sessions` table (mock/numeric
      // sessions). omp sessions (string UUIDs) have no such row — keep the
      // queue client-side only for this session.
      if (sessionId && !Number.isNaN(Number(sessionId))) {
        fetch(`/api/sessions/${sessionId}/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queue_list: newQueue })
        }).catch(console.error);
      }
      return newQueue;
    });
  }, [sessionId]);

  // ── Live omp agent bridge (real mode) ──────────────────────────────────────
  const aiPlaceholderIdRef = useRef<string | null>(null);
  // Real session id adopted by a fresh spawn ("new-…" → UUID). onAgentStart
  // may fire before React re-renders with the new URL, so it reads the id
  // from here instead of the (still-stale) sessionId prop.
  const adoptedSessionIdRef = useRef<string | null>(null);
  // Fire the sidebar/metadata refresh once per session when the AI starts
  // responding (agent_start = first chunk) — the omp JSONL now carries the
  // user turn, so the sidebar item + real title appear immediately.
  const metaRefreshedRef = useRef<string | null>(null);
  const ompAgent = useOmpAgent(isOmpSession ? sessionId : null, {
    onAgentStart: () => {
      setGenerating(true);
      setGeneratingVerb('Deep reasoning');
      setTimeout(() => scrollToBottom('smooth'), 50);
      const sid = adoptedSessionIdRef.current ?? sessionIdRef.current;
      if (sid && metaRefreshedRef.current !== sid) {
        metaRefreshedRef.current = sid;
        setTimeout(() => refreshSessionMeta(sid), 100);
      }
    },
    // omp-web mirrors this exactly: streaming updates live in a SEPARATE
    // slot that is replaced wholesale on every update (never merged into the
    // committed list), and only flushed to history on message_end. omp's
    // message frames are timestamp-identified, not id-identified.
    onMessageUpdate: (msg) => {
      setLocalMessages(prev => {
        const placeholderId = aiPlaceholderIdRef.current;
        // Notice rows are independent of the streaming bubble — append them
        // (deduped by id) without touching the placeholder.
        if (msg.notice) {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        }
        if (placeholderId && prev.some(m => m.id === placeholderId)) {
          return prev.map(m => (m.id === placeholderId ? msg : m));
        }
        const last = prev[prev.length - 1];
        if (last && last.role === 'ai' && msg.id === last.id) {
          return [...prev.slice(0, -1), msg];
        }
        if (last && last.role === 'ai' && /\S/.test(last.content) === false && !last.toolCalls?.length) {
          return [...prev.slice(0, -1), msg];
        }
        return [...prev, msg];
      });
      scrollToBottom('smooth');
    },
    onMessageEnd: (msg) => {
      setLocalMessages(prev => {
        const placeholderId = aiPlaceholderIdRef.current;
        let updated: ChatMessageData[];
        if (placeholderId && prev.some(m => m.id === placeholderId)) {
          updated = prev.map(m => (m.id === placeholderId ? msg : m));
        } else {
          // omp emits one message_end per content segment, each a distinct
          // message id. Only replace the trailing in-flight AI message when
          // the ids match (an update of the same message); otherwise append
          // as a new message so thinking/toolCalls from earlier segments are
          // not lost. Notice rows appended after it must survive.
          let idx = prev.length - 1;
          while (idx >= 0 && prev[idx].notice) idx--;
          if (idx >= 0 && prev[idx].role === 'ai' && prev[idx].id === msg.id) {
            updated = [...prev.slice(0, idx), msg, ...prev.slice(idx + 1)];
          } else {
            updated = [...prev, msg];
          }
        }
        aiPlaceholderIdRef.current = null;
        persistMessages(updated);
        return updated;
      });
    },
    onAgentEnd: () => {
      setGenerating(false);
      abortControllerRef.current = null;
      triggerChatCompletionSound(appSettings);
      setTimeout(() => scrollToBottom('smooth'), 50);
      // The omp JSONL has the final title/messages now — refresh session
      // metadata so navbar/context panel show the real title.
      const sid = sessionIdRef.current;
      if (sid) refreshSessionMeta(sid);
    },
    onPromptError: (errorMessage) => {
      setGenerating(false);
      abortControllerRef.current = null;
      console.error('OMP prompt error:', errorMessage);
    },
    onNotice: (_level, message) => {
      console.info('OMP notice:', message);
    },
  });
  const executeSend = useCallback(async (text: string, attachments: Attachment[]) => {
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const userMsgId = `msg-${Date.now()}-user`;
    const aiPlaceholderId = `msg-${Date.now() + 1}-ai`;

    // Read text-file contents once: used for the editor (attachment.content)
    // and for inlining into the prompt (mirror omp-web).
    const textFileContents = new Map<string, string>();
    try {
      await Promise.all(
        attachments
          .filter(a => isTextAttachmentFile(a.file))
          .map(async a => {
            textFileContents.set(a.id, await a.file.text());
          })
      );
    } catch {
      // Fall back to prompt without inlined contents if a file cannot be read.
    }

    const newUserMsg: ChatMessageData = {
      id: userMsgId,
      role: 'user',
      date: `Today, ${time}`,
      content: text,
      attachments: attachments.map(a => ({
        name: a.file.name,
        preview: a.dataBase64 ? `data:${a.file.type};base64,${a.dataBase64}` : a.preview,
        type: a.file.type,
        size: a.file.size,
        content: textFileContents.get(a.id),
      }))
    };

    const initialAiMsg: ChatMessageData = {
      id: aiPlaceholderId,
      role: 'ai',
      date: `Today, ${time}`,
      content: '',
    };

    setLocalMessages(prev => {
      const next = [...prev, newUserMsg, initialAiMsg];
      persistMessages(next.filter(m => m.id !== aiPlaceholderId));
      return next;
    });

    setGenerating(true);
    const verbs = ['Synthesizing solution', 'Deep reasoning', 'Architecting patch', 'Compiling edge routes'];
    setGeneratingVerb(verbs[Math.floor(Math.random() * verbs.length)]);
    setTimeout(() => scrollToBottom('smooth'), 50);

    // Real mode: route through the omp agent RPC bridge + SSE stream.
    if (isOmpSession) {
      aiPlaceholderIdRef.current = aiPlaceholderId;
      const images = attachments
        .filter(a => a.file.type.startsWith('image/') && a.dataBase64)
        .map(a => ({ data: a.dataBase64 as string, mimeType: a.file.type }));
      // Inline text-file contents into the prompt (mirror omp-web): the model
      // sees the full file content as fenced blocks, not just the filename.
      const textFiles = attachments
        .filter(a => textFileContents.has(a.id))
        .map(a => ({
          name: a.file.name,
          mimeType: a.file.type,
          content: textFileContents.get(a.id) as string,
          size: a.file.size,
        }));
      const promptText = composeMessageWithTextAttachments(text, textFiles);
      const ok = await ompAgent.sendPrompt(promptText, images.length ? images : undefined);
      if (!ok) {
        // Roll back the optimistic bubbles on a failed send.
        setLocalMessages(prev => prev.filter(m => m.id !== userMsgId && m.id !== aiPlaceholderId));
        aiPlaceholderIdRef.current = null;
        setGenerating(false);
      }
      return;
    }

    // No active session (fresh "New Session"): in real mode spawn a brand-new
    // omp session and adopt its id; fall back to the mock/simulated path only
    // when the spawn fails (e.g. MOCK=true or no workspace context).
    if (!isOmpSession) {
      const currentFolder = folders.find(f => String(f.id) === String(selectedFolderId));
      const cwd = currentFolder?.project_path || currentFolder?.name;
      if (cwd) {
        const images = attachments
          .filter(a => a.file.type.startsWith('image/') && a.dataBase64)
          .map(a => ({ data: a.dataBase64 as string, mimeType: a.file.type }));
        const textFiles = attachments
          .filter(a => textFileContents.has(a.id))
          .map(a => ({
            name: a.file.name,
            mimeType: a.file.type,
            content: textFileContents.get(a.id) as string,
            size: a.file.size,
          }));
        const promptText = composeMessageWithTextAttachments(text, textFiles);
        const newSessionId = await ompAgent.sendNewPrompt(promptText, cwd, images.length ? images : undefined);
        if (newSessionId) {
          adoptedSessionIdRef.current = newSessionId;
          aiPlaceholderIdRef.current = aiPlaceholderId;
          setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('sessionId', newSessionId);
            return next;
          }, { replace: true });
          // The agent_start event refreshes the session metadata/sidebar once
          // the JSONL has the user turn; no immediate refresh is needed here.
          return;
        }
      }
    }

    // Mock / chamber-created session: existing Gemini/simulated SSE path.
    // Cancel any previous stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const currentFolder = folders.find(f => String(f.id) === String(selectedFolderId));
    const workspaceName = currentFolder?.name || 'Workspace';

    await streamChatResponse(
      {
        sessionId: sessionId || `session-${Date.now()}`,
        prompt: text,
        workspaceName,
        attachments,
        signal: abortController.signal,
      },
      {
        onInit: (data) => {
          setLocalMessages(prev =>
            prev.map(m => (m.id === aiPlaceholderId ? { ...m, id: data.id, date: data.date } : m))
          );
        },
        onThinkingStart: () => {
          setLocalMessages(prev =>
            prev.map(m =>
              m.id === aiPlaceholderId || m.role === 'ai'
                ? { ...m, thinking: { thought: '', isGenerating: true } }
                : m
            )
          );
          setTimeout(() => scrollToBottom('smooth'), 50);
        },
        onThinkingChunk: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                const currentThought = typeof m.thinking === 'object' ? m.thinking.thought || '' : '';
                return {
                  ...m,
                  thinking: { thought: currentThought + data.delta, isGenerating: true },
                };
              }
              return m;
            })
          );
          scrollToBottom('smooth');
        },
        onThinkingEnd: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return {
                  ...m,
                  thinking: {
                    thought: data.thought,
                    summary: data.summary,
                    duration: data.duration,
                    isGenerating: false,
                  },
                };
              }
              return m;
            })
          );
        },
        onToolStart: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return {
                  ...m,
                  toolCalls: [...(m.toolCalls || []), data],
                };
              }
              return m;
            })
          );
          setTimeout(() => scrollToBottom('smooth'), 50);
        },
        onToolOutputChunk: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return {
                  ...m,
                  toolCalls: (m.toolCalls || []).map(t =>
                    t.id === data.id ? { ...t, output: (t.output || '') + data.delta } : t
                  ),
                };
              }
              return m;
            })
          );
          scrollToBottom('smooth');
        },
        onToolEnd: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return {
                  ...m,
                  toolCalls: (m.toolCalls || []).map(t => (t.id === data.id ? { ...t, ...data } : t)),
                };
              }
              return m;
            })
          );
        },
        onContentChunk: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return {
                  ...m,
                  content: (m.content || '') + data.delta,
                };
              }
              return m;
            })
          );
          scrollToBottom('smooth');
        },
        onSummary: (data) => {
          setLocalMessages(prev =>
            prev.map(m => {
              if (m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)) {
                return { ...m, summary: data.summary };
              }
              return m;
            })
          );
        },
        onDone: (data) => {
          setLocalMessages(prev => {
            const updated = prev.map(m =>
              m.id === aiPlaceholderId || (m.role === 'ai' && prev[prev.length - 1]?.id === m.id)
                ? data.message
                : m
            );
            persistMessages(updated);
            return updated;
          });
          setGenerating(false);
          abortControllerRef.current = null;
          triggerChatCompletionSound(appSettings);
          setTimeout(() => scrollToBottom('smooth'), 50);
        },
        onError: () => {
          setGenerating(false);
          abortControllerRef.current = null;
        },
      }
    );
  }, [appSettings, folders, isOmpSession, ompAgent, selectedFolderId, sessionId, scrollToBottom, persistMessages, refreshSessionMeta]);

  // Auto-process queue
  useEffect(() => {
    if (!isGenerating && messageQueue.length > 0) {
      const nextMessage = messageQueue[0];
      setMessageQueue(q => q.slice(1));
      executeSend(nextMessage.text, nextMessage.attachments);
    }
  }, [isGenerating, messageQueue, executeSend, setMessageQueue]);

  const handleSend = useCallback((attachments: Attachment[], options?: { steering?: boolean }) => {
    const textToSend = inputValue.trim();
    if (!textToSend && attachments.length === 0) return;

    if (isGenerating) {
      if (options?.steering) {
        if (isOmpSession) {
          void ompAgent.abort();
        } else if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        setGenerating(false);
        setInputValue('');
        setTimeout(() => executeSend(textToSend, attachments), 0);
        return;
      } else {
        setMessageQueue(prev => [...prev, {
          id: `queue-${Date.now()}`,
          text: textToSend,
          attachments: attachments
        }]);
        setInputValue('');
        return;
      }
    }

    setInputValue('');
    executeSend(textToSend, attachments);
  }, [inputValue, isGenerating, executeSend, setMessageQueue, isOmpSession, ompAgent]);

  const handleEditQueueItem = useCallback((item: QueuedMessage) => {
    setMessageQueue(q => q.filter(i => i.id !== item.id));
    setInputValue(item.text);
    setInputAttachments(item.attachments);
  }, [setMessageQueue]);

  const handleSendNowQueueItem = useCallback((item: QueuedMessage) => {
    setMessageQueue(q => q.filter(i => i.id !== item.id));

    if (isGenerating) {
      if (isOmpSession) {
        void ompAgent.abort();
      } else if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setGenerating(false);
      setTimeout(() => executeSend(item.text, item.attachments), 0);
    } else {
      executeSend(item.text, item.attachments);
    }
  }, [isGenerating, executeSend, setMessageQueue, isOmpSession, ompAgent]);

  const handleUndo = useCallback((msgId: string, content?: string) => {
    if (isGenerating) {
      if (isOmpSession) {
        void ompAgent.abort();
      } else if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setGenerating(false);
    }

    if (content) {
      setInputValue(content);
    }

    setLocalMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId);
      const next = idx !== -1 ? prev.slice(0, idx) : prev;
      persistMessages(next);
      return next;
    });
  }, [isGenerating, persistMessages, isOmpSession, ompAgent]);

  const handleRetry = useCallback((msgId: string) => {
    if (isGenerating) {
      if (isOmpSession) {
        void ompAgent.abort();
      } else if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setGenerating(false);
    }

    setLocalMessages(prev => {
      const aiIdx = prev.findIndex(m => m.id === msgId);
      if (aiIdx > 0 && prev[aiIdx - 1].role === 'user') {
        const userMsg = prev[aiIdx - 1];
        setTimeout(() => {
          executeSend(userMsg.content, (userMsg.attachments as any) || []);
        }, 0);
        const next = prev.slice(0, aiIdx);
        persistMessages(next);
        return next;
      }
      return prev;
    });
  }, [isGenerating, executeSend, persistMessages, isOmpSession, ompAgent]);

  const submitNewChat = useCallback((text: string, attachments: any[]) => {
    // Client-side pending session id: the sidebar/navbar show a default title
    // immediately; the real omp session id replaces it on first send.
    const pendingId = `new-${Date.now()}`;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('sessionId', pendingId);
      return next;
    }, { replace: true });

    setLocalMessages([]);
    setTimeout(() => {
      executeSend(text, attachments);
    }, 0);
  }, [setSearchParams, executeSend]);

  const stopGenerating = useCallback(() => {
    if (isOmpSession) {
      void ompAgent.abort();
    } else if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerating(false);
  }, [isOmpSession, ompAgent]);

  const handleThinkingLevelChange = useCallback((level: string) => {
    if (level === 'auto') return;
    void ompAgent.setThinkingLevel(level);
  }, [ompAgent]);

  const handleModelChange = useCallback((provider: string, modelId: string) => {
    void ompAgent.setModel(provider, modelId);
  }, [ompAgent]);

  return {
    sessionId,
    folderId,
    isOmpSession,
    selectedFolderId,
    setSelectedFolderId: selectContextFolder,
    sessionData,
    localMessages,
    isGenerating,
    generatingVerb,
    messageQueue,
    setMessageQueue,
    inputValue,
    setInputValue,
    inputAttachments,
    setInputAttachments,
    scrollRef,
    showScrollBottom,
    isScrolling,
    handleScroll,
    scrollToBottom,
    handleSend,
    handleEditQueueItem,
    handleSendNowQueueItem,
    handleUndo,
    handleRetry,
    submitNewChat,
    stopGenerating,
    handleThinkingLevelChange,
    handleModelChange,
  };
}
