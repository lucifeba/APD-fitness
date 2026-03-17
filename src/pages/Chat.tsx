import React, { useState, useRef, useEffect } from 'react';
import { Layout } from '../components/layout/Layout';
import { Header } from '../components/layout/Header';
import { useStore } from '../store/useStore';
import type { ChatMessage } from '../types';
import {
  Send, Paperclip, Users, User, Search, MessageSquare,
  X, FileText, Image, ChevronDown, Radio,
} from 'lucide-react';

const ADMIN_ID = 'admin-001';

function getConversationId(id1: string, id2: string) {
  return [id1, id2].sort().join('_');
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const Chat: React.FC = () => {
  const { currentUser, athletes, chatMessages, sendChatMessage, markMessagesRead, addNotification, getAllAccounts } = useStore();
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; type: 'image' | 'pdf' | 'file'; url: string; size: number }[]>([]);
  const [broadcastMode, setBroadcastMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAdmin = currentUser?.role === 'admin';

  // Build contact list
  const allAccounts = getAllAccounts();

  // For admins: show all trainers + all athletes (via athlete records)
  // For trainers: show admin
  const contacts: { id: string; name: string; type: 'trainer' | 'athlete' | 'admin'; subtitle: string }[] = [];

  if (isAdmin) {
    // Add all active trainers
    allAccounts
      .filter((a) => a.user.role === 'trainer' && a.user.status === 'active')
      .forEach((a) => {
        contacts.push({ id: a.user.id, name: a.user.name, type: 'trainer', subtitle: a.user.email });
      });
  } else {
    // Trainer talks to admin
    contacts.push({ id: ADMIN_ID, name: 'Administrador', type: 'admin', subtitle: 'Panel de Administración' });
    // Also show their athletes (athletes linked to this trainer)
    athletes
      .filter((a) => a.trainerId === currentUser?.id)
      .forEach((a) => {
        contacts.push({ id: a.id, name: a.name, type: 'athlete', subtitle: a.email });
      });
  }

  const filteredContacts = contacts.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Get selected conversation partner info
  const selectedContact = contacts.find((c) => {
    if (!selectedConvId) return false;
    if (broadcastMode) return false;
    return getConversationId(currentUser?.id || '', c.id) === selectedConvId;
  });

  // Messages for current conversation
  const conversationMessages = selectedConvId
    ? chatMessages.filter((m) => {
        if (broadcastMode) return m.recipientId === 'ALL';
        return m.conversationId === selectedConvId;
      })
    : [];

  // Unread per contact
  function getUnread(contactId: string) {
    const convId = getConversationId(currentUser?.id || '', contactId);
    return chatMessages.filter(
      (m) => m.conversationId === convId && m.recipientId === currentUser?.id && !m.read
    ).length;
  }

  // Mark as read when switching conversation
  useEffect(() => {
    if (selectedConvId && currentUser) {
      markMessagesRead(selectedConvId, currentUser.id);
    }
  }, [selectedConvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages.length]);

  const handleSelectContact = (contactId: string) => {
    setBroadcastMode(false);
    setSelectedConvId(getConversationId(currentUser?.id || '', contactId));
  };

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

    if (broadcastMode && isAdmin) {
      // Send to all trainers
      const recipients = allAccounts.filter((a) => a.user.role === 'trainer' && a.user.status === 'active');
      const broadcastConvId = `broadcast_admin`;
      sendChatMessage({
        conversationId: broadcastConvId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        recipientId: 'ALL',
        recipientName: 'Todos',
        text: text.trim(),
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      // Add notification for each trainer
      recipients.forEach((r) => {
        addNotification({
          recipientId: r.user.id,
          senderId: currentUser.id,
          senderName: currentUser.name,
          type: 'message',
          title: 'Mensaje del Administrador',
          body: text.trim().substring(0, 80),
        });
      });
    } else if (selectedContact) {
      const convId = getConversationId(currentUser.id, selectedContact.id);
      sendChatMessage({
        conversationId: convId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        recipientId: selectedContact.id,
        recipientName: selectedContact.name,
        text: text.trim(),
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      addNotification({
        recipientId: selectedContact.id,
        senderId: currentUser.id,
        senderName: currentUser.name,
        type: 'message',
        title: `Mensaje de ${currentUser.name}`,
        body: text.trim().substring(0, 80),
        link: '/chat',
      });
    }

    setText('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Layout>
      <Header title="Chat" subtitle="Mensajería bidireccional" />
      <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-50">
        {/* Sidebar: contacts */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar contacto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Broadcast option (admin only) */}
          {isAdmin && (
            <button
              onClick={() => { setBroadcastMode(true); setSelectedConvId('broadcast'); }}
              className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 transition ${broadcastMode ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <Radio className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-slate-800">Enviar a Todos</p>
                <p className="text-xs text-slate-400">Mensaje broadcast</p>
              </div>
            </button>
          )}

          <div className="flex-1 overflow-y-auto">
            {filteredContacts.length === 0 && (
              <p className="text-xs text-slate-400 text-center mt-8 px-4">No hay contactos disponibles</p>
            )}
            {filteredContacts.map((c) => {
              const convId = getConversationId(currentUser?.id || '', c.id);
              const isSelected = !broadcastMode && selectedConvId === convId;
              const unread = getUnread(c.id);
              const lastMsg = [...chatMessages]
                .filter((m) => m.conversationId === convId)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
              return (
                <button
                  key={c.id}
                  onClick={() => handleSelectContact(c.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 border-b border-slate-50 transition text-left ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm ${
                    c.type === 'admin' ? 'bg-purple-500' : c.type === 'athlete' ? 'bg-green-500' : 'bg-blue-500'
                  }`}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                      {lastMsg && <span className="text-xs text-slate-400 shrink-0 ml-1">{formatTime(lastMsg.createdAt)}</span>}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400 truncate">
                        {lastMsg ? (lastMsg.attachments?.length ? '📎 ' + lastMsg.text || 'Archivo adjunto' : lastMsg.text) : c.subtitle}
                      </p>
                      {unread > 0 && (
                        <span className="ml-1 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center shrink-0">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {!selectedConvId && !broadcastMode ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <MessageSquare className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-lg font-medium">Selecciona una conversación</p>
              <p className="text-sm mt-1">Elige un contacto del panel izquierdo</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center gap-3">
                {broadcastMode ? (
                  <>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <Radio className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">Enviar a Todos los Entrenadores</p>
                      <p className="text-xs text-slate-400">Mensaje broadcast</p>
                    </div>
                  </>
                ) : selectedContact ? (
                  <>
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-sm ${
                      selectedContact.type === 'admin' ? 'bg-purple-500' : selectedContact.type === 'athlete' ? 'bg-green-500' : 'bg-blue-500'
                    }`}>
                      {selectedContact.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{selectedContact.name}</p>
                      <p className="text-xs text-slate-400">{selectedContact.subtitle}</p>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {conversationMessages.length === 0 && (
                  <p className="text-center text-sm text-slate-400 mt-10">No hay mensajes aún. ¡Sé el primero en escribir!</p>
                )}
                {conversationMessages.map((msg) => {
                  const isMine = msg.senderId === currentUser?.id;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[70%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                        {!isMine && (
                          <span className="text-xs text-slate-500 ml-1">{msg.senderName}</span>
                        )}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm ${
                          msg.isSystemMessage
                            ? 'bg-slate-100 text-slate-500 text-xs italic text-center mx-auto'
                            : isMine
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
                        }`}>
                          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                          {msg.attachments?.map((att, i) => (
                            <div key={i} className="mt-2">
                              {att.type === 'image' ? (
                                <img src={att.url} alt={att.name} className="max-w-[200px] rounded-lg" />
                              ) : (
                                <a href={att.url} download={att.name} className={`flex items-center gap-2 text-xs underline ${isMine ? 'text-blue-100' : 'text-blue-600'}`}>
                                  <FileText className="w-4 h-4" />
                                  {att.name}
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
                    <div key={i} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700">
                      {att.type === 'image' ? <Image className="w-3.5 h-3.5 text-blue-500" /> : <FileText className="w-3.5 h-3.5 text-red-500" />}
                      <span className="max-w-[120px] truncate">{att.name}</span>
                      <button onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                        <X className="w-3 h-3 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input area */}
              <div className="bg-white border-t border-slate-200 p-3 flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileAttach}
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition flex-shrink-0"
                  title="Adjuntar archivo"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribe un mensaje... (Enter para enviar)"
                  rows={1}
                  className="flex-1 resize-none px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-32"
                  style={{ minHeight: '42px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!text.trim() && attachments.length === 0}
                  className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};
