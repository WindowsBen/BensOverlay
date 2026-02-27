function connectTo7TV(userId) {
    const socket = new WebSocket('wss://events.7tv.io/v3');
    socket.onopen = () => {
        socket.send(JSON.stringify({
            op: 35, // Subscribe
            d: { type: "emote_set.update", condition: { object_id: userId } }
        }));
    };
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.d && data.d.body && data.d.body.added) {
            data.d.body.added.forEach(e => {
                emoteMap[e.name] = `https://cdn.7tv.app/emote/${e.id}/2x.webp`;
            });
        }
    };
}