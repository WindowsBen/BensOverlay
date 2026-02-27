const params = new URLSearchParams(window.location.search);
const channel = params.get('channel');
const renderer = new ChatRenderer(params);

if (channel) {
    loadEmotes(channel).then(sevenTvId => {
        if (sevenTvId) connectTo7TV(sevenTvId);
        
        const client = new tmi.Client({ channels: [channel] });
        client.connect();

        client.on('message', (chan, tags, message) => {
            let words = message.split(' ');
            let parsed = words.map(w => emoteMap[w] ? `<img class="emote" src="${emoteMap[w]}">` : w).join(' ');
            
            renderer.render(tags['display-name'], parsed, tags.color);
        });
    });
}