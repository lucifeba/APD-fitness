// Athlete chat page - reuses the Chat page but scoped to athlete ↔ trainer conversation
import React from 'react';
import { AthleteLayout } from './AthleteLayout';
import { useStore } from '../../store/useStore';
import { Chat } from '../Chat';

// We reuse the Chat component since it adapts to the current user's role.
// But we need to wrap it with AthleteLayout which differs from the trainer Layout.
// The simplest approach: render Chat embedded without Layout, then wrap with AthleteLayout.
// Since Chat uses <Layout> internally, we render it as a standalone sub-page.
// Actually the cleanest way is to just have the athlete navigate to the /chat page which
// already works for any logged-in user. But we want it in the athlete nav.
// Let's embed Chat content directly here without duplicating.

import { Send, Paperclip, FileText, Image, X } from 'lucide-react';
import type { ChatAttachment } from '../../types';

const TRAINER_ID_FALLBACK = 'admin-001';

function getConvId(id1: string, id2: string) {
  return [id1, id2].sort().join('_');
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const AthleteChat: React.FC = () => {
  const { currentUser, athletes, chatMessages, sendChatMessage, markMessagesRead, addNotification } = useStore();
  const [text, setText] = React.useState('');
  const [attachments, setAttachments] = React.useState<ChatAttachment[]>([]);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const athleteRecord = athletes.find((a) => a.email === currentUser?.email);
  const trainerId = athleteRecord?.trainerId || TRAINER_ID_FALLBACK;
  const convId = getConvId(currentUser?.id || '', trainerId);

  const messages = chatMessages.filter(
    (m) => m.conversationId === convId || (m.recipientId === currentUser?.id && m.conversationId.startsWith('broadcast_'))
  );

  React.useEffect(() => {
    if (currentUser) markMessagesRead(convId, currentUser.id);
  }, [messages.length]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const url = await fileToBase64(file);
      const type = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'file';
      setAttachments((prev) => [...prev, { name: file.name, type, url, size: file.size }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = () => {
    if (!text.trim() && attachments.length === 0) return;
    if (!currentUser) return;
    sendChatMessage({
      conversationId: convId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderRole: 'athlete' as any,
      recipientId: trainerId,
      recipientName: 'Entrenador',
      text: text.trim(),
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    addNotification({
      recipientId: trainerId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      type: 'message',
      title: `Mensaje de ${currentUser.name}`,
      body: text.trim().substring(0, 80),
      link: '/chat',
    });
    setText('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <AthleteLayout title="Chat con Entrenador" subtitle="Mensajería directa">
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {messages.length === 0 && (
            <p className="text-center text-sm text-slate-400 mt-10">Todavía no hay mensajes. ¡Escribe al entrenador!</p>
          )}
          {messages.map((msg) => {
            const isMine = msg.senderId === currentUser?.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
                  {!isMine && <span className="text-xs text-slate-500 ml-1">{msg.senderName}</span>}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                    msg.isSystemMessage
                      ? 'bg-slate-100 text-slate-500 text-xs italic'
                      : isMine
                      ? 'bg-green-600 text-white rounded-br-sm'
                      : 'bg-white border border-slate-200 text-slate-800 shadow-sm rounded-bl-sm'
                  }`}>
                    {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                    {msg.attachments?.map((att, i) => (
                      <div key={i} className="mt-2">
                        {att.type === 'image' ? (
                          <img src={att.url} alt={att.name} className="max-w-[200px] rounded-lg" />
                        ) : (
                          <a href={att.url} download={att.name} className={`flex items-center gap-1 text-xs underline ${isMine ? 'text-green-100' : 'text-blue-600'}`}>
                            <FileText className="w-3.5 h-3.5" />{att.name}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-slate-400 px-1">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-2 flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
                {att.type === 'image' ? <Image className="w-3.5 h-3.5 text-blue-500" /> : <FileText className="w-3.5 h-3.5 text-red-500" />}
                <span className="max-w-[120px] truncate">{att.name}</span>
                <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}><X className="w-3 h-3 text-slate-400" /></button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="bg-white border-t border-slate-200 p-3 flex items-end gap-2">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFile} accept="image/*,.pdf,.doc,.docx" />
          <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-green-600 rounded-xl transition">
            <Paperclip className="w-5 h-5" />
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje..."
            rows={1}
            className="flex-1 resize-none px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 max-h-32"
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() && attachments.length === 0}
            className="p-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-40 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </AthleteLayout>
  );
};
