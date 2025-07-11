// App.tsx
import React, { useEffect, useState } from 'react';
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithRedirect, User } from "firebase/auth";
import { getFirestore, collection, query, orderBy, onSnapshot, doc, setDoc, Timestamp, getDoc } from "firebase/firestore";

// Replace with your Firebase config from the Firebase console
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

interface Conversation {
  id: string;
  name?: string;
  participants: string[];
  phoneNumberId: string;
  lastActivityAt: Timestamp;
}

interface Message {
  id: string;
  from: string;
  to: string[];
  direction: 'incoming' | 'outgoing';
  text: string;
  status: string;
  createdAt: Timestamp;
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setUser);
    return unsubscribe;
  }, []);

  if (!user) {
    return <Auth />;
  }

  return <Dashboard user={user} />;
};

// Auth.tsx (inline)
const Auth() {
  const login = () => {
    const provider = new GoogleAuthProvider();
    signInWithRedirect(auth, provider);
  };

  return (
    <div className="flex items-center justify-center">
      <button onClick={login} className="bg-blue-500 text-white px-4 py-2 rounded">
        Login with Google
      </button>
    </div>
  );
}

// Dashboard.tsx (inline
const Dashboard: React.FC<{ user: User }> = ({ user }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);

  useEffect(() => {
    const settingsRef = doc(db, `users/${user.uid}/settings/openphone`);
    const unsub = onSnapshot(settingsRef, (snap) => {
      const data = snap.data();
      if (data?.apiKey) {
        setApiKey(data.apiKey);
        setHasApiKey(true);
      }
    });
    return unsub;
  }, [user.uid]);

  useEffect(() => {
    const q = query(collection(db, 'conversations'), orderBy('lastActivityAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const convs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation[]));
      setConversations(convs);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (hasApiKey) {
      syncConversations(apiKey);
    }
  }, [hasApiKey, apiKey, apiKey]);

  const saveApiKey = () => {
    const settingsRef = doc(db, `users/${user.uid}/settings/openphone`);
    setDoc(settingsRef, { apiKey }, { merge: true });
    setHasApiKey(true);
  };

  if (!hasApiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <input 
          type="text" 
          value={apiKey} 
          onChange={(e) => setApiKey(e.target.value)} 
placeholder="OpenPhone API Key" 
          className="border p-2 mb-2" 
        />
        <button onClick={saveApiKey} className="bg-green-500 text-white px-4 py-2 rounded">
          Save API Key
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <ConversationList conversations={conversations} onSelect={setSelected} />
      {selected && <ChatView conversationId={selected} apiKey={apiKey} />}
    </div>
  );
};

// ConversationList.tsx (inline)
const ConversationList: React.FC<{ conversations: Conversation[]; onSelect: (id: string) => void }> = ({ conversations, onSelect }) => {
  return (
    <div className="w-1/4 border-r overflow-y-auto">
      <ul>
        {conversations.map((conv) => (
          <li 
            key={conv.id} 
            onClick={() => onSelect(conv.id)} 
            className="p-2 hover:bg-gray-200 cursor-pointer"
          >
            {conv.name || conv.participants[0] || 'Unknown'}
          </li>
        ))}
      </ul>
    </div>
  );
};

// ChatView.tsx (inline)
const ChatView: React.FC<{ conversationId: string; apiKey: string }> = ({ conversationId, apiKey }) => {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const q = query(collection(db, `conversations/${conversationId}/messages`), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
      setMessages(msgs);
    });
    return unsub;
  }, [conversationId]);

  useEffect(() => {
    const loadHistorical = async () => {
      const convRef = doc(db, 'conversations', conversationId);
      const convSnap = await getDoc(convRef);
      if (convSnap.exists()) {
        const conv = convSnap.data() as Conversation;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const url = `https://api.openphone.com/v1/messages?phoneNumberId=${conv.phoneNumberId}&participants=${conv.participants.join('&participants=')}&maxResults=100}&createdAfter=${thirtyDaysAgo}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${apiKey}` }
        });
        const data = await res.json();
        if (data.data) {
          data.data of data.data.forEach(async (msg: any) => {
            const msgRef = doc(db, `conversations/${conversationId}/messages/${msg.id}`);
            const existing = await getDoc(msgRef);
            if (!existing.exists()) {
              await setDoc(msgRef, {
                from: msg.from,
                to: msg.to,
                direction: msg.direction,
                text: msg.text,
                status: msg.status,
                createdAt: Timestamp.fromDate(new Date(msg.createdAt))
              });
            }
          });
        }
      }
    };
    loadHistorical();
  }, [conversationId, apiKey]);

  // Simple date grouping for separators
  const grouped = messages.reduce((acc, msg) => {
    const date = msg.createdAt.toDate().toLocaleDateString();
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {} as Record<string, Message[]>);

  return (
    <div className="w-3/4 p-4 overflow-y-auto">
      {Object.entries(grouped).map(([date, msgs]) => (
        <div key={date}>
          <div className="text-center text-gray-500 my-2">{date}</div>
          {msgs.map((msg) => (
            <div 
              key={msg.id} 
              className={`mb-2 ${msg.direction === 'incoming' ? 'text-left' : 'text-right text-white bg-blue-500' } p-2 rounded`}
            >
              {msg.text}
              <small className="block text-gray-400">{msg.createdAt.toDate().toLocaleTimeString()}</small>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default App;
