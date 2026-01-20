
const APP_VERSION = 1;

let dates = [];

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
    dates.forEach(date => {
        const li = document.createElement('li');
        li.textContent = `${date.title}`;

        const del = document.createElement('button');
        del.textContent = 'X';
        del.addEventListener('click', () => {
            dates = dates.filter(d => d.id !== date.id);
            saveDates();
            renderDates();
        });

        li.appendChild(del);
        dateList.appendChild(li);
    });
}

document.getElementById('addDateForm').addEventListener('submit', function (event) {
    event.preventDefault();
    const input = document.getElementById('TitleInput');
    const newDate = {
        id: Date.now(),
        title: input.value,
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