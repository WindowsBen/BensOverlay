// 1. Read the custom settings from the URL
const params = new URLSearchParams(window.location.search);
const channelName = params.get('channel');
const fontSize = params.get('fontSize');
const shadowColor = params.get('shadow');

// 2. Apply the settings to the CSS
if (fontSize) document.documentElement.style.setProperty('--chat-font-size', fontSize);
if (shadowColor) document.documentElement.style.setProperty('--chat-shadow-color', shadowColor);

// 3. Connect to Twitch Chat using tmi.js
if (channelName) {
    const client = new tmi.Client({
        channels: [ channelName ]
    });

    client.connect();

    // 4. Listen for new messages
    client.on('message', (channel, tags, message, self) => {
        displayMessage(tags, message);
    });
} else {
    document.body.innerHTML = "<h2 style='color:red;'>Error: No channel specified in URL</h2>";
}

// 5. Build the message and put it on the screen
function displayMessage(tags, message) {
    const chatContainer = document.getElementById('chat-container');
    
    // Create a new "div" (box) for the message
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');

    // Get the user's color, default to white if they don't have one
    const userColor = tags.color || '#ffffff';
    const username = tags['display-name'];

    // Put the username and message together
    // Note: This currently just prints raw text. 
    // Emote rendering will replace this section in our next step!
    messageElement.innerHTML = `
        <span class="username" style="color: ${userColor}">${username}:</span>
        <span class="message-text">${message}</span>
    `;

    // Add it to the screen
    chatContainer.appendChild(messageElement);

    // Keep chat clean by removing old messages (keeps max 50 on screen)
    if (chatContainer.childNodes.length > 50) {
        chatContainer.removeChild(chatContainer.firstChild);
    }
}