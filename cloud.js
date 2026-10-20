/* -------------------- CLOUD-SPEICHER (Supabase) -------------------- */

// Die Dates liegen weiter in localStorage (Offline-Zwischenspeicher).
// Jede Änderung wird zusätzlich vorgemerkt und hochgeladen, sobald
// jemand angemeldet und online ist. Danach gilt der Stand der Cloud.
// Ohne Zugangsdaten in config.js läuft die App rein lokal.

const Cloud = (() => {
    const config = window.SUPABASE_CONFIG || {};
    const enabled = Boolean(config.url && config.anonKey);

    const PENDING_KEY = "cloudPending";
    const LINKED_KEY = "cloudLinkedHousehold";

    let client = null;
    let user = null;
    let household = null;
    let householdChecked = false;

    // Noch nicht hochgeladene Änderungen: { id: { op: "upsert", date } | { op: "delete" } }
    let pending = readPending();

    // Zuletzt gespeicherter Stand je Date, um Änderungen zu erkennen
    let baseline = new Map();

    let syncing = false;
    let syncAgain = false;
    let retryTimer = null;
    let applyRemote = () => {};
    let onStatus = () => {};

    function init({ onRemoteDates, onStatusChange }) {
        applyRemote = onRemoteDates;
        onStatus = onStatusChange;

        // Ohne Bibliothek (z.B. CDN nicht erreichbar) werden Änderungen nur vorgemerkt
        if (!enabled || !window.supabase) {
            onStatus();
            return;
        }

        client = window.supabase.createClient(config.url, config.anonKey, {
            auth: {
                // Der Link aus der Mail funktioniert so auch auf einem anderen Gerät
                flowType: "implicit",
                persistSession: true,
                detectSessionInUrl: true
            }
        });

        client.auth.onAuthStateChange((event, session) => {
            const newUser = session ? session.user : null;
            const changed = (newUser && newUser.id) !== (user && user.id);
            user = newUser;

            if (changed) {
                household = null;
                householdChecked = false;
            }
            onStatus();

            // Nicht direkt im Callback weiterarbeiten, sonst hängt supabase-js
            if (changed && user) setTimeout(sync, 0);
        });

        window.addEventListener("online", sync);
        window.addEventListener("offline", () => onStatus());
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") sync();
        });
    }

    /* ---------- Änderungen erkennen ---------- */

    function setBaseline(dates) {
        baseline = new Map(dates.map(d => [String(d.id), JSON.stringify(d)]));
    }

    // Vergleicht mit dem letzten Stand und merkt Unterschiede zum Hochladen vor
    function track(dates) {
        if (!enabled) return;

        const current = new Map(dates.map(d => [String(d.id), d]));
        let changed = false;

        current.forEach((date, id) => {
            const json = JSON.stringify(date);
            if (baseline.get(id) !== json) {
                pending[id] = { op: "upsert", date: JSON.parse(json) };
                changed = true;
            }
        });

        baseline.forEach((_, id) => {
            if (!current.has(id)) {
                pending[id] = { op: "delete" };
                changed = true;
            }
        });

        setBaseline(dates);

        if (changed) {
            writePending();
            sync();
        }
    }

    /* ---------- Synchronisieren ---------- */

    async function sync() {
        if (!client || !user || !navigator.onLine) {
            onStatus();
            return;
        }

        if (syncing) {
            syncAgain = true;
            return;
        }

        syncing = true;
        onStatus();

        try {
            if (!household) {
                household = await fetchHousehold();
                householdChecked = true;
            }

            if (household) {
                await uploadLocalDatesOnce();
                await pushPending();
                await pullDates();
            }
        } catch (err) {
            console.error("Cloud-Sync fehlgeschlagen", err);
            clearTimeout(retryTimer);
            retryTimer = setTimeout(sync, 30000);
        }

        syncing = false;
        onStatus();

        if (syncAgain) {
            syncAgain = false;
            sync();
        }
    }

    async function fetchHousehold() {
        const { data, error } = await client
            .from("members")
            .select("household")
            .maybeSingle();

        if (error) throw error;
        return data ? data.household : null;
    }

    // Beim ersten Login auf diesem Gerät: lokale Dates, die die Cloud
    // noch nicht kennt, einmalig hochladen
    async function uploadLocalDatesOnce() {
        if (localStorage.getItem(LINKED_KEY) === household) return;

        const { data, error } = await client.from("dates").select("id");
        if (error) throw error;

        const remoteIds = new Set(data.map(row => row.id));
        const local = JSON.parse(localStorage.getItem("dates") || "[]");

        local.forEach(date => {
            const id = String(date.id);
            if (!remoteIds.has(id) && !pending[id]) {
                pending[id] = { op: "upsert", date };
            }
        });

        writePending();
        await pushPending();

        localStorage.setItem(LINKED_KEY, household);
    }

    async function pushPending() {
        const entries = Object.entries(pending);
        if (entries.length === 0) return;

        const upserts = entries.filter(([, p]) => p.op === "upsert");
        const deletes = entries.filter(([, p]) => p.op === "delete");

        if (upserts.length) {
            const rows = upserts.map(([id, p]) => ({
                household,
                id,
                data: p.date,
                updated_at: new Date().toISOString()
            }));

            const { error } = await client
                .from("dates")
                .upsert(rows, { onConflict: "household,id" });

            if (error) throw error;
        }

        if (deletes.length) {
            const { error } = await client
                .from("dates")
                .delete()
                .eq("household", household)
                .in("id", deletes.map(([id]) => id));

            if (error) throw error;
        }

        // Nur entfernen, was während des Hochladens nicht erneut geändert wurde
        entries.forEach(([id, p]) => {
            if (pending[id] === p) delete pending[id];
        });
        writePending();
    }

    async function pullDates() {
        const { data, error } = await client.from("dates").select("id, data");
        if (error) throw error;

        const byId = new Map(data.map(row => [row.id, row.data]));

        // Was noch nicht hochgeladen ist, hat Vorrang vor der Cloud
        Object.entries(pending).forEach(([id, p]) => {
            if (p.op === "upsert") byId.set(id, p.date);
            else byId.delete(id);
        });

        applyRemote([...byId.values()]);
    }

    /* ---------- Anmeldung ---------- */

    async function sendLoginLink(email) {
        const { error } = await client.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: location.origin + location.pathname
            }
        });

        if (error) throw error;
    }

    // Kopierter Link (oder Code) aus der Mail: so klappt die Anmeldung auch
    // in der App vom Home-Bildschirm, die auf dem iPhone getrennt von Safari ist
    async function verifyLoginCode(email, input) {
        let result;

        if (/^\d+$/.test(input)) {
            result = await client.auth.verifyOtp({ email, token: input, type: "email" });
        } else {
            let params;
            try {
                params = new URL(input).searchParams;
            } catch {
                throw new Error("Das ist kein Link aus der Login-Mail.");
            }
            const tokenHash = params.get("token");
            if (!tokenHash) throw new Error("Im Link fehlt der Anmelde-Schlüssel.");

            result = await client.auth.verifyOtp({
                token_hash: tokenHash,
                type: params.get("type") || "email"
            });
        }

        if (result.error) throw result.error;
    }

    async function signOut() {
        await client.auth.signOut();
    }

    /* ---------- Status ---------- */

    function getState() {
        return {
            enabled,
            email: user ? user.email : null,
            syncing,
            online: navigator.onLine && Boolean(client),
            notMember: Boolean(user && householdChecked && !household),
            pendingCount: Object.keys(pending).length
        };
    }

    /* ---------- Vorgemerkte Änderungen speichern ---------- */

    function readPending() {
        try {
            return JSON.parse(localStorage.getItem(PENDING_KEY)) || {};
        } catch {
            return {};
        }
    }

    function writePending() {
        localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    }

    return { init, setBaseline, track, sync, sendLoginLink, verifyLoginCode, signOut, getState };
})();
