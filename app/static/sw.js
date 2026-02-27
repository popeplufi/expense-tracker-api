self.addEventListener("push", (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (_err) {
        data = {};
    }
    const title = data.title || "Plufi Chat";
    const options = {
        body: data.body || "New message",
        icon: "/static/frontend/vite.svg",
        badge: "/static/frontend/vite.svg",
        data: {
            url: data.url || "/",
            chat_id: data.chat_id || null,
        },
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || "/";
    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                if ("focus" in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
            return null;
        })
    );
});
