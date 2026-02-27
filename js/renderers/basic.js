class ChatRenderer {
    constructor(params) {
        this.container = document.getElementById('chat-container');
        document.body.style.fontSize = (params.get('size') || '24') + 'px';
        document.body.style.textShadow = `2px 2px 0px ${params.get('shadow') || '#000'}`;
    }

    render(user, message, color, badges = '') {
        const div = document.createElement('div');
        div.className = 'message';
        div.innerHTML = `${badges}<span class="username" style="color:${color}">${user}:</span> <span class="text">${message}</span>`;
        
        this.container.appendChild(div);
        if (this.container.childNodes.length > 50) this.container.removeChild(this.container.firstChild);
    }
}