import * as msgs from "./js/messages.js";
import { speech } from "./js/speech.js";

const leftPanel = document.getElementById('left-panel');
const rightPanel = document.getElementById('right-panel');
const container = document.querySelector('.container');
const chatInput = document.getElementById('chat-input');
const chatHistory = document.getElementById('chat-history');
const sendButton = document.getElementById('send-button');
const inputSection = document.getElementById('input-section');
const statusSection = document.getElementById('status-section');
const chatsSection = document.getElementById('chats-section');
const tasksSection = document.getElementById('tasks-section');
const progressBar = document.getElementById('progress-bar');
const autoScrollSwitch = document.getElementById('auto-scroll-switch');
const timeDate = document.getElementById('time-date-container');


let autoScroll = true;
let context = "";
let connectionStatus = false


// Initialize the toggle button
setupSidebarToggle();
// Initialize tabs
setupTabs();

function isMobile() {
    return window.innerWidth <= 768;
}

function toggleSidebar(show) {
    const overlay = document.getElementById('sidebar-overlay');
    if (typeof show === 'boolean') {
        leftPanel.classList.toggle('hidden', !show);
        rightPanel.classList.toggle('expanded', !show);
        overlay.classList.toggle('visible', show);
    } else {
        leftPanel.classList.toggle('hidden');
        rightPanel.classList.toggle('expanded');
        overlay.classList.toggle('visible', !leftPanel.classList.contains('hidden'));
    }
}

function handleResize() {
    const overlay = document.getElementById('sidebar-overlay');
    if (isMobile()) {
        leftPanel.classList.add('hidden');
        rightPanel.classList.add('expanded');
        overlay.classList.remove('visible');
    } else {
        leftPanel.classList.remove('hidden');
        rightPanel.classList.remove('expanded');
        overlay.classList.remove('visible');
    }
}

window.addEventListener('load', handleResize);
window.addEventListener('resize', handleResize);

document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('sidebar-overlay');
    overlay.addEventListener('click', () => {
        if (isMobile()) {
            toggleSidebar(false);
        }
    });
});

function setupSidebarToggle() {
    const leftPanel = document.getElementById('left-panel');
    const rightPanel = document.getElementById('right-panel');
    const toggleSidebarButton = document.getElementById('toggle-sidebar');
    if (toggleSidebarButton) {
        toggleSidebarButton.addEventListener('click', toggleSidebar);
    } else {
        console.error('Toggle sidebar button not found');
        setTimeout(setupSidebarToggle, 100);
    }
}
document.addEventListener('DOMContentLoaded', setupSidebarToggle);

export async function sendMessage() {
    try {
        const message = chatInput.value.trim();
        const inputAD = Alpine.$data(inputSection);
        const attachments = inputAD.attachments;
        const hasAttachments = attachments && attachments.length > 0;

        if (message || hasAttachments) {
            let response;
            const messageId = generateGUID();

            // Include attachments in the user message
            if (hasAttachments) {
                const attachmentsWithUrls = attachments.map(attachment => {
                    if (attachment.type === 'image') {
                        return {
                            ...attachment,
                            url: URL.createObjectURL(attachment.file)
                        };
                    } else {
                        return {
                            ...attachment
                        };
                    }
                });

                // Render user message with attachments
                setMessage(messageId, 'user', '', message, false, {
                    attachments: attachmentsWithUrls
                });

                const formData = new FormData();
                formData.append('text', message);
                formData.append('context', context);
                formData.append('message_id', messageId);

                for (let i = 0; i < attachments.length; i++) {
                    formData.append('attachments', attachments[i].file);
                }

                response = await fetch('/message_async', {
                    method: 'POST',
                    body: formData
                });
            } else {
                // For text-only messages
                const data = {
                    text: message,
                    context,
                    message_id: messageId
                };
                response = await fetch('/message_async', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });
            }

            // Handle response
            const jsonResponse = await response.json();
            if (!jsonResponse) {
                toast("No response returned.", "error");
            }
            // else if (!jsonResponse.ok) {
            //     if (jsonResponse.message) {
            //         toast(jsonResponse.message, "error");
            //     } else {
            //         toast("Undefined error.", "error");
            //     }
            // }
            else {
                setContext(jsonResponse.context);
            }

            // Clear input and attachments
            chatInput.value = '';
            inputAD.attachments = [];
            inputAD.hasAttachments = false;
            adjustTextareaHeight();
        }
    } catch (e) {
        toastFetchError("Error sending message", e)
    }
}

