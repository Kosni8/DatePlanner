const APP_VERSION = 1;

let dates = [];
let filter = "all";
let appState = "manage";
let planConfig = {
  availableTime: 0,
  smallCount: 0,
  bigCount: 0,
  mode: "exact"
};

// HIER ANGEBEN WIE OFT EIN DATE WIEDER VERWENDET WERDEN KANN
const COOLDOWN_WEEKS ={
  klein: 2,
  groß: 4
}


function renderApp() {
  document.getElementById("planSection").style.display = appState === "plan" ? "block" : "none";

  document.getElementById("suggestSection").style.display = appState === "suggest" ? "block" : "none";

}


document.getElementById("startPlanning").onclick = () => {

  planConfig.availableTime = Number(document.getElementById("timeInput").value);

  planConfig.smallCount = Number(document.getElementById("smallInput").value);

  planConfig.bigCount = Number(document.getElementById("bigInput").value);

  planConfig.mode = document.querySelector('input[name="mode"]:checked').value;

  appState = "suggest";
  renderSuggestions();
  renderApp();

}

document.getElementById("backToPlan").onclick = () => {
  appState = "plan";
  renderApp();
};


function renderSuggestions() {
  const list = document.getElementById("suggestList");
  list.innerHTML = "";

  const li = document.createElement("li");
  li.textContent = "Diese Funktion ist noch in Arbeit!";
  list.appendChild(li);
}



function isDateAvailable(date) {

  if (!date.lastUsed) return true;

  const cooldownWeeks = COOLDOWN_WEEKS[date.size];
  const cooldownMs = cooldownWeeks * 7 * 24 * 60 * 60 * 1000;

  const now = Date.now();
  const nextAllowedTime = date.lastUsed + cooldownMs;

  return now >= nextAllowedTime;
}


function getAvailableDates() {
  return dates.filter(isDateAvailable);
}

function getAvailableDatesBySize(size) {
  return getAvailableDates().filter(d => d.size === size);
}


//Notizen 
// UI MUSS angepasst werden für Handy
// Viel abstand zwischen planung und Date add
// GGF Date Add zuklappen?
// Planung UI Mobile First design



function loadDates() {
  const storedVersion = localStorage.getItem("appVersion");

  if (storedVersion != APP_VERSION) {
    localStorage.removeItem("dates");
    localStorage.setItem("appVersion", APP_VERSION);
  }

  const storedDates = localStorage.getItem("dates");
  dates = storedDates ? JSON.parse(storedDates) : [];
}

function saveDates() {
  localStorage.setItem("dates", JSON.stringify(dates));
}

function renderDates() {
  const dateList = document.getElementById("DateList");
  dateList.innerHTML = "";

  const filtered = dates.filter(d =>
    filter === "all" ? true : d.size === filter
  );

  if (filtered.length === 0) {
    dateList.innerHTML = "<li>Keine Dates vorhanden</li>";
    return;
  }

  filtered.forEach(date => {
    const li = document.createElement("li");

    const left = document.createElement("div");

    const title = document.createElement("div");
    title.textContent = date.title;

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${date.size} • ${date.booking ? "Buchen" : "Kein Buchen"}`;

    left.appendChild(title);
    left.appendChild(meta);

    const del = document.createElement("button");
    del.textContent = "X";
    del.onclick = () => {
      dates = dates.filter(d => d.id !== date.id);
      saveDates();
      renderDates();
    };

    li.appendChild(left);
    li.appendChild(del);
    dateList.appendChild(li);
  });
}

function init() {
  // Filter
  document.getElementById("filterAll").onclick = () => {
    filter = "all";
    renderDates();
  };

  document.getElementById("filterSmall").onclick = () => {
    filter = "klein";
    renderDates();
  };

  document.getElementById("filterBig").onclick = () => {
    filter = "groß";
    renderDates();
  };

  // Toggle Details
  const toggleBtn = document.getElementById("toggleDetails");
  const details = document.getElementById("details");

  toggleBtn.addEventListener("click", () => {
    details.classList.toggle("hidden");
  });

  // Form Submit
  document.getElementById("addDateForm").addEventListener("submit", (event) => {
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
    details.classList.add("hidden");
  });

  loadDates();
  renderDates();
}

document.addEventListener("DOMContentLoaded", init);

appState = "plan";
renderApp();
