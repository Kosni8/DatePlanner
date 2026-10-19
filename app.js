const APP_VERSION = 2;

/* -------------------- STATE -------------------- */

let dates = [];

let listFilter = {
    search: "",
    size: "all",
    season: "all",
    energy: "all",
    category: "all",
    weather: "all",
    booking: "all"
};

let planConfig = {
    smallCount: 0,
    bigCount: 0,
    season: "auto",
    weather: "egal",
    energy: "egal",
    category: "egal",
    noBooking: false
};

let currentSuggestions = [];
let rejectedIds = [];

/* -------------------- KONSTANTEN -------------------- */

const COOLDOWN_WEEKS = {
    klein: 2,
    groß: 4
};

const ENERGY_LEVELS = ["low", "medium", "high"];

const SEASON_LABELS = {
    sommer: "Sommer",
    winter: "Winter",
    ganzjährig: "Ganzjährig"
};

/* -------------------- INIT -------------------- */

document.addEventListener("DOMContentLoaded", () => {
    loadDates();
    requestPersistentStorage();
    renderDates();
    renderSeasonHint();
    bindUI();

    Cloud.init({
        onRemoteDates: applyRemoteDates,
        onStatusChange: renderAccount
    });
});

/* -------------------- UI BINDINGS -------------------- */

function bindUI() {
    document.getElementById("createPlanBtn").onclick = startPlanning;
    document.getElementById("confirmPlanBtn").onclick = confirmPlan;

    document.getElementById("toggleDates").onclick = () => {
        document.getElementById("datesContent").classList.toggle("hidden");
    };

    document.getElementById("addDateForm").addEventListener("submit", addDate);

    // Filter der Date-Liste
    document.getElementById("filterSearch").addEventListener("input", e => {
        listFilter.search = e.target.value.trim().toLowerCase();
        renderDates();
    });

    [
        ["filterSize", "size"],
        ["filterSeason", "season"],
        ["filterEnergy", "energy"],
        ["filterCategory", "category"],
        ["filterWeather", "weather"],
        ["filterBooking", "booking"]
    ].forEach(([id, key]) => {
        document.getElementById(id).addEventListener("change", e => {
            listFilter[key] = e.target.value;
            renderDates();
        });
    });

    document.getElementById("filterReset").onclick = resetListFilter;

    // Backup
    document.getElementById("exportBtn").onclick = exportDates;
    document.getElementById("importInput").addEventListener("change", importDates);

    // Konto
    document.getElementById("loginForm").addEventListener("submit", sendLoginLink);
    document.getElementById("logoutBtn").onclick = () => Cloud.signOut();
}

/* -------------------- PLANNING -------------------- */

function startPlanning() {
    planConfig.smallCount = Number(document.getElementById("smallCount").value);
    planConfig.bigCount = Number(document.getElementById("bigCount").value);
    planConfig.season = document.getElementById("planSeason").value;
    planConfig.weather = document.getElementById("planWeather").value;
    planConfig.energy = document.getElementById("planEnergy").value;
    planConfig.category = document.getElementById("planCategory").value;
    planConfig.noBooking = document.getElementById("planNoBooking").checked;

    rejectedIds = [];
    generateSuggestions();
    renderSuggestions();
    updateConfirmButton();
}

function generateSuggestions() {
    currentSuggestions = [];

    const availableSmall = getAvailableDates("klein")
        .filter(d => !rejectedIds.includes(d.id));
    const availableBig = getAvailableDates("groß")
        .filter(d => !rejectedIds.includes(d.id));

    const pickedSmall = pickWeighted(availableSmall, planConfig.smallCount);
    const pickedBig = pickWeighted(availableBig, planConfig.bigCount);

    currentSuggestions.push(...pickedSmall, ...pickedBig);
}

function replaceSuggestion(rejectedDate) {
    const index = currentSuggestions.findIndex(
        d => d.id === rejectedDate.id
    );

    if (index === -1) return;

    const candidates = getAvailableDates(rejectedDate.size)
        .filter(d =>
            !rejectedIds.includes(d.id) &&
            !currentSuggestions.some(s => s.id === d.id)
        );

    if (candidates.length === 0) {
        // Kein Ersatz → einfach entfernen
        currentSuggestions.splice(index, 1);
        return;
    }

    const replacement = pickWeighted(candidates, 1)[0];

    // Ersetzen an gleicher Position
    currentSuggestions.splice(index, 1, replacement);
}

