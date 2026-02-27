let emoteMap = {};
async function loadEmotes(channelName) {
    try {
        // Fetch 7TV Data (Includes User ID for other services)
        const resp = await fetch(`https://7tv.io/v3/users/twitch/${channelName}`);
        const data = await resp.json();
        
        data.emote_set.emotes.forEach(e => {
            emoteMap[e.name] = `https://cdn.7tv.app/emote/${e.id}/2x.webp`;
        });
        return data.user.id; // Return 7TV ID for the WebSocket
    } catch (e) { console.error("Emote load error", e); }
}