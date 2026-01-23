const APP_VERSION = 1;

/* -------------------- STATE -------------------- */

let dates = [];
let filter = "all";

let planConfig = {
    smallCount: 0,
    bigCount: 0
};

let currentSuggestions = [];
let rejectedIds = [];

/* -------------------- COOLDOWN -------------------- */

const COOLDOWN_WEEKS = {
    klein: 2,
    groß: 4
};

/* -------------------- INIT -------------------- */

document.addEventListener("DOMContentLoaded", () => {
    loadDates();
    renderDates();
    bindUI();
});

/* -------------------- UI BINDINGS -------------------- */

function bindUI() {
    document.getElementById("createPlanBtn").onclick = startPlanning;
    document.getElementById("confirmPlanBtn").onclick = confirmPlan;

    document.getElementById("toggleDates").onclick = () => {
        document.getElementById("datesContent").classList.toggle("hidden");
    };

    document.getElementById("addDateForm").addEventListener("submit", addDate);
}

/* -------------------- PLANNING -------------------- */

function startPlanning() {
    planConfig.smallCount = Number(document.getElementById("smallCount").value);
    planConfig.bigCount = Number(document.getElementById("bigCount").value);

    rejectedIds = [];
    generateSuggestions();
    renderSuggestions();
    updateConfirmButton();
}

function generateSuggestions() {
    currentSuggestions = [];

    const availableSmall = getAvailableDates("klein");
    const availableBig = getAvailableDates("groß");

    const pickedSmall = pickRandom(
        availableSmall.filter(d => !rejectedIds.includes(d.id)),
        planConfig.smallCount
    );

    const pickedBig = pickRandom(
        availableBig.filter(d => !rejectedIds.includes(d.id)),
        planConfig.bigCount
    );

    currentSuggestions.push(...pickedSmall, ...pickedBig);
}

function renderSuggestions() {
    let list = document.getElementById("suggestList");
    list.innerHTML = "";

    if (currentSuggestions.length === 0) {
        list.innerHTML = "<li>Keine passenden Dates verfügbar</li>";
        return;
    }

    currentSuggestions.forEach(date => {
        const li = document.createElement("li");

        const left = document.createElement("div");
        left.textContent = date.title;

        const rejectBtn = document.createElement("button");
        rejectBtn.textContent = "Ablehnen";
        rejectBtn.onclick = () => {
            rejectedIds.push(date.id);
            generateSuggestions();
            renderSuggestions();
            updateConfirmButton();
        };

        li.appendChild(left);
        li.appendChild(rejectBtn);
        list.appendChild(li);
    });
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
    return dates.filter(d => {
        if (d.size !== size) return false;
        if (!d.lastUsed) return true;

        const cooldown =
            COOLDOWN_WEEKS[d.size] * 7 * 24 * 60 * 60 * 1000;

        return Date.now() >= d.lastUsed + cooldown;
    });
}

function pickRandom(array, count) {
    return [...array]
        .sort(() => Math.random() - 0.5)
        .slice(0, count);
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
        lastUsed: null
    };

    dates.push(newDate);
    saveDates();
    renderDates();

    input.value = "";
    input.blur();
}

function renderDates() {
    const list = document.getElementById("DateList");
    list.innerHTML = "";

    if (dates.length === 0) {
        list.innerHTML = "<li>Keine Dates vorhanden</li>";
        return;
    }

    dates.forEach(date => {
        const li = document.createElement("li");

        const left = document.createElement("div");
        left.textContent = date.title;

        const del = document.createElement("button");
        del.textContent = "X";
        del.onclick = () => {
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
    const storedVersion = localStorage.getItem("appVersion");

    if (storedVersion != APP_VERSION) {
        localStorage.removeItem("dates");
        localStorage.setItem("appVersion", APP_VERSION);
    }

    const stored = localStorage.getItem("dates");
    dates = stored ? JSON.parse(stored) : [];
}

function saveDates() {
    localStorage.setItem("dates", JSON.stringify(dates));
}