function renderSuggestions() {
    const list = document.getElementById("suggestList");
    list.innerHTML = "";

    const wanted = planConfig.smallCount + planConfig.bigCount;

    if (currentSuggestions.length === 0) {
        list.innerHTML = "<li>Keine passenden Dates verfügbar. Lockere die Filter oder füge neue Ideen hinzu.</li>";
        return;
    }

    currentSuggestions.forEach(date => {
        const li = document.createElement("li");

        const left = document.createElement("div");
        const title = document.createElement("div");
        title.textContent = date.title;

        const meta = document.createElement("div");
        meta.className = "meta";
        meta.textContent = describeDate(date);

        left.appendChild(title);
        left.appendChild(meta);

        const rejectBtn = document.createElement("button");
        rejectBtn.className = "ButtonReject";
        rejectBtn.textContent = "Ablehnen";
        rejectBtn.onclick = () => {
            rejectedIds.push(date.id);
            replaceSuggestion(date);
            renderSuggestions();
            updateConfirmButton();
        };

        li.appendChild(left);
        li.appendChild(rejectBtn);
        list.appendChild(li);
    });

    if (currentSuggestions.length < wanted) {
        const hint = document.createElement("li");
        hint.className = "meta";
        hint.textContent = `Nur ${currentSuggestions.length} von ${wanted} passenden Dates gefunden.`;
        list.appendChild(hint);
    }
}

function confirmPlan() {
    const now = Date.now();

    currentSuggestions.forEach(suggestion => {
        const real = dates.find(d => d.id === suggestion.id);
        if (real) real.lastUsed = now;
    });

    saveDates();

    currentSuggestions = [];
    rejectedIds = [];

    document.getElementById("suggestList").innerHTML = "";
    document.getElementById("smallCount").value = "";
    document.getElementById("bigCount").value = "";

    renderDates();
    updateConfirmButton();

    alert("Dein Date-Plan wurde bestätigt!");
}

/* -------------------- CONFIRM BUTTON -------------------- */

function updateConfirmButton() {
    const btn = document.getElementById("confirmPlanBtn");
    btn.disabled = currentSuggestions.length === 0;
}

/* -------------------- DATE AVAILABILITY -------------------- */

function getAvailableDates(size) {
    return dates.filter(d =>
        d.size === size &&
        !isOnCooldown(d) &&
        matchesPlan(d)
    );
}

function isOnCooldown(date) {
    if (!date.lastUsed) return false;

    const cooldown =
        COOLDOWN_WEEKS[date.size] * 7 * 24 * 60 * 60 * 1000;

    return Date.now() < date.lastUsed + cooldown;
}

// Prüft ein Date gegen die Planungs-Optionen
function matchesPlan(date) {
    const season = planConfig.season === "auto"
        ? getCurrentSeason()
        : planConfig.season;

    if (season !== "egal" &&
        date.season !== "ganzjährig" &&
        date.season !== season) return false;

    // Schlechtes Wetter → nichts Wetterabhängiges
    if (planConfig.weather === "schlecht" && date.weatherDependent) return false;

    // Energie: alles bis einschließlich des gewählten Levels
    if (planConfig.energy !== "egal" &&
        ENERGY_LEVELS.indexOf(date.energy) > ENERGY_LEVELS.indexOf(planConfig.energy)) return false;

    if (planConfig.category !== "egal" &&
        !date.categories.includes(planConfig.category)) return false;

    if (planConfig.noBooking && date.booking) return false;

    return true;
}

// April bis September = Sommer, sonst Winter
function getCurrentSeason() {
    const month = new Date().getMonth() + 1;
    return month >= 4 && month <= 9 ? "sommer" : "winter";
}

function renderSeasonHint() {
    const option = document.querySelector('#planSeason option[value="auto"]');
    option.textContent = `Automatisch (gerade ${SEASON_LABELS[getCurrentSeason()]})`;
}

