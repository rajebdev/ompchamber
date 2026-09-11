import { useState, useMemo } from 'react';
import { Info, ChevronDown, Bot, CheckCircle2, AlertCircle, Clock, Layers, Bell } from 'lucide-react';
import { highlightCode, isCodeLike } from '@/lib/code/syntax-highlight';
import { parseTaskNotice } from '@/lib/chat/task-result-parser';
import { TaskResultContent } from '@/components/workspace/chat-timeline/TaskResultContent';
import { MarkdownRenderer } from '@/components/common/MarkdownRenderer';

interface SystemNoticeProps {
  notice: string;
}

/** System notice collapsible — handles generic notices, structured <task-result> agent jobs, and <system-reminder> blocks. */
export function SystemNotice({ notice }: SystemNoticeProps) {
  const [isOpen, setIsOpen] = useState(false);

  // 1. Check if notice contains a structured <task-result> block
  const taskNotice = useMemo(() => parseTaskNotice(notice), [notice]);

  // 2. Check if notice is a <system-reminder> or action-reminder block
  const reminderInfo = useMemo(() => {
    const hasReminderTag = /<\/?system-reminder[^>]*>/i.test(notice);
    const isReminderLike =
      hasReminderTag || notice.includes('xd://resolve') || notice.includes('`ast_edit` result');
    if (!isReminderLike) return null;

    const cleanContent = notice.replace(/<\/?system-reminder[^>]*>/gi, '').trim();
    if (!cleanContent) return null;

    // First line for display title, removing backticks for clean title bar display
    const firstLine =
      cleanContent
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean) ?? cleanContent;
    const cleanTitle = firstLine.replace(/`([^`]+)`/g, '$1');

    return {
      content: cleanContent,
      title: cleanTitle,
    };
  }, [notice]);

  // 3. Fallback generic notice parsing (stripping any residual system-notice tags)
  const genericInfo = useMemo(() => {
    const clean = notice.replace(/<\/?system-notice[^>]*>/gi, '').trim();
    const lines = clean.split(/\r?\n/);
    const firstLine = (lines.find((l) => l.trim()) ?? '').trim();
    const restStart = lines.findIndex((l) => l.trim() === firstLine);
    const rest = lines.slice(restStart + 1).join('\n').trim();
    const isCode = isCodeLike(rest);
    return {
      clean,
      firstLine,
      rest,
      isCode,
    };
  }, [notice]);

  const rawTitle = taskNotice?.intro || reminderInfo?.title || genericInfo.firstLine || notice;
  const isTruncated = rawTitle.length > 100;
  const displayTitle = rawTitle.slice(0, 100) + (isTruncated ? '...' : '');

  // If notice has only 1 line of content AND does not exceed the 100-character ellipsis limit,
  // disable expand since the entire text is already fully visible in the sub-header.
  // If it exceeds the ellipsis limit (>100 chars) or has multiple lines, keep expand active.
  const isExpandable = useMemo(() => {
    if (taskNotice) return true;
    const clean = notice
      .replace(/<\/?(?:system-notice|system-reminder)[^>]*>/gi, '')
      .trim();
    const lines = clean
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.length > 1 || clean.length > 100 || rawTitle.length > 100;
  }, [taskNotice, notice, rawTitle]);

  const noticeStyle = useMemo(() => {
    if (taskNotice) {
      const isError = taskNotice.status === 'failed' || taskNotice.status === 'error';
      if (isError) {
        return {
          icon: <AlertCircle size={13} />,
          badgeClass: 'bg-error/10 text-error',
          label: 'Task Result',
          isError: true,
        };
      }
      return {
        icon: <CheckCircle2 size={13} />,
        badgeClass: 'bg-success/10 text-success',
        label: 'Task Result',
        isError: false,
      };
    }
    if (reminderInfo) {
      return {
        icon: <Bell size={13} />,
        badgeClass: 'bg-warning/10 text-warning',
        label: 'System Reminder',
        isError: false,
      };
    }
    return {
      icon: <Info size={13} />,
      badgeClass: 'bg-info/10 text-info',
      label: 'System Notice',
      isError: false,
    };
  }, [taskNotice, reminderInfo]);

  const handleToggle = () => {
    if (!isExpandable) return;
    setIsOpen((prev) => !prev);
  };

  return (
    <div
      className={`mx-3 overflow-hidden rounded-xl border border-ink/10 bg-paper text-[12px] text-ink transition-colors ${
        isExpandable ? 'hover:border-ink/20' : ''
      } select-text`}
    >
      <button
        type="button"
        onClick={handleToggle}
        disabled={!isExpandable}
        aria-expanded={isExpandable ? isOpen : undefined}
        className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
          isExpandable ? 'cursor-pointer hover:bg-ink/[0.03]' : 'cursor-default'
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20`}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${noticeStyle.badgeClass}`}>
          {noticeStyle.icon}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[12px] font-semibold tracking-tight text-ink">
              {noticeStyle.label}
            </span>
            {taskNotice?.agent && (
              <span className="flex items-center gap-1 rounded bg-ink/5 px-1.5 py-0.2 font-mono text-[9px] text-ink/60">
                <Bot size={10} />
                {taskNotice.agent}
              </span>
            )}
            {taskNotice?.status && (
              <span
                className={`flex items-center gap-1 rounded px-1.5 py-0.2 font-mono text-[9px] font-semibold uppercase ${
                  noticeStyle.isError ? 'bg-error/10 text-error' : 'bg-success/10 text-success'
                }`}
              >
                {noticeStyle.isError ? <AlertCircle size={10} /> : <CheckCircle2 size={10} />}
                {taskNotice.status}
              </span>
            )}
            {taskNotice?.duration && (
              <span className="flex items-center gap-1 font-mono text-[9px] text-ink/40">
                <Clock size={9} />
                {taskNotice.duration}
              </span>
            )}
            {taskNotice?.meta?.size && (
              <span className="flex items-center gap-1 font-mono text-[9px] text-ink/40">
                <Layers size={9} />
                {taskNotice.meta.size}
              </span>
            )}
          </span>
          {!isOpen && displayTitle && (
            <span className="truncate font-mono text-[10.5px] text-ink/45" title={rawTitle}>
              {displayTitle}
            </span>
          )}
        </span>
        {isExpandable && (
          <ChevronDown
            size={14}
            className={`shrink-0 text-ink/35 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {isOpen && isExpandable && (
        <div className="border-t border-ink/8 bg-canvas/40 px-3.5 py-2.5">
          {taskNotice ? (
            <TaskResultContent task={taskNotice} />
          ) : reminderInfo ? (
            <div className="rounded-lg border border-ink/8 bg-paper p-3 text-[11.5px] leading-relaxed text-ink/85">
              <MarkdownRenderer content={reminderInfo.content} />
            </div>
          ) : genericInfo.rest ? (
            <pre
              className="max-h-56 overflow-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-ink/75 scrollbar-overlay-container scrollbar-overlay-static"
              dangerouslySetInnerHTML={{
                __html: genericInfo.isCode
                  ? highlightCode(genericInfo.rest, 'javascript')
                  : genericInfo.rest
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;'),
              }}
            />
          ) : (
            <div className="text-[11.5px] leading-relaxed text-ink/85">
              <MarkdownRenderer content={genericInfo.clean} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
