import { createApp, ref, computed, watch } from "vue";
import { createRouter, createWebHashHistory, useRoute, useRouter } from "vue-router";
import { GraffitiLocal } from "@graffiti-garden/implementation-local";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiSession,
  useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";

function useTonePreferences() {
  const STORAGE_KEY = 'tone-preferences';
  
  const defaultColors = {
    excited: '#ffe600',
    happy: '#00ff08',
    joking: '#ff9800',
    neutral: '#ffffff',
    sad: '#008cff',
    bored: '#845646',
    annoyed: '#ff3c00',
    mad: '#ff0000',
    noTone: '#ffffff'
  };
  
  const defaultTextColors = {
    excited: '#000000',
    happy: '#000000',
    joking: '#000000',
    neutral: '#000000',
    sad: '#ffffff',
    bored: '#ffffff',
    annoyed: '#ffffff',
    mad: '#ffffff',
    noTone: '#000000'
  };
  
  const toneColors = ref(JSON.parse(localStorage.getItem(STORAGE_KEY + '_bg') || 'null') || defaultColors);
  const toneTextColors = ref(JSON.parse(localStorage.getItem(STORAGE_KEY + '_text') || 'null') || defaultTextColors);
  
  const updateToneColor = (tone, color, textColor) => {
    toneColors.value = {
      ...toneColors.value,
      [tone]: color
    };
    toneTextColors.value = {
      ...toneTextColors.value,
      [tone]: textColor
    };
    localStorage.setItem(STORAGE_KEY + '_bg', JSON.stringify(toneColors.value));
    localStorage.setItem(STORAGE_KEY + '_text', JSON.stringify(toneTextColors.value));
  };
  
  const resetToDefaults = () => {
    toneColors.value = defaultColors;
    toneTextColors.value = defaultTextColors;
    localStorage.setItem(STORAGE_KEY + '_bg', JSON.stringify(defaultColors));
    localStorage.setItem(STORAGE_KEY + '_text', JSON.stringify(defaultTextColors));
  };
  
  return {
    toneColors,
    toneTextColors,
    updateToneColor,
    resetToDefaults
  };
}

// Update ToneIndicator component:
const ToneIndicator = {
    template: "#tone-indicator-template",
    props: {
        tone: {
            type: String,
            default: ""
        }
    },
    setup(props) {
        const { toneColors, toneTextColors } = useTonePreferences();
        
        const toneText = computed(() => {
            return props.tone && props.tone !== "" ? props.tone : "No tone";
        });
        
        const toneClass = computed(() => {
            if (!props.tone || props.tone === "") return "tone-noTone";
            return `tone-${props.tone.toLowerCase()}`;
        });
        
        const getToneColor = computed(() => {
            const toneKey = props.tone ? props.tone.toLowerCase() : 'noTone';
            return toneColors.value[toneKey] || toneColors.value.noTone;
        });
        
        const getToneTextColor = computed(() => {
            const toneKey = props.tone ? props.tone.toLowerCase() : 'noTone';
            return toneTextColors.value[toneKey] || toneTextColors.value.noTone;
        });
        
        return { 
            toneText,
            toneClass,
            getToneColor,
            getToneTextColor
        };
    }
};