function toastFetchError(text, error) {
    if (getConnectionStatus()) {
        toast(`${text}: ${error.message}`, "error");
    } else {
        toast(`${text} (it seems the backend is not running): ${error.message}`, "error");
    }
    console.error(text, error);
}
window.toastFetchError = toastFetchError

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendButton.addEventListener('click', sendMessage);


export function updateChatInput(text) {
    console.log('updateChatInput called with:', text);

    // Append text with proper spacing
    const currentValue = chatInput.value;
    const needsSpace = currentValue.length > 0 && !currentValue.endsWith(' ');
    chatInput.value = currentValue + (needsSpace ? ' ' : '') + text + ' ';

    // Adjust height and trigger input event
    adjustTextareaHeight();
    chatInput.dispatchEvent(new Event('input'));

    console.log('Updated chat input value:', chatInput.value);
}

function updateUserTime() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const ampm = hours >= 12 ? 'pm' : 'am';
    const formattedHours = hours % 12 || 12;

    // Format the time
    const timeString = `${formattedHours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${ampm}`;

    // Format the date
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    const dateString = now.toLocaleDateString(undefined, options);

    // Update the HTML
    const userTimeElement = document.getElementById('time-date');
    userTimeElement.innerHTML = `${timeString}<br><span id="user-date">${dateString}</span>`;
}

updateUserTime();
setInterval(updateUserTime, 1000);


function setMessage(id, type, heading, content, temp, kvps = null) {
    // Search for the existing message container by id
    let messageContainer = document.getElementById(`message-${id}`);

    if (messageContainer) {
        // Don't re-render user messages
        if (type === 'user') {
            return; // Skip re-rendering
        }
        // For other types, update the message
        messageContainer.innerHTML = '';
    } else {
        // Create a new container if not found
        const sender = type === 'user' ? 'user' : 'ai';
        messageContainer = document.createElement('div');
        messageContainer.id = `message-${id}`;
        messageContainer.classList.add('message-container', `${sender}-container`);
        if (temp) messageContainer.classList.add("message-temp");
    }

    const handler = msgs.getHandler(type);
    handler(messageContainer, id, type, heading, content, temp, kvps);

    // If the container was found, it was already in the DOM, no need to append again
    if (!document.getElementById(`message-${id}`)) {
        chatHistory.appendChild(messageContainer);
    }

    if (autoScroll) chatHistory.scrollTop = chatHistory.scrollHeight;
}


window.loadKnowledge = async function () {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.pdf,.csv,.html,.json,.md';
    input.multiple = true;

    input.onchange = async () => {
        try{
        const formData = new FormData();
        for (let file of input.files) {
            formData.append('files[]', file);
        }

        formData.append('ctxid', getContext());

        const response = await fetch('/import_knowledge', {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            toast(await response.text(), "error");
        } else {
            const data = await response.json();
            toast("Knowledge files imported: " + data.filenames.join(", "), "success");
        }
        } catch (e) {
            toastFetchError("Error loading knowledge", e)
        }
    };

    input.click();
}


function adjustTextareaHeight() {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight) + 'px';
}

export const sendJsonData = async function (url, data) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
    }
    const jsonResponse = await response.json();
    return jsonResponse;
}
window.sendJsonData = sendJsonData

function generateGUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getConnectionStatus() {
    return connectionStatus
}

function setConnectionStatus(connected) {
    connectionStatus = connected
    const statusIcon = Alpine.$data(timeDate.querySelector('.status-icon'));
    statusIcon.connected = connected
}

let lastLogVersion = 0;
let lastLogGuid = ""
let lastSpokenNo = 0

