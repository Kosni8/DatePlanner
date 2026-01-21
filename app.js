
const APP_VERSION = 1;

let dates = [];

let filter = 'all';

function loadDates() {

    const storedVersion = localStorage.getItem("appVersion");

    if (storedVersion != APP_VERSION) {
        localStorage.removeItem("dates");
        localStorage.setItem("appVersion", APP_VERSION);
    }

    const storedDates = localStorage.getItem('dates');
    dates = storedDates ? JSON.parse(storedDates) : [];
}

function saveDates() {
    localStorage.setItem('dates', JSON.stringify(dates));
}

function renderDates() {
    const dateList = document.getElementById('DateList');
    dateList.innerHTML = '';

    const filtered = dates.filter(d =>
        filter === 'all' ? true : d.size === filter
    );

    if (filtered.length === 0) {
        dateList.innerHTML = '<li>Keine Dates vorhanden</li>';
        return;
    }

    filtered.forEach(date => {
        const li = document.createElement('li');

        const left = document.createElement('div')
        const title = document.createElement('div');
        title.textContent = date.title;

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = `${date.size} • ${date.booking ? "Buchen" : "Kein Buchen"}`;

        left.appendChild(title);
        left.appendChild(meta);

        const del = document.createElement('button');
        del.textContent = 'X';
        del.addEventListener('click', () => {
            dates = dates.filter(d => d.id !== date.id);
            saveDates();
            renderDates();
        });

        li.appendChild(left);
        li.appendChild(del);
        dateList.appendChild(li);
    });
}

document.getElementById('filterAll').onclick = () => {
    filter = 'all';
    renderDates();
}


document.getElementById('filterSmall').onclick = () => {
    filter = 'klein';
    renderDates();
}

document.getElementById('filterBig').onclick = () => {
    filter = 'groß';
    renderDates();
}

document.getElementById('addDateForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const input = document.getElementById('TitleInput');

    const newDate = {
        id: Date.now(),
        title: input.value,
        size: document.querySelector('input[name="size"]:checked').value,
        booking: document.getElementById('bookingCheckbox').checked
    };

    dates.push(newDate);
    saveDates();
    renderDates();
    input.value = '';
    input.blur();
});

// Initial load
loadDates();
renderDates();