// Lange nicht gemachte Dates werden bevorzugt
function getWeight(date) {
    if (!date.lastUsed) return 3;

    const weeksSince = (Date.now() - date.lastUsed) / (7 * 24 * 60 * 60 * 1000);
    return Math.min(1 + weeksSince / 8, 3);
}

function pickWeighted(array, count) {
    const pool = [...array];
    const picked = [];

    while (picked.length < count && pool.length > 0) {
        const total = pool.reduce((sum, d) => sum + getWeight(d), 0);
        let r = Math.random() * total;

        let index = 0;
        for (; index < pool.length - 1; index++) {
            r -= getWeight(pool[index]);
            if (r <= 0) break;
        }

        picked.push(pool.splice(index, 1)[0]);
    }

    return picked;
}

/* -------------------- DATE MANAGEMENT -------------------- */

function addDate(event) {
    event.preventDefault();

    const input = document.getElementById("TitleInput");

    const newDate = {
        id: Date.now(),
        title: input.value,
        size: document.querySelector('input[name="size"]:checked').value,
        booking: document.getElementById("bookingCheckbox").checked,
        categories: getSelectedCategories(),
        energy: getSelectedEnergy() || "medium",
        season: document.querySelector('input[name="season"]:checked').value,
        weatherDependent: document.getElementById("weatherCheckbox").checked,
        lastUsed: null
    };

    dates.push(newDate);
    saveDates();
    renderDates();

    input.value = "";
    input.blur();
}

function getSelectedCategories() {
  return Array.from(
    document.querySelectorAll('input[name="category"]:checked')
  ).map(cb => cb.value);
}

function getSelectedEnergy() {
  const selected = document.querySelector('input[name="energy"]:checked');
  return selected ? selected.value : null;
}

function describeDate(date) {
    const parts = [
        date.size,
        date.energy,
        SEASON_LABELS[date.season]
    ];

    if (date.weatherDependent) parts.push("wetterabhängig");
    if (date.booking) parts.push("buchen");
    if (date.categories.length) parts.push(date.categories.join(", "));

    return parts.join(" • ");
}

/* -------------------- LIST FILTER -------------------- */

function matchesListFilter(date) {
    const f = listFilter;

    if (f.search && !date.title.toLowerCase().includes(f.search)) return false;
    if (f.size !== "all" && date.size !== f.size) return false;
    if (f.season !== "all" && date.season !== f.season) return false;
    if (f.energy !== "all" && date.energy !== f.energy) return false;
    if (f.category !== "all" && !date.categories.includes(f.category)) return false;
    if (f.weather === "ja" && !date.weatherDependent) return false;
    if (f.weather === "nein" && date.weatherDependent) return false;
    if (f.booking === "ja" && !date.booking) return false;
    if (f.booking === "nein" && date.booking) return false;

    return true;
}

function resetListFilter() {
    listFilter = {
        search: "",
        size: "all",
        season: "all",
        energy: "all",
        category: "all",
        weather: "all",
        booking: "all"
    };

    document.getElementById("filterSearch").value = "";
    document.querySelectorAll("#listFilter select").forEach(s => {
        s.value = "all";
    });

    renderDates();
}

function renderDates() {
    const list = document.getElementById("DateList");
    const count = document.getElementById("filterCount");
    list.innerHTML = "";

    if (dates.length === 0) {
        list.innerHTML = "<li>Keine Dates vorhanden</li>";
        count.textContent = "";
        return;
    }

    const filtered = dates.filter(matchesListFilter);
    count.textContent = `${filtered.length} von ${dates.length} Dates`;

    if (filtered.length === 0) {
        list.innerHTML = "<li>Keine Dates passen zum Filter</li>";
        return;
    }

    filtered.forEach(date => {
        const li = document.createElement('li');

        const left = document.createElement('div')
        const title = document.createElement('div');
        title.textContent = date.title;

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = describeDate(date);

        left.appendChild(title);
        left.appendChild(meta);

        const del = document.createElement("button");
        del.className = "ButtonDelete";
        del.textContent = "X";
        del.onclick = () => {
            if (!confirm(`"${date.title}" wirklich löschen?`)) return;
            dates = dates.filter(d => d.id !== date.id);
            saveDates();
            renderDates();
        };

        li.appendChild(left);
        li.appendChild(del);
        list.appendChild(li);
    });
}