async function poll() {
    let updated = false
    try {
        // Get timezone from navigator
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        const response = await sendJsonData(
            "/poll",
            {
                log_from: lastLogVersion,
                context: context || null,
                timezone: timezone
            }
        );

        // Check if the response is valid
        if (!response) {
            console.error("Invalid response from poll endpoint");
            return false;
        }

        if (!context) setContext(response.context)
        if (response.context != context) return //skip late polls after context change

        if (lastLogGuid != response.log_guid) {
            chatHistory.innerHTML = ""
            lastLogVersion = 0
        }

        if (lastLogVersion != response.log_version) {
            updated = true
            for (const log of response.logs) {
                const messageId = log.id || log.no; // Use log.id if available
                setMessage(messageId, log.type, log.heading, log.content, log.temp, log.kvps);
            }
            afterMessagesUpdate(response.logs)
        }

        lastLogVersion = response.log_version;
        lastLogGuid = response.log_guid;

        updateProgress(response.log_progress, response.log_progress_active)

        //set ui model vars from backend
        const inputAD = Alpine.$data(inputSection);
        inputAD.paused = response.paused;

        // Update status icon state
        setConnectionStatus(true)

        // Update chats list and sort by created_at time (newer first)
        const chatsAD = Alpine.$data(chatsSection);
        const contexts = response.contexts || [];
        chatsAD.contexts = contexts.sort((a, b) =>
            (b.created_at || 0) - (a.created_at || 0)
        );

        // Update tasks list and sort by creation time (newer first)
        const tasksSection = document.getElementById('tasks-section');
        if (tasksSection) {
            const tasksAD = Alpine.$data(tasksSection);
            let tasks = response.tasks || [];

            // Always update tasks to ensure state changes are reflected
            if (tasks.length > 0) {
                // Sort the tasks by creation time
                const sortedTasks = [...tasks].sort((a, b) =>
                    (b.created_at || 0) - (a.created_at || 0)
                );

                // Assign the sorted tasks to the Alpine data
                tasksAD.tasks = sortedTasks;
            } else {
                // Make sure to use a new empty array instance
                tasksAD.tasks = [];
            }
        }

        // Make sure the active context is properly selected in both lists
        if (context) {
            // Update selection in the active tab
            const activeTab = localStorage.getItem('activeTab') || 'chats';

            if (activeTab === 'chats') {
                chatsAD.selected = context;
                localStorage.setItem('lastSelectedChat', context);

                // Check if this context exists in the chats list
                const contextExists = contexts.some(ctx => ctx.id === context);

                // If it doesn't exist in the chats list but we're in chats tab, try to select the first chat
                if (!contextExists && contexts.length > 0) {
                    // Check if the current context is empty before creating a new one
                    // If there's already a current context and we're just updating UI, don't automatically
                    // create a new context by calling setContext
                    const firstChatId = contexts[0].id;

                    // Only create a new context if we're not currently in an existing context
                    // This helps prevent duplicate contexts when switching tabs
                    setContext(firstChatId);
                    chatsAD.selected = firstChatId;
                    localStorage.setItem('lastSelectedChat', firstChatId);
                }
            } else if (activeTab === 'tasks' && tasksSection) {
                const tasksAD = Alpine.$data(tasksSection);
                tasksAD.selected = context;
                localStorage.setItem('lastSelectedTask', context);

                // Check if this context exists in the tasks list
                const taskExists = response.tasks?.some(task => task.id === context);

                // If it doesn't exist in the tasks list but we're in tasks tab, try to select the first task
                if (!taskExists && response.tasks?.length > 0) {
                    const firstTaskId = response.tasks[0].id;
                    setContext(firstTaskId);
                    tasksAD.selected = firstTaskId;
                    localStorage.setItem('lastSelectedTask', firstTaskId);
                }
            }
        } else if (response.tasks && response.tasks.length > 0 && localStorage.getItem('activeTab') === 'tasks') {
            // If we're in tasks tab with no selection but have tasks, select the first one
            const firstTaskId = response.tasks[0].id;
            setContext(firstTaskId);
            if (tasksSection) {
                const tasksAD = Alpine.$data(tasksSection);
                tasksAD.selected = firstTaskId;
                localStorage.setItem('lastSelectedTask', firstTaskId);
            }
        } else if (contexts.length > 0 && localStorage.getItem('activeTab') === 'chats') {
            // If we're in chats tab with no selection but have chats, select the first one
            const firstChatId = contexts[0].id;

            // Only set context if we don't already have one to avoid duplicates
            if (!context) {
                setContext(firstChatId);
                chatsAD.selected = firstChatId;
                localStorage.setItem('lastSelectedChat', firstChatId);
            }
        }

        lastLogVersion = response.log_version;
        lastLogGuid = response.log_guid;

    } catch (error) {
        console.error('Error:', error);
        setConnectionStatus(false)
    }

    return updated
}

function afterMessagesUpdate(logs) {
    if (localStorage.getItem('speech') == 'true') {
        speakMessages(logs)
    }
}

function speakMessages(logs) {
    // log.no, log.type, log.heading, log.content
    for (let i = logs.length - 1; i >= 0; i--) {
        const log = logs[i]
        if (log.type == "response") {
            if (log.no > lastSpokenNo) {
                lastSpokenNo = log.no
                speech.speak(log.content)
                return
            }
        }
    }
}

function updateProgress(progress, active) {
    if (!progress) progress = ""

    if (!active) {
        removeClassFromElement(progressBar, "shiny-text")
    } else {
        addClassToElement(progressBar, "shiny-text")
    }

    if (progressBar.innerHTML != progress) {
        progressBar.innerHTML = progress
    }
}

