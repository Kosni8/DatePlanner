/* -------------------- SERVICE WORKER (Offline-Start) -------------------- */

// Hält die App-Dateien vor, damit die App auch ohne Internet startet.
// Eigene Dateien kommen immer zuerst frisch aus dem Netz (Updates kommen
// also sofort an), der Zwischenspeicher springt nur ein, wenn das Netz
// fehlt oder zu langsam ist.
// Anfragen an Supabase (Daten und Login) werden nie zwischengespeichert.

// Hochzählen, wenn sich die Liste unten ändert
const VERSION = "v1";
const CACHE = `dateplanner-${VERSION}`;

const SUPABASE_LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js";

const APP_FILES = [
    "./",
    "index.html",
    "styles.css",
    "config.js",
    "cloud.js",
    "app.js",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/apple-touch-icon.png",
    "icons/favicon-32.png"
];

// So lange wird aufs Netz gewartet, bevor der gespeicherte Stand kommt
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE)
            .then(cache => Promise.all([
                cache.addAll(APP_FILES.map(url => new Request(url, { cache: "reload" }))),
                // Die Bibliothek liegt auf einem fremden Server. Ist der gerade
                // nicht erreichbar, startet die App offline trotzdem (nur ohne Sync)
                cache.add(SUPABASE_LIB).catch(() => {})
            ]))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key.startsWith("dateplanner-") && key !== CACHE)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Supabase-Bibliothek: feste Version, darf aus dem Speicher kommen
    if (url.href === SUPABASE_LIB) {
        event.respondWith(
            caches.match(SUPABASE_LIB).then(cached => cached || fetchAndStore(request))
        );
        return;
    }

    // Alles andere von außerhalb (Supabase-API, Login, ...) geht direkt ans Netz
    if (url.origin !== self.location.origin) return;

    event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
    const network = fetchAndStore(request);

    const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
    const fast = await Promise.race([network.catch(() => null), timeout]);
    if (fast) return fast;

    const cached = await fromCache(request);
    if (cached) return cached;

    // Nichts gespeichert: doch auf das Netz warten
    return network;
}

async function fromCache(request) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    // Seitenaufrufe (z.B. mit ?source=pwa) bekommen die Startseite
    if (request.mode === "navigate") return caches.match("./");
    return undefined;
}

async function fetchAndStore(request) {
    const response = await fetch(request);
    if (response.ok && (response.type === "basic" || response.type === "cors")) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
}