/* -------------------- STORAGE -------------------- */

function loadDates() {
    let stored = [];

    try {
        stored = JSON.parse(localStorage.getItem("dates")) || [];
    } catch {
        stored = [];
    }

    // Alte Daten werden migriert statt gelöscht
    dates = stored.map(normalizeDate);
    Cloud.setBaseline(dates);

    localStorage.setItem("appVersion", APP_VERSION);
    saveDates();
}

// Ergänzt fehlende Felder mit Standardwerten
function normalizeDate(d) {
    return {
        ...d,
        id: d.id ?? Date.now() + Math.random(),
        size: d.size === "groß" ? "groß" : "klein",
        booking: Boolean(d.booking),
        categories: Array.isArray(d.categories) ? d.categories : [],
        energy: ENERGY_LEVELS.includes(d.energy) ? d.energy : "medium",
        season: SEASON_LABELS[d.season] ? d.season : "ganzjährig",
        weatherDependent: Boolean(d.weatherDependent),
        lastUsed: d.lastUsed || null
    };
}

function saveDates() {
    localStorage.setItem("dates", JSON.stringify(dates));
    Cloud.track(dates);
}

// Neuer Stand aus der Cloud ersetzt den lokalen Zwischenspeicher
function applyRemoteDates(remoteDates) {
    dates = remoteDates.map(normalizeDate);
    Cloud.setBaseline(dates);
    localStorage.setItem("dates", JSON.stringify(dates));
    renderDates();
}

// Bittet den Browser, die Daten nicht automatisch zu löschen
function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist();
    }
}

/* -------------------- BACKUP -------------------- */

function exportDates() {
    const data = JSON.stringify({ version: APP_VERSION, dates }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `dates-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
}

function importDates(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const parsed = JSON.parse(reader.result);
            const imported = Array.isArray(parsed) ? parsed : parsed.dates;

            if (!Array.isArray(imported)) throw new Error("Ungültige Datei");

            // Zusammenführen: gleiche IDs werden überschrieben
            const byId = new Map(dates.map(d => [d.id, d]));
            imported.map(normalizeDate).forEach(d => byId.set(d.id, d));
            dates = [...byId.values()];

            saveDates();
            renderDates();
            alert(`${imported.length} Dates importiert.`);
        } catch {
            alert("Die Datei konnte nicht gelesen werden.");
        }

        event.target.value = "";
    };
    reader.readAsText(file);
}

/* -------------------- KONTO -------------------- */

async function sendLoginLink(event) {
    event.preventDefault();

    const input = document.getElementById("loginEmail");
    const button = event.target.querySelector("button");
    button.disabled = true;

    try {
        await Cloud.sendLoginLink(input.value.trim());
        alert("Login-Link verschickt. Öffne die Mail auf dem Gerät, auf dem du die App nutzen willst.");
        input.value = "";
    } catch (err) {
        alert(`Login-Link konnte nicht verschickt werden: ${err.message}`);
    }

    button.disabled = false;
}

function renderAccount() {
    const state = Cloud.getState();

    document.getElementById("accountSection").classList.toggle("hidden", !state.enabled);
    if (!state.enabled) return;

    document.getElementById("loggedOut").classList.toggle("hidden", Boolean(state.email));
    document.getElementById("loggedIn").classList.toggle("hidden", !state.email);
    document.getElementById("accountEmail").textContent = state.email || "";

    let status = "";
    if (!state.online) {
        status = "Offline: Änderungen werden hochgeladen, sobald du wieder online bist.";
    } else if (!state.email) {
        status = "Nicht angemeldet: Änderungen bleiben vorerst in diesem Browser.";
    } else if (state.notMember) {
        status = "Diese E-Mail ist noch nicht für eure Liste freigeschaltet.";
    } else if (state.syncing) {
        status = "Synchronisiere…";
    } else if (state.pendingCount > 0) {
        status = "Noch nicht alles hochgeladen, neuer Versuch läuft gleich.";
    } else {
        status = "In der Cloud gespeichert.";
    }

    document.getElementById("syncStatus").textContent = status;
}
