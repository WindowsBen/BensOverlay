document.getElementById('generateBtn').onclick = () => {
    const channel = document.getElementById('channel').value;
    const size = document.getElementById('fontSize').value;
    const shadow = document.getElementById('shadowColor').value;
    
    const baseUrl = window.location.href.replace('index.html', 'overlay.html');
    const url = `${baseUrl}?channel=${channel}&size=${size}&shadow=${encodeURIComponent(shadow)}`;
    
    document.getElementById('resultArea').style.display = 'block';
    document.getElementById('finalUrl').value = url;
};