window.pauseAgent = async function (paused) {
    try {
        const resp = await sendJsonData("/pause", { paused: paused, context });
    } catch (e) {
        window.toastFetchError("Error pausing agent", e)
    }
}

window.resetChat = async function (ctxid=null) {
    try {
        const resp = await sendJsonData("/chat_reset", { "context": ctxid === null ? context : ctxid });
        if (ctxid === null) updateAfterScroll();
    } catch (e) {
        window.toastFetchError("Error resetting chat", e);
    }
}

window.newChat = async function () {
    try {
        setContext(generateGUID());
        updateAfterScroll()
    } catch (e) {
        window.toastFetchError("Error creating new chat", e)
    }
}

window.killChat = async function (id) {
    if (!id) {
        console.error("No chat ID provided for deletion");
        return;
    }

    console.log("Deleting chat with ID:", id);

    try {
        const chatsAD = Alpine.$data(chatsSection);
        console.log("Current contexts before deletion:", JSON.stringify(chatsAD.contexts.map(c => ({ id: c.id, name: c.name }))));

        // switch to another context if deleting current
        switchFromContext(id);

        // Delete the chat on the server
        await sendJsonData("/chat_remove", { context: id });

        // Update the UI manually to ensure the correct chat is removed
        // Deep clone the contexts array to prevent reference issues
        const updatedContexts = chatsAD.contexts.filter(ctx => ctx.id !== id);
        console.log("Updated contexts after deletion:", JSON.stringify(updatedContexts.map(c => ({ id: c.id, name: c.name }))));

        // Force UI update by creating a new array
        chatsAD.contexts = [...updatedContexts];

        updateAfterScroll();

        toast("Chat deleted successfully", "success");
    } catch (e) {
        console.error("Error deleting chat:", e);
        window.toastFetchError("Error deleting chat", e);
    }
}

export function switchFromContext(id){
    // If we're deleting the currently selected chat, switch to another one first
    if (context === id) {
        const chatsAD = Alpine.$data(chatsSection);
        
        // Find an alternate chat to switch to if we're deleting the current one
        let alternateChat = null;
        for (let i = 0; i < chatsAD.contexts.length; i++) {
            if (chatsAD.contexts[i].id !== id) {
                alternateChat = chatsAD.contexts[i];
                break;
            }
        }

        if (alternateChat) {
            setContext(alternateChat.id);
        } else {
            // If no other chats, create a new empty context
            setContext(generateGUID());
        }
    }
}

// Function to ensure proper UI state when switching contexts
function ensureProperTabSelection(contextId) {
    // Get current active tab
    const activeTab = localStorage.getItem('activeTab') || 'chats';

    // First attempt to determine if this is a task or chat based on the task list
    const tasksSection = document.getElementById('tasks-section');
    let isTask = false;

    if (tasksSection) {
        const tasksAD = Alpine.$data(tasksSection);
        if (tasksAD && tasksAD.tasks) {
            isTask = tasksAD.tasks.some(task => task.id === contextId);
        }
    }

    // If we're selecting a task but are in the chats tab, switch to tasks tab
    if (isTask && activeTab === 'chats') {
        // Store this as the last selected task before switching
        localStorage.setItem('lastSelectedTask', contextId);
        activateTab('tasks');
        return true;
    }

    // If we're selecting a chat but are in the tasks tab, switch to chats tab
    if (!isTask && activeTab === 'tasks') {
        // Store this as the last selected chat before switching
        localStorage.setItem('lastSelectedChat', contextId);
        activateTab('chats');
        return true;
    }

    return false;
}

window.selectChat = async function (id) {
    if (id === context) return //already selected

    // Check if we need to switch tabs based on the context type
    const tabSwitched = ensureProperTabSelection(id);

    // If we didn't switch tabs, proceed with normal selection
    if (!tabSwitched) {
        // Switch to the new context - this will clear chat history and reset tracking variables
        setContext(id);

        // Update both contexts and tasks lists to reflect the selected item
        const chatsAD = Alpine.$data(chatsSection);
        const tasksSection = document.getElementById('tasks-section');
        if (tasksSection) {
            const tasksAD = Alpine.$data(tasksSection);
            tasksAD.selected = id;
        }
        chatsAD.selected = id;

        // Store this selection in the appropriate localStorage key
        const activeTab = localStorage.getItem('activeTab') || 'chats';
        if (activeTab === 'chats') {
            localStorage.setItem('lastSelectedChat', id);
        } else if (activeTab === 'tasks') {
            localStorage.setItem('lastSelectedTask', id);
        }

        // Trigger an immediate poll to fetch content
        poll();
    }

    updateAfterScroll();
}