function homeSetup() {
  // Initialize Graffiti
  const graffiti = useGraffiti();
  const session = useGraffitiSession();

  const route = useRoute();
  const router = useRouter();

  // This is the "directory" our messages will go in
  const channel = ref("");

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
    console.log(chat.value.channel);
    router.push(`/chat/${chat.value.channel}`);
  }

  watch(() => route.params.chatId, (chatId) => {
    if (chatId && typeof chatId === 'string') {
      channel.value = chatId;
    } else if (!chatId) {
      channel.value = "";
    }
  }, { immediate: true });

  // "Discover" messages in the chat
  const messagesKey = computed(() => channel.value);
  const { objects: messageObjects, isFirstPoll: areMessageObjectsLoading } =
    useGraffitiDiscover(
      () => messagesKey.value ? [messagesKey.value] : [],
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

  const selectedToneFilter = ref("");
  const filteredMessageObjects = computed(() => {
      if (!selectedToneFilter.value) {
          return sortedMessageObjects.value;
      }
      if (selectedToneFilter.value === "No tone") {
        return sortedMessageObjects.value.filter(msg => !msg.value.tone || msg.value.tone === "");
      }
      return sortedMessageObjects.value.filter(msg => 
          (msg.value.tone || "") === selectedToneFilter.value
      );
  });
  const filteredMessagesCount = computed(() => filteredMessageObjects.value.length);

  const messagesContainer = ref(null);
  const shouldAutoScroll = ref(true);
  const scrollToBottom = () => {
    if (shouldAutoScroll.value && messagesContainer.value) {
      setTimeout(() => {
        if (messagesContainer.value && shouldAutoScroll.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
      }, 0);
    }
  };
  
  const handleScroll = () => {
    if (!messagesContainer.value) return;
    const container = messagesContainer.value;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 10;
    if (isAtBottom) {
      shouldAutoScroll.value = true;
    } else {
      shouldAutoScroll.value = false;
    }
  };

  watch(messagesContainer, (container) => {
    if (container) {
      container.addEventListener('scroll', handleScroll);
      shouldAutoScroll.value = true;
      scrollToBottom();
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  });

  watch(sortedMessageObjects, (newMessages, oldMessages) => {
    if (newMessages.length !== oldMessages?.length) {
      scrollToBottom();
    }
  });
  
  watch(filteredMessagesCount, () => {
    shouldAutoScroll.value = true;
    scrollToBottom();
  });

  // A function to send a message.
  // Since the function is async, we
  // create an "isSending" signal for
  // displaying feedback.
  const isSending = ref(false);
  async function sendMessage() {
    if (!session.value) {
      return;
    }
    shouldAutoScroll.value = true;
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
      console.log(myMessage.value);
      myMessage.value = "";
      selectedTone.value = "";
      scrollToBottom();
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
    if (!session.value || message.actor !== session.value.actor) {
      return;
    }
    if (!confirm(`Are you sure you want to delete the message "${message.value.content}"? This action is irreversible.`)) {
        return;
    }
    console.log(message);
    isDeleting.value.add(message.url);
    try {
      await graffiti.delete(message, session.value);
    } finally {
      isDeleting.value.delete(message.url);
    }
  }

  async function newChat() {
    if (!newChatTitle.value.trim() || isCreatingChat.value || !session.value) {
        return;
    }
    isCreatingChat.value = true;
    try {
        const chatChannel = crypto.randomUUID();
        await graffiti.post(
        {
            value: {
            activity: "Create",
            type: "Chat",
            channel: chatChannel,
            title: newChatTitle.value,
            published: Date.now(),
            },
            channels: ["my-general"],
        },
        session.value,
        );
        newChatTitle.value = "";
        console.log(chatChannel);
        router.push(`/chat/${chatChannel}`);
    } finally {
        isCreatingChat.value = false;
    }
  }

  function startEdit(message) {
    console.log(message);
    editingMessage.value = message;
    editContent.value = message.value.content;
    editTone.value = message.value.tone || "";
  }
  
  async function saveEdit(message) {
    if (!editContent.value.trim() || !session.value || message.actor !== session.value.actor) {
        return;
    }
    isSavingEdit.value = true;
    try {
        console.log(message);
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
    console.log("hi");
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
    if (!session.value || chat.actor !== session.value.actor) {
      return;
    }
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
        console.log(messagesInChat);
        
        await graffiti.delete(chat, session.value);
        if (channel.value === chatChannel) {
          router.push("/");
        }
    } finally {
        isDeletingChat.value.delete(chat.url);
    }
  }

  function startChatEdit(chat) {
    console.log(chat);
    editingChat.value = chat;
    editChatTitle.value = chat.value.title;
  }
  
  async function saveChatEdit(chat) {
    if (!editChatTitle.value.trim() || isSavingChatEdit.value || !session.value || chat.actor !== session.value.actor) {
        return;
    }
    console.log(chat);
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
    console.timeLog(editingChat);
    editingChat.value = null;
    editChatTitle.value = "";
  }

  const { toneColors, toneTextColors, updateToneColor, resetToDefaults } = useTonePreferences();
  const editingTone = ref(null);
  const editingToneColor = ref("");
  const editingToneTextColor = ref("");
  
  function startToneEdit(tone) {
    editingTone.value = tone;
    editingToneColor.value = toneColors.value[tone] || toneColors.value.noTone;
    editingToneTextColor.value = toneTextColors.value[tone] || toneTextColors.value.noTone;
  }
  
  function saveToneColor() {
    if (editingTone.value && editingToneColor.value) {
      updateToneColor(editingTone.value, editingToneColor.value, editingToneTextColor.value);
      editingTone.value = null;
      editingToneColor.value = "";
      editingToneTextColor.value = "";
    }
  }
  
  function cancelToneEdit() {
    editingTone.value = null;
    editingToneColor.value = "";
    editingToneTextColor.value = "";
  }

  const dynamicDropdownStyles = computed(() => {
  let styles = '';
  for (const [tone, color] of Object.entries(toneColors.value)) {
    const toneName = tone === 'noTone' ? 'No tone' : tone.charAt(0).toUpperCase() + tone.slice(1);
    const textColor = toneTextColors.value[tone];
    styles += `
      select option[value="${toneName}"],
      select option[value="${tone === 'noTone' ? 'No tone' : toneName}"],
      .tone-${tone} {
        background-color: ${color} !important;
        color: ${textColor} !important;
      }
    `;
  }
  return styles;
});

  const styleTag = ref(null);
  watch([toneColors, toneTextColors], () => {
    if (!styleTag.value) {
      styleTag.value = document.createElement('style');
      styleTag.value.id = 'dynamic-tone-styles';
      document.head.appendChild(styleTag.value);
    }
    styleTag.value.textContent = dynamicDropdownStyles.value;
  }, { immediate: true, deep: true });

  const isInChat = computed(() => {
    return !!route.params.chatId;
  });

  function exitChat() {
    router.push('/');
  }

  const showColorsSection = ref(localStorage.getItem('showColorsSection') !== 'false');
  
  function toggleColorsSection() {
    showColorsSection.value = !showColorsSection.value;
    localStorage.setItem('showColorsSection', showColorsSection.value);
  }

  function handleMessageKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent newline
        if (myMessage.value.trim() && !isSending.value) {
            sendMessage();
        }
    }
  }

  function handleEditKeydown(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault(); // Prevent newline
          if (editContent.value.trim() && editingMessage.value && !isSavingEdit.value) {
              saveEdit(editingMessage.value);
          }
      }
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
    cancelChatEdit,
    selectedToneFilter,
    filteredMessageObjects,
    filteredMessagesCount,
    messagesContainer,
    toneColors,
    toneTextColors,
    editingTone,
    editingToneColor,
    editingToneTextColor,
    startToneEdit,
    saveToneColor,
    cancelToneEdit,
    resetToDefaults,
    styleTag,
    isInChat,
    exitChat,
    showColorsSection,
    toggleColorsSection,
    handleMessageKeydown,
    handleEditKeydown
  };
}

function loginSetup() {
  const graffiti = useGraffiti();
  const session = useGraffitiSession();
  const router = useRouter();

  async function handleLogin() {
    await graffiti.login();
    router.push("/");
  }

  async function handleLogout() {
    if (session.value) {
        await graffiti.logout(session.value);
        router.push("/");
    }
  }

  return {
    handleLogin,
    handleLogout
  };
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", component: { template: "#home-template", setup: homeSetup }, name: "home" },
    { path: "/chat/:chatId", component: { template: "#home-template", setup: homeSetup }, name: "chat", props: true },
    { path: "/login", component: { template: "#login-template", setup: loginSetup }, name: "login" }
  ],
});

const App = { template: "#template", setup: homeSetup, components: {} };

createApp(App)
  .component("tone-indicator", ToneIndicator)
  .use(GraffitiPlugin, {
    // graffiti: new GraffitiLocal(),
    graffiti: new GraffitiDecentralized(),
  })
  .use(router)
  .mount("#app");