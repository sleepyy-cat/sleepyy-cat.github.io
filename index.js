import { createApp, ref, computed } from "vue";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

function setup() {
  // Initialize Graffiti
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

  // This is the "directory" our messages will go in
  const channel = ref("my-general");

  // Declare a signal for the message entered in the chat
  const myMessage = ref("");
  const newChatTitle = ref("");
  const selectedTone = ref("");

  const editingMessage = ref(null);
  const editContent = ref("");
  const editTone = ref("");
  const isSavingEdit = ref(false);

  const editingChat = ref(null);
  const editChatTitle = ref("");
  const isSavingChatEdit = ref(false);

  const isCreatingChat = ref(false);

  const { objects: chats } = useGraffitiDiscover(
    ["my-general"],
    {
      properties: {
        value: {
          required: ["activity", "type", "channel", "title", "published"],
          properties: {
            activity: { const: "Create" },
            type: { const: "Chat" },
            channel: { type: "string" },
            title: { type: "string" },
            published: { type: "number" }
          }
        }
      },
    },
    undefined,
    true,
  )

  const sortedChats = computed(() => {
    return chats.value.toSorted((a, b) => {
      return a.value.published - b.value.published;
    });
  });

  function selectChat(chat) {
    channel.value = chat.value.channel;
  }

  // "Discover" messages in the chat
  const { objects: messageObjects, isFirstPoll: areMessageObjectsLoading } =
    useGraffitiDiscover(
      () => [channel.value],
      {
        properties: {
          value: {
            required: ["content", "published"],
            properties: {
              content: { type: "string" },
              published: { type: "number" },
              tone: { type: "string"}
            },
          },
        },
      },
      undefined, // Don't look for private messages
      true, // Automatically poll for new messages (realtime)
    );

  // Sort the messages by their timestamp
  const sortedMessageObjects = computed(() => {
    return messageObjects.value.toSorted((a, b) => {
      return a.value.published - b.value.published;
    });
  });

  // A function to send a message.
  // Since the function is async, we
  // create an "isSending" signal for
  // displaying feedback.
  const isSending = ref(false);
  async function sendMessage() {
    isSending.value = true;
    try {
      await graffiti.post(
        {
          value: {
            content: myMessage.value,
            published: Date.now(),
            tone: selectedTone.value
          },
          channels: [channel.value],
        },
        session.value,
      );
      myMessage.value = "";
      selectedTone.value = "";
    } finally {
      isSending.value = false;
    }
  }

  // A function to delete a message.
  // Since the function is async, we
  // create an "isDeleting" signal for
  // displaying feedback.
  const isDeleting = ref(new Set());
  async function deleteMessage(message) {
    if (!confirm(`Are you sure you want to delete the message "${message.value.content}"? This action is irreversible.`)) {
        return;
    }
    isDeleting.value.add(message.url);
    try {
      await graffiti.delete(message, session.value);
    } finally {
      isDeleting.value.delete(message.url);
    }
  }

  async function newChat() {
    if (!newChatTitle.value.trim() || isCreatingChat.value) {
        return;
    }
    isCreatingChat.value = true;
    try {
        await graffiti.post(
        {
            value: {
            activity: "Create",
            type: "Chat",
            channel: crypto.randomUUID(),
            title: newChatTitle.value,
            published: Date.now(),
            },
            channels: ["my-general"],
        },
        session.value,
        );
        newChatTitle.value = "";
    } finally {
        isCreatingChat.value = false;
    }
  }

  function startEdit(message) {
    editingMessage.value = message;
    editContent.value = message.value.content;
    editTone.value = message.value.tone || "";
  }
  
  async function saveEdit(message) {
    if (!editContent.value.trim()) {
        return;
    }
    isSavingEdit.value = true;
    try {
        await graffiti.delete(message, session.value);
        await graffiti.post(
            {
                url: message.url,
                value: {
                    content: editContent.value,
                    published: message.value.published,
                    tone: editTone.value,
                },
                channels: [channel.value],
            },
            session.value,
        );
        cancelEdit();
    } finally {
        isSavingEdit.value = false;
    }
  }

  function cancelEdit() {
    editingMessage.value = null;
    editContent.value = "";
    editTone.value = "";
  }

  const currentChatTitle = computed(() => {
    const currentChat = chats.value.find(chat => chat.value.channel === channel.value);
    return currentChat ? currentChat.value.title : "General Chat";
  });

  const isDeletingChat = ref(new Set());
  async function deleteChat(chat) {
    if (!confirm(`Are you sure you want to delete the chat "${chat.value.title}"? This will also delete all messages in this chat.`)) {
        return;
    }
    
    isDeletingChat.value.add(chat.url);
    try {
        const chatChannel = chat.value.channel;
        const { objects: messagesInChat } = useGraffitiDiscover(
        [chatChannel],
        {
            properties: {
            value: {
                required: ["content", "published"],
                properties: {
                content: { type: "string" },
                published: { type: "number" },
                tone: { type: "string"}
                },
            },
            },
        },
        undefined,
        false
        );
        await new Promise(resolve => setTimeout(resolve, 100));
        
        for (const message of messagesInChat.value) {
            await graffiti.delete(message, session.value);
        }
        
        await graffiti.delete(chat, session.value);
    } finally {
        isDeletingChat.value.delete(chat.url);
    }
  }

  function startChatEdit(chat) {
    editingChat.value = chat;
    editChatTitle.value = chat.value.title;
  }
  
  async function saveChatEdit(chat) {
    if (!editChatTitle.value.trim() || isSavingChatEdit.value) {
        return;
    }
    isSavingChatEdit.value = true;
    try {
        await graffiti.delete(chat, session.value);
        await graffiti.post(
            {
                value: {
                    activity: "Create",
                    type: "Chat",
                    channel: chat.value.channel,
                    title: editChatTitle.value,
                    published: chat.value.published,
                },
                channels: ["my-general"],
            },
            session.value,
        );
        cancelChatEdit();
    } finally {
        isSavingChatEdit.value = false;
    }
  }
  
  function cancelChatEdit() {
    editingChat.value = null;
    editChatTitle.value = "";
  }

  return {
    myMessage,
    messageObjects,
    areMessageObjectsLoading,
    sortedMessageObjects,
    isSending,
    sendMessage,
    isDeleting,
    deleteMessage,
    newChat,
    chats,
    sortedChats,
    selectChat,
    channel,
    newChatTitle,
    selectedTone,
    editingMessage,
    editContent,
    editTone,
    isSavingEdit,
    startEdit,
    saveEdit,
    cancelEdit,
    currentChatTitle,
    isCreatingChat,
    isDeletingChat,
    deleteChat,
    editingChat,
    editChatTitle,
    isSavingChatEdit,
    startChatEdit,
    saveChatEdit,
    cancelChatEdit
  };
}

const App = { template: "#template", setup };

createApp(App)
  .use(GraffitiPlugin, {
    // graffiti: new GraffitiLocal(),
    graffiti: new GraffitiDecentralized(),
  })
  .mount("#app");