export const setContext = function (id) {
    if (id == context) return;
    context = id;
    // Always reset the log tracking variables when switching contexts
    // This ensures we get fresh data from the backend
    lastLogGuid = "";
    lastLogVersion = 0;
    lastSpokenNo = 0;

    // Clear the chat history immediately to avoid showing stale content
    chatHistory.innerHTML = "";

    // Update both selected states
    const chatsAD = Alpine.$data(chatsSection);
    const tasksAD = Alpine.$data(tasksSection);

    chatsAD.selected = id;
    tasksAD.selected = id;
}

export const getContext = function () {
    return context
}

window.toggleAutoScroll = async function (_autoScroll) {
    autoScroll = _autoScroll;
}

window.toggleJson = async function (showJson) {
    // add display:none to .msg-json class definition
    toggleCssProperty('.msg-json', 'display', showJson ? 'block' : 'none');
}

window.toggleThoughts = async function (showThoughts) {
    // add display:none to .msg-json class definition
    toggleCssProperty('.msg-thoughts', 'display', showThoughts ? undefined : 'none');
}

window.toggleUtils = async function (showUtils) {
    // add display:none to .msg-json class definition
    toggleCssProperty('.message-util', 'display', showUtils ? undefined : 'none');
    // toggleCssProperty('.message-util .msg-kvps', 'display', showUtils ? undefined : 'none');
    // toggleCssProperty('.message-util .msg-content', 'display', showUtils ? undefined : 'none');
}

window.toggleDarkMode = function (isDark) {
    if (isDark) {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
       } else {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
    }
    console.log("Dark mode:", isDark);
    localStorage.setItem('darkMode', isDark);
};

window.toggleSpeech = function (isOn) {
    console.log("Speech:", isOn);
    localStorage.setItem('speech', isOn);
    if (!isOn) speech.stop()
};

window.nudge = async function () {
    try {
        const resp = await sendJsonData("/nudge", { ctxid: getContext() });
    } catch (e) {
        toastFetchError("Error nudging agent", e)
    }
}

window.restart = async function () {
    try {
        if (!getConnectionStatus()) {
            toast("Backend disconnected, cannot restart.", "error");
            return
        }
        // First try to initiate restart
        const resp = await sendJsonData("/restart", {});
    } catch (e) {
        // Show restarting message
        toast("Restarting...", "info", 0);

        let retries = 0;
        const maxRetries = 240; // Maximum number of retries (60 seconds with 250ms interval)

        while (retries < maxRetries) {
            try {
                const resp = await sendJsonData("/health", {});
                // Server is back up, show success message
                await new Promise(resolve => setTimeout(resolve, 250));
                hideToast();
                await new Promise(resolve => setTimeout(resolve, 400));
                toast("Restarted", "success", 5000);
                return;
            } catch (e) {
                // Server still down, keep waiting
                retries++;
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        }

        // If we get here, restart failed or took too long
        hideToast();
        await new Promise(resolve => setTimeout(resolve, 400));
        toast("Restart timed out or failed", "error", 5000);
    }
}

// Modify this part
document.addEventListener('DOMContentLoaded', () => {
    const isDarkMode = localStorage.getItem('darkMode') !== 'false';
    toggleDarkMode(isDarkMode);
});


function toggleCssProperty(selector, property, value) {
    // Get the stylesheet that contains the class
    const styleSheets = document.styleSheets;

    // Iterate through all stylesheets to find the class
    for (let i = 0; i < styleSheets.length; i++) {
        const styleSheet = styleSheets[i];
        const rules = styleSheet.cssRules || styleSheet.rules;

        for (let j = 0; j < rules.length; j++) {
            const rule = rules[j];
            if (rule.selectorText == selector) {
                // Check if the property is already applied
                if (value === undefined) {
                    rule.style.removeProperty(property);
                } else {
                    rule.style.setProperty(property, value);
                }
                return;
            }
        }
    }
}

window.loadChats = async function () {
    try {
        const fileContents = await readJsonFiles();
        const response = await sendJsonData("/chat_load", { chats: fileContents });

        if (!response) {
            toast("No response returned.", "error")
        }
        // else if (!response.ok) {
        //     if (response.message) {
        //         toast(response.message, "error")
        //     } else {
        //         toast("Undefined error.", "error")
        //     }
        // }
        else {
            setContext(response.ctxids[0])
            toast("Chats loaded.", "success")
        }

    } catch (e) {
        toastFetchError("Error loading chats", e)
    }
}

window.saveChat = async function () {
    try {
        const response = await sendJsonData("/chat_export", { ctxid: context });

        if (!response) {
            toast("No response returned.", "error")
        }
        //  else if (!response.ok) {
        //     if (response.message) {
        //         toast(response.message, "error")
        //     } else {
        //         toast("Undefined error.", "error")
        //     }
        // }
        else {
            downloadFile(response.ctxid + ".json", response.content)
            toast("Chat file downloaded.", "success")
        }

    } catch (e) {
        toastFetchError("Error saving chat", e)
    }
}

function downloadFile(filename, content) {
    // Create a Blob with the content to save
    const blob = new Blob([content], { type: 'application/json' });

    // Create a link element
    const link = document.createElement('a');

    // Create a URL for the Blob
    const url = URL.createObjectURL(blob);
    link.href = url;

    // Set the file name for download
    link.download = filename;

    // Programmatically click the link to trigger the download
    link.click();

    // Clean up by revoking the object URL
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 0);
}


