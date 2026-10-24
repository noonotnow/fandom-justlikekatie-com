const status = document.getElementById('signin-status');
const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('token');
const destination = '/c-drama-fandom/fandom-games/qilin-keeper/';
history.replaceState({}, '', location.pathname);
try {
  if (!token) throw new Error('This sign-in link is incomplete. Return to your cassette and request another.');
  const response = await fetch('/api/auth/verify', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error((await response.json()).error || 'This sign-in link could not be used.');
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('fandom-collection');
    channel.postMessage({ type: 'session-changed' }); channel.close();
  }
  // Returning never automatically writes guest progress to an existing save.
  location.replace(destination);
} catch (error) {
  status.textContent = error.message;
  const back = document.createElement('a');
  back.href = destination; back.textContent = 'Return to your qilin';
  status.append(document.createElement('br'), back);
}
