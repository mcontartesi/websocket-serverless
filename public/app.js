// WebSocket Serverless Dashboard JavaScript

document.addEventListener('DOMContentLoaded', () => {
  let pusherClient = null;
  let activeChannel = null;
  let eventCounter = 0;

  // --- Admin Authentication & Cloudflare One Integration ---
  const loginModal = document.getElementById('login-modal');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const userBadge = document.getElementById('user-badge');
  const userDisplayName = document.getElementById('user-display-name');
  const authMethodBadge = document.getElementById('auth-method-badge');
  const btnLogout = document.getElementById('btn-logout');

  function getAuthHeaders() {
    const token = sessionStorage.getItem('ws_admin_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function checkAuth() {
    try {
      // 1. Check if Cloudflare One / Access or active token authenticates automatically
      const res = await fetch('/api/admin/check-auth', {
        headers: getAuthHeaders(),
      });
      const data = await res.json();

      if (data.authenticated) {
        onAuthSuccess(data.user, data.method);
        return;
      }

      // 2. Try fetching protected info endpoint with stored token
      const infoRes = await fetch('/api/admin/info', {
        headers: getAuthHeaders(),
      });
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        onAuthSuccess(infoData.authUser || 'Admin', infoData.authMethod || 'password');
        return;
      }
    } catch (e) {
      console.warn('Auth check warning:', e);
    }

    // Show login modal if not authenticated
    loginModal.classList.remove('hidden');
    userBadge.classList.add('hidden');
  }

  function onAuthSuccess(user, method) {
    loginModal.classList.add('hidden');
    userBadge.classList.remove('hidden');
    userDisplayName.textContent = user || 'Admin';
    authMethodBadge.textContent = method === 'cloudflare_one' ? 'Cloudflare One' : 'Password';
    fetchMetrics();
    fetchAppCredentials();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');

    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem('ws_admin_token', data.token);
        onAuthSuccess(data.user, data.method);
      } else {
        loginError.textContent = data.error || 'Invalid credentials';
        loginError.classList.remove('hidden');
      }
    } catch (err) {
      loginError.textContent = 'Connection error. Please try again.';
      loginError.classList.remove('hidden');
    }
  });

  btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('ws_admin_token');
    userBadge.classList.add('hidden');
    loginModal.classList.remove('hidden');
  });

  async function fetchAppCredentials() {
    try {
      const res = await fetch('/api/admin/info', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        document.getElementById('cred-app-id').value = data.appId || 'ws-app';
        document.getElementById('cred-app-key').value = data.appKey || 'ws-key';
        document.getElementById('cred-app-secret').value = data.appSecret || 'ws-secret';
      }
    } catch {}
  }

  // --- Tab Switcher ---
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');
  const tabTitle = document.getElementById('tab-title');
  const tabSubtitle = document.getElementById('tab-subtitle');

  const tabMeta = {
    overview: { title: 'Overview', subtitle: 'Realtime engine metrics & serverless edge status' },
    studio: { title: 'Event Studio', subtitle: 'Publish events via Pusher REST API to connected clients' },
    debugger: { title: 'Live Debugger', subtitle: 'Inspect live WebSocket messages and event payloads' },
    channels: { title: 'Channels Explorer', subtitle: 'Active channels index and presence occupancy' },
    keys: { title: 'App Credentials', subtitle: 'API keys, secrets, and client SDK integration code' },
  };

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const tabKey = item.getAttribute('data-tab');

      navItems.forEach((n) => n.classList.remove('active'));
      tabContents.forEach((t) => t.classList.remove('active'));

      item.classList.add('active');
      document.getElementById(`tab-${tabKey}`).classList.add('active');

      if (tabMeta[tabKey]) {
        tabTitle.textContent = tabMeta[tabKey].title;
        tabSubtitle.textContent = tabMeta[tabKey].subtitle;
      }
    });
  });

  // --- Integration Snippets Switcher ---
  const snippetTabs = document.querySelectorAll('.snippet-tab');
  const snippetContents = document.querySelectorAll('.snippet-content');

  snippetTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-snippet');
      snippetTabs.forEach((t) => t.classList.remove('active'));
      snippetContents.forEach((c) => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`snippet-${target}`).classList.add('active');
    });
  });

  // --- Fetch Server Metrics & Channels ---
  async function fetchMetrics() {
    try {
      const statusRes = await fetch('/health');
      if (statusRes.ok) {
        const data = await statusRes.json();
        console.log('[WebSocket Server Status]', data);
      }

      const channelsRes = await fetch('/apps/ws-app/channels', {
        headers: getAuthHeaders(),
      });
      if (channelsRes.ok) {
        const data = await channelsRes.json();
        const chKeys = Object.keys(data.channels || {});
        document.getElementById('stat-channels').textContent = chKeys.length;
        renderChannelsTable(data.channels);
      }
    } catch (e) {
      console.warn('Metrics fetch offline or initial load');
    }
  }

  function renderChannelsTable(channels) {
    const tbody = document.getElementById('channels-table-body');
    const chKeys = Object.keys(channels || {});

    if (chKeys.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No active channels currently occupied</td></tr>`;
      return;
    }

    tbody.innerHTML = chKeys
      .map((key) => {
        const isPresence = key.startsWith('presence-');
        const isPrivate = key.startsWith('private-');
        const type = isPresence ? 'Presence' : isPrivate ? 'Private' : 'Public';
        const users = channels[key].user_count !== undefined ? channels[key].user_count : '-';

        return `
        <tr>
          <td><strong>${key}</strong></td>
          <td><span class="version-tag">${type}</span></td>
          <td>${users}</td>
          <td><span class="status-indicator online"><span class="dot"></span>Occupied</span></td>
          <td>
            <button class="btn btn-outline" onclick="inspectChannel('${key}')">Inspect</button>
          </td>
        </tr>
      `;
      })
      .join('');
  }

  // --- Toast Notification Helper ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✅',
      error: '⚠️',
      info: 'ℹ️',
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
      <div class="toast-body">${message}</div>
      <button class="toast-close">&times;</button>
    `;

    container.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    setTimeout(() => removeToast(toast), 4000);
  }

  function removeToast(toast) {
    if (!toast || toast.classList.contains('toast-out')) return;
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 300);
  }

  // --- Quick Broadcast Tester ---
  const btnQuickBroadcast = document.getElementById('btn-quick-broadcast');
  btnQuickBroadcast.addEventListener('click', async () => {
    const channel = document.getElementById('quick-channel').value;
    const event = document.getElementById('quick-event').value;
    const rawPayload = document.getElementById('quick-payload').value;
    const appId = document.getElementById('cred-app-id')?.value || 'ws-app';

    let payload;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      payload = rawPayload;
    }

    try {
      const res = await fetch(`/apps/${appId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          channel,
          name: event,
          event: event,
          data: payload,
        }),
      });

      if (res.ok) {
        eventCounter++;
        document.getElementById('stat-events').textContent = eventCounter;
        logDebug('event', `[REST Broadcast] Triggered '${event}' on '${channel}' successfully`);
        showToast(`Event '${event}' broadcasted successfully!`, 'success');
      } else {
        const errText = await res.text();
        showToast(`Failed to broadcast event (${res.status}): ${errText || res.statusText}`, 'error');
      }
    } catch (e) {
      showToast('Error sending request: ' + e.message, 'error');
    }
  });

  // --- Event Studio Send ---
  const btnStudioSend = document.getElementById('btn-studio-send');
  btnStudioSend.addEventListener('click', async () => {
    const channel = document.getElementById('studio-channel').value;
    const event = document.getElementById('studio-event').value;
    const rawData = document.getElementById('studio-data').value;
    const appId = document.getElementById('cred-app-id')?.value || 'ws-app';

    let data;
    try {
      data = JSON.parse(rawData);
    } catch {
      data = rawData;
    }

    const resBox = document.getElementById('studio-response');
    const resStatus = document.getElementById('studio-status-code');
    const resBody = document.getElementById('studio-response-body');

    try {
      const response = await fetch(`/apps/${appId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ channel, name: event, event: event, data }),
      });

      resBox.classList.remove('hidden');
      resStatus.textContent = `${response.status} ${response.statusText}`;
      const resText = await response.text();
      resBody.textContent = resText || '{}';

      if (response.ok) {
        eventCounter++;
        document.getElementById('stat-events').textContent = eventCounter;
        logDebug('event', `[Event Studio] Published '${event}' to channel '${channel}'`);
        showToast(`Event '${event}' published to channel '${channel}'`, 'success');
      } else {
        showToast(`Failed to publish event (${response.status}): ${resText || response.statusText}`, 'error');
      }
    } catch (err) {
      resBox.classList.remove('hidden');
      resStatus.textContent = 'Error';
      resBody.textContent = err.message;
      showToast(`Error publishing event: ${err.message}`, 'error');
    }
  });

  // --- Live Debugger WebSocket Stream ---
  const btnDebugConnect = document.getElementById('btn-debug-connect');
  const btnDebugClear = document.getElementById('btn-debug-clear');
  const logContainer = document.getElementById('debug-log-container');

  btnDebugClear.addEventListener('click', () => {
    logContainer.innerHTML = '';
  });

  btnDebugConnect.addEventListener('click', () => {
    const chName = document.getElementById('debug-channel').value || 'my-channel';

    if (pusherClient) {
      if (typeof pusherClient.disconnect === 'function') {
        pusherClient.disconnect();
      } else if (typeof pusherClient.close === 'function') {
        pusherClient.close();
      }
      pusherClient = null;
    }

    logDebug('system', `Connecting to WebSocket server...`);

    // 1. Try official Pusher JS SDK if loaded
    if (typeof window.Pusher !== 'undefined') {
      try {
        pusherClient = new Pusher('ws-key', {
          cluster: 'mt1',
          wsHost: window.location.hostname,
          wsPort: window.location.port
            ? parseInt(window.location.port)
            : window.location.protocol === 'https:'
              ? 443
              : 80,
          wssPort: window.location.port ? parseInt(window.location.port) : 443,
          forceTLS: window.location.protocol === 'https:',
          disableStats: true,
          enabledTransports: ['ws', 'wss'],
        });

        pusherClient.connection.bind('connected', () => {
          logDebug('system', `Connected via Pusher JS SDK! Socket ID: ${pusherClient.connection.socket_id}`);
          document.getElementById('stat-connections').textContent = '1';

          activeChannel = pusherClient.subscribe(chName);
          logDebug('system', `Subscribed to channel '${chName}'`);

          activeChannel.bind_global((eventName, data) => {
            const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
            logDebug('event', `Event: <strong>${eventName}</strong> on <i>${chName}</i> <pre>${dataStr}</pre>`);
          });
        });

        pusherClient.connection.bind('disconnected', () => {
          logDebug('system', 'Disconnected from server.');
          document.getElementById('stat-connections').textContent = '0';
        });

        pusherClient.connection.bind('error', (err) => {
          logDebug('error', `Socket Error: ${JSON.stringify(err)}`);
        });
        return;
      } catch (e) {
        console.warn('Pusher JS init warning, using Native WebSocket fallback', e);
      }
    }

    // 2. Native WebSocket Fallback (Self-contained, zero CDN dependency)
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/app/ws-key?channel=${encodeURIComponent(chName)}`;

      const ws = new WebSocket(wsUrl);
      pusherClient = ws;

      ws.onopen = () => {
        logDebug('system', `Connected via Native WebSocket to ${wsUrl}`);
        document.getElementById('stat-connections').textContent = '1';

        // Send Pusher subscribe message
        ws.send(
          JSON.stringify({
            event: 'pusher:subscribe',
            data: { channel: chName },
          }),
        );
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.event === 'pusher:connection_established') {
            const data = JSON.parse(msg.data || '{}');
            logDebug('system', `Pusher Handshake OK! Socket ID: ${data.socket_id}`);
          } else if (msg.event === 'pusher:subscription_succeeded') {
            logDebug('system', `Subscribed successfully to channel '${chName}'`);
          } else {
            const payload = typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data, null, 2);
            logDebug(
              'event',
              `Event: <strong>${msg.event}</strong> on <i>${msg.channel || chName}</i> <pre>${payload}</pre>`,
            );
          }
        } catch {
          logDebug('event', `Raw Message: ${evt.data}`);
        }
      };

      ws.onclose = () => {
        logDebug('system', 'Native WebSocket closed.');
        document.getElementById('stat-connections').textContent = '0';
      };

      ws.onerror = (err) => {
        logDebug('error', `Native WebSocket Error`);
      };
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err);
      logDebug('error', `Failed to connect WebSocket: ${errMsg}`);
    }
  });

  function logDebug(type, msg) {
    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg">${msg}</span>`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  window.inspectChannel = (chKey) => {
    document.getElementById('debug-channel').value = chKey;
    document.querySelector('.nav-item[data-tab="debugger"]').click();
    btnDebugConnect.click();
  };

  // Initial Auth Check & Metric Load
  document.getElementById('btn-refresh').addEventListener('click', fetchMetrics);
  document.getElementById('btn-refresh-channels').addEventListener('click', fetchMetrics);

  checkAuth();
});