function readJsonFiles() {
    return new Promise((resolve, reject) => {
        // Create an input element of type 'file'
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json'; // Only accept JSON files
        input.multiple = true;  // Allow multiple file selection

        // Trigger the file dialog
        input.click();

        // When files are selected
        input.onchange = async () => {
            const files = input.files;
            if (!files.length) {
                resolve([]); // Return an empty array if no files are selected
                return;
            }

            // Read each file as a string and store in an array
            const filePromises = Array.from(files).map(file => {
                return new Promise((fileResolve, fileReject) => {
                    const reader = new FileReader();
                    reader.onload = () => fileResolve(reader.result);
                    reader.onerror = fileReject;
                    reader.readAsText(file);
                });
            });

            try {
                const fileContents = await Promise.all(filePromises);
                resolve(fileContents);
            } catch (error) {
                reject(error); // In case of any file reading error
            }
        };
    });
}

function addClassToElement(element, className) {
    element.classList.add(className);
}

function removeClassFromElement(element, className) {
    element.classList.remove(className);
}


function toast(text, type = 'info', timeout = 5000) {
    const toast = document.getElementById('toast');
    const isVisible = toast.classList.contains('show');

    // Clear any existing timeout immediately
    if (toast.timeoutId) {
        clearTimeout(toast.timeoutId);
        toast.timeoutId = null;
    }

    // Function to update toast content and show it
    const updateAndShowToast = () => {
        // Update the toast content and type
        const title = type.charAt(0).toUpperCase() + type.slice(1);
        toast.querySelector('.toast__title').textContent = title;
        toast.querySelector('.toast__message').textContent = text;

        // Remove old classes and add new ones
        toast.classList.remove('toast--success', 'toast--error', 'toast--info');
        toast.classList.add(`toast--${type}`);

        // Show/hide copy button based on toast type
        const copyButton = toast.querySelector('.toast__copy');
        copyButton.style.display = type === 'error' ? 'inline-block' : 'none';

        // Add the close button event listener
        const closeButton = document.querySelector('.toast__close');
        closeButton.onclick = () => {
            hideToast();
        };

        // Add the copy button event listener
        copyButton.onclick = () => {
            navigator.clipboard.writeText(text);
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
                copyButton.textContent = 'Copy';
            }, 2000);
        };

        // Show the toast
        toast.style.display = 'flex';
        // Force a reflow to ensure the animation triggers
        void toast.offsetWidth;
        toast.classList.add('show');

        // Set timeout if specified
        if (timeout) {
            const minTimeout = Math.max(timeout, 5000);
            toast.timeoutId = setTimeout(() => {
                hideToast();
            }, minTimeout);
        }
    };

    if (isVisible) {
        // If a toast is visible, hide it first then show the new one
        toast.classList.remove('show');
        toast.classList.add('hide');

        // Wait for hide animation to complete before showing new toast
        setTimeout(() => {
            toast.classList.remove('hide');
            updateAndShowToast();
        }, 400); // Match this with CSS transition duration
    } else {
        // If no toast is visible, show the new one immediately
        updateAndShowToast();
    }
}
window.toast = toast

function hideToast() {
    const toast = document.getElementById('toast');

    // Clear any existing timeout
    if (toast.timeoutId) {
        clearTimeout(toast.timeoutId);
        toast.timeoutId = null;
    }

    toast.classList.remove('show');
    toast.classList.add('hide');

    // Wait for the hide animation to complete before removing from display
    setTimeout(() => {
        toast.style.display = 'none';
        toast.classList.remove('hide');
    }, 400); // Match this with CSS transition duration
}

function scrollChanged(isAtBottom) {
    const inputAS = Alpine.$data(autoScrollSwitch);
    inputAS.autoScroll = isAtBottom
    // autoScrollSwitch.checked = isAtBottom
}

function updateAfterScroll() {
    // const toleranceEm = 1; // Tolerance in em units
    // const tolerancePx = toleranceEm * parseFloat(getComputedStyle(document.documentElement).fontSize); // Convert em to pixels
    const tolerancePx = 50;
    const chatHistory = document.getElementById('chat-history');
    const isAtBottom = (chatHistory.scrollHeight - chatHistory.scrollTop) <= (chatHistory.clientHeight + tolerancePx);

    scrollChanged(isAtBottom);
}

chatHistory.addEventListener('scroll', updateAfterScroll);

chatInput.addEventListener('input', adjustTextareaHeight);

// setInterval(poll, 250);

async function startPolling() {
    const shortInterval = 25
    const longInterval = 250
    const shortIntervalPeriod = 100
    let shortIntervalCount = 0

    async function _doPoll() {
        let nextInterval = longInterval

        try {
            const result = await poll();
            if (result) shortIntervalCount = shortIntervalPeriod; // Reset the counter when the result is true
            if (shortIntervalCount > 0) shortIntervalCount--; // Decrease the counter on each call
            nextInterval = shortIntervalCount > 0 ? shortInterval : longInterval;
        } catch (error) {
            console.error('Error:', error);
        }

        // Call the function again after the selected interval
        setTimeout(_doPoll.bind(this), nextInterval);
    }

    _doPoll();
}

document.addEventListener("DOMContentLoaded", startPolling);

document.addEventListener('DOMContentLoaded', () => {
    const dragDropOverlay = document.getElementById('dragdrop-overlay');
    const inputSection = document.getElementById('input-section');
    let dragCounter = 0;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Handle drag enter
    document.addEventListener('dragenter', (e) => {
        dragCounter++;
        if (dragCounter === 1) {
            Alpine.$data(dragDropOverlay).isVisible = true;
        }
    }, false);

    // Handle drag leave
    document.addEventListener('dragleave', (e) => {
        dragCounter--;
        if (dragCounter === 0) {
            Alpine.$data(dragDropOverlay).isVisible = false;
        }
    }, false);

    // Handle drop
    dragDropOverlay.addEventListener('drop', (e) => {
        dragCounter = 0;
        Alpine.$data(dragDropOverlay).isVisible = false;

        const inputAD = Alpine.$data(inputSection);
        const files = e.dataTransfer.files;
        handleFiles(files, inputAD);
    }, false);
});

// Separate file handling logic to be used by both drag-drop and file input
function handleFiles(files, inputAD) {
    Array.from(files).forEach(file => {
        const ext = file.name.split('.').pop().toLowerCase();

            const isImage = ['jpg', 'jpeg', 'png', 'bmp'].includes(ext);

            if (isImage) {
                const reader = new FileReader();
                reader.onload = e => {
                    inputAD.attachments.push({
                        file: file,
                        url: e.target.result,
                        type: 'image',
                        name: file.name,
                        extension: ext
                    });
                    inputAD.hasAttachments = true;
                };
                reader.readAsDataURL(file);
            } else {
                inputAD.attachments.push({
                    file: file,
                    type: 'file',
                    name: file.name,
                    extension: ext
                });
                inputAD.hasAttachments = true;
            }

    });
}

// Modify the existing handleFileUpload to use the new handleFiles function
window.handleFileUpload = function(event) {
    const files = event.target.files;
    const inputAD = Alpine.$data(inputSection);
    handleFiles(files, inputAD);
}

// Setup event handlers once the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    setupSidebarToggle();
    setupTabs();
    initializeActiveTab();
});

// Setup tabs functionality
function setupTabs() {
    const chatsTab = document.getElementById('chats-tab');
    const tasksTab = document.getElementById('tasks-tab');

    if (chatsTab && tasksTab) {
        chatsTab.addEventListener('click', function() {
            activateTab('chats');
        });

        tasksTab.addEventListener('click', function() {
            activateTab('tasks');
        });
    } else {
        console.error('Tab elements not found');
        setTimeout(setupTabs, 100); // Retry setup
    }
}

function activateTab(tabName) {
    const chatsTab = document.getElementById('chats-tab');
    const tasksTab = document.getElementById('tasks-tab');
    const chatsSection = document.getElementById('chats-section');
    const tasksSection = document.getElementById('tasks-section');

    // Get current context to preserve before switching
    const currentContext = context;

    // Store the current selection for the active tab before switching
    const previousTab = localStorage.getItem('activeTab');
    if (previousTab === 'chats') {
        localStorage.setItem('lastSelectedChat', currentContext);
    } else if (previousTab === 'tasks') {
        localStorage.setItem('lastSelectedTask', currentContext);
    }

    // Reset all tabs and sections
    chatsTab.classList.remove('active');
    tasksTab.classList.remove('active');
    chatsSection.style.display = 'none';
    tasksSection.style.display = 'none';

    // Remember the last active tab in localStorage
    localStorage.setItem('activeTab', tabName);

    // Activate selected tab and section
    if (tabName === 'chats') {
        chatsTab.classList.add('active');
        chatsSection.style.display = '';

        // Get the available contexts from Alpine.js data
        const chatsAD = Alpine.$data(chatsSection);
        const availableContexts = chatsAD.contexts || [];

        // Restore previous chat selection
        const lastSelectedChat = localStorage.getItem('lastSelectedChat');

        // Only switch if:
        // 1. lastSelectedChat exists AND
        // 2. It's different from current context AND
        // 3. The context actually exists in our contexts list OR there are no contexts yet
        if (lastSelectedChat &&
            lastSelectedChat !== currentContext &&
            (availableContexts.some(ctx => ctx.id === lastSelectedChat) || availableContexts.length === 0)) {
            setContext(lastSelectedChat);
        }
    } else if (tabName === 'tasks') {
        tasksTab.classList.add('active');
        tasksSection.style.display = 'flex';
        tasksSection.style.flexDirection = 'column';

        // Get the available tasks from Alpine.js data
        const tasksAD = Alpine.$data(tasksSection);
        const availableTasks = tasksAD.tasks || [];

        // Restore previous task selection
        const lastSelectedTask = localStorage.getItem('lastSelectedTask');

        // Only switch if:
        // 1. lastSelectedTask exists AND
        // 2. It's different from current context AND
        // 3. The task actually exists in our tasks list
        if (lastSelectedTask &&
            lastSelectedTask !== currentContext &&
            availableTasks.some(task => task.id === lastSelectedTask)) {
            setContext(lastSelectedTask);
        }
    }

    // Request a poll update
    poll();
}

// Add function to initialize active tab and selections from localStorage
function initializeActiveTab() {
    // Initialize selection storage if not present
    if (!localStorage.getItem('lastSelectedChat')) {
        localStorage.setItem('lastSelectedChat', '');
    }
    if (!localStorage.getItem('lastSelectedTask')) {
        localStorage.setItem('lastSelectedTask', '');
    }

    const activeTab = localStorage.getItem('activeTab') || 'chats';
    activateTab(activeTab);
}

/*
 * A0 Chat UI
 *
 * Tasks tab functionality:
 * - Tasks are displayed in the Tasks tab with the same mechanics as chats
 * - Both lists are sorted by creation time (newest first)
 * - Selection state is preserved across tab switches
 * - The active tab is remembered across sessions
 * - Tasks use the same context system as chats for communication with the backend
 * - Future support for renaming and deletion will be implemented later
 */

// Open the scheduler detail view for a specific task
function openTaskDetail(taskId) {
    // Wait for Alpine.js to be fully loaded
    if (window.Alpine) {
        // Get the settings modal button and click it to ensure all init logic happens
        const settingsButton = document.getElementById('settings');
        if (settingsButton) {
            // Programmatically click the settings button
            settingsButton.click();

            // Now get a reference to the modal element
            const modalEl = document.getElementById('settingsModal');
            if (!modalEl) {
                console.error('Settings modal element not found after clicking button');
                return;
            }

            // Get the Alpine.js data for the modal
            const modalData = Alpine.$data(modalEl);

            // Use a timeout to ensure the modal is fully rendered
            setTimeout(() => {
                // Switch to the scheduler tab first
                modalData.switchTab('scheduler');

                // Use another timeout to ensure the scheduler component is initialized
                setTimeout(() => {
                    // Get the scheduler component
                    const schedulerComponent = document.querySelector('[x-data="schedulerSettings"]');
                    if (!schedulerComponent) {
                        console.error('Scheduler component not found');
                        return;
                    }

                    // Get the Alpine.js data for the scheduler component
                    const schedulerData = Alpine.$data(schedulerComponent);

                    // Show the task detail view for the specific task
                    schedulerData.showTaskDetail(taskId);

                    console.log('Task detail view opened for task:', taskId);
                }, 50); // Give time for the scheduler tab to initialize
            }, 25); // Give time for the modal to render
        } else {
            console.error('Settings button not found');
        }
    } else {
        console.error('Alpine.js not loaded');
    }
}

// Make the function available globally
window.openTaskDetail = openTaskDetail;
